import surveyJson from '../data/survey.json';
import type { SurveyAnswers } from '../types';

export interface SurveyOption {
  id: string;
  ko: string;
  en: string;
}

export interface SurveyStep {
  id: string;
  part: string;
  title: string;
  kind: 'single' | 'multi';
  source: 'secondary' | 'mock';
  group?: TemplateGroup;
  exclusiveOption?: string;
  showIf?: Record<string, string>;
  options: SurveyOption[];
}

export type TemplateGroup = 'activity' | 'sport' | 'travel' | 'home';

export const surveySteps = surveyJson.steps as SurveyStep[];
export const surveySourceNote = surveyJson.sourceNote;

/** Steps that collect activity topics (Part 4). */
export const topicStepIds = ['leisure', 'hobbies', 'sports', 'vacations'] as const;

/** Mock-test requirement: enough distinct topics to build combo questions. Not an official rule. */
export const MIN_TOPICS_FOR_EXAM = 3;
/** Rule reported by prep materials; only enforced when the user turns on strict mode. */
export const REPORTED_MIN_SELECTIONS = 12;

export function visibleSteps(answers: SurveyAnswers): SurveyStep[] {
  return surveySteps.filter((step) => {
    if (!step.showIf) return true;
    return Object.entries(step.showIf).every(([key, value]) => answers[key] === value);
  });
}

export function findOption(stepId: string, optionId: string): SurveyOption | undefined {
  return surveySteps.find((s) => s.id === stepId)?.options.find((o) => o.id === optionId);
}

export function asArray(value: string | string[] | undefined): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

export interface SurveyTopic {
  stepId: string;
  optionId: string;
  ko: string;
  en: string;
  group: TemplateGroup;
}

/** Topics the exam may draw from, derived from the current survey answers. */
export function surveyTopics(answers: SurveyAnswers): SurveyTopic[] {
  const topics: SurveyTopic[] = [];
  for (const stepId of topicStepIds) {
    const step = surveySteps.find((s) => s.id === stepId);
    if (!step) continue;
    for (const optionId of asArray(answers[stepId])) {
      if (optionId === step.exclusiveOption) continue;
      const option = step.options.find((o) => o.id === optionId);
      if (option) topics.push({ stepId, optionId, ko: option.ko, en: option.en, group: step.group ?? 'activity' });
    }
  }
  const residence = typeof answers.residence === 'string' ? findOption('residence', answers.residence) : undefined;
  if (residence) {
    topics.push({ stepId: 'residence', optionId: 'home', ko: `거주지 (${residence.ko})`, en: residence.en, group: 'home' });
  }
  return topics;
}

export function countTopicSelections(answers: SurveyAnswers): number {
  return topicStepIds.reduce((sum, id) => sum + asArray(answers[id]).length, 0);
}

export interface SurveyValidation {
  ok: boolean;
  errors: string[];
}

export function validateStep(step: SurveyStep, answers: SurveyAnswers): string | null {
  const value = answers[step.id];
  if (step.kind === 'single') return value ? null : '항목을 하나 선택해 주세요.';
  if (asArray(value).length === 0) return '최소 1개 이상 선택해 주세요.';
  return null;
}

export function validateSurvey(answers: SurveyAnswers, strict: boolean): SurveyValidation {
  const errors: string[] = [];
  for (const step of visibleSteps(answers)) {
    const err = validateStep(step, answers);
    if (err) errors.push(`${step.part}: ${err}`);
  }
  const topicCount = surveyTopics(answers).length;
  if (topicCount < MIN_TOPICS_FOR_EXAM) {
    errors.push(`출제할 주제가 부족합니다. 여가·취미·운동·휴가에서 주제를 더 선택해 주세요. (모의고사 출제를 위한 최소 ${MIN_TOPICS_FOR_EXAM}개)`);
  }
  if (strict && countTopicSelections(answers) < REPORTED_MIN_SELECTIONS) {
    errors.push(`엄격 모드: Part 4에서 총 ${REPORTED_MIN_SELECTIONS}개 이상 선택해야 합니다.`);
  }
  return { ok: errors.length === 0, errors };
}

export function isSurveyComplete(answers: SurveyAnswers | null, strict = false): boolean {
  return !!answers && validateSurvey(answers, strict).ok;
}

/** Drop answers for steps that are no longer visible (e.g. student follow-up after changing student → no). */
export function pruneHiddenAnswers(answers: SurveyAnswers): SurveyAnswers {
  const visible = new Set(visibleSteps(answers).map((s) => s.id));
  return Object.fromEntries(Object.entries(answers).filter(([key]) => visible.has(key)));
}
