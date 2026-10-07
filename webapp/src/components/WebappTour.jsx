import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react';
import { ThemeBuddy } from './ThemeNudge';

/* ====================================================================
   Webapp tour: slow automatic engine + reaction script. The buddy
   himself is the cursor: themes first (white, dark, 80s, tokyo,
   terminal, 3s each, settling on 80s), then reactions, then the grand
   tour. RULE ZERO: read-only. Play/pause + navigation only.
   X_COMMENT_PATH: installer fills this when the user names the X post
   for the comments stop. null = use the reacted post's own comments.
   ==================================================================== */

const X_COMMENT_PATH = null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const reduced = () => {
  try { return !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches; }
  catch (e) { return false; }
};
const sel = (a) => `[data-tour="${a.name || a}"]`
  + (a.to ? `[data-to="${a.to}"]` : '')
  + (a.kind ? `[data-kind="${a.kind}"]` : '');
const find = (a) => (a ? document.querySelector(sel(a)) : null);
const nameOf = (a) => (a && (a.name || a)) || '';
const shown = (el) => {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
};

async function waitFor(get, ms, alive) {
  const end = Date.now() + ms;
  for (;;) {
    const v = get();
    if (v) return v;
    if (!alive() || Date.now() >= end) return null;
    await sleep(80);
  }
}

async function hold(ms, alive) {
  const end = Date.now() + ms;
  while (alive() && Date.now() < end) await sleep(Math.max(1, Math.min(100, end - Date.now())));
  return alive();
}

/* Slow readable dwell per step: scales a little with copy length. */
const dwellFor = (step) => {
  if (step.dwell) return step.dwell;
  const base = Math.min(Math.max(4500 + (step.text || '').length * 18, 4500), 8000);
  if (step.action === 'pause-toggle') return 1500;
  return base;
};

