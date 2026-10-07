import { useEffect, useLayoutEffect, useRef, useState } from 'react';

// Panel buddy: 1:1 port of the webapp ThemeBuddy puppy (perky ears, feet,
// bent side arm, tail, glinting eyes). Colors come from panel vars via the
// b-accent / b-on classes; arm and tail use currentColor.
export function TourBuddy({ cute = false, size = 44 }) {
  return (
    <svg
      className={`tour-buddy${cute ? ' is-cute' : ''}`}
      width={size}
      height={size}
      viewBox="0 0 48 48"
      aria-hidden="true"
      focusable="false"
    >
      <g className="tour-tail">
        <path d="M9 33 C 3 33, 2 27, 6 25" fill="none" stroke="currentColor" strokeWidth="4.5" strokeLinecap="round" />
      </g>
      <g className="tour-arm">
        <path d="M33 29 C 38 27, 41 24, 41 19" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
        <circle cx="41" cy="17.5" r="4" fill="currentColor" />
      </g>
      <ellipse className="b-accent" cx="14" cy="13" rx="4" ry="7" transform="rotate(-18 14 13)" />
      <ellipse className="b-accent" cx="30" cy="13" rx="4" ry="7" transform="rotate(18 30 13)" />
      <ellipse className="b-on" cx="14" cy="13.5" rx="2" ry="4.5" opacity=".3" transform="rotate(-18 14 13.5)" />
      <ellipse className="b-on" cx="30" cy="13.5" rx="2" ry="4.5" opacity=".3" transform="rotate(18 30 13.5)" />
      <ellipse className="b-accent" cx="15" cy="42" rx="5.5" ry="4" />
      <ellipse className="b-accent" cx="29" cy="42" rx="5.5" ry="4" />
      <circle className="b-accent" cx="22" cy="27" r="15" />
      <ellipse cx="21" cy="17" rx="4" ry="2.2" fill="#fff" opacity=".22" transform="rotate(-25 21 17)" />
      {cute ? (
        <g>
          <path className="b-on-stroke" d="M14 24.5 q3.5 -5 7 0" fill="none" strokeWidth="2.3" strokeLinecap="round" />
          <path className="b-on-stroke" d="M24 24.5 q3.5 -5 7 0" fill="none" strokeWidth="2.3" strokeLinecap="round" />
          <path className="b-on" d="M16 30 q6.5 6.5 13 0 Z" />
        </g>
      ) : (
        <g>
          <circle className="b-on" cx="17" cy="24.5" r="3.2" />
          <circle className="b-on" cx="27" cy="24.5" r="3.2" />
          <circle cx="15.7" cy="23.2" r="1.1" fill="#fff" opacity=".95" />
          <circle cx="25.7" cy="23.2" r="1.1" fill="#fff" opacity=".95" />
          <path className="b-on-stroke" d="M18 31.5 q4 4 8 0" fill="none" strokeWidth="2.2" strokeLinecap="round" />
        </g>
      )}
      <circle className="b-on" cx="12" cy="29.5" r="2.6" opacity=".25" />
      <circle className="b-on" cx="33" cy="29.5" r="2.6" opacity=".25" />
    </svg>
  );
}

// Bubble placement: full width dock above/below in narrow panels, side
// placement when room allows. Tail position tracks the anchor center.
function layout(rect, bw, bh, pref, vw, vh) {
  const M = 12;
  const G = 14;
  const narrow = vw < 560;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const dock = (top) => ({ left: Math.round((vw - bw) / 2), top: Math.round(top), side: 'dock', tail: 0 });
  if (!rect) return dock(Math.max(M, vh - bh - M * 2));
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const room = {
    below: vh - rect.top - rect.height - G - M,
    above: rect.top - G - M,
    right: vw - rect.left - rect.width - G - M,
    left: rect.left - G - M,
  };
  const fits = {
    below: room.below >= bh,
    above: room.above >= bh,
    right: !narrow && room.right >= bw,
    left: !narrow && room.left >= bw,
  };
  const side = pref && pref !== 'auto' && fits[pref] ? pref : ['below', 'above', 'right', 'left'].find((s) => fits[s]);
  if (!side) return dock(cy > vh / 2 ? M : Math.max(M, vh - bh - M));
  let left;
  let top;
  let tail;
  if (side === 'below' || side === 'above') {
    left = clamp(cx - bw / 2, M, vw - bw - M);
    top = side === 'below' ? rect.top + rect.height + G : rect.top - G - bh;
    tail = clamp(cx - left, 18, bw - 18);
  } else {
    top = clamp(cy - bh / 2, M, vh - bh - M);
    left = side === 'right' ? rect.left + rect.width + G : rect.left - G - bw;
    tail = clamp(cy - top, 18, bh - 18);
  }
  return { left: Math.round(left), top: Math.round(top), side, tail: Math.round(tail) };
}

export function TourOverlay({ step, text, rect, tapKey }) {
  const cardRef = useRef(null);
  const [pos, setPos] = useState({ left: 12, top: 12, side: 'dock', tail: 0 });
  const [ready, setReady] = useState(false);
  const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight });
  const [tapping, setTapping] = useState(false);
  const lastBuddy = useRef(null);

  useEffect(() => {
    const f = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', f);
    return () => window.removeEventListener('resize', f);
  }, []);

  useLayoutEffect(() => {
    const c = cardRef.current;
    if (!c) return;
    const n = layout(rect, c.offsetWidth, c.offsetHeight, step?.place, vp.w, vp.h);
    setPos((p) => (p.left === n.left && p.top === n.top && p.side === n.side && p.tail === n.tail ? p : n));
    if (!ready) requestAnimationFrame(() => setReady(true));
  });

  useEffect(() => {
    if (!tapKey) return undefined;
    setTapping(true);
    const t = window.setTimeout(() => setTapping(false), 520);
    return () => window.clearTimeout(t);
  }, [tapKey]);

  // The buddy himself is the cursor: he rests on the current stop and
  // glides slowly to the next one. Tracks the last seen rect so he never
  // vanishes mid-navigation.
  let buddyXY = null;
  if (rect) {
    buddyXY = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    lastBuddy.current = buddyXY;
  } else {
    buddyXY = lastBuddy.current;
  }

  const pad = 6;
  return (
    <div className="tour-root" data-tour-ui="true">
      {rect && (
        <div
          className="tour-ring"
          data-on="1"
          style={{ top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }}
        />
      )}
      <section
        ref={cardRef}
        className="tour-card"
        role="dialog"
        aria-label="Guided tour"
        aria-live="polite"
        data-side={pos.side}
        data-ready={ready ? '1' : '0'}
        style={{ left: pos.left, top: pos.top, '--tail': `${pos.tail}px` }}
      >
        <div className="tour-col">
          <div className="tour-body" key={step?.text}>
            {step?.title ? <p className="tour-title">{step.title}</p> : null}
            <p className="tour-text">{text}</p>
          </div>
          <p className="tour-hint">Sit back, I drive. Esc stops me.</p>
        </div>
      </section>
      {buddyXY && (
        <div
          className={`tour-fly${tapping ? ' is-tap' : ''}`}
          data-on="1"
          style={{ left: buddyXY.x, top: buddyXY.y }}
        >
          <TourBuddy cute={!!step?.cute} />
        </div>
      )}
      {tapKey > 0 && rect && (
        <span
          key={tapKey}
          className="tour-ripple"
          style={{ left: rect.left + rect.width / 2, top: rect.top + rect.height / 2 }}
        />
      )}
    </div>
  );
}
