import { useEffect, useState } from 'react';
import { getAudio } from '../lib/audioDb';

/** Plays a locally stored answer from IndexedDB. */
export function AudioPlayback({ audioKey, compact }: { audioKey: string; compact?: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    setUrl(null);
    setError(null);
    getAudio(audioKey)
      .then((audio) => {
        if (cancelled) return;
        if (!audio) {
          setError('저장된 녹음 파일을 찾을 수 없습니다. (브라우저 데이터가 삭제되었거나 다른 기기에서 기록을 보고 있을 수 있습니다)');
          return;
        }
        objectUrl = URL.createObjectURL(audio.blob);
        setUrl(objectUrl);
      })
      .catch(() => !cancelled && setError('녹음 파일을 불러오지 못했습니다.'));
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [audioKey]);

  if (error) return <p className="small error-text">{error}</p>;
  if (!url) return <p className="small muted">녹음 불러오는 중…</p>;
  return (
    <audio
      className={compact ? 'audio compact' : 'audio'}
      controls
      preload="metadata"
      src={url}
      onError={() => setError('이 브라우저에서 재생할 수 없는 오디오 형식입니다. 녹음한 브라우저에서 다시 열어 주세요.')}
    />
  );
}
