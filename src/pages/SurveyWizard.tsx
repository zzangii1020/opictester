import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../state/AppStore';
import { navigate } from '../hooks/useHashRoute';
import {
  asArray,
  countTopicSelections,
  pruneHiddenAnswers,
  REPORTED_MIN_SELECTIONS,
  surveySourceNote,
  surveyTopics,
  validateStep,
  validateSurvey,
  visibleSteps,
  type SurveyStep,
} from '../engine/surveyData';
import { Notice, ProgressBar, StatusBadge } from '../components/common';
import type { SurveyAnswers } from '../types';

const SUMMARY = -1;

export function SurveyWizard({ flow }: { flow: boolean }) {
  const { settings, updateSettings, updatePrefs, activeExam } = useStore();
  const [answers, setAnswers] = useState<SurveyAnswers>(() => settings.survey ?? {});
  const [hadPrevious] = useState(() => !!settings.survey);
  // Returning users land on the summary so they can confirm or edit previous answers quickly.
  const [index, setIndex] = useState(() => (settings.survey && validateSurvey(settings.survey, false).ok ? SUMMARY : 0));
  const [stepError, setStepError] = useState<string | null>(null);
  const advanceTimer = useRef<number | undefined>(undefined);

  const steps = useMemo(() => visibleSteps(answers), [answers]);
  const strict = settings.prefs.strictSurveyRule;
  const onSummary = index === SUMMARY || index >= steps.length;
  const step: SurveyStep | undefined = onSummary ? undefined : steps[index];
  const topicCount = countTopicSelections(answers);

  useEffect(() => () => window.clearTimeout(advanceTimer.current), []);

  const goNext = (current: SurveyAnswers = answers) => {
    if (!step) return;
    const err = validateStep(step, current);
    if (err) {
      setStepError(err);
      return;
    }
    setStepError(null);
    const nextSteps = visibleSteps(current);
    const pos = nextSteps.findIndex((s) => s.id === step.id);
    setIndex(pos + 1 >= nextSteps.length ? SUMMARY : pos + 1);
  };

  const goBack = () => {
    setStepError(null);
    if (onSummary) setIndex(steps.length - 1);
    else if (index > 0) setIndex(index - 1);
  };

  const selectSingle = (optionId: string) => {
    if (!step) return;
    const next = pruneHiddenAnswers({ ...answers, [step.id]: optionId });
    setAnswers(next);
    setStepError(null);
    window.clearTimeout(advanceTimer.current);
    advanceTimer.current = window.setTimeout(() => goNext(next), 250);
  };

  const toggleMulti = (optionId: string) => {
    if (!step) return;
    const current = asArray(answers[step.id]);
    let next: string[];
    if (current.includes(optionId)) next = current.filter((id) => id !== optionId);
    else if (optionId === step.exclusiveOption) next = [optionId];
    else next = [...current.filter((id) => id !== step.exclusiveOption), optionId];
    setAnswers({ ...answers, [step.id]: next });
    setStepError(null);
  };

  const validation = validateSurvey(answers, strict);

  const save = () => {
    if (!validation.ok) return;
    updateSettings({ survey: pruneHiddenAnswers(answers), surveyUpdatedAt: Date.now() });
    navigate(flow ? '/difficulty?flow=exam' : '/');
  };

  const totalSteps = steps.length + 1;
  const position = onSummary ? totalSteps : index + 1;

  return (
    <div className="narrow">
      <div className="wizard-top">
        <a className="back-link" href="#/">← 홈</a>
        <span className="small muted">{flow ? '실전 모의고사 · 1단계 Background Survey' : 'Survey 설정'}</span>
      </div>
      <ProgressBar value={position} max={totalSteps} label="Survey 진행률" />
      <ol className="stepper" aria-label="Survey 단계">
        {steps.map((s, i) => (
          <li key={s.id} className={i === index ? 'current' : (onSummary || i < index) ? 'done' : ''}>
            <button
              disabled={!(onSummary || i < index)}
              onClick={() => setIndex(i)}
              title={s.part}
            >
              {i + 1}
            </button>
          </li>
        ))}
        <li className={onSummary ? 'current' : ''}><button disabled={!onSummary}>✓</button></li>
      </ol>

      {step && (
        <section className="card survey-step" key={step.id}>
          <div className="row between wrap">
            <p className="eyebrow">{step.part} · {position}/{totalSteps}</p>
            <StatusBadge status={step.source} />
          </div>
          <h1 className="survey-title">{step.title}</h1>

          {step.kind === 'multi' && (
            <p className="small muted">
              이 단계 {asArray(answers[step.id]).length}개 선택 · Part 4 누적 {topicCount}개
              {strict ? ` (엄격 모드: ${REPORTED_MIN_SELECTIONS}개 이상 필요)` : ` (수험 자료에서는 ${REPORTED_MIN_SELECTIONS}개 이상 선택이 안내됨 — 참고용)`}
            </p>
          )}

          <div className={`option-grid ${step.kind}`} role={step.kind === 'single' ? 'radiogroup' : 'group'} aria-label={step.title}>
            {step.options.map((o) => {
              const selected = step.kind === 'single' ? answers[step.id] === o.id : asArray(answers[step.id]).includes(o.id);
              return (
                <button
                  key={o.id}
                  role={step.kind === 'single' ? 'radio' : 'checkbox'}
                  aria-checked={selected}
                  className={`option ${selected ? 'selected' : ''}`}
                  onClick={() => (step.kind === 'single' ? selectSingle(o.id) : toggleMulti(o.id))}
                >
                  <span className="option-mark" aria-hidden="true">{selected ? '✓' : ''}</span>
                  <span>{o.ko}</span>
                </button>
              );
            })}
          </div>

          {stepError && <p className="error-text" role="alert">{stepError}</p>}

          <div className="wizard-actions">
            <button className="btn btn-ghost" onClick={goBack} disabled={index === 0}>이전</button>
            <button className="btn btn-primary" onClick={() => goNext()}>다음</button>
          </div>
        </section>
      )}

      {onSummary && (
        <section className="card">
          <p className="eyebrow">Survey 요약</p>
          <h1 className="survey-title">선택한 내용을 확인하세요</h1>
          {hadPrevious && <Notice tone="info">이전에 저장한 Survey 설정을 불러왔습니다. 그대로 진행하거나 항목별로 수정할 수 있습니다.</Notice>}
          <dl className="summary-list">
            {steps.map((s, i) => (
              <div key={s.id} className="summary-row">
                <dt>{s.part}</dt>
                <dd>
                  {asArray(answers[s.id]).map((id) => s.options.find((o) => o.id === id)?.ko).filter(Boolean).join(', ') || <span className="error-text">미선택</span>}
                </dd>
                <button className="link-btn" onClick={() => setIndex(i)}>수정</button>
              </div>
            ))}
          </dl>
          <p className="small">
            출제 가능 주제 <b>{surveyTopics(answers).length}개</b> · Part 4 선택 <b>{topicCount}개</b>
          </p>

          <label className="toggle">
            <input type="checkbox" checked={strict} onChange={(e) => updatePrefs({ strictSurveyRule: e.target.checked })} />
            <span>엄격 모드: Part 4 총 {REPORTED_MIN_SELECTIONS}개 이상 선택 규칙 적용 <StatusBadge status="secondary" /></span>
          </label>

          {!validation.ok && (
            <Notice tone="error" title="완료하려면 다음을 확인하세요">
              <ul>{validation.errors.map((e) => <li key={e}>{e}</li>)}</ul>
            </Notice>
          )}
          {activeExam && <p className="small muted">변경한 Survey는 진행 중인 시험이 아닌 다음 시험부터 반영됩니다.</p>}
          <p className="small muted">{surveySourceNote}</p>

          <div className="wizard-actions">
            <button className="btn btn-ghost" onClick={goBack}>이전</button>
            <button className="btn btn-primary" onClick={save} disabled={!validation.ok}>
              {flow ? '저장하고 난이도 선택으로' : 'Survey 저장'}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
