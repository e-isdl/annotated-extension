import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ThemeBuddy } from './ThemeNudge';

const RELEASES = 'https://github.com/e-isdl/annotated-extension/releases';
const FLY_MS = 5200;
const SPARKS = 18;
const LOOK = 0.02;            // lookahead (fraction of the time-warped clock) for heading
const SC = 32 / 48;           // svg px per viewBox unit
const RAD = 180 / Math.PI;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const smooth = (t) => { const c = clamp(t, 0, 1); return c * c * (3 - 2 * c); };
const wrapDeg = (d) => ((d + 180) % 360 + 360) % 360 - 180;

// Thrust profile instead of a symmetric ease: a quick burst up to cruise
// speed (first 10%), a long steady cruise, then a gentle arrival (last 20%).
// Speed is constant in the middle, so he reads as flying, not as being eased.
function thrustEase(t, a = 0.10, b = 0.20) {
  const vmax = 1 / (a / 2 + (1 - a - b) + b / 2);
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  if (t < a) return (vmax * t * t) / (2 * a);
  if (t < 1 - b) return vmax * (a / 2 + (t - a));
  const d = 1 - t;
  return 1 - (vmax * d * d) / (2 * b);
}

// Densely sample a Catmull-Rom spline through the waypoints. Besides the
// arc length we build a per-sample "time cost": he slows a little through
// tight turns (banking) and gets a power surge on the final climb. The
// clock maps onto this cost, so pace follows the shape of the path.
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
  const n = pts.length;
  const len = [0];
  for (let i = 1; i < n; i++) {
    len.push(len[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  }
  const total = len[n - 1] || 1;

  // curvature (rad per px)
  const kap = new Array(n).fill(0);
  for (let i = 1; i < n - 1; i++) {
    const a1 = Math.atan2(pts[i].y - pts[i - 1].y, pts[i].x - pts[i - 1].x);
    const a2 = Math.atan2(pts[i + 1].y - pts[i].y, pts[i + 1].x - pts[i].x);
    const d = a2 - a1;
    kap[i] = Math.abs(Math.atan2(Math.sin(d), Math.cos(d))) / (((len[i + 1] - len[i - 1]) / 2) || 1);
  }

  // speed factor: slower in tight turns, surge on the last (pull-up -> link) segment
  const iSurge = (segs - 1) * per;
  const spd = new Array(n);
  for (let i = 0; i < n; i++) {
    let k = 0, c = 0;
    for (let j = Math.max(0, i - 8); j <= Math.min(n - 1, i + 8); j++) { k += kap[j]; c++; }
    k /= c;
    let f = clamp(1 / (1 + 0.6 * k * 160), 0.55, 1);
    f *= 1 + 0.22 * smooth((i - iSurge) / 24);
    spd[i] = f;
  }
  const tm = [0];
  for (let i = 1; i < n; i++) {
    tm.push(tm[i - 1] + (len[i] - len[i - 1]) / ((spd[i - 1] + spd[i]) / 2));
  }
  return { pts, len, total, tm, tmTotal: tm[n - 1] || 1, uSurge: len[iSurge] / total };
}

// Point at clock fraction tau (time-warped). Writes into `out` (no allocation).
function sampleT(path, tau, out) {
  const target = clamp(tau, 0, 1) * path.tmTotal;
  const tm = path.tm;
  let lo = 1, hi = tm.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (tm[mid] < target) lo = mid + 1; else hi = mid;
  }
  const seg = tm[lo] - tm[lo - 1] || 1;
  const f = clamp((target - tm[lo - 1]) / seg, 0, 1);
  const a = path.pts[lo - 1], b = path.pts[lo];
  out.x = a.x + (b.x - a.x) * f;
  out.y = a.y + (b.y - a.y) * f;
  out.u = (path.len[lo - 1] + (path.len[lo] - path.len[lo - 1]) * f) / path.total;
  return out;
}

