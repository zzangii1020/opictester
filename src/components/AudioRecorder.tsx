import type { useAnswerRecorder } from '../hooks/useAnswerRecorder';
import { formatDuration } from '../lib/metrics';
import { recordingSupport } from '../lib/recorder';
import { AudioPlayback } from './AudioPlayback';

type RecorderApi = ReturnType<typeof useAnswerRecorder>;

interface Props {
  recorder: RecorderApi;
  onStart: () => void;
  savedAudioKey: string | null;
  savedDurationMs?: number;
  disabled?: boolean;
  disabledReason?: string;
  timeLimitSec?: number;
}

export function AudioRecorder({ recorder, onStart, savedAudioKey, savedDurationMs, disabled, disabledReason, timeLimitSec }: Props) {
  const support = recordingSupport();
  const { status, elapsedMs, level, liveTranscript, error, sttNotice } = recorder;
  const recording = status === 'recording';
  const busy = status === 'starting' || status === 'saving';

  if (!support.ok) {
    return (
      <div className="recorder">
        <p className="error-text">{support.reason}</p>
      </div>
    );
  }

  return (
    <section className={`recorder ${recording ? 'is-recording' : ''}`}>
      {recording ? (
        <>
          <div className="rec-indicator" role="status">
            <span className="rec-dot" aria-hidden="true" /> 녹음 중 · 답변하고 있습니다
          </div>
          <div className="rec-timer" aria-label="녹음 시간">
            {formatDuration(elapsedMs)}
            {timeLimitSec ? <span className="muted"> / {formatDuration(timeLimitSec * 1000)}</span> : null}
          </div>
          <div className="meter" aria-hidden="true">
            <div className="meter-fill" style={{ width: `${Math.round(level * 100)}%` }} />
          </div>
          {liveTranscript && <p className="live-transcript" lang="en">{liveTranscript}</p>}
          <button className="btn btn-stop btn-lg" onClick={() => void recorder.stop()}>
            ■ 녹음 종료
          </button>
        </>
      ) : (
        <>
          {savedAudioKey ? (
            <div className="saved-answer">
              <p className="small"><strong>✓ 답변이 저장되었습니다</strong>{savedDurationMs ? ` · ${formatDuration(savedDurationMs)}` : ''}</p>
              <AudioPlayback audioKey={savedAudioKey} />
            </div>
          ) : null}
          <button className="btn btn-record btn-lg" disabled={disabled || busy} onClick={onStart}>
            {status === 'starting' ? '마이크 준비 중…' : status === 'saving' ? '저장 중…' : savedAudioKey ? '● 다시 녹음' : '● 녹음 시작'}
          </button>
          {disabled && disabledReason && <p className="small muted">{disabledReason}</p>}
        </>
      )}
      {error && (
        <div className="notice notice-error" role="alert">
          <div>{error}</div>
          <button className="btn btn-sm btn-outline" onClick={() => { recorder.clearError(); onStart(); }}>다시 시도</button>
        </div>
      )}
      {sttNotice && <p className="small muted">{sttNotice}</p>}
    </section>
  );
}
