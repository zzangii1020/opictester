import templatesJson from '../data/questionTemplates.json';
import topicQuestionsJson from '../data/topicQuestions.json';
import roleplaysJson from '../data/roleplays.json';
import surpriseJson from '../data/surpriseTopics.json';
import type { Question, QuestionType } from '../types';
import type { Rng } from '../lib/random';
import type { SurveyTopic, TemplateGroup } from './surveyData';

interface RawQuestion {
  text: string;
  minLevel?: number;
  type?: string;
}

export interface RoleplaySet {
  id: string;
  title: string;
  relatedTopics: string[];
  call: string;
  problem: string;
  experience: string;
}

export interface SurpriseTopic {
  id: string;
  ko: string;
  en: string;
  questions: (RawQuestion & { type: string })[];
}

const templates = templatesJson as {
  selfIntro: RawQuestion[];
  groups: Record<TemplateGroup, Record<string, RawQuestion[]>>;
};
const topicQuestions = topicQuestionsJson.topics as Record<string, (RawQuestion & { type: string })[]>;
export const roleplaySets = roleplaysJson.sets as RoleplaySet[];
export const surpriseTopics = surpriseJson.topics as SurpriseTopic[];

export const questionTypeLabels: Record<QuestionType, string> = {
  selfIntro: '자기소개',
  description: '묘사',
  routine: '일상·습관',
  pastExperience: '과거 경험',
  memorable: '기억에 남는 경험',
  comparison: '비교',
  problemSolving: '문제 해결',
  roleplayCall: '롤플레이 (전화·대화)',
  askQuestions: '질문하기',
  issue: '이슈·의견',
};

export const practiceTypes: QuestionType[] = [
  'description',
  'routine',
  'pastExperience',
  'memorable',
  'comparison',
  'problemSolving',
  'roleplayCall',
  'askQuestions',
  'issue',
];

const fits = (q: RawQuestion, level: number) => (q.minLevel ?? 1) <= level;

function fill(text: string, topic: SurveyTopic) {
  return text.replaceAll('{activity}', topic.en);
}

export function selfIntroQuestion(rng: Rng): Question {
  const raw = rng.pick(templates.selfIntro);
  return { id: '', type: 'selfIntro', source: 'intro', topicId: 'intro', topicLabel: '자기소개', text: raw.text };
}

/** A question about a survey topic. Prefers hand-written questions, falls back to group templates. */
export function surveyQuestion(topic: SurveyTopic, type: QuestionType, level: number, rng: Rng): Question | null {
  const specific = (topicQuestions[topic.optionId] ?? []).filter((q) => q.type === type && fits(q, level));
  const generic = (templates.groups[topic.group]?.[type] ?? []).filter((q) => fits(q, level));
  const pool = specific.length > 0 ? specific : generic;
  if (pool.length === 0) return null;
  const raw = rng.pick(pool);
  return {
    id: '',
    type,
    source: 'survey',
    topicId: topic.optionId,
    topicLabel: topic.ko,
    text: fill(raw.text, topic),
  };
}

export function surpriseQuestion(topic: SurpriseTopic, type: QuestionType, level: number, rng: Rng): Question | null {
  const pool = topic.questions.filter((q) => q.type === type && fits(q, level));
  if (pool.length === 0) return null;
  return { id: '', type, source: 'surprise', topicId: topic.id, topicLabel: topic.ko, text: rng.pick(pool).text };
}

export function roleplayQuestions(set: RoleplaySet): Question[] {
  const base = { id: '', source: 'roleplay' as const, topicId: set.id, topicLabel: `롤플레이: ${set.title}` };
  return [
    { ...base, type: 'roleplayCall', text: set.call },
    { ...base, type: 'problemSolving', text: set.problem },
    { ...base, type: 'pastExperience', text: set.experience },
  ];
}

/** Picks a roleplay related to the user's topics when possible. */
export function pickRoleplay(topicIds: string[], rng: Rng): RoleplaySet {
  const related = roleplaySets.filter((s) => s.relatedTopics.some((t) => topicIds.includes(t)));
  return rng.pick(related.length > 0 ? related : roleplaySets);
}
