import { useEffect, useState } from 'react';

// Shared little buddy. Three looks:
// - "normal": dot eyes + smile, blinking (the load-time nudge)
// - "jet": jetpack strapped on, wide excited eyes and open mouth
//          (used for the flight after a theme change)
// - "cute": happy arc eyes, open smile, blush cheeks (landed look)
export function ThemeBuddy({ variant = 'normal' }) {
  const jet = variant === 'jet';
  const cute = variant === 'cute';
  return (
    <svg className="theme-nudge-buddy" width="32" height="32" viewBox="0 0 48 48" aria-hidden="true">
      {jet && (
        <g className="theme-jetpack">
          <rect x="1" y="17" width="9" height="15" rx="4.5" fill="var(--surface-3)" stroke="var(--border-strong)" strokeWidth="1.5" />
          <rect x="3" y="13.5" width="5" height="4" rx="1.5" fill="var(--border-strong)" />
          <g className="theme-jet-flame">
            <path d="M2.5 32 C 3 39.5, 8 39.5, 7.5 32 Z" fill="var(--warn)" />
            <path d="M3.9 32 C 4.2 36.5, 6.3 36.5, 6.6 32 Z" fill="var(--yellow)" />
          </g>
        </g>
      )}
      <g className="theme-nudge-arm">
        <path d="M31 15 C 34 9, 34 5, 33 2" stroke="currentColor" strokeWidth="5" strokeLinecap="round" fill="none" />
        <circle cx="33" cy="3" r="4" fill="currentColor" />
      </g>
      <circle cx="22" cy="27" r="15" fill="var(--accent)" />
      {jet ? (
        <>
          <circle cx="17" cy="23.5" r="2.9" fill="var(--on-red)" />
          <circle cx="27" cy="23.5" r="2.9" fill="var(--on-red)" />
          <ellipse cx="22" cy="31.5" rx="4" ry="3.4" fill="var(--on-red)" />
        </>
      ) : cute ? (
        <>
          <path d="M14 24.5 q3.5 -5 7 0" stroke="var(--on-red)" strokeWidth="2.3" fill="none" strokeLinecap="round" />
          <path d="M24 24.5 q3.5 -5 7 0" stroke="var(--on-red)" strokeWidth="2.3" fill="none" strokeLinecap="round" />
          <path d="M16 30 q6.5 6.5 13 0 Z" fill="var(--on-red)" />
          <circle cx="12" cy="29.5" r="2.6" fill="var(--on-red)" opacity="0.25" />
          <circle cx="33" cy="29.5" r="2.6" fill="var(--on-red)" opacity="0.25" />
        </>
      ) : (
        <>
          <g className="theme-nudge-eyes">
            <circle cx="17" cy="24" r="2.3" fill="var(--on-red)" />
            <circle cx="27" cy="24" r="2.3" fill="var(--on-red)" />
          </g>
          <path d="M17 31.5 q5 4.5 10 0" stroke="var(--on-red)" strokeWidth="2.3" fill="none" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}

// Tiny animated buddy that pops under the theme button on every page
// load, points up at it, and offers to open the theme menu. Steps
// aside once the theme is actually changed (ThemeFlyer takes over).
export default function ThemeNudge({ onPick, hidden }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const appear = window.setTimeout(() => setShow(true), 900);
    const dismiss = window.setTimeout(() => setShow(false), 14000);
    const stepAside = () => setShow(false);
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
      onClick={() => { setShow(false); onPick?.(); }}
      aria-label="Try themes: open the theme menu"
    >
      <ThemeBuddy />
      <span className="theme-nudge-copy">Try themes!</span>
    </button>
  );
}
