export type QuestionType =
  | 'selfIntro'
  | 'description'
  | 'routine'
  | 'pastExperience'
  | 'memorable'
  | 'comparison'
  | 'problemSolving'
  | 'roleplayCall'
  | 'askQuestions'
  | 'issue';

/** Where a question's topic came from. */
export type QuestionSource = 'intro' | 'survey' | 'surprise' | 'roleplay';

export interface Question {
  id: string;
  type: QuestionType;
  source: QuestionSource;
  topicId: string;
  topicLabel: string;
  text: string;
}

export type SurveyAnswers = Record<string, string | string[]>;

export type Level = 1 | 2 | 3 | 4 | 5 | 6;
export type Adjustment = 'easier' | 'same' | 'harder';
export type TargetGrade = 'IL' | 'IM1' | 'IM2' | 'IM3' | 'IH' | 'AL';

export interface Preferences {
  showQuestionText: boolean;
  /** 0 = unlimited */
  replayLimit: number;
  autoRecord: boolean;
  ttsRate: number;
  /** User consented to browser speech recognition (may send audio to the browser vendor). */
  sttEnabled: boolean;
  /** Enforce the "12+ selections" rule reported by prep materials. Off by default because it is not officially verified here. */
  strictSurveyRule: boolean;
}

export interface AnswerRecord {
  questionId: string;
  audioKey: string;
  mimeType: string;
  durationMs: number;
  transcript: string;
  transcriptSource: 'speech' | 'manual' | 'none';
  recordedAt: number;
}

export type ExamPhase = 'question' | 'adjust' | 'finished';

export interface ExamState {
  id: string;
  seed: number;
  startedAt: number;
  elapsedMs: number;
  survey: SurveyAnswers;
  level: Level;
  adjustment: Adjustment | null;
  adjustedLevel: Level | null;
  totalQuestions: number;
  questions: Question[];
  currentIndex: number;
  phase: ExamPhase;
  answers: Record<string, AnswerRecord>;
  replays: Record<string, number>;
  /** Set while a recording is in progress, so a reload can tell the user it was lost. */
  recordingQuestionId: string | null;
}

export interface CriterionScore {
  key: string;
  label: string;
  score: number | null;
  comment: string;
  tip: string;
}

export interface QuestionFeedback {
  questionId: string;
  relevance: string;
  grammarErrors: { original: string; correction: string; explanation: string }[];
  awkwardExpressions: { original: string; better: string; explanation: string }[];
  improvedAnswer: string;
}

export interface AiEvaluation {
  model: string;
  createdAt: number;
  estimatedLevel: string;
  summary: string;
  criteria: CriterionScore[];
  perQuestion: QuestionFeedback[];
  actionItems: string[];
  fluencyBasis: string;
}

export interface ExamResult {
  id: string;
  kind: 'exam';
  startedAt: number;
  finishedAt: number;
  elapsedMs: number;
  level: Level;
  adjustment: Adjustment | null;
  adjustedLevel: Level | null;
  targetGrade: TargetGrade;
  survey: SurveyAnswers;
  questions: Question[];
  answers: Record<string, AnswerRecord>;
  evaluation: AiEvaluation | null;
}

export interface PracticeRecord {
  id: string;
  kind: 'practice';
  createdAt: number;
  question: Question;
  timeLimitSec: number;
  answer: AnswerRecord | null;
  evaluation: AiEvaluation | null;
}
