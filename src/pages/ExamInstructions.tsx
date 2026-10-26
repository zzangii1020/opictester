import { useEffect, useRef, useState } from 'react';
import { useStore } from '../state/AppStore';
import { navigate } from '../hooks/useHashRoute';
import { createExam, SESSION1_COUNT, totalQuestionsFor } from '../engine/examEngine';
import { isSurveyComplete, surveyTopics } from '../engine/surveyData';
import { RecorderError, recordingSupport, VoiceRecorder } from '../lib/recorder';
import { speak, sttSupported, ttsSupported } from '../lib/speech';
import { Notice, PageHeader, StatusBadge } from '../components/common';

function MicCheck() {
  const [state, setState] = useState<'idle' | 'recording' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [level, setLevel] = useState(0);
  const recRef = useRef<VoiceRecorder | null>(null);

  useEffect(() => () => {
    recRef.current?.cancel();
  }, []);
  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url);
  }, [url]);

  const run = async () => {
    setError(null);
    const rec = new VoiceRecorder();
    try {
      await rec.start();
    } catch (err) {
      setError(err instanceof RecorderError ? err.message : '마이크를 사용할 수 없습니다.');
      return;
    }
    recRef.current = rec;
    setState('recording');
    const tick = window.setInterval(() => setLevel(rec.level()), 80);
    await new Promise((r) => window.setTimeout(r, 4000));
    window.clearInterval(tick);
    try {
      const result = await rec.stop();
      setUrl(URL.createObjectURL(result.blob));
      setState('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : '녹음 테스트에 실패했습니다.');
      setState('idle');
    }
    recRef.current = null;
  };

  const support = recordingSupport();
  if (!support.ok) return <Notice tone="error" title="녹음할 수 없는 환경">{support.reason}</Notice>;

  return (
    <div className="mic-check">
      {state === 'recording' ? (
        <>
          <p><span className="rec-dot" /> 4초 동안 “Hello, this is a microphone test.”라고 말해 보세요.</p>
          <div className="meter"><div className="meter-fill" style={{ width: `${Math.round(level * 100)}%` }} /></div>
        </>
      ) : (
        <button className="btn btn-outline" onClick={() => void run()}>
          🎙️ {state === 'done' ? '마이크 다시 테스트' : '마이크 테스트 (권한 요청)'}
        </button>
      )}
      {state === 'done' && url && (
        <div>
          <p className="small">녹음된 소리를 확인하세요. 소리가 들리지 않으면 마이크 설정을 확인하세요.</p>
          <audio controls src={url} className="audio" />
        </div>
      )}
      {error && (
        <Notice tone="error">
          {error}
          <div><button className="btn btn-sm btn-outline" onClick={() => void run()}>다시 시도</button></div>
        </Notice>
      )}
    </div>
  );
}

