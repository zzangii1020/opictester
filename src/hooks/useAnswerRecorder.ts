import { useCallback, useEffect, useRef, useState } from 'react';
import { RecorderError, VoiceRecorder } from '../lib/recorder';
import { startTranscription, type TranscriptionSession } from '../lib/speech';
import { putAudio } from '../lib/audioDb';
import type { AnswerRecord } from '../types';

export type RecorderStatus = 'idle' | 'starting' | 'recording' | 'saving';

interface Options {
  sttEnabled: boolean;
  /** Called when a recording has been stored in IndexedDB. */
  onSaved: (answer: AnswerRecord) => void;
  onStarted?: () => void;
  onAborted?: () => void;
}

/** Records one answer, optionally transcribes it, and stores the audio locally. */
export function useAnswerRecorder({ sttEnabled, onSaved, onStarted, onAborted }: Options) {
  const recorderRef = useRef<VoiceRecorder | null>(null);
  const sttRef = useRef<TranscriptionSession | null>(null);
  const targetRef = useRef<{ questionId: string; audioKey: string } | null>(null);
  const [status, setStatus] = useState<RecorderStatus>('idle');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [level, setLevel] = useState(0);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sttNotice, setSttNotice] = useState<string | null>(null);
  const callbacks = useRef({ onSaved, onStarted, onAborted });
  callbacks.current = { onSaved, onStarted, onAborted };

  useEffect(() => {
    if (status !== 'recording') return;
    const started = performance.now();
    let frame = 0;
    const loop = () => {
      setElapsedMs(performance.now() - started);
      setLevel(recorderRef.current?.level() ?? 0);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [status]);

  const start = useCallback(
    async (questionId: string, audioKey: string) => {
      if (status !== 'idle') return;
      setError(null);
      setSttNotice(null);
      setLiveTranscript('');
      setElapsedMs(0);
      setStatus('starting');
      const recorder = new VoiceRecorder();
      try {
        await recorder.start();
      } catch (err) {
        setStatus('idle');
        setError(err instanceof RecorderError ? err.message : '녹음을 시작하지 못했습니다.');
        return;
      }
      recorderRef.current = recorder;
      targetRef.current = { questionId, audioKey };
      if (sttEnabled) {
        sttRef.current = startTranscription(setLiveTranscript, setSttNotice);
        if (!sttRef.current) setSttNotice('이 브라우저는 음성 인식을 지원하지 않습니다. 녹음은 정상 저장되며, 답변 텍스트는 결과 화면에서 직접 입력할 수 있습니다.');
      }
      setStatus('recording');
      callbacks.current.onStarted?.();
    },
    [status, sttEnabled],
  );

  const stop = useCallback(async () => {
    const recorder = recorderRef.current;
    const target = targetRef.current;
    if (!recorder || !target || status !== 'recording') return;
    setStatus('saving');
    const sttPromise = sttRef.current?.stop() ?? Promise.resolve('');
    sttRef.current = null;
    try {
      const result = await recorder.stop();
      const transcript = (await sttPromise).trim();
      await putAudio({ key: target.audioKey, blob: result.blob, mimeType: result.mimeType, durationMs: result.durationMs, createdAt: Date.now() });
      callbacks.current.onSaved({
        questionId: target.questionId,
        audioKey: target.audioKey,
        mimeType: result.mimeType,
        durationMs: result.durationMs,
        transcript,
        transcriptSource: transcript ? 'speech' : 'none',
        recordedAt: Date.now(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : '녹음을 저장하지 못했습니다.');
      callbacks.current.onAborted?.();
    } finally {
      recorderRef.current = null;
      targetRef.current = null;
      setStatus('idle');
    }
  }, [status]);

  const cancel = useCallback(() => {
    sttRef.current?.abort();
    sttRef.current = null;
    recorderRef.current?.cancel();
    recorderRef.current = null;
    if (targetRef.current) callbacks.current.onAborted?.();
    targetRef.current = null;
    setStatus('idle');
  }, []);

  useEffect(() => () => {
    sttRef.current?.abort();
    recorderRef.current?.cancel();
  }, []);

  return { status, elapsedMs, level, liveTranscript, error, sttNotice, start, stop, cancel, clearError: () => setError(null) };
}
