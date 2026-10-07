import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { TourOverlay } from './TourBuddy';

/* ====================================================================
   Panel tour: engine + extension scripts. The engine drives the real UI
   through data-tour anchors only (see tour-handoff.txt section 4).
   RULE ZERO: never posts, saves, votes or submits anything. The NEVER
   list below is enforced in perform() - a step targeting one throws and
   its action is skipped.
   Clip-range restore is NOT possible through the DOM (no API exposes the
   window mapping), so exit restores video time, take text and play mode;
   the range stays where the tour left it, adjustable by hand.
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
    await sleep(30 + Math.random() * 30);
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

function useTourEngine({ pick, perform, snapshot, restore }) {
  const [active, setActive] = useState(false);
  const [presented, setPresented] = useState(false);
  const [steps, setSteps] = useState([]);
  const [idx, setIdx] = useState(0);
  const [rect, setRect] = useState(null);
  const [busy, setBusyState] = useState(false);
  const [, bump] = useReducer((n) => n + 1, 0);
  const R = useRef({
    token: 0, idx: -1, steps: [], active: false, busy: false,
    anchor: null, snap: null, store: {},
  }).current;
  const hooks = useRef({});
  hooks.current = { pick, perform, snapshot, restore };

  const setBusy = useCallback((v) => { R.busy = v; setBusyState(v); }, [R]);

  const stop = useCallback(async () => {
    if (!R.active) return;
    const { snap, store } = R;
    R.token += 1;
    R.active = false;
    R.anchor = null;
    setActive(false); setPresented(false); setBusyState(false); R.busy = false; setRect(null);
    try { await hooks.current.restore?.(snap, store); } catch (e) { /* ignore */ }
  }, [R]);

  const goTo = useCallback(async (start, dir) => {
    R.token += 1;
    const t = R.token;
    const ok = () => R.active && R.token === t;
    setBusy(true);
    for (let j = start; j >= 0 && j < R.steps.length; j += dir) {
      const step = R.steps[j];
      if (step.skipIf) {
        try { if (step.skipIf(R.store)) continue; } catch (e) { /* ignore */ }
      }
      let el = null;
      if (step.anchor) {
        el = await waitFor(
          () => { const e = find(step.anchor); return e && shown(e) ? e : null; },
          dir > 0 ? (step.wait ?? 2000) : 400,
          ok,
        );
        if (!ok()) return;
        if (!el) continue;
      }
      R.idx = j;
      R.anchor = step.anchor || null;
      setIdx(j); setPresented(true); bump();
      el?.scrollIntoView({ block: 'center', inline: 'nearest', behavior: reduced() ? 'auto' : 'smooth' });
      if (step.action && dir > 0) {
        setBusy(!step.interruptible);
        if (!(await hold(700, ok))) return;
        try { await hooks.current.perform(step, el, { alive: ok, store: R.store }); }
        catch (e) { console.warn('[tour]', e.message || e); }
        if (!ok()) return;
        bump();
      }
      setBusy(false);
      return;
    }
    if (dir > 0) stop(); else setBusy(false);
  }, [R, setBusy, stop]);

  const next = useCallback(() => {
    if (!R.active || R.busy) return;
    if (R.idx >= R.steps.length - 1) stop(); else goTo(R.idx + 1, 1);
  }, [R, goTo, stop]);

  const back = useCallback(() => {
    if (!R.active || R.busy || R.idx <= 0) return;
    goTo(R.idx - 1, -1);
  }, [R, goTo]);

  const start = useCallback(() => {
    if (R.active) return;
    const list = hooks.current.pick();
    R.steps = list; R.idx = -1; R.store = {}; R.anchor = null;
    try { R.snap = hooks.current.snapshot?.() ?? null; } catch (e) { R.snap = null; }
    R.active = true;
    setSteps(list); setIdx(0); setRect(null); setPresented(false); setActive(true);
    goTo(0, 1);
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
     the engine's own synthetic events are untrusted and pass through. */
  useEffect(() => {
    if (!active) return undefined;
    const types = ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'dblclick', 'contextmenu', 'keydown', 'keyup', 'keypress'];
    const onEvt = (e) => {
      if (!e.isTrusted) return;
      if (e.type === 'keydown') {
        const k = e.key;
        if (k === 'Escape' || k === 'ArrowRight' || k === 'ArrowLeft') {
          e.preventDefault(); e.stopPropagation();
          if (k === 'Escape') stop(); else if (k === 'ArrowRight') next(); else back();
          return;
        }
      }
      if (e.target?.closest?.('[data-tour-ui]')) return;
      e.stopPropagation(); e.stopImmediatePropagation();
      if (e.cancelable) e.preventDefault();
    };
    types.forEach((tt) => window.addEventListener(tt, onEvt, true));
    return () => types.forEach((tt) => window.removeEventListener(tt, onEvt, true));
  }, [active, stop, next, back]);

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

  return { active, presented, steps, idx, rect, busy, next, back, stop, store: R.store };
}

