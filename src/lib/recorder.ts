/*
 * MediaRecorder wrapper. Picks the first container the browser can produce:
 * Chrome/Firefox/Edge → webm/ogg (Opus), Safari/iOS → mp4 (AAC).
 */
const MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4;codecs=mp4a.40.2',
  'audio/mp4',
  'audio/ogg;codecs=opus',
  'audio/aac',
];

export interface RecordingResult {
  blob: Blob;
  mimeType: string;
  durationMs: number;
}

export type RecorderErrorCode = 'unsupported' | 'insecure' | 'denied' | 'no-device' | 'busy' | 'empty' | 'unknown';

export class RecorderError extends Error {
  code: RecorderErrorCode;
  constructor(code: RecorderErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export function recordingSupport(): { ok: boolean; reason?: string } {
  if (!window.isSecureContext) return { ok: false, reason: '마이크는 HTTPS 또는 localhost 주소에서만 사용할 수 있습니다.' };
  if (!navigator.mediaDevices?.getUserMedia) return { ok: false, reason: '이 브라우저는 마이크 입력(getUserMedia)을 지원하지 않습니다.' };
  if (typeof MediaRecorder === 'undefined') return { ok: false, reason: '이 브라우저는 녹음(MediaRecorder)을 지원하지 않습니다. 최신 Chrome, Edge, Safari, Firefox를 사용해 주세요.' };
  return { ok: true };
}

export function pickMimeType(): string {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return '';
  return MIME_CANDIDATES.find((t) => MediaRecorder.isTypeSupported(t)) ?? '';
}

function toRecorderError(err: unknown): RecorderError {
  if (err instanceof RecorderError) return err;
  const name = err instanceof DOMException ? err.name : '';
  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      return new RecorderError('denied', '마이크 권한이 거부되었습니다. 주소창의 자물쇠(사이트 설정) 아이콘에서 마이크를 "허용"으로 바꾼 뒤 다시 시도해 주세요.');
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return new RecorderError('no-device', '사용할 수 있는 마이크를 찾지 못했습니다. 마이크 연결 상태를 확인해 주세요.');
    case 'NotReadableError':
    case 'TrackStartError':
      return new RecorderError('busy', '다른 앱이 마이크를 사용 중이거나 장치 오류가 발생했습니다. 다른 앱을 종료한 뒤 다시 시도해 주세요.');
    case 'SecurityError':
      return new RecorderError('insecure', '보안 설정 때문에 마이크를 사용할 수 없습니다. HTTPS 주소로 접속해 주세요.');
    default:
      return new RecorderError('unknown', `녹음을 시작하지 못했습니다. (${err instanceof Error ? err.message : String(err)})`);
  }
}

export function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export class VoiceRecorder {
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private startedAt = 0;
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private levelBuffer: Uint8Array<ArrayBuffer> | null = null;

  get isRecording() {
    return this.recorder?.state === 'recording';
  }

  async start(): Promise<void> {
    const support = recordingSupport();
    if (!support.ok) throw new RecorderError(window.isSecureContext ? 'unsupported' : 'insecure', support.reason!);
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      const mimeType = pickMimeType();
      this.recorder = new MediaRecorder(this.stream, mimeType ? { mimeType } : undefined);
      this.chunks = [];
      this.recorder.ondataavailable = (e) => {
        if (e.data.size > 0) this.chunks.push(e.data);
      };
      // iOS/Safari's MP4 recorder misbehaves with a timeslice; let it deliver one blob on stop instead.
      if (this.recorder.mimeType.includes('mp4') || mimeType.includes('mp4') || isIOS()) this.recorder.start();
      else this.recorder.start(1000);
      this.startedAt = performance.now();
      this.setupMeter(this.stream);
    } catch (err) {
      this.release();
      throw toRecorderError(err);
    }
  }

  stop(): Promise<RecordingResult> {
    const recorder = this.recorder;
    if (!recorder || recorder.state === 'inactive') {
      this.release();
      return Promise.reject(new RecorderError('empty', '진행 중인 녹음이 없습니다.'));
    }
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(watchdog);
        const durationMs = Math.round(performance.now() - this.startedAt);
        const mimeType = recorder.mimeType || this.chunks[0]?.type || 'audio/mp4';
        const blob = new Blob(this.chunks, { type: mimeType });
        this.release();
        if (blob.size === 0) reject(new RecorderError('empty', '녹음된 소리가 없습니다. 마이크가 음소거되어 있지 않은지 확인하고 다시 녹음해 주세요.'));
        else resolve({ blob, mimeType, durationMs });
      };
      // Some iOS versions never fire onstop; finish with whatever data arrived instead of hanging forever.
      const watchdog = window.setTimeout(finish, 4000);
      recorder.onstop = () => window.setTimeout(finish, 0); // let a final dataavailable land first
      try {
        recorder.stop();
      } catch {
        finish();
      }
    });
  }

  /** Abandon a recording without producing a result. */
  cancel() {
    if (this.recorder && this.recorder.state !== 'inactive') {
      this.recorder.onstop = null;
      this.recorder.stop();
    }
    this.release();
  }

  /** Current input level 0..1 for the on-screen meter. */
  level(): number {
    if (!this.analyser || !this.levelBuffer) return 0;
    this.analyser.getByteTimeDomainData(this.levelBuffer);
    let peak = 0;
    for (const v of this.levelBuffer) peak = Math.max(peak, Math.abs(v - 128));
    return Math.min(1, peak / 64);
  }

  private setupMeter(stream: MediaStream) {
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      this.audioCtx = new Ctx();
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 512;
      this.levelBuffer = new Uint8Array(new ArrayBuffer(this.analyser.fftSize));
      this.audioCtx.createMediaStreamSource(stream).connect(this.analyser);
      // iOS creates the context suspended because it is no longer inside the tap gesture.
      if (this.audioCtx.state === 'suspended') void this.audioCtx.resume().catch(() => undefined);
    } catch {
      this.analyser = null; // meter is optional
    }
  }

  private release() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.recorder = null;
    this.analyser = null;
    this.levelBuffer = null;
    void this.audioCtx?.close().catch(() => undefined);
    this.audioCtx = null;
  }
}
