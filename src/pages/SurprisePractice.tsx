import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../state/AppStore';
import { useAnswerRecorder } from '../hooks/useAnswerRecorder';
import { generatePracticeQuestion } from '../engine/practice';
import { practiceTypes, questionTypeLabels } from '../engine/questionBank';
import { createRng, randomSeed, uid } from '../lib/random';
import { buildItems } from '../lib/evaluation';
import { speak, stopSpeaking, ttsSupported } from '../lib/speech';
import { AudioRecorder } from '../components/AudioRecorder';
import { AnswerFeedback } from '../components/AnswerFeedback';
import { AiEvaluationPanel } from '../components/AiEvaluationPanel';
import { Notice, PageHeader } from '../components/common';
import type { PracticeRecord, QuestionType } from '../types';

type Phase = 'setup' | 'listening' | 'countdown' | 'answering' | 'review';

const TIME_LIMITS = [45, 60, 90, 120, 0];

export function SurprisePractice({ initialType }: { initialType: string | null }) {
  const { settings, savePractice, practice } = useStore();
  const rng = useMemo(() => createRng(randomSeed()), []);
  const [type, setType] = useState<QuestionType | 'any'>(
    initialType && (practiceTypes as string[]).includes(initialType) ? (initialType as QuestionType) : 'any',
  );
  const [timeLimit, setTimeLimit] = useState(60);
  const [prepSec, setPrepSec] = useState(3);
  const [includeUnselected, setIncludeUnselected] = useState(true);
  const [phase, setPhase] = useState<Phase>('setup');
  const [record, setRecord] = useState<PracticeRecord | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [session, setSession] = useState({ count: 0, totalMs: 0 });
  const recordRef = useRef<PracticeRecord | null>(null);
  recordRef.current = record;

  const recorder = useAnswerRecorder({
    sttEnabled: settings.prefs.sttEnabled,
    onSaved: (answer) => {
      const current = recordRef.current;
      if (!current) return;
      const updated = { ...current, answer };
      setRecord(updated);
      savePractice(updated);
      setSession((s) => ({ count: s.count + 1, totalMs: s.totalMs + answer.durationMs }));
      setPhase('review');
    },
    onAborted: () => setPhase('review'),
  });

  const { status: recStatus, elapsedMs: recElapsed, start: startRec, stop: stopRec } = recorder;

  // Enforce the answer time limit.
  useEffect(() => {
    if (recStatus === 'recording' && timeLimit > 0 && recElapsed >= timeLimit * 1000) void stopRec();
  }, [recStatus, recElapsed, stopRec, timeLimit]);

  // Preparation countdown, then recording starts automatically ("answer immediately" drill).
  useEffect(() => {
    if (phase !== 'countdown' || !record) return;
    if (countdown <= 0) {
      setPhase('answering');
      void startRec(record.question.id, `${record.id}:answer`);
      return;
    }
    const t = window.setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => window.clearTimeout(t);
  }, [phase, countdown, record, startRec]);

  useEffect(() => () => stopSpeaking(), []);

  const newQuestion = async () => {
    stopSpeaking();
    const question = generatePracticeQuestion(
      settings.survey,
      { type, includeUnselectedSurvey: includeUnselected, level: settings.level ?? 4 },
      rng,
      record?.question.text,
    );
    const next: PracticeRecord = { id: uid('practice'), kind: 'practice', createdAt: Date.now(), question, timeLimitSec: timeLimit, answer: null, evaluation: null };
    setRecord(next);
    setPhase('listening');
    if (ttsSupported()) await speak(question.text, settings.prefs.ttsRate);
    setCountdown(prepSec);
    setPhase('countdown');
  };

  const update = (patch: Partial<PracticeRecord>) => {
    if (!record) return;
    const updated = { ...record, ...patch };
    setRecord(updated);
    if (updated.answer) savePractice(updated);
  };

  return (
    <div className="narrow">
      <PageHeader
        title="돌발 질문 훈련"
        subtitle="Survey에서 고르지 않은 주제와 돌발 주제(분리수거, 대중교통, 기술 변화, 환경 문제 등)에 즉시 답변하는 연습입니다."
        back={{ label: '홈', href: '/' }}
      />

      {phase === 'setup' && (
        <section className="card">
          <h2>훈련 설정</h2>
          <label className="field">
            <span>질문 유형</span>
            <select value={type} onChange={(e) => setType(e.target.value as QuestionType | 'any')}>
              <option value="any">무작위 (모든 유형)</option>
              {practiceTypes.map((t) => <option key={t} value={t}>{questionTypeLabels[t]}</option>)}
            </select>
          </label>
          <label className="field">
            <span>답변 시간 제한</span>
            <select value={timeLimit} onChange={(e) => setTimeLimit(Number(e.target.value))}>
              {TIME_LIMITS.map((t) => <option key={t} value={t}>{t === 0 ? '제한 없음' : `${t}초`}</option>)}
            </select>
          </label>
          <label className="field">
            <span>질문 후 준비 시간</span>
            <select value={prepSec} onChange={(e) => setPrepSec(Number(e.target.value))}>
              <option value={0}>없음 (바로 녹음)</option>
              <option value={3}>3초</option>
              <option value={5}>5초</option>
              <option value={10}>10초</option>
            </select>
          </label>
          <label className="toggle">
            <input type="checkbox" checked={includeUnselected} onChange={(e) => setIncludeUnselected(e.target.checked)} />
            <span>Survey에서 선택하지 않은 주제도 출제</span>
          </label>
          <p className="small muted">질문이 재생된 뒤 준비 시간이 지나면 녹음이 자동으로 시작되고, 제한 시간이 되면 자동으로 종료됩니다.</p>
          <button className="btn btn-primary btn-lg" onClick={() => void newQuestion()}>훈련 시작</button>
          {practice.length > 0 && <p className="small muted">지금까지 {practice.length}회 연습했습니다. <a href="#/history">기록 보기</a></p>}
        </section>
      )}

      {phase !== 'setup' && record && (
        <section className="card practice-card">
          <div className="row between wrap">
            <span className="chips">
              <span className="chip">{questionTypeLabels[record.question.type]}</span>
              <span className="chip chip-soft">{record.question.topicLabel}</span>
            </span>
            <span className="small muted">이번 세션 {session.count}문항</span>
          </div>
          <p className="question-text" lang="en">{record.question.text}</p>

          {phase === 'listening' && <p className="muted">🔊 질문을 듣는 중…</p>}
          {phase === 'countdown' && (
            <div className="countdown" aria-live="assertive">
              <span>{countdown}</span>
              <p className="small muted">초 후 녹음이 시작됩니다</p>
            </div>
          )}
          {(phase === 'answering' || phase === 'review') && (
            <AudioRecorder
              recorder={recorder}
              onStart={() => {
                setPhase('answering');
                void recorder.start(record.question.id, `${record.id}:answer`);
              }}
              savedAudioKey={null}
              timeLimitSec={timeLimit || undefined}
            />
          )}

          {phase === 'review' && record.answer && (
            <>
              <AnswerFeedback
                index={0}
                question={record.question}
                answer={record.answer}
                feedback={record.evaluation?.perQuestion[0]}
                onTranscriptChange={(text) => update({ answer: { ...record.answer!, transcript: text, transcriptSource: text ? 'manual' : 'none' } })}
                defaultOpen
              />
              <AiEvaluationPanel
                items={buildItems([record.question], { [record.question.id]: record.answer })}
                level={settings.level ?? 4}
                targetGrade={settings.targetGrade}
                evaluation={record.evaluation}
                onEvaluated={(evaluation) => update({ evaluation })}
              />
            </>
          )}
          {phase === 'review' && !record.answer && <Notice tone="warn">답변이 저장되지 않았습니다. 다시 녹음하거나 다음 질문으로 넘어가세요.</Notice>}

          <div className="wizard-actions">
            <button className="btn btn-ghost" disabled={recorder.status !== 'idle'} onClick={() => { stopSpeaking(); setPhase('setup'); }}>설정 변경</button>
            <button className="btn btn-primary" disabled={recorder.status !== 'idle' || phase === 'listening'} onClick={() => void newQuestion()}>
              다음 돌발 질문 →
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
