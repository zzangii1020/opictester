import { useEffect, useRef, useState } from 'react';
import type { Question } from '../types';
import { speak, stopSpeaking, ttsSupported } from '../lib/speech';

interface Props {
  question: Question;
  rate: number;
  /** 0 = unlimited */
  replayLimit: number;
  replaysUsed: number;
  showText: boolean;
  /** Blocks replay (e.g. while recording). */
  locked: boolean;
  paused?: boolean;
  onReplay: () => void;
  onPlayingChange: (playing: boolean) => void;
  /** Fired after the first automatic playback finishes. */
  onFirstPlayEnd?: () => void;
}

export function QuestionPlayer({ question, rate, replayLimit, replaysUsed, showText, locked, paused, onReplay, onPlayingChange, onFirstPlayEnd }: Props) {
  const [playing, setPlaying] = useState(false);
  const [revealed, setRevealed] = useState(showText);
  const tts = ttsSupported();
  const playedFor = useRef<string | null>(null);
  const cbs = useRef({ onPlayingChange, onFirstPlayEnd });
  cbs.current = { onPlayingChange, onFirstPlayEnd };

  const generation = useRef(0);

  const play = async (onDone?: () => void) => {
    const gen = ++generation.current;
    setPlaying(true);
    cbs.current.onPlayingChange(true);
    await speak(question.text, rate);
    if (gen !== generation.current) return; // superseded by a newer playback
    setPlaying(false);
    cbs.current.onPlayingChange(false);
    onDone?.();
  };

  // Auto-play once per question. If interrupted (pause, StrictMode remount) before it finishes, it plays again on resume.
  useEffect(() => {
    setRevealed(showText || !tts);
    if (paused || playedFor.current === question.id) return;
    playedFor.current = question.id;
    if (!tts) {
      cbs.current.onFirstPlayEnd?.();
      return;
    }
    let active = true;
    let finished = false;
    void play(() => {
      finished = true;
      if (active) cbs.current.onFirstPlayEnd?.();
    });
    return () => {
      active = false;
      if (!finished) {
        playedFor.current = null;
        stopSpeaking();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question.id, paused]);

  useEffect(() => () => stopSpeaking(), []);

  const remaining = replayLimit === 0 ? Infinity : replayLimit - replaysUsed;
  const canReplay = tts && !playing && !locked && remaining > 0;

  return (
    <section className="question-player" aria-live="polite">
      <div className={`speaker ${playing ? 'speaking' : ''}`} aria-hidden="true">
        <span /><span /><span /><span /><span />
      </div>
      <p className="speaker-status">{playing ? '질문을 재생하고 있습니다…' : tts ? '질문 재생이 끝났습니다.' : '이 브라우저는 음성 합성을 지원하지 않아 질문을 텍스트로 표시합니다.'}</p>

      {revealed ? (
        <p className="question-text" lang="en">{question.text}</p>
      ) : (
        <button className="btn btn-ghost btn-sm" onClick={() => setRevealed(true)}>질문 텍스트 보기 (학습용)</button>
      )}

      <div className="player-actions">
        <button
          className="btn btn-outline"
          disabled={!canReplay}
          onClick={() => {
            onReplay();
            void play();
          }}
        >
          ↻ 다시 듣기 {replayLimit === 0 ? '' : `(${Math.max(0, remaining)}회 남음)`}
        </button>
        {playing && (
          <button className="btn btn-ghost btn-sm" onClick={() => stopSpeaking()}>
            재생 중지
          </button>
        )}
      </div>
    </section>
  );
}