export function ExamInstructions() {
  const { settings, updatePrefs, setActiveExam, activeExam } = useStore();
  const { prefs, survey, level } = settings;
  const ready = isSurveyComplete(survey, prefs.strictSurveyRule) && !!level;

  const start = () => {
    if (!survey || !level) return;
    setActiveExam(createExam(survey, level));
    navigate('/exam', true);
  };

  if (activeExam) {
    return (
      <div className="narrow">
        <Notice tone="info" title="진행 중인 시험이 있습니다">
          <button className="btn btn-primary btn-sm" onClick={() => navigate('/exam')}>이어서 응시하기</button>
        </Notice>
      </div>
    );
  }

  return (
    <div className="narrow">
      <PageHeader title="시험 안내" subtitle="실전 모의고사 · 3단계 — 설정을 확인하고 시험을 시작합니다." back={{ label: '난이도 선택으로', href: '/difficulty?flow=exam' }} />

      {!ready && (
        <Notice tone="warn">
          Survey와 난이도 설정이 필요합니다. <a href="#/survey?flow=exam">Survey</a> · <a href="#/difficulty?flow=exam">난이도</a>
        </Notice>
      )}

      <section className="card">
        <h2>시험 진행 순서</h2>
        <ol className="flow-list">
          <li>질문이 음성으로 재생됩니다. 질문을 듣고 <b>녹음 시작</b>을 눌러 영어로 답변하세요.</li>
          <li>답변이 끝나면 <b>녹음 종료</b> → <b>다음 문제</b>로 이동합니다. 녹음 중에는 다음 문제로 넘어갈 수 없습니다.</li>
          <li>{SESSION1_COUNT}번 문항 뒤에 이후 질문의 난이도를 다시 고릅니다.</li>
          <li>마지막 문항 뒤 시험을 종료하면 결과 화면에서 녹음·전사·피드백을 확인합니다.</li>
        </ol>
        <p className="small muted">권장 진행 시간 약 40분 · 문항당 1~2분 답변을 권장합니다. 시간 제한으로 시험이 강제 종료되지는 않습니다. <StatusBadge status="mock" /></p>
      </section>

      {ready && survey && level && (
        <section className="card">
          <h2>설정 확인</h2>
          <dl className="summary-list">
            <div className="summary-row"><dt>Survey 출제 주제</dt><dd>{surveyTopics(survey).map((t) => t.ko).join(', ')}</dd><a className="link-btn" href="#/survey?flow=exam">수정</a></div>
            <div className="summary-row"><dt>난이도</dt><dd>{level}단계 · {totalQuestionsFor(level)}문항</dd><a className="link-btn" href="#/difficulty?flow=exam">수정</a></div>
            <div className="summary-row"><dt>목표 등급</dt><dd>{settings.targetGrade}</dd><a className="link-btn" href="#/">수정</a></div>
          </dl>
        </section>
      )}

      <section className="card">
        <h2>장치 확인</h2>
        <MicCheck />
        <div className="row gap wrap">
          <button className="btn btn-outline" disabled={!ttsSupported()} onClick={() => void speak('This is how the questions will sound during the test.', prefs.ttsRate)}>
            🔊 질문 음성 테스트
          </button>
          {!ttsSupported() && <span className="small error-text">이 브라우저는 음성 합성을 지원하지 않아 질문이 텍스트로만 표시됩니다.</span>}
        </div>
      </section>

      <section className="card">
        <h2>학습용 설정 <StatusBadge status="mock" /></h2>
        <p className="small muted">아래 기능은 연습 편의를 위한 것으로, 실제 시험에서 같은 방식으로 제공된다고 보장하지 않습니다.</p>
        <label className="toggle">
          <input type="checkbox" checked={prefs.showQuestionText} onChange={(e) => updatePrefs({ showQuestionText: e.target.checked })} />
          <span>질문 텍스트 표시 (끄면 듣기에만 의존 — 실전 감각 연습)</span>
        </label>
        <label className="toggle">
          <input type="checkbox" checked={prefs.autoRecord} onChange={(e) => updatePrefs({ autoRecord: e.target.checked })} />
          <span>질문 재생이 끝나면 자동으로 녹음 시작</span>
        </label>
        <label className="field">
          <span>질문 다시 듣기 횟수</span>
          <select value={prefs.replayLimit} onChange={(e) => updatePrefs({ replayLimit: Number(e.target.value) })}>
            <option value={1}>1회 (수험 자료에서 흔히 안내되는 방식)</option>
            <option value={2}>2회</option>
            <option value={0}>제한 없음 (학습용)</option>
          </select>
        </label>
        <label className="field">
          <span>질문 음성 속도</span>
          <select value={prefs.ttsRate} onChange={(e) => updatePrefs({ ttsRate: Number(e.target.value) })}>
            <option value={0.8}>느리게</option>
            <option value={0.95}>보통</option>
            <option value={1.1}>빠르게</option>
          </select>
        </label>

        <div className="stt-box">
          <label className="toggle">
            <input
              type="checkbox"
              disabled={!sttSupported()}
              checked={prefs.sttEnabled && sttSupported()}
              onChange={(e) => updatePrefs({ sttEnabled: e.target.checked })}
            />
            <span><b>브라우저 음성 인식으로 답변 텍스트 만들기</b> (선택)</span>
          </label>
          {sttSupported() ? (
            <p className="small muted">
              Chrome·Edge·Safari 등의 음성 인식은 인식을 위해 음성을 <b>브라우저 제조사의 서버</b>로 보낼 수 있습니다. 동의하는 경우에만 켜세요. 끄더라도 녹음·재생은 정상 동작하며, 결과 화면에서 답변 텍스트를 직접 입력할 수 있습니다. 일부 모바일 기기에서는 녹음과 음성 인식을 동시에 쓰면 인식이 불안정할 수 있습니다.
            </p>
          ) : (
            <p className="small muted">이 브라우저는 음성 인식(Web Speech API)을 지원하지 않습니다. 녹음·재생은 정상 동작하며, 결과 화면에서 답변 텍스트를 직접 입력할 수 있습니다.</p>
          )}
        </div>
      </section>

      <Notice tone="info">
        녹음 파일은 이 브라우저(IndexedDB)에만 저장되며 외부로 전송되지 않습니다. 새로고침하거나 화면을 벗어나도 진행 상태가 저장되어 이어서 응시할 수 있습니다(녹음 중이던 답변은 다시 녹음해야 합니다).
      </Notice>

      <div className="wizard-actions">
        <a className="btn btn-ghost" href="#/difficulty?flow=exam">이전</a>
        <button className="btn btn-primary btn-lg" disabled={!ready} onClick={start}>본 시험 시작</button>
      </div>
    </div>
  );
}
