import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from '../state/AppStore';
import { navigate } from '../hooks/useHashRoute';
import { useAnswerRecorder } from '../hooks/useAnswerRecorder';
import { examReducer, adjustLevel, SESSION1_COUNT, type ExamAction } from '../engine/examEngine';
import { questionTypeLabels } from '../engine/questionBank';
import { formatDuration } from '../lib/metrics';
import { stopSpeaking } from '../lib/speech';
import { QuestionPlayer } from '../components/QuestionPlayer';
import { AudioRecorder } from '../components/AudioRecorder';
import { ConfirmDialog, Notice, ProgressBar } from '../components/common';
import type { Adjustment, ExamResult } from '../types';

export function ExamSession() {
  const { activeExam: exam, setActiveExam, settings, saveResult } = useStore();
  const { prefs } = settings;
  const [paused, setPaused] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [dialog, setDialog] = useState<'skip' | 'finish' | 'exit' | null>(null);
  const [lostRecording, setLostRecording] = useState(() => !!exam?.recordingQuestionId);
  const finishing = useRef(false);

  const dispatch = useCallback(
    (action: ExamAction) => setActiveExam((prev) => (prev ? examReducer(prev, action) : prev)),
    [setActiveExam],
  );

  const recorder = useAnswerRecorder({
    sttEnabled: prefs.sttEnabled,
    onSaved: (answer) => dispatch({ type: 'answerSaved', answer }),
    onStarted: () => {
      const qid = exam?.questions[exam.currentIndex]?.id;
      if (qid) dispatch({ type: 'recordingStarted', questionId: qid });
    },
    onAborted: () => dispatch({ type: 'recordingStopped' }),
  });
  const recording = recorder.status === 'recording';
  const recorderBusy = recorder.status !== 'idle';

  // A reload during recording loses that take; clear the flag and tell the user.
  useEffect(() => {
    if (exam?.recordingQuestionId && recorder.status === 'idle') dispatch({ type: 'recordingStopped' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Exam clock (pauses with the exam).
  const phase = exam?.phase;
  useEffect(() => {
    if (paused || phase !== 'question') return;
    const id = window.setInterval(() => dispatch({ type: 'tick', ms: 1000 }), 1000);
    return () => window.clearInterval(id);
  }, [phase, paused, dispatch]);

  // Progress is persisted continuously; only an in-flight recording would be lost on unload.
  useEffect(() => {
    if (!recording) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [recording]);

  // Turn a finished exam into a saved result.
  useEffect(() => {
    if (!exam || exam.phase !== 'finished' || finishing.current) return;
    finishing.current = true;
    stopSpeaking();
    const result: ExamResult = {
      id: exam.id,
      kind: 'exam',
      startedAt: exam.startedAt,
      finishedAt: Date.now(),
      elapsedMs: exam.elapsedMs,
      level: exam.level,
      adjustment: exam.adjustment,
      adjustedLevel: exam.adjustedLevel,
      targetGrade: settings.targetGrade,
      survey: exam.survey,
      questions: exam.questions,
      answers: exam.answers,
      evaluation: null,
    };
    saveResult(result);
    setActiveExam(null);
    navigate(`/results/${exam.id}`, true);
  }, [exam, saveResult, setActiveExam, settings.targetGrade]);

  if (!exam) {
    return (
      <div className="narrow">
        <Notice tone="info" title="진행 중인 시험이 없습니다">
          <a className="btn btn-primary btn-sm" href="#/survey?flow=exam">실전 모의고사 시작</a>
        </Notice>
      </div>
    );
  }

  if (exam.phase === 'adjust') {
    const options: { id: Adjustment; label: string; desc: string }[] = [
      { id: 'easier', label: '쉬운 질문', desc: `난이도 ${adjustLevel(exam.level, 'easier')}단계 수준으로 진행` },
      { id: 'same', label: '비슷한 질문', desc: `난이도 ${exam.level}단계 수준 유지` },
      { id: 'harder', label: '어려운 질문', desc: `난이도 ${adjustLevel(exam.level, 'harder')}단계 수준으로 진행` },
    ];
    return (
      <div className="exam-shell">
        <div className="exam-inner narrow">
          <p className="eyebrow">{SESSION1_COUNT}/{exam.totalQuestions}문항 완료</p>
          <h1>이후 질문의 난이도를 선택하세요</h1>
          <p className="muted">지금까지의 질문과 비교해 남은 질문을 어떻게 받을지 고르세요. (난이도 재조정 — 단계 변화 폭은 이 모의고사의 설정입니다)</p>
          <div className="adjust-grid">
            {options.map((o) => (
              <button key={o.id} className="adjust-card" onClick={() => dispatch({ type: 'adjust', adjustment: o.id })}>
                <span className="adjust-label">{o.label}</span>
                <span className="small muted">{o.desc}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (exam.phase === 'finished') return <div className="narrow"><p>결과를 저장하는 중…</p></div>;

  const question = exam.questions[exam.currentIndex];
  const answer = exam.answers[question.id];
  const isLast = exam.currentIndex + 1 >= exam.totalQuestions;
  const answeredCount = Object.keys(exam.answers).length;
  const audioKey = `${exam.id}:${question.id}`;

  const startRecording = () => {
    stopSpeaking();
    setLostRecording(false);
    void recorder.start(question.id, audioKey);
  };

  const goNext = () => {
    if (recorderBusy || playing) return;
    if (!answer) {
      setDialog('skip');
      return;
    }
    if (isLast) {
      setDialog('finish');
      return;
    }
    dispatch({ type: 'next' });
  };

  const stopThen = async (fn: () => void) => {
    if (recording) await recorder.stop();
    stopSpeaking();
    fn();
  };

  return (
    <div className="exam-shell">
      <header className="exam-bar">
        <div className="exam-bar-left">
          <span className="exam-brand">OPIc 실전형 모의고사</span>
          <span className="exam-count" aria-label="현재 문항">
            Question <b>{exam.currentIndex + 1}</b> of {exam.totalQuestions}
          </span>
        </div>
        <div className="exam-bar-right">
          <span className="exam-clock" title="경과 시간 (권장 40분)">⏱ {formatDuration(exam.elapsedMs)}</span>
          <button className="btn btn-ghost-dark btn-sm" onClick={() => void stopThen(() => setPaused(true))}>일시정지</button>
          <button className="btn btn-ghost-dark btn-sm" onClick={() => setDialog('exit')}>나가기</button>
        </div>
      </header>
      <ProgressBar value={exam.currentIndex + (answer ? 1 : 0)} max={exam.totalQuestions} label="시험 진행률" />

      <main className="exam-inner">
        {lostRecording && (
          <Notice tone="warn">페이지를 다시 열기 전에 녹음 중이던 답변은 저장되지 않았습니다. 이 문항을 다시 녹음해 주세요.</Notice>
        )}
        <div className="q-meta">
          <span className="chip chip-dark">{questionTypeLabels[question.type]}</span>
          {question.topicLabel !== questionTypeLabels[question.type] && <span className="small dim">{question.topicLabel}</span>}
        </div>

        <QuestionPlayer
          question={question}
          rate={prefs.ttsRate}
          replayLimit={prefs.replayLimit}
          replaysUsed={exam.replays[question.id] ?? 0}
          showText={prefs.showQuestionText}
          locked={recorderBusy}
          paused={paused}
          onReplay={() => dispatch({ type: 'replayed', questionId: question.id })}
          onPlayingChange={setPlaying}
          onFirstPlayEnd={() => {
            if (prefs.autoRecord && !exam.answers[question.id]) startRecording();
          }}
        />

        <AudioRecorder
          recorder={recorder}
          onStart={startRecording}
          savedAudioKey={answer ? answer.audioKey : null}
          savedDurationMs={answer?.durationMs}
          disabled={playing}
          disabledReason={playing ? '질문 재생이 끝나면 녹음할 수 있습니다.' : undefined}
        />

        <div className="exam-nav">
          <span className="small dim">답변 완료 {answeredCount}/{exam.totalQuestions}</span>
          <button className="btn btn-primary btn-lg" disabled={recorderBusy || playing} onClick={goNext}>
            {isLast ? '시험 종료' : '다음 문제 →'}
          </button>
        </div>
        {recording && <p className="small dim center">녹음 중에는 다음 문제로 이동할 수 없습니다. 먼저 녹음을 종료하세요.</p>}
        <p className="tiny dim center">일시정지·다시 듣기 횟수 설정·질문 텍스트 표시는 학습용 기능이며 실제 시험과 다를 수 있습니다.</p>
      </main>

      {paused && (
        <div className="modal-backdrop">
          <div className="modal" role="dialog" aria-modal="true">
            <h2>시험 일시정지</h2>
            <p>시험 시간이 멈췄습니다. 실제 시험에서는 일시정지 기능을 전제로 하지 마세요(학습용 기능).</p>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => { setPaused(false); navigate('/'); }}>저장하고 홈으로</button>
              <button className="btn btn-primary" onClick={() => setPaused(false)}>계속하기</button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={dialog === 'skip'}
        title="답변 없이 넘어갈까요?"
        confirmLabel={isLast ? '답변 없이 시험 종료' : '답변 없이 다음 문제'}
        onCancel={() => setDialog(null)}
        onConfirm={() => {
          setDialog(null);
          if (isLast) dispatch({ type: 'finish' });
          else dispatch({ type: 'next' });
        }}
      >
        이 문항은 미응답으로 기록되며, 지나간 문항으로는 돌아갈 수 없습니다.
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog === 'finish'}
        title="시험을 종료할까요?"
        confirmLabel="시험 종료하고 결과 보기"
        onCancel={() => setDialog(null)}
        onConfirm={() => {
          setDialog(null);
          dispatch({ type: 'finish' });
        }}
      >
        {answeredCount}/{exam.totalQuestions}문항에 답변했습니다. 종료 후에는 답변을 다시 녹음할 수 없습니다.
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog === 'exit'}
        title="시험에서 나갈까요?"
        confirmLabel="저장하고 나가기"
        cancelLabel="계속 응시"
        onCancel={() => setDialog(null)}
        onConfirm={() => {
          setDialog(null);
          void stopThen(() => navigate('/'));
        }}
      >
        <p>진행 상태와 저장된 답변은 이 브라우저에 보관되며 홈에서 이어서 응시할 수 있습니다.</p>
        <p>
          지금 바로 결과를 보려면{' '}
          <button className="link-btn" onClick={() => { setDialog(null); void stopThen(() => dispatch({ type: 'finish' })); }}>
            여기서 시험 종료
          </button>
          를 누르세요.
        </p>
      </ConfirmDialog>
    </div>
  );
}
