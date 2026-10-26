/*
 * Optional AI evaluation server + static file server for the built app.
 *
 * - The Anthropic API key stays here (ANTHROPIC_API_KEY env var); it is never sent to the browser.
 * - Only question text, transcript text and answer durations are received — never audio.
 * - Request bodies are not logged or stored.
 *
 * Run: ANTHROPIC_API_KEY=... node server/index.ts   (Node 22.18+ runs .ts directly)
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';

const PORT = Number(process.env.PORT ?? 8787);
const MODEL = 'claude-opus-5-5';
const DIST = fileURLToPath(new URL('../dist/', import.meta.url));
const MAX_BODY = 256 * 1024;
const hasCredentials = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
const client = hasCredentials ? new Anthropic() : null;

const CRITERIA: { key: string; label: string }[] = [
  { key: 'relevance', label: '질문에 대한 적절성' },
  { key: 'organization', label: '논리적 흐름' },
  { key: 'detail', label: '구체적인 설명' },
  { key: 'tense', label: '과거·현재·미래 시제 활용' },
  { key: 'grammar', label: '문법 정확성' },
  { key: 'vocabulary', label: '어휘의 다양성' },
  { key: 'naturalness', label: '자연스러운 영어 표현' },
  { key: 'fluency', label: '발화 유창성' },
  { key: 'length', label: '답변 길이와 내용의 충분성' },
];
const LEVELS = ['NL', 'NM', 'NH', 'IL', 'IM1', 'IM2', 'IM3', 'IH', 'AL'];

const str = { type: 'string' } as const;
const obj = (properties: Record<string, unknown>) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

const OUTPUT_SCHEMA = obj({
  estimatedLevel: { type: 'string', enum: LEVELS },
  summary: str,
  criteria: {
    type: 'array',
    items: obj({ key: { type: 'string', enum: CRITERIA.map((c) => c.key) }, score: { type: 'integer' }, comment: str, tip: str }),
  },
  perQuestion: {
    type: 'array',
    items: obj({
      questionId: str,
      relevance: str,
      grammarErrors: { type: 'array', items: obj({ original: str, correction: str, explanation: str }) },
      awkwardExpressions: { type: 'array', items: obj({ original: str, better: str, explanation: str }) },
      improvedAnswer: str,
    }),
  },
  actionItems: { type: 'array', items: str },
  fluencyBasis: str,
});

const SYSTEM_PROMPT = `You are an experienced English speaking coach reviewing answers from an OPIc-style mock speaking test taken by a Korean learner.

This is a learning tool, not an official test. You do not know the official OPIc rating algorithm, so never claim to, and frame the level as a rough learning estimate on the NL–AL scale.

You receive each question, the learner's answer transcript, how the transcript was produced, and how long they spoke. Transcripts from "speech" come from browser speech recognition and can contain recognition errors: do not report a likely misrecognition as a grammar error. "manual" transcripts were typed by the learner afterwards.

Score each of these criteria from 1 (weak) to 5 (strong): ${CRITERIA.map((c) => `${c.key} (${c.label})`).join(', ')}. You only have text and timing, not audio. For fluency, estimate from words per minute and disfluency markers visible in speech-recognition transcripts; if every transcript is "manual", fluency cannot be judged — give it score 0 and say so. Use 0 for any other criterion you genuinely cannot assess. In fluencyBasis, state in Korean exactly what the fluency judgment was based on.

For every answer, list concrete grammar errors and awkward expressions quoted from the transcript, with corrections, and write an improved model answer of roughly 120–180 words that keeps the learner's own content and suits their target grade.

Write summary, comments, tips, explanations, relevance notes and 1–3 actionItems in Korean. Keep quoted originals, corrections, better expressions and improved answers in English.`;

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<string> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY) throw new Error('요청 본문이 너무 큽니다.');
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

interface Item {
  questionId: string;
  type: string;
  question: string;
  transcript: string;
  transcriptSource: string;
  durationSec: number;
}

function parseRequest(raw: string): { items: Item[]; level: number; targetGrade: string } {
  const data = JSON.parse(raw) as { items?: unknown; level?: unknown; targetGrade?: unknown };
  if (!Array.isArray(data.items) || data.items.length === 0 || data.items.length > 20) throw new Error('평가할 답변이 1~20개여야 합니다.');
  const items = data.items.map((it: Record<string, unknown>) => {
    const item = {
      questionId: String(it.questionId ?? '').slice(0, 20),
      type: String(it.type ?? '').slice(0, 30),
      question: String(it.question ?? '').slice(0, 1000),
      transcript: String(it.transcript ?? '').slice(0, 6000),
      transcriptSource: it.transcriptSource === 'speech' ? 'speech' : 'manual',
      durationSec: Math.max(0, Math.min(1800, Number(it.durationSec) || 0)),
    };
    if (!item.questionId || !item.transcript.trim()) throw new Error('답변 텍스트가 비어 있는 항목이 있습니다.');
    return item;
  });
  const level = Math.max(1, Math.min(6, Number(data.level) || 3));
  const targetGrade = LEVELS.includes(String(data.targetGrade)) ? String(data.targetGrade) : 'IM2';
  return { items, level, targetGrade };
}

async function evaluate(req: IncomingMessage, res: ServerResponse) {
  if (!client) return json(res, 503, { error: 'AI 평가 서버에 ANTHROPIC_API_KEY가 설정되지 않았습니다.' });
  let input: ReturnType<typeof parseRequest>;
  try {
    input = parseRequest(await readBody(req));
  } catch (err) {
    return json(res, 400, { error: err instanceof Error ? err.message : '잘못된 요청입니다.' });
  }

  const payload = {
    selectedDifficulty: input.level,
    targetGrade: input.targetGrade,
    answers: input.items.map((i) => ({
      ...i,
      wordsPerMinute: i.durationSec > 0 ? Math.round(i.transcript.split(/\s+/).filter(Boolean).length / (i.durationSec / 60)) : null,
    })),
  };

  try {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: `Evaluate these mock-test answers:\n\n${JSON.stringify(payload, null, 2)}` }],
    });

    if (response.stop_reason === 'refusal') return json(res, 422, { error: 'AI가 이 요청에 대한 평가를 거절했습니다. 답변 내용을 확인한 뒤 다시 시도해 주세요.' });
    if (response.stop_reason === 'max_tokens') return json(res, 502, { error: '평가 결과가 너무 길어 잘렸습니다. 문항 수를 줄여 다시 시도해 주세요.' });

    const text = response.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
    const parsed = JSON.parse(text) as {
      estimatedLevel: string;
      summary: string;
      criteria: { key: string; score: number; comment: string; tip: string }[];
      perQuestion: unknown[];
      actionItems: string[];
      fluencyBasis: string;
    };
    json(res, 200, {
      model: response.model,
      createdAt: Date.now(),
      estimatedLevel: parsed.estimatedLevel,
      summary: parsed.summary,
      criteria: CRITERIA.map((c) => {
        const found = parsed.criteria.find((x) => x.key === c.key);
        const score = found && found.score >= 1 && found.score <= 5 ? found.score : null;
        return { key: c.key, label: c.label, score, comment: found?.comment ?? '평가 결과 없음', tip: found?.tip ?? '' };
      }),
      perQuestion: parsed.perQuestion,
      actionItems: parsed.actionItems.slice(0, 3),
      fluencyBasis: parsed.fluencyBasis,
    });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) return json(res, 502, { error: 'API 키 인증에 실패했습니다. 서버의 ANTHROPIC_API_KEY를 확인하세요.' });
    if (err instanceof Anthropic.RateLimitError) return json(res, 429, { error: '요청이 많아 잠시 후 다시 시도해 주세요.' });
    if (err instanceof Anthropic.APIError) return json(res, 502, { error: `AI API 오류 (${err.status ?? 'network'})` });
    if (err instanceof SyntaxError) return json(res, 502, { error: 'AI 응답을 해석하지 못했습니다. 다시 시도해 주세요.' });
    console.error('evaluate failed:', err instanceof Error ? err.message : err);
    return json(res, 500, { error: '평가 중 알 수 없는 오류가 발생했습니다.' });
  }
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

async function serveStatic(pathname: string, res: ServerResponse) {
  const safe = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '');
  let file = join(DIST, safe === '/' ? 'index.html' : safe);
  if (!file.startsWith(DIST)) return json(res, 403, { error: 'forbidden' });
  try {
    if (!(await stat(file)).isFile()) file = join(DIST, 'index.html');
  } catch {
    file = join(DIST, 'index.html');
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    json(res, 404, { error: '빌드 파일이 없습니다. 먼저 npm run build를 실행하세요.' });
  }
}

createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname === '/api/status' && req.method === 'GET') {
    return json(res, 200, client
      ? { available: true, model: MODEL }
      : { available: false, reason: 'AI 평가 서버는 실행 중이지만 ANTHROPIC_API_KEY가 설정되지 않았습니다.' });
  }
  if (url.pathname === '/api/evaluate' && req.method === 'POST') return void evaluate(req, res);
  if (url.pathname.startsWith('/api/')) return json(res, 404, { error: 'not found' });
  void serveStatic(url.pathname, res);
}).listen(PORT, () => {
  console.log(`OPIc mock server on http://localhost:${PORT} (AI evaluation ${client ? 'enabled' : 'disabled: set ANTHROPIC_API_KEY'})`);
});
