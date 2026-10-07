import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import TIPS, { GREETING, ASLEEP_BODY } from '../lib/buddyTips';
import { ThemeBuddy } from './BuddyArt';

/* Corner buddy guide. Hover-driven only: the visitor drives, the buddy
   explains. No autoplay, no navigation, no sound, no dimming. */

const STORE_KEY = 'annotated-buddy';
const GREET_KEY = 'annotated-buddy-greeted';
const BUDDY_SIZE = 60;
const BUDDY_RIGHT = 24;
const BUDDY_BOTTOM = 20;

function loadEnabled() {
  try {
    const v = localStorage.getItem(STORE_KEY);
    return v === null ? true : v === '1';
  } catch { return true; }
}
function saveEnabled(v) {
  try { localStorage.setItem(STORE_KEY, v ? '1' : '0'); } catch {}
}

/* Pure placement: candidates in order - above him right-aligned, left of
   him bottom-aligned, above him stepping up 40px (max 6), else candidate 1.
   Tail always points toward him (resolved in CSS via data-side). */
export function pickBubblePlacement(targetRect, buddyRect, viewport, bubbleSize) {
  const M = 12;
  const W = bubbleSize.w;
  const H = bubbleSize.h;
  const fits = (l, t) => l >= M && t >= M && l + W <= viewport.w - M && t + H <= viewport.h - M;
  const clearOf = (l, t) => {
    if (!targetRect) return true;
    return l + W <= targetRect.left || l >= targetRect.left + targetRect.width
      || t + H <= targetRect.top || t >= targetRect.top + targetRect.height;
  };
  // 1) above him, right-aligned with him
  let c = { left: buddyRect.left + buddyRect.width - W, top: buddyRect.top - H - 14, side: 'above' };
  if (fits(c.left, c.top) && clearOf(c.left, c.top)) return c;
  // 2) to the left of him, bottom-aligned
  c = { left: buddyRect.left - W - 14, top: buddyRect.top + buddyRect.height - H, side: 'left' };
  if (fits(c.left, c.top) && clearOf(c.left, c.top)) return c;
  // 3) above him, stepping up 40px at a time
  for (let i = 0; i < 6; i += 1) {
    const top = buddyRect.top - H - 14 - i * 40;
    const left = buddyRect.left + buddyRect.width - W;
    if (fits(left, top) && clearOf(left, top)) return { left, top, side: 'above' };
  }
  // fallback: candidate 1 clamped into the viewport
  return {
    left: Math.max(M, Math.min(viewport.w - M - W, buddyRect.left + buddyRect.width - W)),
    top: Math.max(M, buddyRect.top - H - 14),
    side: 'above',
  };
}

function buddyRectNow() {
  return {
    left: window.innerWidth - BUDDY_RIGHT - BUDDY_SIZE,
    top: window.innerHeight - BUDDY_BOTTOM - BUDDY_SIZE,
    width: BUDDY_SIZE,
    height: BUDDY_SIZE,
  };
}

