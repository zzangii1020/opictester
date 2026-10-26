import type { ExamResult } from '../types';
import { analyzeText } from './metrics';

export interface ResultStats {
  total: number;
  answered: number;
  recordingMs: number;
  avgDurationMs: number;
  avgWords: number | null;
  avgWpm: number | null;
}

export function resultStats(r: ExamResult): ResultStats {
  const answers = Object.values(r.answers);
  const recordingMs = answers.reduce((s, a) => s + a.durationMs, 0);
  const withText = answers.filter((a) => a.transcript);
  const metrics = withText.map((a) => analyzeText(a.transcript, a.durationMs));
  const wpms = metrics.map((m) => m.wordsPerMinute).filter((v): v is number => v !== null);
  return {
    total: r.questions.length,
    answered: answers.length,
    recordingMs,
    avgDurationMs: answers.length ? recordingMs / answers.length : 0,
    avgWords: metrics.length ? Math.round(metrics.reduce((s, m) => s + m.wordCount, 0) / metrics.length) : null,
    avgWpm: wpms.length ? Math.round(wpms.reduce((s, v) => s + v, 0) / wpms.length) : null,
  };
}
