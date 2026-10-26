import { useEffect, useState } from 'react';

export interface Route {
  path: string;
  params: URLSearchParams;
}

function parse(): Route {
  const raw = window.location.hash.replace(/^#/, '') || '/';
  const [path, query = ''] = raw.split('?');
  return { path: path || '/', params: new URLSearchParams(query) };
}

export function useHashRoute(): Route {
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const onChange = () => {
      setRoute(parse());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export function navigate(to: string, replace = false) {
  const hash = `#${to}`;
  if (replace) {
    history.replaceState(null, '', hash);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    window.location.hash = to;
  }
}
