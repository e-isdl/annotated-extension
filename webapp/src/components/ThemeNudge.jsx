import { useEffect, useState } from 'react';

// Shared little buddy. Three looks:
// - "normal": dot eyes + smile, blinking (the load-time nudge)
// - "jet": big advanced jetpack (tank, gauge, flared nozzle) with a
//          layered thrust plume that trails naturally behind him,
//          and a fierce determined face - he flies himself, he is
//          not being pulled
// - "cute": happy arc eyes, open smile, blush cheeks (landed look)
//
// Jet nesting (do not flatten - attribute vs CSS transforms must not fight):
//   [data-jetpack]  mirror / turn-around (attribute, set per frame)
//   [data-exhaust]  plume direction rotate(rot 3 39) (attribute, set per frame)
//   [data-thrust]   plume length scale around the nozzle (attribute, set per frame)
//   .theme-jet-flame  flicker (CSS animation)
export function ThemeBuddy({ variant = 'normal' }) {
  const jet = variant === 'jet';
  const cute = variant === 'cute';
  return (
    <svg className="theme-nudge-buddy" width="32" height="32" viewBox="0 0 48 48" aria-hidden="true">
      {!jet && (
        <g className="theme-nudge-arm">
          <path d="M31 15 C 34 9, 34 5, 33 2" stroke="currentColor" strokeWidth="5" strokeLinecap="round" fill="none" />
          <circle cx="33" cy="3" r="4" fill="currentColor" />
        </g>
      )}
      <circle cx="22" cy="27" r="15" fill="var(--accent)" />
      {jet ? (
        <>
          {/* bolder, fewer shapes so the scowl reads at 32px: heavy brows that
              run into the eyes, one wide grin */}
          <circle cx="17" cy="26" r="2.9" fill="var(--on-red)" />
          <circle cx="27" cy="26" r="2.9" fill="var(--on-red)" />
          <path d="M11.8 19.2 L19.6 23" stroke="var(--on-red)" strokeWidth="3.4" strokeLinecap="round" />
          <path d="M32.2 19.2 L24.4 23" stroke="var(--on-red)" strokeWidth="3.4" strokeLinecap="round" />
          <path d="M16.5 31.2 L27.5 31.2 C 27 36.8, 17 36.8, 16.5 31.2 Z" fill="var(--on-red)" />
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
      {jet && (
        <g className="theme-jetpack" data-jetpack>
          <rect x="0" y="13" width="12" height="22" rx="6" fill="var(--surface-3)" stroke="var(--border-strong)" strokeWidth="1.5" />
          <rect x="3" y="9.5" width="6" height="4.5" rx="2" fill="var(--border-strong)" />
          <rect x="2" y="20" width="8" height="3" rx="1.5" fill="var(--accent)" />
          <circle cx="6" cy="16.5" r="1.7" fill="var(--accent)" />
          <path d="M0.5 35 L5.5 35 L6.5 39 L-0.5 39 Z" fill="var(--border-strong)" />
          <g data-exhaust transform="rotate(0 3 39)">
            <g data-thrust>
              {/* soft heat glow at the nozzle exit (theme colors, low opacity) */}
              <circle cx="3" cy="40" r="6.5" fill="var(--warn)" opacity="0.14" />
              <circle cx="3" cy="40" r="3.6" fill="var(--yellow)" opacity="0.28" />
              <g className="theme-jet-flame">
                <path d="M3 39 C 1 51, 8 51, 6 39 Z" fill="var(--warn)" />
                <path d="M3.7 39 C 2.4 47, 6.6 47, 5.3 39 Z" fill="var(--yellow)" />
                <path d="M4.3 39 C 3.7 43.5, 5.3 43.5, 4.7 39 Z" fill="#fff" opacity="0.85" />
              </g>
            </g>
          </g>
        </g>
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
