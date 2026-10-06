import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ThemeBuddy } from './ThemeNudge';

const RELEASES = 'https://github.com/e-isdl/annotated-extension/releases';
const FLY_MS = 4600;

// Densely sample a Catmull-Rom spline through the waypoints, then
// map an eased clock onto cumulative arc length so the buddy moves
// at a steady, watchable pace along the whole winding journey.
function buildPath(points) {
  const p = [points[0], ...points, points[points.length - 1]];
  const segs = points.length - 1;
  const per = 60;
  const pts = [];
  for (let s = 0; s < segs; s++) {
    const p0 = p[s], p1 = p[s + 1], p2 = p[s + 2], p3 = p[s + 3];
    for (let i = 0; i < per; i++) {
      const t = i / per, t2 = t * t, t3 = t2 * t;
      pts.push({
        x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      });
    }
  }
  pts.push({ ...points[points.length - 1] });
  const len = [0];
  for (let i = 1; i < pts.length; i++) {
    len.push(len[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  }
  return { pts, len, total: len[len.length - 1] || 1 };
}

function sample(path, u) {
  const target = Math.max(0, Math.min(1, u)) * path.total;
  let i = 1;
  while (i < path.len.length - 1 && path.len[i] < target) i++;
  const seg = path.len[i] - path.len[i - 1] || 1;
  const f = (target - path.len[i - 1]) / seg;
  const a = path.pts[i - 1], b = path.pts[i];
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
}

// After a theme change the buddy boosts straight up off the theme
// button and flies a long, slow airshow route (big jetpack, thrust
// plume trailing naturally behind him, determined face) across the
// page, then climbs to dock just below the GitHub link as a
// "Try themes!"-style pill with a cute face, text wrapped and a tail
// pointing up at the link. Clicking opens the releases page. One
// flight per trigger; falls back to the bottom-right corner on pages
// without the right rail.
export default function ThemeFlyer() {
  const [flight, setFlight] = useState(null);
  const [adjust, setAdjust] = useState({ dx: 0, dy: 0 });
  const [savedLink, setSavedLink] = useState(null);
  const busyRef = useRef(false);
  const measuredRef = useRef(false);
  const dirRef = useRef(1);
  const flyerRef = useRef(null);
  const pillRef = useRef(null);

  useEffect(() => {
    const timers = [];
    const clearAll = () => { timers.forEach(window.clearTimeout); timers.length = 0; };

    const begin = () => {
      if (busyRef.current) return;
      const btn = document.querySelector('[data-theme-button]');
      if (!btn) return;
      const b = btn.getBoundingClientRect();
      const start = { x: Math.round(b.left + b.width / 2 - 18), y: Math.round(b.bottom + 8) };

      const W = window.innerWidth, H = window.innerHeight;
      let linkInfo = null;
      const link = document.querySelector('[data-github-link]');
      if (link) {
        const l = link.getBoundingClientRect();
        if (l.width > 0 && l.left > 0 && l.top > 56 && l.bottom + 70 < H) {
          linkInfo = { cx: l.left + l.width / 2, bottom: l.bottom };
        }
      }
      const end = linkInfo
        ? { x: Math.round(linkInfo.cx - 18), y: Math.round(linkInfo.bottom + 8) }
        : { x: W - 64, y: H - 76 };
      end.x = Math.max(end.x, 64);
      end.y = Math.min(Math.max(end.y, 64), H - 64);

      // Airshow route: boost straight up over the navbar, cruise
      // left across the top, carve down the left side, sweep low
      // across the feed, then pull up and climb to the link.
      const journey = [
        start,
        { x: Math.max(16, start.x - 0.10 * W), y: 30 },
        { x: 0.40 * W, y: 46 },
        { x: 0.11 * W, y: 0.42 * H },
        { x: 0.34 * W, y: 0.80 * H },
        { x: 0.66 * W, y: 0.78 * H },
        { x: Math.max(end.x - 0.28 * W, 0.15 * W), y: Math.min(end.y + 0.14 * H, H - 48) },
        end,
      ];

      busyRef.current = true;
      measuredRef.current = false;
      setSavedLink(linkInfo);
      setAdjust({ dx: 0, dy: 0 });
      setFlight({ start, end, path: buildPath(journey), phase: 'start' });
      timers.push(window.setTimeout(() => setFlight((f) => (f ? { ...f, phase: 'fly' } : f)), 80));
      timers.push(window.setTimeout(() => setFlight((f) => (f ? { ...f, phase: 'docked' } : f)), 80 + FLY_MS + 80));
      timers.push(window.setTimeout(() => setFlight((f) => (f ? { ...f, phase: 'leave' } : f)), 80 + FLY_MS + 80 + 15000));
      timers.push(window.setTimeout(() => { setFlight(null); busyRef.current = false; clearAll(); }, 80 + FLY_MS + 80 + 15550));
    };

    window.addEventListener('annotated:theme-changed', begin);
    return () => { window.removeEventListener('annotated:theme-changed', begin); clearAll(); };
  }, []);

  // The rAF journey: eased progress along the arc-length path. He
  // flies himself - body leans into the direction of travel, the
  // jetpack mirrors to his back, and the thrust plume trails
  // naturally opposite his velocity.
  useEffect(() => {
    if (!flight || flight.phase !== 'fly') return;
    const el = flyerRef.current;
    if (!el) return;
    const svg = el.querySelector('svg');
    const jet = svg && svg.querySelector('[data-jetpack]');
    const exh = svg && svg.querySelector('[data-exhaust]');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const dur = reduce ? 700 : FLY_MS;
    const t0 = performance.now();
    let raf = 0;
    const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    const step = (now) => {
      const p = Math.min(1, (now - t0) / dur);
      const e = ease(p);
      const cur = sample(flight.path, e);
      const look = sample(flight.path, Math.min(1, e + 0.03));
      const vx = look.x - cur.x, vy = look.y - cur.y;
      const mag = Math.hypot(vx, vy) || 1;
      if (Math.abs(vx) > 0.5) dirRef.current = vx < 0 ? -1 : 1;
      const dirX = dirRef.current;

      el.style.transform = `translate(${cur.x - flight.start.x}px, ${cur.y - flight.start.y}px)`;
      if (svg) svg.style.transform = `rotate(${Math.max(-13, Math.min(13, (vx / mag) * 16)).toFixed(2)}deg)`;
      if (jet) jet.setAttribute('transform', dirX < 0 ? 'translate(44 0) scale(-1 1)' : '');

      // Exhaust points opposite the local velocity; if that direction
      // would cross the tank, trail straight back instead.
      const lvx = Math.abs(vx);
      let rot = Math.atan2(-vy, -lvx) * 180 / Math.PI - 90;
      rot = ((rot + 180) % 360 + 360) % 360 - 180;
      const ang = (90 + rot) * Math.PI / 180;
      if (Math.sin(ang) < -0.02 && Math.cos(ang) > -0.6) rot = 90;
      if (exh) exh.setAttribute('transform', `rotate(${rot.toFixed(1)} 3 39)`);

      if (p < 1) raf = requestAnimationFrame(step);
      else el.style.transform = `translate(${flight.end.x - flight.start.x}px, ${flight.end.y - flight.start.y}px)`;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [flight]);

  // Once the pill renders, measure it (offset values, immune to the
  // pop-in scale) and slide the whole thing so the buddy sits exactly
  // under the link, text growing to the left. Runs once per flight.
  useLayoutEffect(() => {
    if (!flight || flight.phase !== 'docked' || measuredRef.current) return;
    const pill = pillRef.current;
    if (!pill) return;
    measuredRef.current = true;
    const baseX = flight.end.x - flight.start.x;
    const baseY = flight.end.y - flight.start.y;
    const pillRight = flight.start.x + baseX + pill.offsetLeft + pill.offsetWidth;
    const pillTop = flight.start.y + baseY + pill.offsetTop;
    let dx = 0, dy = 0;
    if (savedLink) {
      dx = savedLink.cx - (pillRight - 6 - 16);
      dy = (savedLink.bottom + 4) - pillTop;
    } else {
      dx = Math.min(0, window.innerWidth - 12 - pillRight);
      dy = Math.min(0, window.innerHeight - 12 - (pillTop + pill.offsetHeight));
    }
    setAdjust({ dx: Math.round(dx), dy: Math.round(dy) });
  }, [flight, savedLink]);

  if (!flight) return null;
  const docked = flight.phase === 'docked' || flight.phase === 'leave';
  const baseX = flight.end.x - flight.start.x;
  const baseY = flight.end.y - flight.start.y;

  return (
    <a
      ref={flyerRef}
      href={RELEASES}
      target="_blank"
      rel="noopener noreferrer"
      className={`theme-flyer theme-flyer-${flight.phase}`}
      style={{
        left: flight.start.x,
        top: flight.start.y,
        transform: docked
          ? `translate(${baseX + adjust.dx}px, ${baseY + adjust.dy}px)`
          : 'translate(0, 0)',
      }}
      aria-label="Download the extension here"
    >
      {docked ? (
        <span className="theme-flyer-pill" ref={pillRef}>
          <span className="theme-flyer-copy">Download the extension here!</span>
          <ThemeBuddy variant="cute" />
        </span>
      ) : (
        <ThemeBuddy variant="jet" />
      )}
    </a>
  );
}
