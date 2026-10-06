import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ThemeBuddy } from './ThemeNudge';

const RELEASES = 'https://github.com/e-isdl/annotated-extension/releases';

// After a theme change the buddy alone glides from the theme button
// to the GitHub releases link. Only once he lands does the "Try the
// extension" pill appear around him - flush under the link, tail
// pointing up at it - and he jumps up and down inside it, smiling,
// for 15 seconds. Then he is gone until the page is refreshed. One
// flight per page load; falls back to the bottom-right corner
// without the right rail.
export default function ThemeFlyer() {
  const [flight, setFlight] = useState(null);
  const busyRef = useRef(false);
  const rootRef = useRef(null);

  useEffect(() => {
    const timers = [];
    const clearAll = () => { timers.forEach(window.clearTimeout); timers.length = 0; };

    const begin = () => {
      if (busyRef.current) return;
      const btn = document.querySelector('[data-theme-button]');
      if (!btn) return;
      const b = btn.getBoundingClientRect();

      const nudge = document.querySelector('.theme-nudge');
      const n = nudge ? nudge.getBoundingClientRect() : null;
      const start = n && n.width > 0
        ? { x: Math.round(n.left + 7), y: Math.round(n.top + 6) }
        : { x: Math.round(b.left + b.width / 2 - 18), y: Math.round(b.bottom + 8) };

      const link = document.querySelector('[data-github-link]');
      const l = link ? link.getBoundingClientRect() : null;
      const target = l && l.width > 0 && l.top > 56 && l.bottom + 64 < window.innerHeight
        ? { right: Math.round(l.right), bottom: Math.round(l.bottom) }
        : null;

      busyRef.current = true; // stays true: one flight per page load
      setFlight({ start, target, end: null, phase: 'start' });
      timers.push(window.setTimeout(() => setFlight((f) => (f ? { ...f, phase: 'fly' } : f)), 70));
      timers.push(window.setTimeout(() => setFlight((f) => (f ? { ...f, phase: 'docked' } : f)), 2500));
      timers.push(window.setTimeout(() => setFlight((f) => (f ? { ...f, phase: 'leave' } : f)), 17500));
      timers.push(window.setTimeout(() => { setFlight(null); clearAll(); }, 18000));
    };

    window.addEventListener('annotated:theme-changed', begin);
    return () => { window.removeEventListener('annotated:theme-changed', begin); clearAll(); };
  }, []);

  // The pill is laid out hidden during the start phase so its exact
  // width is known before takeoff; the dock lands flush with the
  // right edge of the link, tail directly under it.
  useLayoutEffect(() => {
    if (!flight || flight.phase !== 'start' || flight.end || !rootRef.current) return;
    const m = rootRef.current.querySelector('.theme-flyer-measure');
    if (!m) return;
    const w = m.offsetWidth;
    let end;
    if (flight.target) {
      end = { x: flight.target.right - w, y: flight.target.bottom + 10 };
    } else {
      end = { x: window.innerWidth - w - 24, y: window.innerHeight - 76 };
    }
    end.x = Math.max(end.x, 214);
    end.y = Math.min(Math.max(end.y, 64), window.innerHeight - 64);
    setFlight((f) => (f && !f.end ? { ...f, end } : f));
  }, [flight]);

  if (!flight) return null;
  const end = flight.end || flight.start;
  const dx = end.x - flight.start.x;
  const dy = end.y - flight.start.y;
  const moved = flight.phase !== 'start' && !!flight.end;
  const docked = flight.phase === 'docked' || flight.phase === 'leave';

  return (
    <a
      ref={rootRef}
      href={RELEASES}
      target="_blank"
      rel="noopener noreferrer"
      className={`theme-flyer theme-flyer-${flight.phase}`}
      style={{
        left: flight.start.x,
        top: flight.start.y,
        transform: moved ? `translate(${dx}px, ${dy}px)` : 'translate(0, 0)',
      }}
      aria-label="Try the extension"
    >
      {docked ? (
        <span className="theme-flyer-pill">
          <ThemeBuddy cute />
          <span>Try the extension</span>
        </span>
      ) : (
        <>
          <ThemeBuddy />
          {flight.phase === 'start' && (
            <span className="theme-flyer-pill theme-flyer-measure" aria-hidden="true">
              <ThemeBuddy cute />
              <span>Try the extension</span>
            </span>
          )}
        </>
      )}
    </a>
  );
}