export default function BuddyGuide() {
  const [enabled, setEnabled] = useState(loadEnabled);
  const [bubble, setBubble] = useState(null); // null | { id, title, body } | { greeting: true }
  const [bubblePos, setBubblePos] = useState(null); // { left, top, side }
  const [ring, setRing] = useState(null); // { top, left, width, height, radius }
  const [perky, setPerky] = useState(false);
  const [sleepy, setSleepy] = useState(false);

  const buddyEl = useRef(null);
  const bubbleEl = useRef(null);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const bubbleRef = useRef(bubble);
  bubbleRef.current = bubble;
  const st = useRef({
    x: -1, y: -1, raf: 0, lastMove: 0,
    leanX: 0, leanY: 0, excitedUntil: 0, coolUntil: 0,
    openTimer: 0, swapTimer: 0, closeTimer: 0, greetTimer: 0, greetKill: 0,
    pendingId: null, closedId: null, suppressed: false, lastId: null,
    targetEl: null, ro: null, reduced: false, greeted: false,
  });
  const S = st.current;

  const clearTimers = () => {
    [S.openTimer, S.swapTimer, S.closeTimer, S.greetTimer, S.greetKill].forEach((t) => { if (t) window.clearTimeout(t); });
    S.openTimer = S.swapTimer = S.closeTimer = S.greetTimer = S.greetKill = 0;
  };

  const closeBubble = useCallback((keepRing) => {
    clearTimers();
    setBubble(null);
    if (!keepRing) setRing(null);
    S.targetEl = null;
    if (S.ro) { try { S.ro.disconnect(); } catch {} S.ro = null; }
  }, [S]);

  const broadcast = useCallback((on) => {
    window.dispatchEvent(new CustomEvent('annotated:buddy-state', { detail: { enabled: on } }));
  }, []);

  const setOn = useCallback((on) => {
    saveEnabled(on);
    setEnabled(on);
    broadcast(on);
    if (!on) {
      closeBubble();
      setSleepy(true);
    } else {
      setSleepy(false);
      setPerky(true);
      window.setTimeout(() => setPerky(false), 260);
    }
  }, [broadcast, closeBubble]);

  /* Ring geometry from the live target element. */
  const placeRing = useCallback(() => {
    const el = S.targetEl;
    if (!el || !el.isConnected) {
      if (bubbleRef.current) closeBubble();
      return;
    }
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0 || r.bottom < 0 || r.top > window.innerHeight) {
      closeBubble();
      return;
    }
    let radius = 12;
    try {
      const m = String(window.getComputedStyle(el).borderRadius || '').match(/[\d.]+/);
      if (m) radius = Math.min(24, parseFloat(m[0]) + 4);
    } catch {}
    const pad = 5;
    setRing((prev) => {
      const n = { top: r.top - pad, left: r.left - pad, width: r.width + pad * 2, height: r.height + pad * 2, radius };
      if (prev && Math.abs(prev.top - n.top) < 0.5 && Math.abs(prev.left - n.left) < 0.5
        && Math.abs(prev.width - n.width) < 0.5 && Math.abs(prev.height - n.height) < 0.5) return prev;
      return n;
    });
  }, [S, closeBubble]);

  /* Bubble geometry: measured after render, relative to buddy + target. */
  const placeBubble = useCallback(() => {
    const b = bubbleEl.current;
    if (!b) return;
    const bw = b.offsetWidth;
    const bh = b.offsetHeight;
    if (!bw || !bh) return;
    const vp = { w: window.innerWidth, h: window.innerHeight };
    const br = buddyRectNow();
    const t = S.targetEl && S.targetEl.isConnected ? S.targetEl.getBoundingClientRect() : null;
    const tr = t && t.width > 0 && t.height > 0 ? { left: t.left, top: t.top, width: t.width, height: t.height } : null;
    const n = pickBubblePlacement(tr, br, vp, { w: bw, h: bh });
    setBubblePos((p) => (p && p.left === n.left && p.top === n.top && p.side === n.side ? p : n));
  }, [S]);

  const openFor = useCallback((id) => {
    const tip = TIPS[id];
    if (!tip) return;
    const body = (id === 'tour-toggle' && !enabledRef.current) ? ASLEEP_BODY : tip.body;
    S.targetEl = document.querySelector(`[data-buddy="${id}"]`);
    setBubble({ id, title: tip.title, body });
    setPerky(true);
    window.setTimeout(() => setPerky(false), 260);
    if (S.ro) { try { S.ro.disconnect(); } catch {} S.ro = null; }
    if (S.targetEl && typeof ResizeObserver !== 'undefined') {
      try {
        S.ro = new ResizeObserver(() => { placeRing(); placeBubble(); });
        S.ro.observe(S.targetEl);
      } catch {}
    }
    placeRing();
  }, [S, placeRing, placeBubble]);

  const openGreeting = useCallback(() => {
    try { localStorage.setItem(GREET_KEY, '1'); } catch {}
    S.greeted = true;
    S.targetEl = null;
    if (S.ro) { try { S.ro.disconnect(); } catch {} S.ro = null; }
    setRing(null);
    setBubble({ greeting: true, title: GREETING.title, body: GREETING.body });
    S.greetKill = window.setTimeout(() => {
      if (bubbleRef.current && bubbleRef.current.greeting) setBubble(null);
    }, 9000);
  }, [S]);

  /* Resolve what is under the pointer right now. */
  const resolveTarget = useCallback(() => {
    if (!enabledRef.current || S.suppressed) return;
    const host = document.elementFromPoint(S.x, S.y);
    const node = host && host.closest ? host.closest('[data-buddy]') : null;
    const id = node ? node.getAttribute('data-buddy') : null;
    if (id !== S.lastId) {
      S.lastId = id;
      S.suppressed = false;
      S.closedId = null;
    }
    const cur = bubbleRef.current;
    if (!id) {
      if (cur && !cur.greeting) {
        clearTimers();
        S.closeTimer = window.setTimeout(() => { setBubble(null); setRing(null); S.targetEl = null; }, 300);
      }
      return;
    }
    if (S.closedId === id) return;
    if (cur && !cur.greeting && cur.id === id) {
      clearTimers();
      S.targetEl = node;
      placeRing();
      return;
    }
    if (cur && !cur.greeting) {
      // Neighbor swap: quick crossfade, no re-open.
      clearTimers();
      S.targetEl = node;
      S.swapTimer = window.setTimeout(() => openFor(id), 120);
      return;
    }
    // Fresh open (also steals the greeting).
    clearTimers();
    if (cur && cur.greeting) setBubble(null);
    S.pendingId = id;
    S.openTimer = window.setTimeout(() => {
      if (S.pendingId === id) openFor(id);
    }, 250);
  }, [S, openFor, placeRing, clearTimers]);

  /* Lean loop: writes straight to the buddy element, never setState. */
  const pokeLoop = useCallback(() => {
    if (S.raf) return;
    const reducedMotion = S.reduced;
    const step = () => {
      S.raf = 0;
      if (!enabledRef.current) return;
      const el = buddyEl.current;
      if (el && !reducedMotion) {
        const br = buddyRectNow();
        const cx = br.left + br.width / 2;
        const cy = br.top + br.height / 2;
        const idle = Date.now() - S.lastMove > 3000 || S.x < 0;
        let tx = 0;
        let ty = 0;
        let tr = 0;
        if (!idle) {
          const dx = Math.max(-1, Math.min(1, (S.x - cx) / 300));
          const dy = Math.max(-1, Math.min(1, (S.y - cy) / 300));
          tx = dx * 4;
          ty = dy * 4;
          tr = dx * 10;
          const dist = Math.hypot(S.x - cx, S.y - cy);
          if (dist < 100 && Date.now() > S.coolUntil) {
            S.coolUntil = Date.now() + 4000;
            el.classList.remove('is-excited');
            void el.offsetWidth;
            el.classList.add('is-excited');
          }
        }
        S.leanX += (tx - S.leanX) * 0.12;
        S.leanY += (ty - S.leanY) * 0.12;
        const rr = tr * 0.12 + (parseFloat(el.dataset.rot || '0') * 0.88);
        el.dataset.rot = String(rr);
        el.style.transform = `translate(${S.leanX.toFixed(2)}px, ${S.leanY.toFixed(2)}px) rotate(${rr.toFixed(2)}deg)`;
        if (Math.abs(tx - S.leanX) > 0.02 || Math.abs(ty - S.leanY) > 0.02 || !idle) {
          S.raf = requestAnimationFrame(step);
        }
      }
      // Ring follows while open (scroll/resize drift).
      if (bubbleRef.current && !bubbleRef.current.greeting && S.targetEl) placeRing();
    };
    S.raf = requestAnimationFrame(step);
  }, [S, placeRing]);

  useEffect(() => {
    try { S.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { S.reduced = false; }
    try { S.greeted = !!localStorage.getItem(GREET_KEY); } catch { S.greeted = false; }
    broadcast(loadEnabled());

    const onMove = (e) => {
      if (!enabledRef.current) return;
      if (e.buttons !== 0) return;
      S.x = e.clientX;
      S.y = e.clientY;
      S.lastMove = Date.now();
      pokeLoop();
    };
    const onOver = (e) => {
      if (!enabledRef.current) return;
      if (e.buttons !== 0) return;
      resolveTarget();
    };
    const onKey = (e) => {
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) {
        if (bubbleRef.current) setBubble(null);
        S.suppressed = true;
        clearTimers();
        setRing(null);
        S.targetEl = null;
      }
    };
    const onClick = (e) => {
      const cur = bubbleRef.current;
      if (!cur || cur.greeting || !cur.id) return;
      const t = e.target;
      if (t && t.closest && t.closest(`[data-buddy="${cur.id}"]`)) {
        S.closedId = cur.id;
        setBubble(null);
        setRing(null);
        S.targetEl = null;
        clearTimers();
      }
    };
    const onScroll = () => {
      if (!enabledRef.current) return;
      if (S.rafScroll) return;
      S.rafScroll = requestAnimationFrame(() => {
        S.rafScroll = 0;
        if (S.x >= 0) resolveTarget();
        placeRing();
        placeBubble();
      });
    };
    const onResize = () => {
      placeRing();
      placeBubble();
    };
    const onLeave = () => {
      S.x = -1;
      S.y = -1;
      pokeLoop();
      if (bubbleRef.current) { setBubble(null); setRing(null); }
      clearTimers();
      S.targetEl = null;
    };
    const onToggle = () => {
      const next = !enabledRef.current;
      saveEnabled(next);
      setEnabled(next);
      broadcast(next);
      if (!next) {
        clearTimers();
        setBubble(null);
        setRing(null);
        S.targetEl = null;
        setSleepy(true);
      } else {
        setSleepy(false);
        setPerky(true);
        window.setTimeout(() => setPerky(false), 260);
      }
    };
    const onVis = () => { if (document.visibilityState !== 'visible') onLeave(); };

    document.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerover', onOver, { passive: true });
    document.addEventListener('keydown', onKey);
    document.addEventListener('click', onClick);
    document.addEventListener('mouseleave', onLeave);
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('scroll', onScroll, { passive: true, capture: true });
    window.addEventListener('resize', onResize);
    window.addEventListener('annotated:buddy-toggle', onToggle);
    return () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerover', onOver);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('click', onClick);
      document.removeEventListener('mouseleave', onLeave);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('scroll', onScroll, { capture: true });
      window.removeEventListener('resize', onResize);
      window.removeEventListener('annotated:buddy-toggle', onToggle);
      if (S.raf) cancelAnimationFrame(S.raf);
      if (S.rafScroll) cancelAnimationFrame(S.rafScroll);
      if (S.ro) { try { S.ro.disconnect(); } catch {} }
      clearTimers();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Greeting: first visit only, shortly after load. */
  useEffect(() => {
    if (S.greeted) return undefined;
    S.greetTimer = window.setTimeout(() => {
      if (enabledRef.current && !bubbleRef.current) openGreeting();
      else S.greeted = true;
    }, 1000);
    return () => { if (S.greetTimer) window.clearTimeout(S.greetTimer); };
  }, [S, openGreeting]);

  /* Measure + place the bubble after every open/swap. */
  useLayoutEffect(() => {
    if (bubble) placeBubble();
  });

  const br = buddyRectNow();

  return (
    <div className="buddy-guide" aria-hidden="true">
      {ring && <div className="buddy-ring" style={{ top: ring.top, left: ring.left, width: ring.width, height: ring.height, borderRadius: ring.radius }} />}
      {bubble && (
        <section
          ref={bubbleEl}
          className="buddy-bubble"
          data-side={bubblePos ? bubblePos.side : 'above'}
          style={bubblePos ? { left: bubblePos.left, top: bubblePos.top } : { visibility: 'hidden' }}
        >
          <p className="buddy-bubble-title" key={`t-${bubble.id || 'hi'}`}>{bubble.title}</p>
          <p className="buddy-bubble-text" key={`b-${bubble.id || 'hi'}`}>{bubble.body}</p>
        </section>
      )}
      <div
        ref={buddyEl}
        data-rot="0"
        className={`buddy-corner${perky ? ' is-perky' : ''}${sleepy ? ' is-sleepy' : ''}`}
        style={{ width: BUDDY_SIZE, height: BUDDY_SIZE }}
      >
        <ThemeBuddy size={BUDDY_SIZE} />
      </div>
    </div>
  );
}
