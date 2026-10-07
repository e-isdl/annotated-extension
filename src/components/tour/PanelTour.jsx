import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { TourOverlay } from './TourBuddy';

/* ====================================================================
   Panel tour: slow automatic engine + extension scripts. The buddy
   himself is the cursor: he glides to each stop, taps it, a ripple
   blooms. No buttons, no dimming, no manual advancing. Esc stops it.
   RULE ZERO: never posts, saves, votes or submits anything. The NEVER
   list below is enforced in perform() - a step targeting one throws and
   its action is skipped.
   Clip-range restore is NOT possible through the DOM (no API exposes the
   window mapping): exit restores video time, take text and play mode; the
   range stays where the tour left it, adjustable by hand.
   ==================================================================== */

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

/* React-controlled inputs: native setter + input event. */
function setNative(el, value) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

async function typeInto(el, text, alive) {
  setNative(el, '');
  for (let i = 1; i <= text.length; i += 1) {
    if (!alive()) return false;
    setNative(el, text.slice(0, i));
    await sleep(45 + Math.random() * 30);
  }
  return true;
}

/* Synthetic pointer events carry no active pointer, so a component calling
   setPointerCapture on them would throw. Guard it for the tap duration. */
function guardCapture() {
  const P = Element.prototype;
  const keys = ['setPointerCapture', 'releasePointerCapture'];
  const saved = keys.map((k) => P[k]);
  keys.forEach((k, i) => {
    P[k] = function guarded(...args) {
      try { return saved[i]?.apply(this, args); } catch (e) { return undefined; }
    };
  });
  return () => keys.forEach((k, i) => { P[k] = saved[i]; });
}

function firePointer(el, type, x, y) {
  el.dispatchEvent(new PointerEvent(type, {
    bubbles: true, cancelable: true, composed: true, view: window,
    clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse', isPrimary: true,
    button: 0, buttons: type === 'pointerdown' ? 1 : 0,
  }));
}

/* Tap a bar at a fraction of its width. */
async function tapAt(el, frac) {
  const r = el.getBoundingClientRect();
  const x = r.left + Math.min(Math.max(frac, 0), 1) * r.width;
  const y = r.top + r.height / 2;
  const release = guardCapture();
  try {
    firePointer(el, 'pointerdown', x, y);
    await sleep(60);
    firePointer(el, 'pointerup', x, y);
  } finally {
    release();
  }
}

function dblclickEl(el) {
  const r = el.getBoundingClientRect();
  const base = {
    bubbles: true, cancelable: true, composed: true, view: window, button: 0,
    clientX: r.left + r.width / 2, clientY: r.top + r.height / 2,
  };
  [1, 2].forEach((n) => {
    el.dispatchEvent(new MouseEvent('mousedown', { ...base, detail: n, buttons: 1 }));
    el.dispatchEvent(new MouseEvent('mouseup', { ...base, detail: n }));
    el.dispatchEvent(new MouseEvent('click', { ...base, detail: n }));
  });
  el.dispatchEvent(new MouseEvent('dblclick', { ...base, detail: 2 }));
}

const NEVER = new Set([
  'ann-post', 'ann-save', 'drafts-first', 'pod-capture',
  'art-continue', 'tw-continue', 'pod-continue',
]);

/* Slow readable dwell per step: scales a little with copy length. */
const dwellFor = (step) => {
  if (step.dwell) return step.dwell;
  const base = Math.min(Math.max(4500 + (step.text || '').length * 18, 4500), 8000);
  if (step.action === 'type') return 3000;
  if (step.action === 'pause-toggle') return 1500;
  if (step.action === 'tap-seek') return 3200;
  return base;
};

