import type { Adjustment, AnswerRecord, ExamState, Level, Question, QuestionType, SurveyAnswers } from '../types';
import { createRng, randomSeed, uid } from '../lib/random';
import { surveyTopics, type SurveyTopic } from './surveyData';
import {
  pickRoleplay,
  roleplayQuestions,
  roleplaySets,
  selfIntroQuestion,
  surpriseQuestion,
  surpriseTopics,
  surveyQuestion,
  type SurpriseTopic,
} from './questionBank';

/*
 * Mock-test blueprint. Question counts and order are this app's own design
 * (informed by publicly reported 12–15 question tests); they are not an official rule.
 */
export const SESSION1_COUNT = 7;

export function totalQuestionsFor(level: Level): number {
  return level <= 2 ? 12 : 15;
}

export function adjustLevel(level: Level, adjustment: Adjustment): Level {
  const delta = adjustment === 'easier' ? -1 : adjustment === 'harder' ? 1 : 0;
  return Math.min(6, Math.max(1, level + delta)) as Level;
}

const FALLBACK_ORDER: QuestionType[] = ['memorable', 'routine', 'pastExperience', 'description', 'comparison'];

interface Plan {
  topicA: SurveyTopic;
  topicB: SurveyTopic;
  topicC: SurveyTopic | null;
  surprise: SurpriseTopic;
  surprise2: SurpriseTopic;
  roleplayId: string;
}

/** Deterministic topic plan for an exam, so a reload rebuilds identical sessions. */
function planExam(survey: SurveyAnswers, seed: number): Plan {
  const rng = createRng(seed);
  const topics = rng.shuffle(surveyTopics(survey));
  if (topics.length < 2) throw new Error('출제할 Survey 주제가 부족합니다.');
  const topicA = topics[0];
  // Prefer a topic from a different survey part for the second combo so sets feel varied.
  const topicB = topics.slice(1).find((t) => t.stepId !== topicA.stepId) ?? topics[1];
  const topicC = topics.find((t) => t !== topicA && t !== topicB) ?? null;
  const surprises = rng.shuffle(surpriseTopics);
  const roleplay = pickRoleplay(topics.map((t) => t.optionId), rng);
  return { topicA, topicB, topicC, surprise: surprises[0], surprise2: surprises[1], roleplayId: roleplay.id };
}

function buildCombo(
  make: (type: QuestionType) => Question | null,
  types: QuestionType[],
): Question[] {
  const out: Question[] = [];
  const usedTexts = new Set<string>();
  for (const wanted of types) {
    for (const type of [wanted, ...FALLBACK_ORDER]) {
      const q = make(type);
      if (q && !usedTexts.has(q.text)) {
        usedTexts.add(q.text);
        out.push(q);
        break;
      }
    }
  }
  return out;
}

function surveyCombo(topic: SurveyTopic, types: QuestionType[], level: number, seed: number) {
  const rng = createRng(seed);
  return buildCombo((type) => surveyQuestion(topic, type, level, rng), types);
}

function surpriseCombo(topic: SurpriseTopic, types: QuestionType[], level: number, seed: number) {
  const rng = createRng(seed);
  return buildCombo((type) => surpriseQuestion(topic, type, level, rng), types);
}

/**
 * Guarantees the promised question count: if combos came up short (a topic without enough questions at this
 * level), top up from backup sources. The exam screen relies on `questions.length === totalQuestions`.
 */
function fillTo(qs: Question[], needed: number, backups: (() => Question[])[], alreadyAsked: Question[] = []): Question[] {
  const out = qs.slice(0, needed);
  const seen = new Set([...alreadyAsked, ...out].map((q) => q.text));
  for (const backup of backups) {
    if (out.length >= needed) break;
    for (const q of backup()) {
      if (out.length >= needed) break;
      if (!seen.has(q.text)) {
        seen.add(q.text);
        out.push(q);
      }
    }
  }
  return out;
}

const BACKUP_TYPES: QuestionType[] = ['description', 'routine', 'memorable', 'pastExperience', 'comparison', 'problemSolving'];

function withIds(questions: Question[], offset: number): Question[] {
  return questions.map((q, i) => ({ ...q, id: `q${offset + i + 1}` }));
}

export function buildSession1(survey: SurveyAnswers, level: Level, seed: number): Question[] {
  const plan = planExam(survey, seed);
  const rng = createRng(seed + 1);
  const qs: Question[] = [
    selfIntroQuestion(rng),
    ...surveyCombo(plan.topicA, ['description', 'routine', level >= 5 ? 'memorable' : 'pastExperience'], level, seed + 2),
    ...surveyCombo(plan.topicB, ['description', level >= 3 ? 'comparison' : 'routine', 'memorable'], level, seed + 3),
  ];
  const filled = fillTo(qs, SESSION1_COUNT, [
    () => (plan.topicC ? surveyCombo(plan.topicC, BACKUP_TYPES, level, seed + 7) : []),
    () => surveyCombo(plan.topicA, BACKUP_TYPES, 6, seed + 8),
  ]);
  return withIds(filled, 0);
}