function useTourEngine({ pick, perform }) {
  const [active, setActive] = useState(false);
  const [presented, setPresented] = useState(false);
  const [steps, setSteps] = useState([]);
  const [idx, setIdx] = useState(0);
  const [rect, setRect] = useState(null);
  const [tapKey, setTapKey] = useState(0);
  const [, bump] = useReducer((n) => n + 1, 0);
  const R = useRef({
    token: 0, idx: -1, steps: [], active: false,
    anchor: null, store: {},
  }).current;
  const hooks = useRef({});
  hooks.current = { pick, perform };

  const pauseStartedMedia = useCallback(() => {
    for (const m of R.store.media || []) {
      try {
        const scope = document.querySelector(m.sel);
        if (!scope) continue;
        const btn = scope.tagName === 'BUTTON' ? scope : (scope.querySelector('button[aria-label]') || scope);
        const label = (btn.getAttribute('aria-label') || '').toLowerCase();
        if (label.startsWith('pause')) btn.click();
        else if (btn.pause && !btn.paused) btn.pause();
      } catch (e) { /* ignore */ }
    }
    R.store.media = [];
  }, [R]);

  const stop = useCallback(async () => {
    if (!R.active) return;
    R.token += 1;
    R.active = false;
    R.anchor = null;
    try { pauseStartedMedia(); } catch (e) { /* ignore */ }
    setActive(false); setPresented(false); setRect(null);
  }, [R, pauseStartedMedia]);

  const goTo = useCallback(async (start) => {
    R.token += 1;
    const t = R.token;
    const ok = () => R.active && R.token === t;
    for (let j = start; j < R.steps.length; j += 1) {
      const step = R.steps[j];
      if (step.skipIf) {
        try { if (step.skipIf(R.store)) continue; } catch (e) { /* ignore */ }
      }
      let el = null;
      if (step.anchor) {
        el = await waitFor(
          () => { const e = find(step.anchor); return e && shown(e) ? e : null; },
          step.wait ?? 2000,
          ok,
        );
        if (!ok()) return;
        if (!el) continue;
      }
      R.idx = j;
      R.anchor = step.anchor || null;
      setIdx(j); setPresented(true); bump();
      el?.scrollIntoView({ block: 'center', inline: 'nearest', behavior: reduced() ? 'auto' : 'smooth' });
      // Let the buddy glide in (1.5s) before he touches anything.
      if (!(await hold(1600, ok))) return;
      if (step.action) {
        try { await hooks.current.perform(step, el, { alive: ok, store: R.store, tap: () => setTapKey((k) => k + 1) }); }
        catch (e) { console.warn('[tour]', e.message || e); }
        if (!ok()) return;
        bump();
      }
      if (!(await hold(dwellFor(step), ok))) return;
    }
    stop();
  }, [R, stop]);

  const start = useCallback(() => {
    if (R.active) return;
    const list = hooks.current.pick();
    R.steps = list; R.idx = -1; R.store = { media: [] }; R.anchor = null;
    R.active = true;
    setSteps(list); setIdx(0); setRect(null); setPresented(false); setTapKey(0); setActive(true);
    goTo(0);
  }, [R, goTo]);

  const toggle = useCallback(() => (R.active ? stop() : start()), [R, start, stop]);

  useEffect(() => {
    window.addEventListener('annotated:tour-toggle', toggle);
    return () => window.removeEventListener('annotated:tour-toggle', toggle);
  }, [toggle]);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('annotated:tour-state', { detail: { active } }));
    const root = document.documentElement;
    if (active) root.setAttribute('data-tour-active', '1'); else root.removeAttribute('data-tour-active');
  }, [active]);

  useEffect(() => {
    if (!active) return undefined;
    const types = ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'dblclick', 'contextmenu', 'keydown', 'keyup', 'keypress'];
    const onEvt = (e) => {
      if (!e.isTrusted) return;
      if (e.type === 'keydown' && e.key === 'Escape') {
        e.preventDefault(); e.stopPropagation();
        stop();
        return;
      }
      if (e.target?.closest?.('[data-tour-ui]')) return;
      e.stopPropagation(); e.stopImmediatePropagation();
      if (e.cancelable) e.preventDefault();
    };
    types.forEach((tt) => window.addEventListener(tt, onEvt, true));
    return () => types.forEach((tt) => window.removeEventListener(tt, onEvt, true));
  }, [active, stop]);

  useEffect(() => {
    if (!active) return undefined;
    let raf = 0;
    let last = '';
    const tick = () => {
      const el = R.anchor ? find(R.anchor) : null;
      let r = null;
      if (el) {
        const b = el.getBoundingClientRect();
        if (b.width > 0 && b.height > 0) r = { top: b.top, left: b.left, width: b.width, height: b.height };
      }
      const k = r ? [r.top, r.left, r.width, r.height].map(Math.round).join() : 'x';
      if (k !== last) { last = k; setRect(r); }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [active, R]);

  useEffect(() => () => { stop(); }, [stop]);

  return { active, presented, steps, idx, rect, tapKey, stop };
}

/* ---------------- actions ---------------- */

async function perform(step, el, { alive, store, tap }) {
  const n = nameOf(step.anchor);
  if (/vote|submit|share/i.test(n)) throw new Error(`[tour] blocked anchor: ${n}`);
  const a = step.action;
  if (!a) return 'none';
  if (a === 'click') {
    if (el.disabled) return 'skipped-disabled';
    tap();
    el.click();
    return 'clicked';
  }
  if (a === 'focus') {
    el.focus();
    return 'focused';
  }
  if (a === 'open-card') {
    const card = document.querySelector(`[data-tour="web-postcard"][data-kind="${step.kind}"]`);
    if (!card) return 'skipped-no-card';
    const link = card.querySelector('.post-card-link');
    if (!link) return 'skipped-no-link';
    tap();
    link.click();
    return 'opened';
  }
  if (a === 'goto-or-click') {
    if (step.gotoPath) {
      window.history.pushState({}, '', step.gotoPath);
      window.dispatchEvent(new PopStateEvent('popstate'));
      return 'navigated';
    }
    tap();
    el.click();
    return 'clicked';
  }
  if (a === 'pause-toggle') {
    const btn = el.tagName === 'BUTTON' ? el : (el.querySelector('button[aria-label]') || el);
    const isPlaying = (btn.getAttribute('aria-label') || '').toLowerCase().startsWith('pause');
    if (!isPlaying) {
      tap();
      btn.click();
    }
    (store.media = store.media || []).push({ sel: sel(step.anchor) });
    await sleep(step.waitMs ?? 7000);
    if (!alive()) return 'aborted';
    const scope = document.querySelector(sel(step.anchor));
    const b2 = scope ? (scope.tagName === 'BUTTON' ? scope : (scope.querySelector('button[aria-label]') || scope)) : null;
    if (b2 && (b2.getAttribute('aria-label') || '').toLowerCase().startsWith('pause')) {
      tap();
      b2.click();
    }
    return 'toggled';
  }
  if (a === 'toggle-themes-if-open') {
    const wrap = el.parentElement;
    if (wrap && wrap.querySelector('[role="menu"]')) {
      tap();
      el.click();
    }
    return 'toggled';
  }
  if (a === 'pick-theme') {
    const wrap = el.parentElement;
    let menu = wrap ? wrap.querySelector('.theme-menu') : null;
    if (!menu) {
      tap();
      el.click();
      await sleep(450);
      if (!alive()) return 'aborted';
      menu = wrap ? wrap.querySelector('.theme-menu') : document.querySelector('.theme-menu');
    }
    const item = menu
      ? menu.querySelector(`[data-tour="web-theme-item"][data-id="${step.theme}"]`)
      : document.querySelector(`[data-tour="web-theme-item"][data-id="${step.theme}"]`);
    if (!item) return 'skipped-no-item';
    tap();
    item.click();
    return 'picked';
  }
  return 'unknown-action';
}

/* ---------------- overlay: ring + traveling buddy + ripple ---------------- */

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

function WebappOverlay({ step, text, rect, tapKey }) {
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
          <ThemeBuddy cute={!!step?.cute} />
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

/* ---------------- script: themes first, then reactions, then the tour ---- */

const STEPS = [
  { anchor: 'web-logo', place: 'below', title: 'Hi there',
    text: 'Hi, I am buddy. Sit back, I will show you around.' },
  { anchor: 'web-theme', place: 'below', title: 'First, themes',
    text: 'First, themes. White, clean paper.',
    action: 'pick-theme', theme: 'light', dwell: 3200 },
  { anchor: 'web-theme', place: 'below', title: 'Dark',
    text: 'Dark. Easy on the eyes.',
    action: 'pick-theme', theme: 'dark', dwell: 3200 },
  { anchor: 'web-theme', place: 'below', title: '80s Retro',
    text: '80s Retro. Neon dusk and glow.',
    action: 'pick-theme', theme: 'synthwave', dwell: 3200 },
  { anchor: 'web-theme', place: 'below', title: 'Tokyo Night',
    text: 'Tokyo Night. Moonlight in the corner.',
    action: 'pick-theme', theme: 'tokyo', dwell: 3200 },
  { anchor: 'web-theme', place: 'below', title: 'Terminal',
    text: 'Terminal. Phosphor green.',
    action: 'pick-theme', theme: 'terminal', dwell: 3200 },
  { anchor: 'web-theme', place: 'below', title: 'Settled', cute: true,
    text: 'And we settle on 80s. Home.',
    action: 'pick-theme', theme: 'synthwave', dwell: 3200 },
  { anchor: 'web-logo', place: 'below', title: 'Starting point',
    text: 'Starting from the feed, so every stop below exists.', action: 'click' },
  { anchor: { name: 'web-postcard', kind: 'article' }, place: 'auto', title: 'An article',
    text: 'First, an article.', action: 'open-card', kind: 'article' },
  { anchor: 'web-cliptitle', place: 'below', title: 'My reaction', cute: true,
    text: '\u201C{title}\u201D, sharp one. Articles clip by quote.' },
  { anchor: 'web-logo', place: 'below', title: 'Back to the feed',
    text: 'Back to the feed.', action: 'click' },
  { anchor: { name: 'web-postcard', kind: 'social' }, place: 'auto', title: 'An X post',
    text: 'An X post, captured as video.', action: 'open-card', kind: 'social' },
  { anchor: 'web-cliptitle', place: 'below', title: 'My reaction', cute: true,
    text: '\u201C{title}\u201D, spicy.' },
  { anchor: 'web-comments-link', place: 'below', title: 'The discussion',
    text: 'The conversation lives in comments. Jumping down.',
    action: 'goto-or-click', gotoPath: X_COMMENT_PATH },
  { anchor: 'web-comments', place: 'above', title: 'My reaction', cute: true,
    text: 'Good thread. Takes get tested here.' },
  { anchor: 'web-logo', place: 'below', title: 'Back to the feed',
    text: 'Back to the feed.', action: 'click' },
  { anchor: { name: 'web-postcard', kind: 'youtube' }, place: 'auto', title: 'A video',
    text: 'A video. Opening it.', action: 'open-card', kind: 'youtube' },
  { anchor: 'web-yt-play', place: 'above', title: 'Listen', cute: true,
    text: 'This is how it sounds like. Ninety seconds max.',
    action: 'pause-toggle', waitMs: 7000 },
  { anchor: 'web-clip-source', place: 'below', title: 'Always linked',
    text: 'Every clip links its source.' },
  { anchor: 'web-claim', place: 'below', title: 'Fair use has a button',
    text: 'Every page carries File a claim.' },
  { anchor: 'web-logo', place: 'below', title: 'Back to the feed',
    text: 'Back to the feed.', action: 'click' },
  { anchor: { name: 'web-postcard', kind: 'podcast' }, place: 'auto', title: 'A podcast',
    text: 'A podcast. Opening it.', action: 'open-card', kind: 'podcast' },
  { anchor: 'web-ep-play', place: 'above', title: 'Listen', cute: true,
    text: 'This is how it sounds like. Ninety seconds of audio.',
    action: 'pause-toggle', waitMs: 7000 },
  { anchor: 'web-logo', place: 'below', title: 'Back to the feed',
    text: 'Back to the feed.', action: 'click' },
  { anchor: { name: 'web-side', to: '/popular' }, place: 'below', title: 'Top takes',
    text: 'Top sorts the best first.', action: 'click' },
  { anchor: 'web-sort', place: 'below', title: 'Pick your flavor',
    text: 'Home, Top, New. Same feed, new order.' },
  { anchor: 'web-rail-comms', place: 'left', title: 'Communities',
    text: 'Communities to explore.' },
  { anchor: 'web-rail-ext', place: 'left', title: 'The sidebar is the product',
    text: 'Annotated is a sidebar extension first. Get it here.' },
  { anchor: { name: 'web-side', to: '/explore' }, place: 'below', title: 'Explore',
    text: 'Explore finds people.', action: 'click' },
  { anchor: 'web-search', place: 'below', title: 'Search',
    text: 'Search anything said or written.', action: 'focus' },
  { anchor: 'web-create-link', place: 'below', title: 'Create',
    text: 'Create starts a post by hand.', action: 'click' },
  { anchor: 'web-create-url', place: 'below', title: 'Paste a URL',
    text: 'Paste a URL first.' },
  { anchor: 'web-create-title', place: 'below', title: 'Name it',
    text: 'Give it a title worth clicking.' },
  { anchor: 'web-create-quote', place: 'below', title: 'Pull the passage',
    text: 'Quote the exact lines.' },
  { anchor: 'web-create-take', place: 'above', title: 'Say your take',
    text: 'Say your take. I never submit.' },
  { anchor: 'web-logo', place: 'below', title: 'Done', cute: true,
    text: "That's the whole website. Press T to replay me.", action: 'click' },
];

function pick() {
  return STEPS;
}

function fillTitle(text) {
  if (!text || !text.includes('{title}')) return text;
  let title = '';
  try {
    title = (document.querySelector('[data-tour="web-cliptitle"]')?.textContent || '').trim().replace(/\s+/g, ' ');
  } catch (e) { /* ignore */ }
  if (!title) {
    try { title = (document.title || '').replace(/\s*[|-].*$/, '').trim(); } catch (e) { /* ignore */ }
  }
  return text.replace('{title}', title.slice(0, 70) || 'this one');
}

export default function WebappTour() {
  const engine = useTourEngine({ pick, perform });
  const { active, presented, steps, idx, rect, tapKey } = engine;
  if (!active || !presented || !steps[idx]) return null;
  const step = steps[idx];
  return (
    <WebappOverlay
      step={step}
      text={fillTitle(step.text)}
      rect={rect}
      tapKey={tapKey}
    />
  );
}
