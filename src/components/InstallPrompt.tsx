import { useEffect, useState } from 'react';

interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'opic-mock.installDismissed';

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
}

/** Offers "add to home screen": a native prompt on Chrome/Android, instructions on iOS Safari. */
export function InstallPrompt() {
  const [event, setEvent] = useState<InstallEvent | null>(null);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  });
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvent(e as InstallEvent);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  if (dismissed || isStandalone() || (!event && !ios)) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* ignore */
    }
  };

  return (
    <section className="card install-card">
      <div>
        <h2>📱 홈 화면에 앱으로 설치</h2>
        {event ? (
          <p className="small muted">설치하면 주소창 없이 앱처럼 열리고, 인터넷이 없어도 화면이 열립니다.</p>
        ) : (
          <p className="small muted">
            Safari 하단의 <b>공유 버튼(□↑)</b> → <b>홈 화면에 추가</b>를 누르면 앱처럼 사용할 수 있습니다.
          </p>
        )}
      </div>
      <div className="row gap">
        {event && (
          <button
            className="btn btn-primary btn-sm"
            onClick={async () => {
              await event.prompt();
              await event.userChoice;
              setEvent(null);
            }}
          >
            앱 설치
          </button>
        )}
        <button className="btn btn-ghost btn-sm" onClick={dismiss}>닫기</button>
      </div>
    </section>
  );
}