/** `asked` = the session-1 questions, so backups never repeat something the user already answered. */
export function buildSession2(survey: SurveyAnswers, level: Level, seed: number, total: number, asked: Question[] = []): Question[] {
  const plan = planExam(survey, seed);
  const roleplay = roleplaySets.find((s) => s.id === plan.roleplayId) ?? roleplaySets[0];
  const qs: Question[] = [];
  if (total >= 15) {
    qs.push(...surpriseCombo(plan.surprise, ['description', level >= 3 ? 'comparison' : 'routine', level >= 5 ? 'issue' : 'memorable'], level, seed + 4));
    qs.push(...roleplayQuestions(roleplay));
    const closingTypes: QuestionType[] = level >= 5 ? ['comparison', 'issue'] : level >= 3 ? ['askQuestions', 'comparison'] : ['description', 'askQuestions'];
    qs.push(...(plan.topicC
      ? surveyCombo(plan.topicC, closingTypes, level, seed + 5)
      : surpriseCombo(plan.surprise2, closingTypes, level, seed + 5)));
  } else {
    qs.push(...roleplayQuestions(roleplay));
    qs.push(...surpriseCombo(plan.surprise, ['description', 'memorable'], level, seed + 4));
  }
  const filled = fillTo(qs, total - SESSION1_COUNT, [
    () => surpriseCombo(plan.surprise2, BACKUP_TYPES, level, seed + 6),
    () => surveyCombo(plan.topicC ?? plan.topicB, BACKUP_TYPES, level, seed + 7),
    () => surveyCombo(plan.topicA, BACKUP_TYPES, 6, seed + 8),
    () => surpriseTopics.flatMap((t) => surpriseCombo(t, BACKUP_TYPES, 6, seed + 9)),
  ], asked);
  return withIds(filled, SESSION1_COUNT);
}

export function createExam(survey: SurveyAnswers, level: Level): ExamState {
  const seed = randomSeed();
  return {
    id: uid('exam'),
    seed,
    startedAt: Date.now(),
    elapsedMs: 0,
    survey,
    level,
    adjustment: null,
    adjustedLevel: null,
    totalQuestions: totalQuestionsFor(level),
    questions: buildSession1(survey, level, seed),
    currentIndex: 0,
    phase: 'question',
    answers: {},
    replays: {},
    recordingQuestionId: null,
  };
}

export type ExamAction =
  | { type: 'recordingStarted'; questionId: string }
  | { type: 'recordingStopped' }
  | { type: 'answerSaved'; answer: AnswerRecord }
  | { type: 'answerRemoved'; questionId: string }
  | { type: 'replayed'; questionId: string }
  | { type: 'tick'; ms: number }
  | { type: 'next' }
  | { type: 'adjust'; adjustment: Adjustment }
  | { type: 'finish' };

export function examReducer(state: ExamState, action: ExamAction): ExamState {
  switch (action.type) {
    case 'recordingStarted':
      return { ...state, recordingQuestionId: action.questionId };
    case 'recordingStopped':
      return { ...state, recordingQuestionId: null };
    case 'answerSaved':
      return {
        ...state,
        recordingQuestionId: null,
        answers: { ...state.answers, [action.answer.questionId]: action.answer },
      };
    case 'answerRemoved': {
      const answers = { ...state.answers };
      delete answers[action.questionId];
      return { ...state, answers };
    }
    case 'replayed':
      return { ...state, replays: { ...state.replays, [action.questionId]: (state.replays[action.questionId] ?? 0) + 1 } };
    case 'tick':
      return { ...state, elapsedMs: state.elapsedMs + action.ms };
    case 'next': {
      if (state.recordingQuestionId) return state; // never move on mid-answer
      const nextIndex = state.currentIndex + 1;
      if (nextIndex >= state.totalQuestions) return { ...state, phase: 'finished' };
      if (nextIndex === SESSION1_COUNT && state.questions.length === SESSION1_COUNT) {
        return { ...state, phase: 'adjust' };
      }
      return { ...state, currentIndex: nextIndex };
    }
    case 'adjust': {
      const adjustedLevel = adjustLevel(state.level, action.adjustment);
      const session1 = state.questions.slice(0, SESSION1_COUNT);
      const session2 = buildSession2(state.survey, adjustedLevel, state.seed, state.totalQuestions, session1);
      return {
        ...state,
        adjustment: action.adjustment,
        adjustedLevel,
        questions: [...session1, ...session2],
        currentIndex: SESSION1_COUNT,
        phase: 'question',
      };
    }
    case 'finish':
      return { ...state, phase: 'finished', recordingQuestionId: null };
  }
}
