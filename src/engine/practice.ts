import type { Question, QuestionType, SurveyAnswers } from '../types';
import type { Rng } from '../lib/random';
import { asArray, surveySteps, topicStepIds, type SurveyTopic } from './surveyData';
import { roleplayQuestions, roleplaySets, surpriseQuestion, surpriseTopics, surveyQuestion } from './questionBank';

/** Survey options the user did NOT pick — useful for unexpected-topic practice. */
export function unselectedSurveyTopics(survey: SurveyAnswers | null): SurveyTopic[] {
  const topics: SurveyTopic[] = [];
  for (const stepId of topicStepIds) {
    const step = surveySteps.find((s) => s.id === stepId);
    if (!step) continue;
    const chosen = asArray(survey?.[stepId]);
    for (const o of step.options) {
      if (chosen.includes(o.id) || o.id === step.exclusiveOption) continue;
      topics.push({ stepId, optionId: o.id, ko: o.ko, en: o.en, group: step.group ?? 'activity' });
    }
  }
  return topics;
}

export interface PracticeOptions {
  type: QuestionType | 'any';
  includeUnselectedSurvey: boolean;
  level: number;
}

/** Random unexpected question. Tries several sources until one can produce the requested type. */
export function generatePracticeQuestion(survey: SurveyAnswers | null, opts: PracticeOptions, rng: Rng, avoidText?: string): Question {
  const types: QuestionType[] = opts.type === 'any'
    ? ['description', 'routine', 'pastExperience', 'memorable', 'comparison', 'problemSolving', 'roleplayCall', 'askQuestions', 'issue']
    : [opts.type];
  const unselected = opts.includeUnselectedSurvey ? unselectedSurveyTopics(survey) : [];
  // When drilling one specific type, allow every difficulty so advanced types (e.g. issue) are available.
  const level = opts.type === 'any' ? opts.level : 6;

  for (let attempt = 0; attempt < 40; attempt++) {
    const type = rng.pick(types);
    const source = rng.next();
    let q: Question | null = null;
    if (type === 'roleplayCall' || (type === 'problemSolving' && source < 0.5)) {
      const set = rng.pick(roleplaySets);
      q = roleplayQuestions(set).find((x) => x.type === type) ?? null;
    } else if (type === 'askQuestions' || (unselected.length > 0 && source < 0.35)) {
      // askQuestions only exists as a survey-topic template.
      const pool = unselected.length > 0 ? unselected : unselectedSurveyTopics(null);
      q = surveyQuestion(rng.pick(pool), type, level, rng);
      if (q) q = { ...q, source: 'surprise', topicLabel: `${q.topicLabel} (${unselected.length > 0 ? 'Survey 미선택 주제' : 'Survey 주제'})` };
    } else {
      q = surpriseQuestion(rng.pick(surpriseTopics), type, level, rng);
    }
    if (q && q.text !== avoidText) return { ...q, id: 'p1' };
  }
  // Every type exists in the templates for any level ≥ 5; fall back to a plain description question.
  const fallback = surpriseQuestion(surpriseTopics[0], 'description', 6, rng)!;
  return { ...fallback, id: 'p1' };
}
