import { useEffect, useState } from 'react';
import { ThemeBuddy } from './BuddyArt';

// Tiny animated buddy for first-time viewers only: pops under the theme
// button on the very first page load, points up at it, and never appears
// again once seen (or once a theme was ever picked). Steps aside early if
// the theme is actually changed.
export default function ThemeNudge({ onPick, hidden }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    let gone = false;
    let seen = false;
    try {
      seen = Boolean(localStorage.getItem('annotated-nudge-seen'))
        || Boolean(localStorage.getItem('annotated-theme'));
    } catch {}
    const markSeen = () => { try { localStorage.setItem('annotated-nudge-seen', '1'); } catch {} };
    const appear = window.setTimeout(() => {
      if (gone || seen) return;
      setShow(true);
      markSeen();
    }, 900);
    const dismiss = window.setTimeout(() => setShow(false), 14000);
    const stepAside = () => { gone = true; setShow(false); markSeen(); };
    window.addEventListener('annotated:theme-changed', stepAside);
    return () => {
      window.clearTimeout(appear);
      window.clearTimeout(dismiss);
      window.removeEventListener('annotated:theme-changed', stepAside);
    };
  }, []);

  if (!show || hidden) return null;

  return (
    <button
      type="button"
      className="theme-nudge"
      onClick={() => { setShow(false); try { localStorage.setItem('annotated-nudge-seen', '1'); } catch {} onPick?.(); }}
      aria-label="Try themes: open the theme menu"
    >
      <ThemeBuddy />
      <span className="theme-nudge-copy">Try themes!</span>
    </button>
  );
}