/* ---------------- actions ---------------- */

async function perform(step, el, { alive }) {
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
    el.click();
    return 'clicked';
  }
  if (a === 'tap-seek') {
    for (const f of step.fracs || [0.5]) {
      if (!alive()) return 'aborted';
      await tapAt(el, f);
      await sleep(900);
    }
    return 'tapped';
  }
  if (a === 'tap-bar') {
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
  { anchor: 'ext-flowhead', place: 'below', title: 'Meet your clipper',
    text: 'This header always tells you what you are clipping. I will drive, you read along. Press Next, Esc stops me anytime.' },
  { anchor: 'yt-play', place: 'below', title: 'Preview first',
    text: 'Play runs your current clip range, so you can hear what you have before you touch anything.' },
  { anchor: 'yt-scrub', place: 'above', title: 'The full timeline',
    text: 'Every second of the video lives here. I tap to seek, watch the playhead jump.',
    action: 'tap-seek', fracs: [0.4, 0.65] },
  { anchor: 'yt-clipbar', place: 'above', title: 'The clipping window',
    text: 'A locked 3 minute window rides with your moment. Drag the handles, or tap and the nearer one jumps over.',
    action: 'tap-bar', frac: 0.62 },
  { anchor: 'yt-clippill', place: 'below', title: 'Your clip, in a pill',
    text: 'Start, end, length. Clips run 90 seconds max, downscaled to 240p.' },
  { anchor: 'yt-chapters', place: 'below', title: 'Chapters',
    text: 'Chapters jump you to a section in one click. Opening the list now.',
    action: 'click' },
  { anchor: 'yt-chapter-row', place: 'below', title: 'Pick one',
    text: 'First chapter, please. Picking it sets a 30 second clip and seeks the video there.',
    action: 'click' },
  { anchor: 'yt-words', place: 'below', title: 'Word clipper',
    text: 'Find moments by what was actually said. Opening it now.',
    action: 'click' },
  { anchor: 'word-find', place: 'below', title: 'Search the transcript',
    text: 'I read a word straight off your transcript and search it. Guaranteed match.',
    action: 'type-dom-word' },
  { anchor: 'word-area', place: 'above', title: 'There it is',
    text: 'Lit up. Double-clicking grabs the whole phrase, not just the word.',
    action: 'dblclick-current' },
  { anchor: 'word-continue', place: 'above', title: 'Fold it in',
    text: 'Continue folds my words into the clip and seeks the video there.',
    action: 'click' },
  { anchor: 'yt-clippill', place: 'below', title: 'Locked in',
    text: 'The window followed us here like it should. That pill is our clip.' },
  { anchor: 'yt-record', place: 'above', title: 'Record mode',
    text: 'Record saves real video with sound through tab capture. I select the mode so you see it. I never start a capture.',
    action: 'click' },
  { anchor: 'yt-embed', place: 'above', title: 'Embed mode',
    text: 'Embed plays straight from YouTube and posts right away. Back to Embed to finish.',
    action: 'click' },
  { anchor: 'yt-continue', place: 'above', title: 'Onward',
    text: 'Continue carries the clip to your take. Clicking it now.',
    action: 'click' },
  { anchor: 'ann-take', place: 'above', title: 'Your take',
    text: 'This is where you put your take. Typing it now, demo text only, wiped when we exit.',
    action: 'type', text2: 'this is where you put your take' },
  { anchor: 'ann-speak', place: 'above', title: 'Speak it',
    text: 'Prefer talking? Speak it records a voice note instead of typing.' },
  { anchor: 'ann-type', place: 'above', title: 'Pick a shape',
    text: 'Reaction, fact check, explainer, hot take, question. The shape of your take.' },
  { anchor: 'ann-community', place: 'above', title: 'Pick a home',
    text: 'Post it to a community, or none at all.' },
  { anchor: 'ann-save', place: 'above', title: 'Save draft',
    text: 'Save draft keeps it private. I explain, I never click it.' },
  { anchor: 'ann-post', place: 'above', title: 'The red button',
    text: 'Post annotation publishes for real. That one is always your call, never mine.' },
  { anchor: 'ann-drafts', place: 'above', title: 'Drafts live here',
    text: 'Unfinished work waits under View drafts. Opening the list, read only.',
    action: 'click' },
  { anchor: 'drafts-first', place: 'below', title: 'Each draft keeps everything',
    text: 'Its clip, its take, its range. Continue would resume it, so I will not.' },
  { anchor: 'drafts-back', place: 'below', title: 'And back',
    text: 'Back returns us to the form.',
    action: 'click' },
  { anchor: 'ann-take', place: 'above', title: 'Your turn', cute: true,
    text: 'Tour over. Your take box is restored, the video is back where it was. Press T to replay me.' },
];

