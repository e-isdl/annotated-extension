import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ThemeBuddy } from './BuddyArt';

const RELEASES = 'https://github.com/e-isdl/annotated-extension/releases';

// After a theme change the buddy alone glides from the theme button
// to the GitHub releases link. Only once he lands does the "Try the
// extension" pill appear around him - flush under the link, tail
// pointing up at it - and he jumps up and down inside it, smiling,
// for 15 seconds. Then he is gone until the page is refreshed. One
// flight per page load; falls back to the bottom-right corner
// without the right rail.
// The dock is re-aimed at landing time (and the buddy faces his travel
// direction mid-flight) so scrolling mid-flight never leaves him
// pointing at empty space.
function readLinkRect() {
  const link = document.querySelector('[data-github-link]');
  if (!link) return null;
  const rect = link.getBoundingClientRect();
  return rect && rect.width > 0 ? rect : null;
}

// The flyer is position:fixed inside the zoomed app root, so its
// left/top/translate resolve in root-local px, not viewport px.
// Every viewport measurement is divided by --k (1 at 125% zoom,
// where this math is byte-identical to the old code).
function zoomK() {
  const raw = Number(getComputedStyle(document.documentElement).getPropertyValue('--k'));
  return Number.isFinite(raw) && raw > 0 ? raw : 1;
}

function linkTarget(k) {
  const l = readLinkRect();
  if (!l || !(l.top > 56) || !(l.bottom + 64 < window.innerHeight)) return null;
  return { right: Math.round(l.right / k), bottom: Math.round(l.bottom / k) };
}

function dockEnd(target, pillWidth, k) {
  const px = (n) => n / k;
  const w = pillWidth || 0;
  let end;
  if (target) {
    end = { x: target.right - w, y: target.bottom + px(10) };
  } else {
    end = { x: window.innerWidth / k - w - px(24), y: window.innerHeight / k - px(76) };
  }
  end.x = Math.max(end.x, px(214));
  end.y = Math.min(Math.max(end.y, px(64)), window.innerHeight / k - px(64));
  return end;
}
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

      const k = zoomK();
      const nudge = document.querySelector('.theme-nudge');
      const n = nudge ? nudge.getBoundingClientRect() : null;
      const start = n && n.width > 0
        ? { x: Math.round((n.left + 7) / k), y: Math.round((n.top + 6) / k) }
        : { x: Math.round((b.left + b.width / 2 - 18) / k), y: Math.round((b.bottom + 8) / k) };

      const target = linkTarget(k);

      busyRef.current = true; // stays true: one flight per page load
      setFlight({ start, target, end: null, pillW: 0, k, phase: 'start' });
      timers.push(window.setTimeout(() => setFlight((f) => (f ? { ...f, phase: 'fly' } : f)), 70));
      // Re-aim at landing time: the link may have moved (scroll/resize)
      // since takeoff, so measure again instead of trusting the old rect.
      timers.push(window.setTimeout(() => setFlight((f) => {
        if (!f) return f;
        const kk = f.k || zoomK();
        const fresh = linkTarget(kk);
        return { ...f, target: fresh, end: dockEnd(fresh, f.pillW, kk), phase: 'docked' };
      }), 2500));
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
    const end = dockEnd(flight.target, w, flight.k || zoomK());
    setFlight((f) => (f && !f.end ? { ...f, end, pillW: w } : f));
  }, [flight]);

  if (!flight) return null;
  const end = flight.end || flight.start;
  const dx = end.x - flight.start.x;
  const dy = end.y - flight.start.y;
  const moved = flight.phase !== 'start' && !!flight.end;
  const docked = flight.phase === 'docked' || flight.phase === 'leave';
  // Mid-flight the pointing arm leads: face the link while traveling.
  const faceLeft = !docked && moved && dx < 0;

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
          {faceLeft ? <span className="theme-flyer-face"><ThemeBuddy /></span> : <ThemeBuddy />}
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
