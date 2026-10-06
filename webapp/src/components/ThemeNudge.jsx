import { useEffect, useState } from 'react';

// Tiny animated buddy that pops under the theme button on every page
// load, points up at it, and offers to open the theme menu.
export default function ThemeNudge({ onPick, hidden }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const appear = window.setTimeout(() => setShow(true), 900);
    const dismiss = window.setTimeout(() => setShow(false), 14000);
    return () => {
      window.clearTimeout(appear);
      window.clearTimeout(dismiss);
    };
  }, []);

  if (!show || hidden) return null;

  return (
    <button
      type="button"
      className="theme-nudge"
      onClick={() => { setShow(false); onPick?.(); }}
      aria-label="Try themes: open the theme menu"
    >
      <svg className="theme-nudge-buddy" width="32" height="32" viewBox="0 0 48 48" aria-hidden="true">
        <g className="theme-nudge-arm">
          <path d="M31 15 C 34 9, 34 5, 33 2" stroke="currentColor" strokeWidth="5" strokeLinecap="round" fill="none" />
          <circle cx="33" cy="3" r="4" fill="currentColor" />
        </g>
        <circle cx="22" cy="27" r="15" fill="var(--accent)" />
        <g className="theme-nudge-eyes">
          <circle cx="17" cy="24" r="2.3" fill="var(--on-red)" />
          <circle cx="27" cy="24" r="2.3" fill="var(--on-red)" />
        </g>
        <path d="M17 31.5 q5 4.5 10 0" stroke="var(--on-red)" strokeWidth="2.3" fill="none" strokeLinecap="round" />
      </svg>
      <span className="theme-nudge-copy">Try themes!</span>
    </button>
  );
}
