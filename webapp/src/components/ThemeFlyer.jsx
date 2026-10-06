import { useEffect, useRef, useState } from 'react';
import { ThemeBuddy } from './ThemeNudge';

const RELEASES = 'https://github.com/e-isdl/annotated-extension/releases';

// After a theme change the buddy leaves the theme button and glides
// in a straight line to the GitHub releases link, lands just below it
// and jumps up and down, happy, saying "Try the extension" with the
// pill pointing up at the link - for 15 seconds, then he is gone for
// good until the page is refreshed. One flight per page load; falls
// back to the bottom-right corner on pages without the right rail.
export default function ThemeFlyer() {
  const [flight, setFlight] = useState(null);
  const busyRef = useRef(false);

  useEffect(() => {
    const timers = [];
    const clearAll = () => { timers.forEach(window.clearTimeout); timers.length = 0; };

    const begin = () => {
      if (busyRef.current) return;
      const btn = document.querySelector('[data-theme-button]');
      if (!btn) return;
      const b = btn.getBoundingClientRect();
      const start = { x: Math.round(b.left + b.width / 2 - 18), y: Math.round(b.bottom + 8) };

      let end = null;
      const link = document.querySelector('[data-github-link]');
      if (link) {
        const l = link.getBoundingClientRect();
        if (l.width > 0 && l.left > 0 && l.top > 56 && l.bottom + 64 < window.innerHeight) {
          end = { x: Math.round(l.left + l.width / 2 - 18), y: Math.round(l.bottom + 10) };
        }
      }
      if (!end) end = { x: window.innerWidth - 64, y: window.innerHeight - 76 };
      end.x = Math.max(end.x, 214);
      end.y = Math.min(Math.max(end.y, 64), window.innerHeight - 64);

      busyRef.current = true; // stays true: one flight per page load
      setFlight({ start, end, phase: 'start' });
      timers.push(window.setTimeout(() => setFlight((f) => (f ? { ...f, phase: 'fly' } : f)), 70));
      timers.push(window.setTimeout(() => setFlight((f) => (f ? { ...f, phase: 'docked' } : f)), 2500));
      timers.push(window.setTimeout(() => setFlight((f) => (f ? { ...f, phase: 'leave' } : f)), 17500));
      timers.push(window.setTimeout(() => { setFlight(null); clearAll(); }, 18000));
    };

    window.addEventListener('annotated:theme-changed', begin);
    return () => { window.removeEventListener('annotated:theme-changed', begin); clearAll(); };
  }, []);

  if (!flight) return null;
  const dx = flight.end.x - flight.start.x;
  const dy = flight.end.y - flight.start.y;
  const moved = flight.phase !== 'start';
  const docked = flight.phase === 'docked' || flight.phase === 'leave';

  return (
    <a
      href={RELEASES}
      target="_blank"
      rel="noopener noreferrer"
      className={`theme-flyer theme-flyer-${flight.phase}`}
      style={{
        left: flight.start.x,
        top: flight.start.y,
        transform: moved ? `translate(${dx}px, ${dy}px)` : 'translate(0, 0)',
      }}
      aria-label="Download the extension here"
    >
      {docked && <span className="theme-flyer-bubble">Try the extension</span>}
      {docked ? <ThemeBuddy cute /> : <ThemeBuddy />}
    </a>
  );
}
