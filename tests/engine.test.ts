// Exhaustive check of the exam builder: for every starting level, every mid-test adjustment and many
// random seeds/surveys, the exam must contain exactly `totalQuestions` questions with no duplicates.
// Run: npm run test:engine
import { buildSession1, buildSession2, adjustLevel, totalQuestionsFor, SESSION1_COUNT } from '../src/engine/examEngine';
import { surveySteps } from '../src/engine/surveyData';
import { surpriseTopics } from '../src/engine/questionBank';
import type { Adjustment, Level, SurveyAnswers } from '../src/types';

const base: SurveyAnswers = { work: 'business', student: 'no', recentCourse: 'over5', residence: 'family' };
const optionIds = (stepId: string) => surveySteps.find((s) => s.id === stepId)!.options.map((o) => o.id);

// A few hand-picked surveys plus one survey per Part 4 option (paired with the residence topic and one more).
const surveys: SurveyAnswers[] = [
  { ...base, leisure: ['shopping'], hobbies: ['music'], sports: ['walking'], vacations: ['domesticTravel'] },
  { ...base, leisure: ['movies', 'park', 'cafe'], hobbies: ['music'], sports: ['noExercise'], vacations: ['homeVacation'] },
];
for (const stepId of ['leisure', 'hobbies', 'sports', 'vacations']) {
  for (const id of optionIds(stepId)) {
    if (id === 'noExercise') continue;
    surveys.push({ ...base, leisure: stepId === 'leisure' ? [id] : ['tv'], hobbies: stepId === 'hobbies' ? [id] : [], sports: stepId === 'sports' ? [id] : ['noExercise'], vacations: stepId === 'vacations' ? [id] : [] });
  }
}

const adjustments: Adjustment[] = ['easier', 'same', 'harder'];
const failures: string[] = [];
let exams = 0;

for (const survey of surveys) {
  for (let level = 1 as Level; level <= 6; level = (level + 1) as Level) {
    for (let seed = 1; seed <= 120; seed++) {
      const total = totalQuestionsFor(level);
      const s1 = buildSession1(survey, level, seed);
      for (const adj of adjustments) {
        exams++;
        const s2 = buildSession2(survey, adjustLevel(level, adj), seed, total, s1);
        const all = [...s1, ...s2];
        const problem =
          s1.length !== SESSION1_COUNT ? `session1 has ${s1.length}/${SESSION1_COUNT}` :
          all.length !== total ? `exam has ${all.length}/${total}` :
          new Set(all.map((q) => q.text)).size !== all.length ? 'duplicate question text' :
          all.some((q, i) => q.id !== `q${i + 1}`) ? 'ids out of order' : '';
        if (problem && failures.length < 15) {
          const topics = [...new Set(s2.map((q) => q.topicId))].join(',');
          failures.push(`level ${level} → ${adj}, seed ${seed}, leisure=${String(survey.leisure)}: ${problem} (session2 topics: ${topics})`);
        }
      }
    }
  }
}

// Every surprise topic must be able to fill each combo the blueprint asks of it, at every level.
for (const t of surpriseTopics) {
  for (let lv = 1; lv <= 6; lv++) {
    const usable = t.questions.filter((q) => (q.minLevel ?? 1) <= lv).length;
    if (usable < 3) failures.push(`surprise topic "${t.id}" has only ${usable} question(s) usable at level ${lv} (needs 3)`);
  }
}

console.log(`${exams} exams built`);
if (failures.length) {
  console.log(`FAIL\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log('PASS: every exam has exactly the promised number of questions');
