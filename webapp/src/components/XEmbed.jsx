import { useEffect, useRef, useState } from 'react';
import { tweetIdFromUrl } from '../lib/social';

let widgetsScript = null;

function loadWidgets() {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (window.twttr && window.twttr.widgets) return Promise.resolve(window.twttr);
  if (!widgetsScript) {
    widgetsScript = new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = 'https://platform.twitter.com/widgets.js';
      script.async = true;
      script.onload = () => resolve(window.twttr || null);
      script.onerror = () => resolve(null);
      document.body.appendChild(script);
    });
  }
  return widgetsScript;
}

export default function XEmbed({ url }) {
  const containerRef = useRef(null);
  const [failed, setFailed] = useState(false);
  const tweetId = tweetIdFromUrl(url);

  useEffect(() => {
    if (!tweetId) return undefined;
    const container = containerRef.current;
    if (!container) return undefined;
    let cancelled = false;
    loadWidgets().then((twttr) => {
      if (cancelled || !twttr) {
        if (!twttr) setFailed(true);
        return;
      }
      twttr.ready((ready) => {
        if (cancelled || !container.isConnected) return;
        container.innerHTML = '';
        ready.widgets.createTweet(tweetId, container, {
          theme: 'dark',
          align: 'center',
          conversation: 'none',
          dnt: true,
        });
      });
    });
    return () => {
      cancelled = true;
    };
  }, [tweetId]);

  if (!tweetId) return null;

  if (failed) {
    return (
      <a className="x-embed-fallback" href={url} target="_blank" rel="noopener noreferrer">
        View post on X
      </a>
    );
  }

  return <div ref={containerRef} className="x-embed" />;
}
