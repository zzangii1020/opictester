/*
 * Client for the optional AI evaluation server (server/index.ts).
 * Only transcript text and question text are sent — never audio — and only after explicit consent.
 */
import type { AiEvaluation, AnswerRecord, Question, TargetGrade } from '../types';

export interface AiStatus {
  available: boolean;
  model?: string;
  reason?: string;
}

export async function fetchAiStatus(): Promise<AiStatus> {
  try {
    const res = await fetch('./api/status', { headers: { accept: 'application/json' } });
    const isJson = res.headers.get('content-type')?.includes('application/json');
    if (res.status === 404 || !isJson) {
      return { available: false, reason: '이 주소는 정적 호스팅(예: GitHub Pages)이라 AI 평가 서버가 없습니다.' };
    }
    if (!res.ok) return { available: false, reason: `평가 서버 응답 오류 (${res.status})` };
    return (await res.json()) as AiStatus;
  } catch {
    return { available: false, reason: 'AI 평가 서버에 연결할 수 없습니다. (정적 배포만 된 경우 서버가 없습니다)' };
  }
}

export interface EvaluationItem {
  questionId: string;
  type: string;
  question: string;
  transcript: string;
  transcriptSource: AnswerRecord['transcriptSource'];
  durationSec: number;
}

export function buildItems(questions: Question[], answers: Record<string, AnswerRecord>): EvaluationItem[] {
  return questions
    .filter((q) => answers[q.id])
    .map((q) => {
      const a = answers[q.id];
      return {
        questionId: q.id,
        type: q.type,
        question: q.text,
        transcript: a.transcript.trim(),
        transcriptSource: a.transcriptSource,
        durationSec: Math.round(a.durationMs / 1000),
      };
    });
}

export async function requestEvaluation(items: EvaluationItem[], level: number, targetGrade: TargetGrade): Promise<AiEvaluation> {
  const res = await fetch('./api/evaluate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ items, level, targetGrade }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `평가 요청 실패 (${res.status})`);
  return data as AiEvaluation;
}
