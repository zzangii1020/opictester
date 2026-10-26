import { useState } from 'react';
import examInfo from '../data/examInfo.json';
import { useStore } from '../state/AppStore';
import { navigate } from '../hooks/useHashRoute';
import { SESSION1_COUNT, totalQuestionsFor } from '../engine/examEngine';
import { isSurveyComplete } from '../engine/surveyData';
import { Notice, PageHeader, StatusBadge } from '../components/common';
import type { Level } from '../types';

export function DifficultySelector({ flow }: { flow: boolean }) {
  const { settings, updateSettings } = useStore();
  const [level, setLevel] = useState<Level | null>(settings.level);
  const rec = examInfo.recommendedLevel[settings.targetGrade];
  const surveyReady = isSurveyComplete(settings.survey, settings.prefs.strictSurveyRule);

  const save = () => {
    if (!level) return;
    updateSettings({ level });
    navigate(flow ? '/exam/setup' : '/');
  };

  return (
    <div className="narrow">
      <PageHeader
        title="난이도 선택 (Self-Assessment)"
        subtitle={flow ? '실전 모의고사 · 2단계' : '시험 전에 자신의 말하기 수준에 가장 가까운 단계를 고르세요.'}
        back={flow ? { label: 'Survey로', href: '/survey?flow=exam' } : { label: '홈', href: '/' }}
      />
      {flow && !surveyReady && (
        <Notice tone="warn">Survey가 완료되지 않았습니다. <a href="#/survey?flow=exam">Survey 먼저 완료하기</a></Notice>
      )}
      <Notice tone="info">
        <p>
          선택한 난이도에 따라 시험 형태가 달라지는 구조는 공개 자료로 확인됩니다 <StatusBadge status="public" />. 1~6단계 선택과 시험 중 재조정 방식은 수험 자료 기준입니다 <StatusBadge status="secondary" />.
        </p>
        <p className="small muted">{examInfo.levelNote}</p>
      </Notice>

      <div className="level-list" role="radiogroup" aria-label="난이도">
        {examInfo.levels.map((l) => {
          const lv = l.level as Level;
          const recommended = lv >= rec[0] && lv <= rec[1];
          return (
            <button
              key={lv}
              role="radio"
              aria-checked={level === lv}
              className={`level-card ${level === lv ? 'selected' : ''}`}
              onClick={() => setLevel(lv)}
            >
              <span className="level-num">{lv}</span>
              <span className="level-body">
                <span className="level-title">
                  {l.title}
                  {recommended && <span className="chip chip-accent">목표 {settings.targetGrade} 참고</span>}
                </span>
                <span className="level-desc">{l.desc}</span>
              </span>
            </button>
          );
        })}
      </div>

      {level && (
        <section className="card">
          <h2>선택한 난이도: {level}단계</h2>
          <ul className="plain-list">
            <li>이 모의고사의 문항 수: <b>{totalQuestionsFor(level)}문항</b> <StatusBadge status="mock" /></li>
            <li>{SESSION1_COUNT}번 문항 뒤에 “쉬운 질문 / 비슷한 질문 / 어려운 질문” 중 하나를 골라 이후 난이도를 재조정합니다. <StatusBadge status="mock" /></li>
            <li>난이도가 높을수록 비교·이슈·돌발 유형의 비중이 커집니다. <StatusBadge status="mock" /></li>
          </ul>
        </section>
      )}

      <div className="wizard-actions">
        <a className="btn btn-ghost" href={flow ? '#/survey?flow=exam' : '#/'}>이전</a>
        <button className="btn btn-primary" disabled={!level || (flow && !surveyReady)} onClick={save}>
          {flow ? '다음: 시험 안내' : '난이도 저장'}
        </button>
      </div>
    </div>
  );
}
