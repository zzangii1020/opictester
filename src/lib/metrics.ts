/*
 * Rule-based text indicators computed in the browser. These are NOT an AI evaluation:
 * they count words, tense markers, fillers and connectors in the transcript.
 */
const IRREGULAR_PAST = new Set(
  'was were had did went came saw got made took said told thought felt knew found gave left met bought brought began became ate drank ran sat stood wrote read heard kept lost paid spent sent slept taught understood won wore chose drove flew forgot grew hid hung led lent let rode rang rose sang shook shot shut sold sang swam threw woke caught fell fought'.split(' '),
);
const FUTURE = /\b(will|won't|gonna|'ll|going to|plan to|planning to|hope to|want to|would like to|someday|next (week|month|year|time))\b/gi;
const PRESENT_PERFECT = /\b(have|has|'ve|'s) (been|\w+ed|done|gone|seen|had|made|taken|met|heard)\b/gi;
const FILLERS = /\b(um+|uh+|er+|hmm+|like|you know|i mean|kind of|sort of)\b/gi;
const CONNECTORS = /\b(because|so|but|however|also|first|second|then|after that|finally|for example|for instance|actually|anyway|on the other hand|in addition|moreover|that's why|when|while|although|though)\b/gi;

export interface TextMetrics {
  wordCount: number;
  sentenceCount: number;
  uniqueWordRatio: number;
  wordsPerMinute: number | null;
  pastMarkers: number;
  futureMarkers: number;
  perfectMarkers: number;
  fillerCount: number;
  connectorCount: number;
  topRepeated: { word: string; count: number }[];
}

const STOPWORDS = new Set('the a an and i to of in it is was that my me we you for on with at be this they so but are have had there do not just very really'.split(' '));

export function analyzeText(text: string, durationMs: number): TextMetrics {
  const clean = text.toLowerCase().replace(/[’]/g, "'");
  const words = clean.match(/[a-z']+/g) ?? [];
  const sentences = text.split(/[.!?]+/).map((s) => s.trim()).filter(Boolean);
  const counts = new Map<string, number>();
  for (const w of words) counts.set(w, (counts.get(w) ?? 0) + 1);
  const pastMarkers = words.filter((w) => IRREGULAR_PAST.has(w) || (w.length > 4 && w.endsWith('ed'))).length;
  const minutes = durationMs / 60000;
  return {
    wordCount: words.length,
    sentenceCount: sentences.length,
    uniqueWordRatio: words.length ? counts.size / words.length : 0,
    wordsPerMinute: words.length > 0 && minutes > 0.05 ? Math.round(words.length / minutes) : null,
    pastMarkers,
    futureMarkers: clean.match(FUTURE)?.length ?? 0,
    perfectMarkers: clean.match(PRESENT_PERFECT)?.length ?? 0,
    fillerCount: clean.match(FILLERS)?.length ?? 0,
    connectorCount: clean.match(CONNECTORS)?.length ?? 0,
    topRepeated: [...counts.entries()]
      .filter(([w, c]) => c >= 3 && !STOPWORDS.has(w))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([word, count]) => ({ word, count })),
  };
}

/** Short Korean hints derived from the metrics. Purely rule-based. */
export function metricHints(m: TextMetrics, durationMs: number): string[] {
  const hints: string[] = [];
  if (m.wordCount === 0) return ['답변 텍스트가 없어 텍스트 지표를 계산할 수 없습니다.'];
  if (durationMs < 45000) hints.push('답변 시간이 45초 미만입니다. 이유·예시·느낌을 덧붙여 1분 이상 말해 보세요.');
  if (m.wordCount < 60) hints.push('단어 수가 적습니다. 구체적인 장소·사람·시간 정보를 추가해 보세요.');
  if (m.connectorCount < 2) hints.push('because, so, after that 같은 연결어를 사용하면 흐름이 자연스러워집니다.');
  if (m.pastMarkers === 0) hints.push('과거 시제 표현이 거의 없습니다. 경험 질문에서는 과거 시제로 이야기를 전개하세요.');
  if (m.fillerCount > Math.max(3, m.wordCount * 0.06)) hints.push('um, like 같은 군말이 많은 편입니다. 잠깐 멈추는 것도 괜찮습니다.');
  if (m.uniqueWordRatio > 0 && m.uniqueWordRatio < 0.4 && m.wordCount > 40) hints.push('같은 단어가 자주 반복됩니다. 비슷한 의미의 다른 표현을 써 보세요.');
  if (m.topRepeated.length) hints.push(`반복이 많은 단어: ${m.topRepeated.map((r) => `${r.word}(${r.count})`).join(', ')}`);
  if (hints.length === 0) hints.push('기본 지표상 큰 문제는 없습니다. 내용의 구체성과 표현 다양성을 계속 늘려 보세요.');
  return hints;
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