// After a theme change the buddy boosts straight up off the theme
// button and flies a long airshow route (big jetpack, thrust plume
// trailing naturally behind him, determined face) across the page,
// then climbs to dock just below the GitHub link as a "Try themes!"-style
// pill with a cute face, text wrapped and a tail pointing up at the
// link. Clicking opens the releases page. One flight per trigger; falls
// back to the bottom-right corner on pages without the right rail.
export default function ThemeFlyer() {
  const [flight, setFlight] = useState(null);
  const [adjust, setAdjust] = useState({ dx: 0, dy: 0 });
  const [savedLink, setSavedLink] = useState(null);
  const busyRef = useRef(false);
  const measuredRef = useRef(false);
  const dirRef = useRef(1);
  const flyerRef = useRef(null);
  const pillRef = useRef(null);
  const sparksRef = useRef([]);

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

  // The rAF journey. He flies himself:
  //  - thrust clock: burst launch, steady cruise, soft arrival (thrustEase),
  //    slowed through tight turns, surging on the final climb
  //  - the whole body pitches along the path (nose toward travel); facing
  //    turns around smoothly instead of snapping
  //  - the plume points opposite the velocity in the body frame, its length
  //    follows thrust (big at launch and on the final climb)
  //  - a pooled spark trail stays behind in world space
  useEffect(() => {
    if (!flight || flight.phase !== 'fly') return;
    const el = flyerRef.current;
    if (!el) return;
    const svg = el.querySelector('svg');
    const jet = svg && svg.querySelector('[data-jetpack]');
    const exh = svg && svg.querySelector('[data-exhaust]');
    const thr = svg && svg.querySelector('[data-thrust]');
    const sparks = sparksRef.current;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const dur = reduce ? 700 : FLY_MS;
    const { path, start, end } = flight;

    const cur = { x: 0, y: 0, u: 0 };
    const a = { x: 0, y: 0, u: 0 };
    const b = { x: 0, y: 0, u: 0 };

    // spark pool (typed arrays, no per-frame allocation besides style strings)
    const birth = new Float64Array(SPARKS).fill(-1);
    const px = new Float32Array(SPARKS), py = new Float32Array(SPARKS);
    const pvx = new Float32Array(SPARKS), pvy = new Float32Array(SPARKS);
    const life = new Float32Array(SPARKS), size = new Float32Array(SPARKS);
    let nextSpark = 0, lastSpawn = 0;
    const spawn = (now, ox, oy, bx, by, big) => {
      const i = nextSpark; nextSpark = (nextSpark + 1) % SPARKS;
      const n = sparks[i];
      if (!n) return;
      const spread = (Math.random() - 0.5) * (big ? 2.2 : 0.7);
      const ca = Math.cos(spread), sa = Math.sin(spread);
      const sp = big ? 70 + Math.random() * 90 : 28 + Math.random() * 40;
      birth[i] = now; px[i] = ox; py[i] = oy;
      pvx[i] = (bx * ca - by * sa) * sp;
      pvy[i] = (bx * sa + by * ca) * sp;
      life[i] = (big ? 420 : 340) + Math.random() * 200;
      size[i] = big ? 1.3 + Math.random() * 0.9 : 0.6 + Math.random() * 0.6;
      n.style.background = i % 3 === 0 ? 'var(--yellow)' : 'var(--warn)';
    };

    // initial facing from the first heading (no turn animation at launch)
    sampleT(path, 0, a); sampleT(path, LOOK, b);
    let dir = b.x - a.x < 0 ? -1 : 1;
    dirRef.current = dir;
    let face = dir, pitch = 0, plume = 90;

    const t0 = performance.now();
    let last = t0;
    let raf = 0;

    const step = (now) => {
      const dt = clamp((now - last) / 1000, 0.001, 0.05);
      last = now;
      const t = Math.max(0, now - t0);
      const p = Math.min(1, t / dur);
      const tau = thrustEase(p);

      sampleT(path, tau, cur);
      const la = Math.min(tau, 1 - LOOK);
      sampleT(path, la, a); sampleT(path, la + LOOK, b);
      const vx = b.x - a.x, vy = b.y - a.y;
      const mag = Math.hypot(vx, vy) || 1;
      const ax = Math.abs(vx);

      // facing: only flip on a clear horizontal heading, then turn smoothly
      if (ax > 2.5) dir = vx < 0 ? -1 : 1;
      dirRef.current = dir;
      face += (dir - face) * (1 - Math.exp(-dt * 16));
      const f = Math.abs(face) < 0.04 ? (face < 0 ? -0.04 : 0.04) : face;

      // pitch along the path (canonical right-facing frame), levels out on arrival
      const pitchT = clamp(Math.atan2(vy, ax) * RAD, -52, 52);
      pitch += (pitchT - pitch) * (1 - Math.exp(-dt * 10));
      const level = 1 - smooth((p - 0.88) / 0.12);
      const body = pitch * level;                 // canonical body rotation (deg)

      // launch: coil, then pop (squash/stretch along his heading)
      let sq = 0;
      if (!reduce) {
        if (t < 90) sq = -smooth(t / 90);
        else if (t < 150) sq = -1 + 2 * ((t - 90) / 60);
        else if (t < 420) sq = Math.pow(1 - (t - 150) / 270, 2);
      }
      const sx = 1 + 0.14 * sq, sy = 1 - 0.10 * sq;

      el.style.transform = `translate(${(cur.x - start.x).toFixed(2)}px, ${(cur.y - start.y).toFixed(2)}px)`;
      if (svg) svg.style.transform = `rotate(${(f * body).toFixed(2)}deg) scale(${sx.toFixed(3)} ${sy.toFixed(3)})`;
      if (jet) jet.setAttribute('transform', `translate(${(22 * (1 - f)).toFixed(2)} 0) scale(${f.toFixed(3)} 1)`);

      // plume: opposite the velocity, expressed in the body frame
      const phi = Math.atan2(-vy || 0, -ax) * RAD;
      let rot = wrapDeg(phi - body - 90);
      const ang = (90 + rot) * Math.PI / 180;
      if (Math.sin(ang) < -0.02 && Math.cos(ang) > -0.6) rot = 90;   // never through the tank
      plume += wrapDeg(rot - plume) * (1 - Math.exp(-dt * 14));
      if (exh) exh.setAttribute('transform', `rotate(${plume.toFixed(1)} 3 39)`);

      // thrust level: small crouch, big launch burst, steady cruise, surge on the climb, taper in
      const burst = t < 90 ? 0 : Math.exp(-(t - 90) / 260);
      const surge = smooth((cur.u - path.uSurge) / 0.06);
      const taper = 1 - 0.55 * smooth((p - 0.8) / 0.2);
      const L = ((t < 90 ? 0.6 : 0.85) + 0.6 * burst + 0.4 * surge) * taper;
      if (thr) {
        const w = 1 + (L - 1) * 0.4;
        thr.setAttribute('transform', `translate(3 39) scale(${w.toFixed(3)} ${L.toFixed(3)}) translate(-3 -39)`);
      }

      if (!reduce) {
        // nozzle position in the viewport (mirror + scale + rotation applied)
        const rr = f * body * Math.PI / 180;
        const ox0 = (22 - 19 * f - 24) * SC * sx, oy0 = 15 * SC * sy;
        const cs = Math.cos(rr), sn = Math.sin(rr);
        const nx = cur.x + 16 + ox0 * cs - oy0 * sn;
        const ny = cur.y + 16 + ox0 * sn + oy0 * cs;
        const bx = -vx / mag, by = -vy / mag;
        if (p < 0.88 && t >= 90) {
          if (t < 300) spawn(now, nx, ny, bx, by, true);
          if (now - lastSpawn > 30) { spawn(now, nx, ny, bx, by, false); lastSpawn = now; }
        }
        for (let i = 0; i < SPARKS; i++) {
          const n = sparks[i];
          if (!n || birth[i] < 0) continue;
          const age = now - birth[i];
          if (age >= life[i]) { birth[i] = -1; n.style.opacity = '0'; continue; }
          const k = age / life[i];
          const s = (1 - k * 0.75) * size[i];
          n.style.opacity = (0.9 * (1 - k)).toFixed(2);
          n.style.transform = `translate3d(${(px[i] + pvx[i] * age / 1000).toFixed(1)}px, ${(py[i] + pvy[i] * age / 1000).toFixed(1)}px, 0) scale(${s.toFixed(2)})`;
        }
      }

      if (p < 1) raf = requestAnimationFrame(step);
      else el.style.transform = `translate(${end.x - start.x}px, ${end.y - start.y}px)`;
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      for (let i = 0; i < SPARKS; i++) if (sparks[i]) sparks[i].style.opacity = '0';
    };
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
  const flying = flight.phase === 'start' || flight.phase === 'fly';
  const baseX = flight.end.x - flight.start.x;
  const baseY = flight.end.y - flight.start.y;

  return (
    <>
      {flying && (
        <div className="theme-flyer-trail" aria-hidden="true">
          {Array.from({ length: SPARKS }, (_, i) => (
            <span key={i} className="theme-flyer-spark" ref={(n) => { sparksRef.current[i] = n; }} />
          ))}
        </div>
      )}
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
    </>
  );
}
