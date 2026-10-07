import { useEffect, useState } from 'react';

// Shared little buddy: round puppy with perky ears, little feet and a
// wagging tail, big shining eyes. The `cute` variant is the landed
// look - happy arc eyes, open smile and blush cheeks.
export function ThemeBuddy({ cute = false }) {
  return (
    <svg className="theme-nudge-buddy" width="32" height="32" viewBox="0 0 48 48" aria-hidden="true">
      <g className="theme-nudge-tail">
        <path d="M9 33 C 3 33, 2 27, 6 25" stroke="currentColor" strokeWidth="4.5" strokeLinecap="round" fill="none" />
      </g>
      <g className="theme-nudge-arm">
        <path d="M33 29 C 38 27, 41 24, 41 19" stroke="currentColor" strokeWidth="5" strokeLinecap="round" fill="none" />
        <circle cx="41" cy="17.5" r="4" fill="currentColor" />
      </g>
      <ellipse cx="14" cy="13" rx="4" ry="7" fill="var(--accent)" transform="rotate(-18 14 13)" />
      <ellipse cx="30" cy="13" rx="4" ry="7" fill="var(--accent)" transform="rotate(18 30 13)" />
      <ellipse cx="14" cy="13.5" rx="2" ry="4.5" fill="var(--on-red)" opacity="0.3" transform="rotate(-18 14 13.5)" />
      <ellipse cx="30" cy="13.5" rx="2" ry="4.5" fill="var(--on-red)" opacity="0.3" transform="rotate(18 30 13.5)" />
      <ellipse cx="15" cy="42" rx="5.5" ry="4" fill="var(--accent)" />
      <ellipse cx="29" cy="42" rx="5.5" ry="4" fill="var(--accent)" />
      <circle cx="22" cy="27" r="15" fill="var(--accent)" />
      <ellipse cx="21" cy="17" rx="4" ry="2.2" transform="rotate(-25 21 17)" fill="#fff" opacity="0.22" />
      {cute ? (
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
            <circle cx="17" cy="24.5" r="3.2" fill="var(--on-red)" />
            <circle cx="27" cy="24.5" r="3.2" fill="var(--on-red)" />
            <circle cx="15.7" cy="23.2" r="1.1" fill="#fff" opacity="0.95" />
            <circle cx="25.7" cy="23.2" r="1.1" fill="#fff" opacity="0.95" />
          </g>
          <path d="M18 31.5 q4 4 8 0" stroke="var(--on-red)" strokeWidth="2.2" fill="none" strokeLinecap="round" />
          <circle cx="12" cy="29.5" r="2.6" fill="var(--on-red)" opacity="0.25" />
          <circle cx="33" cy="29.5" r="2.6" fill="var(--on-red)" opacity="0.25" />
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
    let gone = false;
    const appear = window.setTimeout(() => { if (!gone) setShow(true); }, 900);
    const dismiss = window.setTimeout(() => setShow(false), 14000);
    const stepAside = () => { gone = true; setShow(false); };
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
