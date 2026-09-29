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

function handleFromUrl(url) {
  if (!url) return null;
  try {
    const segments = new URL(url).pathname.split('/').filter(Boolean);
    return segments.length ? segments[segments.length - 1] : null;
  } catch {
    return null;
  }
}

export default function XEmbed({ url, title, authorName, authorUrl, text }) {
  const containerRef = useRef(null);
  const [expanded, setExpanded] = useState(false);
  const [failed, setFailed] = useState(false);
  const tweetId = tweetIdFromUrl(url);
  const handle = handleFromUrl(authorUrl);
  const postText = (text || '').trim();
  const postTitle = (title || '').trim();
  const showTitle = Boolean(postTitle) && (!postText || (postTitle !== postText && !postText.startsWith(postTitle)));

  useEffect(() => {
    if (!expanded || !tweetId) return undefined;
    const container = containerRef.current;
    if (!container) return undefined;
    let cancelled = false;
    loadWidgets().then((twttr) => {
      if (cancelled) return;
      if (!twttr) {
        setFailed(true);
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
  }, [expanded, tweetId]);

  if (!tweetId) return null;

  return (
    <div className="x-card">
      {showTitle && <p className="x-card-title">{postTitle}</p>}
      {(authorName || handle) && (
        <div className="x-card-author">
          {authorName && <span className="x-card-name">{authorName}</span>}
          {handle && <span className="x-card-handle">@{handle}</span>}
        </div>
      )}
      {!expanded && postText && <p className="x-card-text">{postText}</p>}
      {expanded && failed && (
        <a className="x-embed-fallback" href={url} target="_blank" rel="noopener noreferrer">
          View post on X
        </a>
      )}
      {expanded && !failed && <div ref={containerRef} className="x-embed" />}
      <div className="x-card-foot">
        <span className="x-card-domain">x.com</span>
        <button
          type="button"
          className="btn-ghost"
          onClick={() => {
            setFailed(false);
            setExpanded((value) => !value);
          }}
        >
          {expanded ? 'Hide post' : 'Show full post'}
        </button>
      </div>
    </div>
  );
}
