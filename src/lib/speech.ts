/*
 * Text-to-speech for questions (speechSynthesis) and optional speech-to-text (Web Speech API).
 * Speech recognition in Chrome/Edge/Safari may send audio to the browser vendor's servers,
 * so it only runs after the user explicitly opts in.
 */

export function ttsSupported() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
}

function pickVoice(): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices();
  return (
    voices.find((v) => v.lang === 'en-US' && /natural|google|samantha|aria|jenny/i.test(v.name)) ??
    voices.find((v) => v.lang === 'en-US') ??
    voices.find((v) => v.lang.startsWith('en'))
  );
}

/** Speaks text; resolves when finished, cancelled, or if TTS fails (the text is always shown as fallback). */
export function speak(text: string, rate = 0.95): Promise<'ended' | 'error'> {
  if (!ttsSupported()) return Promise.resolve('error');
  return new Promise((resolve) => {
    const synth = window.speechSynthesis;
    synth.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'en-US';
    utter.rate = rate;
    const voice = pickVoice();
    if (voice) utter.voice = voice;
    let done = false;
    const finish = (r: 'ended' | 'error') => {
      if (done) return;
      done = true;
      clearTimeout(watchdog);
      resolve(r);
    };
    utter.onend = () => finish('ended');
    utter.onerror = () => finish('error');
    // Some engines never fire onend; cap at a generous estimate of the speaking time.
    const watchdog = window.setTimeout(() => finish('ended'), Math.max(4000, (text.split(/\s+/).length / (2.6 * rate)) * 1000 + 4000));
    synth.speak(utter);
  });
}

export function stopSpeaking() {
  if (ttsSupported()) window.speechSynthesis.cancel();
}

// Minimal typings for the Web Speech recognition API, which is not in lib.dom for all TS versions.
interface RecognitionAlternative { transcript: string }
interface RecognitionResult { isFinal: boolean; 0: RecognitionAlternative; length: number }
interface RecognitionEvent { resultIndex: number; results: { length: number; [i: number]: RecognitionResult } }
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function sttSupported() {
  return typeof window !== 'undefined' && recognitionCtor() !== null;
}

export interface TranscriptionSession {
  stop(): Promise<string>;
  abort(): void;
}

/**
 * Starts continuous recognition alongside the recorder. Chrome ends recognition after silences,
 * so it is restarted until stop() is called.
 */
export function startTranscription(onUpdate: (text: string) => void, onError: (message: string) => void): TranscriptionSession | null {
  const Ctor = recognitionCtor();
  if (!Ctor) return null;
  let finalText = '';
  let interim = '';
  let active = true;
  let resolveStop: ((t: string) => void) | null = null;
  let rec: Recognition;
  let startedAt = 0;
  let quickEnds = 0;
  let restarts = 0;
  let restartTimer: number | undefined;

  const emit = () => onUpdate(`${finalText} ${interim}`.trim());
  const giveUp = (msg: string) => {
    if (!active) return;
    active = false;
    window.clearTimeout(restartTimer);
    onError(msg);
  };

  const begin = () => {
    rec = new Ctor();
    rec.lang = 'en-US';
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText = `${finalText} ${r[0].transcript}`.trim();
        else interim += r[0].transcript;
      }
      quickEnds = 0;
      emit();
    };
    rec.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return; // handled by onend's restart limits
      giveUp(
        e.error === 'not-allowed' || e.error === 'service-not-allowed'
          ? '음성 인식 권한이 거부되었습니다. 녹음은 계속 저장되며, 결과 화면에서 답변 텍스트를 직접 입력할 수 있습니다.'
          : e.error === 'network'
            ? '음성 인식 서버에 연결하지 못했습니다. 녹음은 정상 저장됩니다.'
            : `음성 인식 오류(${e.error}). 녹음은 정상 저장됩니다.`,
      );
    };
    rec.onend = () => {
      if (interim) {
        finalText = `${finalText} ${interim}`.trim();
        interim = '';
      }
      if (!active) {
        resolveStop?.(finalText);
        return;
      }
      // Engines end sessions after silence, so restart — but never in a tight loop. A session that keeps
      // ending immediately (e.g. the mic is busy with the recorder) means recognition can't run here.
      quickEnds = performance.now() - startedAt < 1500 ? quickEnds + 1 : 0;
      restarts += 1;
      if (quickEnds >= 3 || restarts > 40) {
        giveUp('이 기기에서는 녹음 중 음성 인식이 계속 중단되어 인식을 멈췄습니다. 녹음은 정상 저장되며, 결과 화면에서 답변 텍스트를 직접 입력할 수 있습니다.');
        return;
      }
      restartTimer = window.setTimeout(() => {
        if (!active) return;
        try {
          startedAt = performance.now();
          begin();
        } catch {
          giveUp('음성 인식을 다시 시작하지 못했습니다. 녹음은 정상 저장됩니다.');
        }
      }, 300);
    };
    startedAt = performance.now();
    rec.start();
  };

  try {
    begin();
  } catch {
    return null;
  }

  return {
    stop() {
      active = false;
      window.clearTimeout(restartTimer);
      return new Promise((resolve) => {
        resolveStop = resolve;
        try {
          rec.stop();
        } catch {
          resolve(finalText);
        }
        // Resolve even if the engine never fires onend.
        window.setTimeout(() => resolve(`${finalText} ${interim}`.trim()), 1500);
      });
    },
    abort() {
      active = false;
      window.clearTimeout(restartTimer);
      try {
        rec.abort();
      } catch {
        /* already stopped */
      }
    },
  };
}