function useTourEngine({ pick, perform, snapshot, restore }) {
  const [active, setActive] = useState(false);
  const [presented, setPresented] = useState(false);
  const [steps, setSteps] = useState([]);
  const [idx, setIdx] = useState(0);
  const [rect, setRect] = useState(null);
  const [tapKey, setTapKey] = useState(0);
  const [, bump] = useReducer((n) => n + 1, 0);
  const R = useRef({
    token: 0, idx: -1, steps: [], active: false,
    anchor: null, snap: null, store: {},
  }).current;
  const hooks = useRef({});
  hooks.current = { pick, perform, snapshot, restore };

  const stop = useCallback(async () => {
    if (!R.active) return;
    const { snap, store } = R;
    R.token += 1;
    R.active = false;
    R.anchor = null;
    setActive(false); setPresented(false); setRect(null);
    try { await hooks.current.restore?.(snap, store); } catch (e) { /* ignore */ }
  }, [R]);

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
          step.wait ?? 3500,
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
    R.steps = list; R.idx = -1; R.store = {}; R.anchor = null;
    try { R.snap = hooks.current.snapshot?.() ?? null; } catch (e) { R.snap = null; }
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

  /* While touring, trusted (real) input outside the tour UI is swallowed;
     the engine's own synthetic events are untrusted and pass through.
     Esc stops the tour. The T pill stays clickable. */
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

  /* Re-measure the anchor every frame: follows scroll, resize, movement. */
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

async function perform(step, el, { alive, tap }) {
  const n = nameOf(step.anchor);
  if (NEVER.has(n)) throw new Error(`[tour] blocked anchor: ${n}`);
  const a = step.action;
  if (!a) return 'none';
  if (a === 'click') {
    if (el.disabled) return 'skipped-disabled';
    if (n === 'yt-continue') {
      const emb = document.querySelector('[data-tour="yt-embed"]');
      const isEmbed = emb && (emb.getAttribute('aria-checked') === 'true' || emb.classList.contains('is-selected'));
      if (!isEmbed) return 'skipped-record-mode';
    }
    tap();
    el.click();
    return 'clicked';
  }
  if (a === 'tap-seek') {
    tap();
    for (const f of step.fracs || [0.5]) {
      if (!alive()) return 'aborted';
      await tapAt(el, f);
      await sleep(900);
    }
    return 'tapped';
  }
  if (a === 'tap-bar') {
    tap();
    await tapAt(el, step.frac ?? 0.62);
    return 'tapped';
  }
  if (a === 'type') {
    await typeInto(el, step.text2 || '', alive);
    return 'typed';
  }
  if (a === 'type-dom-word') {
    const w50 = document.querySelector('[data-word-index="50"]');
    const word = (w50?.textContent || '').trim().split(/\s+/)[0] || 'the';
    await typeInto(el, word, alive);
    return 'typed';
  }
  if (a === 'dblclick-current') {
    const cur = document.querySelector('.word-area span.is-current, [data-word-index].is-current');
    if (!cur) return 'skipped-no-match';
    tap();
    dblclickEl(cur);
    return 'dblclicked';
  }
  return 'unknown-action';
}

function snapshot() {
  const snap = {};
  try {
    const scrub = document.querySelector('[data-tour="yt-scrub"]');
    if (scrub) {
      snap.videoMax = Number(scrub.getAttribute('aria-valuemax')) || null;
      snap.videoTime = Number(scrub.getAttribute('aria-valuenow')) || 0;
    }
    const emb = document.querySelector('[data-tour="yt-embed"]');
    if (emb) snap.embed = emb.getAttribute('aria-checked') === 'true' || emb.classList.contains('is-selected');
    else snap.embed = null;
    const take = document.querySelector('[data-tour="ann-take"]');
    snap.takeText = take ? take.value : null;
  } catch (e) { /* ignore */ }
  return snap;
}

async function restore(snap) {
  if (!snap) return;
  try {
    if (snap.embed !== null && snap.embed !== undefined) {
      const target = document.querySelector(snap.embed ? '[data-tour="yt-embed"]' : '[data-tour="yt-record"]');
      if (target) {
        const on = target.getAttribute('aria-checked') === 'true' || target.classList.contains('is-selected');
        if (!on) target.click();
      }
    }
    if (typeof snap.videoTime === 'number' && snap.videoMax) {
      const scrub = document.querySelector('[data-tour="yt-scrub"]');
      if (scrub) {
        const max = Number(scrub.getAttribute('aria-valuemax')) || snap.videoMax;
        await tapAt(scrub, Math.min(Math.max(snap.videoTime / Math.max(1, max), 0), 1));
      }
    }
    if (snap.takeText !== null && snap.takeText !== undefined) {
      const take = document.querySelector('[data-tour="ann-take"]');
      if (take) setNative(take, snap.takeText);
    }
  } catch (e) { /* ignore */ }
  // NOTE (integration): clip-range (startSec/endSec) cannot be restored
  // through the DOM - no API exposes the window mapping. It stays where the
  // tour left it, adjustable by hand.
}

/* ---------------- scripts: copy lives here, easy to edit ---------------- */

const YT = [
  { anchor: 'ext-flowhead', place: 'below', title: 'Hi there',
    text: 'Hi, I am buddy. Sit back, I will show clipping end to end.' },
  { anchor: 'ext-flowhead', place: 'below', title: 'Meet your clipper',
    text: 'This header always tells you what you are clipping.' },
  { anchor: 'yt-play', place: 'below', title: 'Preview first',
    text: 'Play runs your clip range, so you hear what you have.' },
  { anchor: 'yt-scrub', place: 'above', title: 'The full timeline',
    text: 'Every second lives here. I tap to seek, watch it jump.',
    action: 'tap-seek', fracs: [0.4, 0.65] },
  { anchor: 'yt-clipbar', place: 'above', title: 'The clipping window',
    text: 'A locked 3 minute window rides your moment. Tap moves a handle.',
    action: 'tap-bar', frac: 0.62 },
  { anchor: 'yt-clippill', place: 'below', title: 'Your clip, in a pill',
    text: 'Start, end, length. Ninety seconds max.' },
  { anchor: 'yt-chapters', place: 'below', title: 'Chapters',
    text: 'Chapters jump sections. Opening the list.',
    action: 'click' },
  { anchor: 'yt-chapter-row', place: 'below', title: 'Pick one',
    text: 'First chapter. Thirty seconds, seeks itself.',
    action: 'click' },
  { anchor: 'yt-words', place: 'below', title: 'Word clipper',
    text: 'Find moments by spoken words. Opening it.',
    action: 'click' },
  { anchor: 'word-find', place: 'below', title: 'Search the transcript',
    text: 'I search a word from your transcript.',
    action: 'type-dom-word' },
  { anchor: 'word-area', place: 'above', title: 'There it is',
    text: 'Lit up. Double-click grabs the whole phrase.',
    action: 'dblclick-current' },
  { anchor: 'word-continue', place: 'above', title: 'Fold it in',
    text: 'Continue folds my words into the clip.',
    action: 'click' },
  { anchor: 'yt-clippill', place: 'below', title: 'Locked in',
    text: 'The window followed us. That pill is our clip.' },
  { anchor: 'yt-record', place: 'above', title: 'Record mode',
    text: 'Record saves real video. I select it, never capture.',
    action: 'click' },
  { anchor: 'yt-embed', place: 'above', title: 'Embed mode',
    text: 'Embed plays from YouTube. Back to it.',
    action: 'click' },
  { anchor: 'yt-continue', place: 'above', title: 'Onward',
    text: 'Continue carries the clip to your take.',
    action: 'click' },
  { anchor: 'ann-take', place: 'above', title: 'Your take',
    text: 'This is where you put your take. Typing it, wiped after.',
    action: 'type', text2: 'this is where you put your take' },
  { anchor: 'ann-speak', place: 'above', title: 'Speak it',
    text: 'Or record a voice note instead.' },
  { anchor: 'ann-type', place: 'above', title: 'Pick a shape',
    text: 'Reaction, fact check, explainer, hot take, question.' },
  { anchor: 'ann-community', place: 'above', title: 'Pick a home',
    text: 'Post to a community, or none.' },
  { anchor: 'ann-save', place: 'above', title: 'Save draft',
    text: 'Save draft stays private. I never click it.' },
  { anchor: 'ann-post', place: 'above', title: 'The red button',
    text: 'Post annotation publishes. Always your call, never mine.' },
  { anchor: 'ann-drafts', place: 'above', title: 'Drafts live here',
    text: 'Unfinished work waits here. Opening, read only.',
    action: 'click' },
  { anchor: 'drafts-first', place: 'below', title: 'Kept safe',
    text: 'Each draft keeps clip, take and range. I will not resume it.' },
  { anchor: 'drafts-back', place: 'below', title: 'And back',
    text: 'Back to the form.',
    action: 'click' },
  { anchor: 'ann-take', place: 'above', title: 'Your turn', cute: true,
    text: 'Done. All restored. Press T to replay me.' },
];

const ARTICLE = [
  { anchor: 'ext-flowhead', place: 'below', title: 'Hi there',
    text: 'Hi, I am buddy. Articles clip by quote, I will show you.' },
  { anchor: 'art-card', place: 'below', title: 'The quote card',
    text: 'Highlight page text, it lands here. Up to 200 words.' },
  { anchor: 'art-edit', place: 'below', title: 'Trim it',
    text: 'Edit opens the raw quote.',
    action: 'click' },
  { anchor: 'art-edit', place: 'below', title: 'And closed',
    text: 'Done folds it back.',
    action: 'click' },
  { anchor: 'art-continue', place: 'above', title: 'Continue',
    text: 'Select text on the page to enable me. I stop here.' },
];

const XPOST = [
  { anchor: 'ext-flowhead', place: 'below', title: 'Hi there',
    text: 'Hi, I am buddy. X posts clip by capture, two flavors.' },
  { anchor: 'tw-post', place: 'below', title: 'Frame it first',
    text: 'First I zoom the page until the whole post fits.' },
  { anchor: 'tw-post', place: 'below', title: 'Photo or video',
    text: 'Video plays? I record just the player, small and silent. Photo only? One crisp screenshot, sized to fit.' },
  { anchor: 'tw-preview', place: 'below', title: 'The loop',
    text: 'A video becomes a small silent loop, with Retake.' },
  { anchor: 'tw-continue', place: 'above', title: 'Continue',
    text: 'Continue carries it on. I stop here.' },
];

const PODCAST = [
  { anchor: 'ext-flowhead', place: 'below', title: 'Hi there',
    text: 'Hi, I am buddy. Podcasts capture tab audio.' },
  { anchor: 'pod-capture', place: 'below', title: 'Capture',
    text: 'Capture asks YOU to share the tab. I never touch that picker.' },
  { anchor: 'pod-trim', place: 'below', title: 'Trim',
    text: 'Then listen back and trim here.' },
  { anchor: 'pod-continue', place: 'above', title: 'Continue',
    text: 'Then Continue. I stop here.' },
];

const AUTH = [
  { anchor: 'auth-screen', place: 'below', title: 'Hi there',
    text: 'Sign up with X or Google, no passwords. Then press T again.' },
];

const FALLBACK = [
  { anchor: 'ext-flowhead', place: 'below', title: 'No tour here',
    text: 'Open a video, article, X post or podcast, then press T.' },
];

function pick() {
  if (find('yt-play')) return YT;
  if (find('art-card')) return ARTICLE;
  if (find('tw-post')) return XPOST;
  if (find('pod-capture')) return PODCAST;
  if (find('auth-screen')) return AUTH;
  return FALLBACK;
}

export default function PanelTour() {
  const engine = useTourEngine({ pick, perform, snapshot, restore });
  const { active, presented, steps, idx, rect, tapKey, stop } = engine;
  if (!active || !presented || !steps[idx]) return null;
  const step = steps[idx];
  return (
    <TourOverlay
      step={step}
      text={step.text}
      rect={rect}
      tapKey={tapKey}
    />
  );
}