const ARTICLE = [
  { anchor: 'ext-flowhead', place: 'below', title: 'Articles clip by quote',
    text: 'No timeline here. Highlight text on the page and it lands in the card below.' },
  { anchor: 'art-card', place: 'below', title: 'The quote card',
    text: 'Up to 200 words, with a counter that warns you near the top.' },
  { anchor: 'art-edit', place: 'below', title: 'Trim it',
    text: 'Edit text opens the raw quote. Opening and closing it now.',
    action: 'click' },
  { anchor: 'art-edit', place: 'below', title: 'And closed',
    text: 'Done folds it back. Select text on the page to enable Continue.',
    action: 'click' },
  { anchor: 'art-continue', place: 'above', title: 'Continue',
    text: 'Continue to Annotate carries the quote to your take. I stop here.' },
];

const XPOST = [
  { anchor: 'ext-flowhead', place: 'below', title: 'X posts clip by capture',
    text: 'No timeline here either. The post is framed, then captured as video.' },
  { anchor: 'tw-post', place: 'below', title: 'The post',
    text: 'Your post, with its link, ready to capture.' },
  { anchor: 'tw-preview', place: 'below', title: 'Preview',
    text: 'Captured video loops here, silent, with a Retake if you flub it.' },
  { anchor: 'tw-continue', place: 'above', title: 'Continue',
    text: 'Continue carries it to annotation. I stop here.' },
];

const PODCAST = [
  { anchor: 'ext-flowhead', place: 'below', title: 'Podcasts capture audio',
    text: 'Spotify and podcasts record the tab audio while it plays. This one needs your ears.' },
  { anchor: 'pod-capture', place: 'below', title: 'Capture',
    text: 'Capture asks YOU to share the tab audio in a system picker. I cannot and will not touch that.' },
  { anchor: 'pod-trim', place: 'below', title: 'Trim',
    text: 'After capture you listen back and trim right here.' },
  { anchor: 'pod-continue', place: 'above', title: 'Continue',
    text: 'Then Continue to Annotate. I stop here.' },
];

const AUTH = [
  { anchor: 'auth-screen', place: 'below', title: 'Sign in first',
    text: 'Sign up with X or Google, no passwords. I am useless until you are in, so this is a short tour.' },
];

const FALLBACK = [
  { anchor: 'ext-flowhead', place: 'below', title: 'No tour here',
    text: 'Open a YouTube video, article, X post or podcast page and press T again.' },
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
  const { active, presented, steps, idx, rect, busy, next, back, stop } = engine;
  if (!active || !presented || !steps[idx]) return null;
  const step = steps[idx];
  return (
    <TourOverlay
      step={step}
      text={step.text}
      idx={idx}
      total={steps.length}
      rect={rect}
      busy={busy}
      canBack={idx > 0}
      isLast={idx >= steps.length - 1}
      onNext={next}
      onBack={back}
      onSkip={stop}
    />
  );
}
