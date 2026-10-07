import { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback, memo } from 'react';
import { fetchYouTubeTranscript } from '../lib/youtubeTranscript';
import { cleanTranscript } from '../lib/text';

function formatTime(s) {
  s = Math.max(0, Math.floor(s));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function formatShort(s) {
  s = Math.max(0, Math.floor(s));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function formatLength(s) {
  s = Math.floor(s);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  if (m && sec) return `${m} min ${sec} s`;
  if (m) return `${m} min`;
  return `${sec} s`;
}

function formatBytes(n) {
  if (n >= 1048576) return `${(n / 1048576).toFixed(1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}

const WIN_SPAN = 180;
const MAX_CLIP = 90;
const DEFAULT_CLIP = 30;
// Timeline ruler: minimum pixel gap between minor ticks / labels, and how far a
// label must stay from the bar edges and from the playhead so it never clips
// or gets struck through.
const MINOR_TICK_PX = 14;
const LABEL_PX = 62;
const LABEL_EDGE_PX = 24;
const LABEL_CLEAR_PX = 26;

function ariaTimeText(t) {
  const total = Math.max(0, Math.floor(Number(t) || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const parts = [];
  if (h > 0) parts.push(`${h} hour${h === 1 ? '' : 's'}`);
  if (m > 0 || h > 0) parts.push(`${m} minute${m === 1 ? '' : 's'}`);
  parts.push(`${s} second${s === 1 ? '' : 's'}`);
  return parts.join(' ');
}

function reducedMotion() {
  try {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  } catch (e) {
    return false;
  }
}

const NICE_STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200];

function niceSteps(span, barW) {
  const pxPerSec = Math.max(0.0001, barW / Math.max(1, span));
  let minor = NICE_STEPS[NICE_STEPS.length - 1];
  for (const n of NICE_STEPS) {
    if (n * pxPerSec >= MINOR_TICK_PX) { minor = n; break; }
  }
  let label = 0;
  for (const n of NICE_STEPS) {
    if (n >= minor && n % minor === 0 && n * pxPerSec >= LABEL_PX) { label = n; break; }
  }
  if (!label) {
    for (const n of NICE_STEPS) if (n >= minor && n % minor === 0) label = n;
  }
  return { minor, label: label || minor };
}

function cubicEaseOut(t) {
  const k = Math.min(1, Math.max(0, t));
  const f = (a) => 3 * 0.2 * a * (1 - a) * (1 - a) + 3 * 0.2 * a * a * (1 - a) + a * a * a;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 8; i += 1) {
    const mid = (lo + hi) / 2;
    if (f(mid) < k) lo = mid;
    else hi = mid;
  }
  const y = (a) => 3 * 0.8 * a * (1 - a) * (1 - a) + 3 * 1 * a * a * (1 - a) + a * a * a;
  return y((lo + hi) / 2);
}

// Bars handle their own pointer drags: stop the browser from scrolling or selecting text.
const BAR_TOUCH = { touchAction: 'none', userSelect: 'none' };

const IDLE_REC = { state: 'idle', t: 0, error: null, blob: null, mime: null, url: null };

const Word = memo(function Word({ w, index, selected, isMatch, isCurrent, onWordDoubleClick }) {
  const cls = 'word'
    + (selected ? ' is-selected' : '')
    + (isMatch ? ' is-match' : '')
    + (isCurrent ? ' is-current' : '');
  return (
    <span data-word-index={index} className={cls} onDoubleClick={() => onWordDoubleClick(index)}>{w.text} </span>
  );
});

function parseTime(str) {
  const v = String(str == null ? '' : str).trim();
  if (!/^\d+(:\d{1,2}){0,2}$/.test(v)) return NaN;
  const parts = v.split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0];
}

// Promise-based Chrome messaging. The old code passed a callback AND chained
// .catch() on the result; in MV3 a call with a callback returns undefined, so
// every poll threw a TypeError and "receiving end does not exist" went unchecked.
async function getActiveTab() {
  if (typeof chrome === 'undefined' || !chrome.tabs) return null;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab && tab.id != null ? tab : null;
  } catch (e) {
    return null;
  }
}

async function sendToActiveTab(message) {
  const tab = await getActiveTab();
  if (!tab) return null;
  try {
    const res = await chrome.tabs.sendMessage(tab.id, message);
    return res === undefined ? null : res;
  } catch (e) {
    return null;
  }
}

// Runs in the page MAIN world via chrome.scripting.executeScript: reads the
// chapter data YouTube already has on the page (ytInitialData and friends).
// Self-contained: must not reference anything outside this function.
function readChaptersMainWorld(args) {
  try {
    const wantId = String((args && args.videoId) || '');
    const maxT = Number((args && args.duration) || 0);
    const seen = new Set();
    const out = [];
    const visited = new Set();
    const cleanTitle = (v) => {
      if (!v) return '';
      if (typeof v === 'string') return v.trim().slice(0, 140);
      if (v.simpleText) return String(v.simpleText).trim().slice(0, 140);
      if (Array.isArray(v.runs)) return v.runs.map((r) => r.text || '').join('').trim().slice(0, 140);
      return '';
    };
    const parseT = (v) => {
      if (typeof v === 'number' && isFinite(v) && v >= 0) return Math.floor(v);
      const m = String(v || '').trim().match(/^(?:(\d+):)?([0-5]?\d):([0-5]\d)$/);
      if (!m) return null;
      return (Number(m[1] || 0) * 3600) + (Number(m[2]) * 60) + Number(m[3]);
    };
    const push = (t, title) => {
      t = Math.round(Number(t));
      title = String(title || '').trim().slice(0, 140);
      if (!Number.isFinite(t) || t < 0 || !title || seen.has(t)) return;
      seen.add(t);
      out.push({ t, title });
    };
    const scan = (node, depth) => {
      if (!node || depth > 12 || visited.has(node)) return;
      if (typeof node !== 'object') return;
      visited.add(node);
      if (Array.isArray(node)) {
        if (node.length > 400) return;
        for (const item of node) {
          if (item && typeof item === 'object') {
            const cr = item.chapterRenderer;
            if (cr) {
              const title = cleanTitle(cr.title);
              const t = cr.timeRangeStartMillis != null ? Number(cr.timeRangeStartMillis) / 1000 : null;
              if (title && t != null) push(t, title);
            }
            const mm = item.macroMarkersListItemRenderer;
            if (mm) {
              const title = cleanTitle(mm.title);
              let t = mm.startTimeSeconds != null ? Number(mm.startTimeSeconds) : null;
              if (t == null) t = parseT(cleanTitle(mm.timeDescription));
              if (title && t != null) push(t, title);
            }
          }
          scan(item, depth + 1);
        }
        return;
      }
      let keys = [];
      try { keys = Object.keys(node); } catch (e) { return; }
      if (keys.length > 400) return;
      for (const k of keys) {
        try { scan(node[k], depth + 1); } catch (e) {}
      }
    };
    let pageId = '';
    try {
      const u = new URL(window.location.href);
      pageId = u.searchParams.get('v') || ((u.pathname.match(/^\/shorts\/([^/?]+)/) || [])[1] || '');
    } catch (e) {}
    const roots = [];
    try { if (window.ytInitialData) roots.push(window.ytInitialData); } catch (e) {}
    try { if (window.ytInitialPlayerResponse) roots.push(window.ytInitialPlayerResponse); } catch (e) {}
    try {
      const raw = window.ytplayer && window.ytplayer.config && window.ytplayer.config.args
        && window.ytplayer.config.args.player_response;
      if (raw) roots.push(JSON.parse(raw));
    } catch (e) {}
    try {
      const live = document.querySelector('#movie_player') && document.querySelector('#movie_player').getPlayerResponse
        ? document.querySelector('#movie_player').getPlayerResponse()
        : null;
      if (live) roots.push(live);
    } catch (e) {}
    for (const r of roots) scan(r, 0);
    // shortDescription carries the author's own chapter list ("0:00 Intro").
    // Harvest it directly: the isolated content script cannot see page JS.
    // Description lines only count when they start at 0:00, otherwise they
    // are sponsor timestamps, not chapters.
    const descChapters = [];
    const descSeen = new Set();
    const parseDescLines = (text) => {
      String(text || '').split('\n').forEach((rawLine) => {
        const line = String(rawLine || '').trim();
        const m = line.match(/^((?:\d+:)?[0-5]?\d:[0-5]\d)\s+(.+?)\s*$/);
        if (!m) return;
        const t = parseT(m[1]);
        const title = String(m[2] || '').trim().replace(/^[-–—•·|>]+/, '').trim();
        if (t == null || !title || descSeen.has(t)) return;
        descSeen.add(t);
        descChapters.push({ t, title });
      });
    };
    roots.forEach((r) => {
      try {
        const sd = r && r.videoDetails && r.videoDetails.shortDescription;
        if (sd) parseDescLines(sd);
      } catch (e) {}
    });
    descChapters.sort((a, b) => a.t - b.t);
    if (descChapters.length >= 3 && descChapters[0].t === 0) {
      descChapters.forEach((c) => push(c.t, c.title));
    }
    out.sort((a, b) => a.t - b.t);
    const inRange = out.filter((c, i) => (i === 0 || c.t > out[i - 1].t) && (!(maxT > 0) || c.t < maxT));
    const chapters = inRange.slice(0, 200);
    const ok = chapters.length >= 3;
    return { videoId: pageId, wantId, chapters: ok ? chapters : [] };
  } catch (e) {
    return { videoId: '', wantId: '', chapters: [] };
  }
}

export default function YouTubeClipper({
  pageInfo,
  onReady,
  published,
  embedRequest,
  resumeRange,
  // Optional: called with the new video id when the user navigates YouTube while
  // the panel is open, so the parent can refresh pageInfo (id, url, title).
  onVideoChange,
  // The parent already shows the source row; set true to show the title here too.
  showTitle = false,
}) {
  const { data } = pageInfo;
  const [duration, setDuration] = useState(data.duration || 300);
  // Shared mapping: 0..duration on the seek bar, winStart..winStart+span
  // on the clip bar. Every element positions itself through overPct /
  // detailPct only, so nothing can drift out of alignment.
  const tlDuration = () => Math.max(1, duration || 0);
  const winSpan = () => Math.min(WIN_SPAN, tlDuration());
  const hasWindow = () => tlDuration() > WIN_SPAN;
  const [durKnown, setDurKnown] = useState(!!(data.duration && data.duration > 0));
  const [isLive, setIsLive] = useState(false);
  const [startSec, setStartSec] = useState(resumeRange?.start_sec ?? 0);
  const [endSec, setEndSec] = useState(resumeRange?.end_sec ?? Math.min(DEFAULT_CLIP, data.duration || 300));
  // Window model: a 180s workspace, 30s behind X and 150s after it.
  // The window LOCKS when you seek (seek bar, arrows, chapters, video
  // change). Adjusting X/Y never moves it and never seeks the video;
  // if X leaves the locked window it is pulled back minimally so the
  // handles stay visible.
  const [winStart, setWinStart] = useState(0);
  const lockWindowTo = (x, dur) => {
    const D = dur || tlDuration();
    const W = Math.min(WIN_SPAN, D);
    const maxStart = Math.max(0, D - W);
    const nws = Math.max(0, Math.min(Math.round(x - 30), maxStart));
    winStartRef.current = nws;
    setWinStart(nws);
  };
  const ensureXVisible = (x) => {
    const W = winSpan();
    const ws = winStartRef.current;
    const D = tlDuration();
    if (x < ws || x > ws + W) {
      const maxStart = Math.max(0, D - W);
      const nws = x < ws
        ? Math.max(0, Math.min(Math.round(x - 8), maxStart))
        : Math.max(0, Math.min(Math.round(x - W + 8), maxStart));
      winStartRef.current = nws;
      setWinStart(nws);
    }
  };
  const [uiTime, setUiTime] = useState(0);
  const [ytAd, setYtAd] = useState(false);
  const [dragView, setDragView] = useState(null);
  const [dragVal, setDragVal] = useState(0);
  const [capFlash, setCapFlash] = useState(0);
  const [chapters, setChapters] = useState([]);
  const [chaptersOpen, setChaptersOpen] = useState(false);
  const [chaptersLoading, setChaptersLoading] = useState(false);
  const chapterCacheRef = useRef(new Map());
  const [playMode, setPlayMode] = useState('embed');
  useEffect(() => {
    try {
      chrome.storage.local.get('annotated-playmode', (res) => {
        const v = res && res['annotated-playmode'];
        if (v === 'embed' || v === 'record') setPlayMode(v);
      });
    } catch (e) {}
  }, []);
  useEffect(() => {
    try { chrome.storage.local.set({ 'annotated-playmode': playMode }); } catch (e) {}
  }, [playMode]);
  const [rec, setRec] = useState(IDLE_REC);
  const overRef = useRef(null);
  const detailRef = useRef(null);
  const dragRef = useRef(null);
  const dragCleanupRef = useRef(null);
  const ytTimeRef = useRef(0);
  const ytPausedRef = useRef(true);
  const ytAdRef = useRef(false);
  const wasPlayingRef = useRef(false);
  const lastSeekRef = useRef(0);
  const pendingSeekRef = useRef(null);
  const seekTimerRef = useRef(0);
  const winStartRef = useRef(0);
  useEffect(() => { winStartRef.current = winStart; });
  const portRef = useRef(null);
  const dirtyRef = useRef(false);
  const uiTimeRef = useRef(0);
  const rateRef = useRef(1);
  const lastTRef = useRef(0);
  const lastStampRef = useRef(0);
  const easeRef = useRef(null);
  const prevTRef = useRef(null);
  const anchorSuppressRef = useRef(false);
  const seqRef = useRef(0);
  const lastSentSeqRef = useRef(0);
  const releaseIgnoreRef = useRef(null);
  const smoothRafRef = useRef(0);
  const playOverRef = useRef(null);
  const selectedHandleRef = useRef(null);
  const [selectedHandle, setSelectedHandle] = useState(null);
  const [sheetSearch, setSheetSearch] = useState('');
  const [sheetClosing, setSheetClosing] = useState(false);
  const wordSnapRef = useRef(null);
  const viewRef = useRef({ s: 0, e: 30, t: 0 });
  // Per-frame / per-drag scratch: readout throttle, cap-hit latch, snap latch.
  const frameRef = useRef({ lastReadout: 0, capped: false, snapKey: '' });
  const [wordClipperOpen, setWordClipperOpen] = useState(false);
  const [wordConfirm, setWordConfirm] = useState(null);
  const [clipInfoOpen, setClipInfoOpen] = useState(false);
  const clipInfoWrapRef = useRef(null);
  const [segments, setSegments] = useState(null);
  const [wordLoading, setWordLoading] = useState(false);
  const [wordError, setWordError] = useState('');
  const [wordStart, setWordStart] = useState(0);
  const [wordEnd, setWordEnd] = useState(0);
  const [draggingWord, setDraggingWord] = useState(null);
  const wordAreaRef = useRef(null);
  const durationRef = useRef(0);
  durationRef.current = duration;
  const durKnownRef = useRef(durKnown);
  durKnownRef.current = durKnown;
  const timesTouchedRef = useRef(false);
  const wordClipUsedRef = useRef(false);
  const [editingChip, setEditingChip] = useState(null);
  const [chipDraft, setChipDraft] = useState('');
  const [detailBarW, setDetailBarW] = useState(0);
  const [snapFlash, setSnapFlash] = useState(null);
  const snapTimerRef = useRef(null);
  const nudgeHoldRef = useRef(null);
  const sheetTimerRef = useRef(null);
  const sheetOpenerRef = useRef(null);
  const closeSheetRef = useRef(() => {});
  // Always-current values for long-lived callbacks (the player poll) so they
  // never close over stale state.
  const latestRef = useRef({ endSec: 0, videoId: '' });
  latestRef.current = { endSec, videoId: data.videoId };
  // The video the UI currently represents. Moves on YouTube navigation even
  // before the parent has swapped pageInfo, so a change is handled exactly once.
  const activeVideoRef = useRef(data.videoId);
  const pollBusyRef = useRef(false);
  const applyPlayerStateRef = useRef(() => {});
  const markDirty = () => { dirtyRef.current = true; };

  const flashCap = () => setCapFlash((n) => n + 1);

  const pulseSnap = (which) => {
    setSnapFlash(which);
    if (snapTimerRef.current) clearTimeout(snapTimerRef.current);
    snapTimerRef.current = setTimeout(() => setSnapFlash(null), 240);
  };

  const syncStartToVideoTime = async (dur) => {
    if (timesTouchedRef.current) return;
    const res = await sendToActiveTab({ type: 'VIDEO_TIME' });
    if (!res || !res.ok || typeof res.time !== 'number' || timesTouchedRef.current) return;
    const safeDur = dur > 0 ? dur : 300;
    const t = Math.floor(res.time);
    if (!(t >= 0)) return;
    const s = Math.max(0, Math.min(t, Math.max(0, safeDur - 1)));
    const end = Math.min(s + DEFAULT_CLIP, safeDur);
    if (!(end > s)) return;
    setStartSec(s);
    setEndSec(end);
    viewRef.current = { ...viewRef.current, s, e: end };
    lockWindowTo(s);
  };

  // Nothing may outlive the panel: drag listeners, timers, rAF, nudge repeat.
  useEffect(() => () => {
    if (dragCleanupRef.current) dragCleanupRef.current();
    [seekTimerRef, sheetTimerRef, snapTimerRef].forEach((r) => { if (r.current) clearTimeout(r.current); });
    stopNudgeHold();
  }, []);

  useEffect(() => {
    if (!chaptersOpen) return undefined;
    const onKey = (ev) => {
      if (ev.key === 'Escape') {
        ev.preventDefault();
        closeSheetRef.current();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [chaptersOpen]);

  useEffect(() => {
    if (rec.url) return () => URL.revokeObjectURL(rec.url);
    return undefined;
  }, [rec.url]);

  useEffect(() => {
    if (published) setRec(IDLE_REC);
  }, [published]);

  useEffect(() => {
    if (embedRequest > 0) {
      setPlayMode('embed');
      setRec(IDLE_REC);
    }
  }, [embedRequest]);

  useEffect(() => {
    if (data.duration && data.duration > 0) {
      setDuration(data.duration);
      setDurKnown(true);
      syncStartToVideoTime(data.duration);
    }
    // Otherwise the player poll supplies the duration as soon as the video has
    // loaded it (the old oEmbed round-trip never contributed anything).
  }, [data.videoId, data.duration]);

  useEffect(() => {
    if (!resumeRange) return;
    const s = Math.max(0, resumeRange.start_sec ?? 0);
    const e = resumeRange.end_sec ?? Math.min(30, data.duration || 300);
    if (!(e > s)) return;
    setStartSec(s);
    setEndSec(e);
    viewRef.current = { ...viewRef.current, s, e };
    lockWindowTo(s);
  }, [resumeRange]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible') syncStartToVideoTime(durationRef.current || 0);
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.onConnect) return undefined;
    const handleConnect = (port) => {
      if (port.name !== 'annotated-recorder') return;
      portRef.current = port;
      const parts = [];
      let finished = false;
      port.onMessage.addListener((msg) => {
        if (msg.type === 'progress') {
          setRec((prev) => (prev.state === 'recording' ? { ...prev, t: msg.t } : prev));
        } else if (msg.type === 'chunk') {
          try {
            const bin = atob(msg.data);
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
            parts[msg.i] = bytes;
          } catch (e) {}
        } else if (msg.type === 'done') {
          finished = true;
          const expected = typeof msg.chunks === 'number' ? msg.chunks : null;
          const ordered = [];
          let complete = true;
          if (expected !== null) {
            for (let k = 0; k < expected; k += 1) {
              if (!parts[k]) { complete = false; break; }
              ordered.push(parts[k]);
            }
          } else {
            parts.forEach((p) => { if (p) ordered.push(p); });
          }
          const totalBytes = ordered.reduce((n, p) => n + p.length, 0);
          parts.length = 0;
          if (!complete || totalBytes === 0) {
            setRec({ state: 'error', t: 0, error: 'Recording captured no video. Try again.', blob: null, mime: null, url: null });
            return;
          }
          const mime = msg.mime || 'video/webm';
          const blob = new Blob(ordered, { type: mime });
          setRec({ state: 'done', t: msg.seconds || 0, error: null, blob, mime, url: URL.createObjectURL(blob) });
        } else if (msg.type === 'error') {
          finished = true;
          parts.length = 0;
          setRec((prev) => (prev.state === 'recording'
            ? { state: 'error', t: 0, error: msg.message || 'Recording stopped.', blob: null, mime: null, url: null }
            : prev));
        }
      });
      port.onDisconnect.addListener(() => {
        if (portRef.current === port) portRef.current = null;
        if (!finished) {
          parts.length = 0;
          setRec((prev) => (prev.state === 'recording'
            ? { state: 'error', t: 0, error: 'Recording stopped.', blob: null, mime: null, url: null }
            : prev));
        }
      });
    };
    chrome.runtime.onConnect.addListener(handleConnect);
    return () => {
      chrome.runtime.onConnect.removeListener(handleConnect);
      try { portRef.current?.disconnect(); } catch (e) {}
      portRef.current = null;
    };
  }, []);

  const startRecording = async () => {
    setRec({ ...IDLE_REC, state: 'recording' });
    const res = await sendToActiveTab({ type: 'record-clip', start: startSec, end: endSec });
    if (!res?.ok) {
      setRec({
        ...IDLE_REC,
        state: 'error',
        error: (res && res.message) || 'Open a YouTube video to record a clip.',
      });
    }
  };

  const loadChapters = async (forId) => {
    const videoId = forId || activeVideoRef.current;
    if (!videoId) return;
    const cached = chapterCacheRef.current.get(videoId);
    if (cached) {
      setChapters(cached);
      return;
    }
    // Ignore results that arrive after the user has moved to another video.
    const still = () => activeVideoRef.current === videoId;
    setChaptersLoading(true);
    try {
      const tab = await getActiveTab();
      if (!tab) return;
      let res = await sendToActiveTab({ type: 'YT_CHAPTERS' });
      if (!res) {
        // Content script not there yet: inject it once, then ask again.
        // (Injecting on every call stacked duplicate message listeners.)
        try {
          await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
        } catch (e) {}
        res = await sendToActiveTab({ type: 'YT_CHAPTERS' });
      }
      if (res && res.ok && Array.isArray(res.chapters) && res.chapters.length) {
        if (res.videoId && res.videoId !== videoId) {
          // The tab answered from the previous video's DOM (SPA navigation
          // race). Retry briefly for the new page; never cache another
          // video's chapters under this id.
          for (let attempt = 0; attempt < 3; attempt += 1) {
            await new Promise((resolve) => setTimeout(resolve, 700));
            if (!still()) return;
            let retry = null;
            try { retry = await sendToActiveTab({ type: 'YT_CHAPTERS' }); } catch (e) { retry = null; }
            if (retry && retry.ok && Array.isArray(retry.chapters) && retry.chapters.length
              && (!retry.videoId || retry.videoId === videoId)) {
              chapterCacheRef.current.set(videoId, retry.chapters);
              if (still()) setChapters(retry.chapters);
              return;
            }
          }
          return;
        }
        chapterCacheRef.current.set(videoId, res.chapters);
        if (still()) setChapters(res.chapters);
        return;
      }
      for (let attempt = 0; attempt < 3; attempt += 1) {
        if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 500));
        if (!still()) return;
        let out = null;
        try {
          const [injection] = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            world: 'MAIN',
            func: readChaptersMainWorld,
            args: [{ videoId, duration: tlDuration() }],
          });
          out = injection?.result || null;
        } catch (e) {
          out = null;
        }
        if (!out) continue;
        if (out.videoId && out.videoId !== videoId) continue;
        if (Array.isArray(out.chapters) && out.chapters.length) {
          chapterCacheRef.current.set(videoId, out.chapters);
          if (still()) setChapters(out.chapters);
          return;
        }
      }
    } catch (e) {
    } finally {
      if (still()) setChaptersLoading(false);
    }
  };

  useEffect(() => {
    activeVideoRef.current = data.videoId;
    setChapters([]);
    setChaptersOpen(false);
    setWordConfirm(null);
    setClipInfoOpen(false);
    loadChapters(data.videoId);
  }, [data.videoId]);

  const measureBars = () => {
    if (detailRef.current) setDetailBarW(detailRef.current.clientWidth || 0);
  };

  useEffect(() => {
    measureBars();
    let ro = null;
    try {
      if (typeof ResizeObserver !== 'undefined') {
        ro = new ResizeObserver(() => measureBars());
        if (overRef.current) ro.observe(overRef.current);
        if (detailRef.current) ro.observe(detailRef.current);
      }
    } catch (e) {
      ro = null;
    }
    window.addEventListener('resize', measureBars);
    return () => {
      window.removeEventListener('resize', measureBars);
      try { if (ro) ro.disconnect(); } catch (e) {}
    };
  }, [duration]);

  // Picking a chapter moves the 30s clip to that section (the window
  // follows automatically because it derives from X).
  const pickChapter = (ch) => {
    if (locked || ytAdRef.current || isLive) return;
    const t = Math.round(ch.t);
    anchorSuppressRef.current = true;
    anchorClip(t);
    timesTouchedRef.current = true;
    markDirty();
    ytSeek(t, { hold: true });
    closeSheet();
  };

  const openChapters = () => {
    sheetOpenerRef.current = document.activeElement;
    setSheetSearch('');
    setSheetClosing(false);
    setChaptersOpen(true);
    if (!chapters.length && !chaptersLoading) loadChapters();
  };

  const closeSheet = () => {
    if (sheetClosing) return;
    setSheetClosing(true);
    if (sheetTimerRef.current) clearTimeout(sheetTimerRef.current);
    sheetTimerRef.current = setTimeout(() => {
      setChaptersOpen(false);
      setSheetClosing(false);
      setSheetSearch('');
      const opener = sheetOpenerRef.current;
      sheetOpenerRef.current = null;
      try { if (opener && opener.focus) opener.focus(); } catch (err) {}
    }, 180);
  };
  closeSheetRef.current = closeSheet;

  const currentChapter = () => {
    let cur = null;
    const pos = playValue() + 0.5;
    chapters.forEach((c) => { if (c.t <= pos && (!cur || c.t > cur.t)) cur = c; });
    return cur;
  };

  const [previewPlaying, setPreviewPlaying] = useState(false);

  const anchorClip = (t) => {
    const D = tlDuration();
    const s = Math.max(0, Math.min(Math.round(t), D));
    const e = Math.min(s + 30, D);
    if (!(e > s)) return;
    setStartSec(s);
    setEndSec(e);
    viewRef.current = { ...viewRef.current, s, e };
    lockWindowTo(s);
  };

  const handleVideoChange = (res) => {
    const t = typeof res.time === 'number' ? Math.max(0, res.time) : 0;
    const D = typeof res.duration === 'number' && res.duration > 0 && isFinite(res.duration)
      ? Math.floor(res.duration)
      : tlDuration();
    const previousId = activeVideoRef.current;
    activeVideoRef.current = res.videoId;
    setDuration(D);
    setDurKnown(true);
    const s = Math.max(0, Math.min(Math.round(t), D));
    const end = Math.min(s + DEFAULT_CLIP, D);
    setStartSec(s);
    setEndSec(end > s ? end : s);
    dirtyRef.current = false;
    timesTouchedRef.current = false;
    wordClipUsedRef.current = false;
    selectedHandleRef.current = null;
    setSelectedHandle(null);
    setChapters([]);
    setChaptersOpen(false);
    setSheetSearch('');
    setWordConfirm(null);
    setClipInfoOpen(false);
    chapterCacheRef.current.delete(previousId);
    prevTRef.current = t;
    ytTimeRef.current = t;
    lastTRef.current = t;
    lastStampRef.current = performance.now();
    uiTimeRef.current = t;
    viewRef.current = { s, e: end > s ? end : s, t };
    lockWindowTo(s, D);
    loadChapters(res.videoId);
    if (typeof onVideoChange === 'function') {
      try { onVideoChange(res.videoId); } catch (err) {}
    }
  };

  // Applies one YT_STATE sample. Re-assigned every render (see the ref below) so
  // it always sees fresh state while the poll interval stays a single timer.
  const applyPlayerState = (res) => {
    if (typeof res.videoId === 'string' && res.videoId && res.videoId !== activeVideoRef.current) {
      handleVideoChange(res);
      return;
    }
    const now = performance.now();
    if (typeof res.rate === 'number' && res.rate > 0) rateRef.current = res.rate;
    if (typeof res.paused === 'boolean') {
      ytPausedRef.current = res.paused;
      setPreviewPlaying(!res.paused);
      if (res.paused && typeof res.time === 'number') {
        lastTRef.current = res.time;
        lastStampRef.current = now;
        uiTimeRef.current = res.time;
      }
    }
    if (res.live) {
      setIsLive(true);
    } else {
      setIsLive(false);
      if (typeof res.duration === 'number' && res.duration > 0 && isFinite(res.duration)) {
        const d = Math.floor(res.duration);
        setDuration((prev) => (prev !== d ? d : prev));
        if (!durKnownRef.current) {
          durKnownRef.current = true;
          setDurKnown(true);
          syncStartToVideoTime(d);
        }
      }
    }
    const ad = !!res.ad;
    ytAdRef.current = ad;
    setYtAd((prev) => (prev === ad ? prev : ad));
    if (typeof res.time !== 'number') return;
    const staleSeq = typeof res.seq === 'number' && res.seq < lastSentSeqRef.current;
    if (staleSeq) return;
    if (releaseIgnoreRef.current) {
      const ig = releaseIgnoreRef.current;
      if (now < ig.until && Math.abs(res.time - ig.target) > 1.0) return;
      releaseIgnoreRef.current = null;
    }
    if (dragRef.current) {
      prevTRef.current = null;
      return;
    }
    ytTimeRef.current = res.time;
    if (anchorSuppressRef.current) {
      anchorSuppressRef.current = false;
      prevTRef.current = res.time;
    } else if (!dirtyRef.current && prevTRef.current !== null && Math.abs(res.time - prevTRef.current) > 2) {
      anchorClip(res.time);
      prevTRef.current = res.time;
    } else {
      prevTRef.current = res.time;
    }
    const diff = res.time - uiTimeRef.current;
    if (Math.abs(diff) > 0.3) {
      easeRef.current = { from: uiTimeRef.current, to: res.time, t0: now };
    } else {
      easeRef.current = null;
      lastTRef.current = res.time;
      lastStampRef.current = now;
    }
  };
  applyPlayerStateRef.current = applyPlayerState;

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      // One request at a time: a slow tab used to pile up overlapping messages.
      if (pollBusyRef.current) return;
      pollBusyRef.current = true;
      try {
        const res = await sendToActiveTab({ type: 'YT_STATE', end: latestRef.current.endSec });
        if (alive && res && res.ok) applyPlayerStateRef.current(res);
      } finally {
        pollBusyRef.current = false;
      }
    };
    const id = setInterval(tick, 250);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  // Continuous rAF loop: owns playhead style.left directly and feeds readouts at 10Hz.
  useEffect(() => {
    let running = true;
    const loop = (now) => {
      if (!running) return;
      smoothRafRef.current = requestAnimationFrame(loop);
      const D = Math.max(1, durationRef.current || 0);
      let t;
      const drag = dragRef.current;
      if (drag && drag.kind === 'playhead' && typeof drag.value === 'number') {
        t = Math.max(0, Math.min(drag.value, D));
      } else {
        const ease = easeRef.current;
        if (ease) {
          const k = Math.min(1, (now - ease.t0) / 220);
          t = ease.from + (ease.to - ease.from) * cubicEaseOut(k);
          if (k >= 1) {
            easeRef.current = null;
            lastTRef.current = ease.to;
            lastStampRef.current = now;
          }
        } else if (ytPausedRef.current) {
          t = lastTRef.current;
        } else {
          const dt = Math.max(0, now - lastStampRef.current) / 1000;
          t = lastTRef.current + dt * rateRef.current;
        }
        t = Math.max(0, Math.min(t, D));
      }
      uiTimeRef.current = t;
      const fs = frameRef.current;
      if (now - fs.lastReadout >= 100) {
        fs.lastReadout = now;
        // The word clipper renders thousands of words; don't re-render it at 10 Hz.
        if (!wordOpenRef.current) setUiTime(Math.round(t * 10) / 10);
      }
      const overPctNow = Math.max(0, Math.min(100, (t / D) * 100));
      if (playOverRef.current) playOverRef.current.style.left = `${overPctNow}%`;
    };
    smoothRafRef.current = requestAnimationFrame(loop);
    return () => {
      running = false;
      if (smoothRafRef.current) cancelAnimationFrame(smoothRafRef.current);
      stopNudgeHold();
    };
  }, []);

  const sendToTab = (message, onResponse) => {
    sendToActiveTab(message).then((res) => { if (onResponse) onResponse(res); });
  };

  const togglePlay = () => {
    anchorSuppressRef.current = true;
    ytSend({ type: 'YT_PREVIEW_CANCEL' });
    sendToTab({ type: 'PLAY_FROM', start: startSec, end: endSec, action: 'toggle' }, (res) => {
      if (res && typeof res.playing === 'boolean') setPreviewPlaying(res.playing);
    });
  };

  const replayClip = () => {
    anchorSuppressRef.current = true;
    ytSend({ type: 'YT_PREVIEW_CANCEL' });
    sendToTab({ type: 'PLAY_FROM', start: startSec, end: endSec, action: 'replay' });
  };

  const cancelRecording = async () => {
    await sendToActiveTab({ type: 'cancel-recording' });
  };

  const useEmbedInstead = () => {
    if (rec.url) URL.revokeObjectURL(rec.url);
    setPlayMode('embed');
    setRec(IDLE_REC);
  };

  const reRecord = () => {
    setRec(IDLE_REC);
    setPlayMode('record');
  };

  const clipLen = endSec - startSec;

  // X and Y are independent, 0 <= X < Y <= duration. Editing them never
  // seeks the video and never moves the locked window (it is only pulled
  // minimally if X leaves it).
  const updateStart = (sec) => {
    timesTouchedRef.current = true;
    wordClipUsedRef.current = false;
    const clamped = Math.max(0, Math.min(Math.round(sec), duration - 1));
    const e = Math.max(endSec, clamped + 1);
    setStartSec(clamped);
    setEndSec(Math.min(e, duration));
    markDirty();
    viewRef.current = { ...viewRef.current, s: clamped, e: Math.min(e, duration) };
    ensureXVisible(clamped);
    return clamped;
  };

  const updateEnd = (sec) => {
    timesTouchedRef.current = true;
    wordClipUsedRef.current = false;
    const clamped = Math.min(duration, Math.max(Math.round(sec), 1));
    const s = Math.min(startSec, clamped - 1);
    setStartSec(Math.max(s, 0));
    setEndSec(clamped);
    markDirty();
    viewRef.current = { ...viewRef.current, s: Math.max(s, 0), e: clamped };
    ensureXVisible(Math.max(s, 0));
    return clamped;
  };

  const handleContinue = () => {
    if (endSec <= startSec || clipLen <= 0 || clipLen > MAX_CLIP || isLive) return;
    let wordTranscript = null;
    if (wordClipUsedRef.current && words.length) {
      const picked = words.slice(Math.max(0, wordStart), Math.min(words.length - 1, wordEnd) + 1);
      if (picked.length) wordTranscript = picked.map((w) => w.text).join(' ').trim() || null;
    }
    onReady({
      source_url: pageInfo.url,
      source_type: 'youtube',
      title: data.title,
      youtube_id: data.videoId,
      start_sec: Math.floor(startSec),
      end_sec: Math.ceil(endSec),
      duration: duration || null,
      thumbnail: `https://img.youtube.com/vi/${data.videoId}/hqdefault.jpg`,
      ...(wordTranscript ? { word_transcript: wordTranscript } : {}),
      ...(playMode === 'record' && rec.blob
        ? { recorded_clip: { blob: rec.blob, mime: rec.mime, seconds: rec.t } }
        : {}),
    });
  };

  const words = useMemo(() => {
    if (!segments?.length) return [];
    const out = [];
    const pushSpan = (rawText, spanStart, spanEnd, caps) => {
      const cleaned = cleanTranscript(rawText, caps);
      const parts = cleaned.trim().split(/\s+/).filter(Boolean);
      if (!parts.length) return;
      const span = Math.max(0.001, spanEnd - spanStart);
      // Word times stay raw: each cue's own timing is the truth. Never clamp
      // against neighbors, overlapping cues would ratchet everything forward.
      parts.forEach((text, i) => {
        const start = spanStart + (span * i) / parts.length;
        const end = spanStart + (span * (i + 1)) / parts.length;
        out.push({ text, start, end });
      });
    };
    segments.forEach((seg) => {
      const timed = [];
      (seg.segs || []).forEach((s) => {
        if (!String(s.text ?? '').trim()) return;
        let off = Number(s.offset);
        if (!Number.isFinite(off)) off = timed.length ? timed[timed.length - 1].offset : 0;
        timed.push({ text: s.text, offset: Math.max(0, off) });
      });
      const hasTrueOffsets = (seg.segs || []).some((s) => Number.isFinite(Number(s.offset)));
      if (!hasTrueOffsets || !timed.length) {
        pushSpan(seg.text, seg.start, seg.end, true);
        return;
      }
      timed.forEach((ts, k) => {
        const spanStart = Math.min(Math.max(seg.start, seg.start + ts.offset / 1000), seg.end);
        const nextOff = timed[k + 1]?.offset;
        let spanEnd = (nextOff != null && nextOff > ts.offset) ? seg.start + nextOff / 1000 : seg.end;
        if (!(spanEnd > spanStart)) spanEnd = spanStart + 0.01;
        pushSpan(ts.text, spanStart, spanEnd, false);
      });
    });
    out.forEach((w, i) => {
      const prevText = i === 0 ? '' : out[i - 1].text;
      if ((i === 0 || /[.!?]["')\]]*$/.test(prevText)) && /^[a-z]/.test(w.text)) {
        w.text = w.text.charAt(0).toUpperCase() + w.text.slice(1);
      }
    });
    return out;
  }, [segments]);

  const [findQuery, setFindQuery] = useState('');
  const [findIndex, setFindIndex] = useState(0);
  const findInputRef = useRef(null);
  const wordOpenRef = useRef(false);
  wordOpenRef.current = wordClipperOpen;
  const lastScrolledMatch = useRef(-1);

  // Atomic tokens for find: lowercase, apostrophes folded away, split on
  // anything that is not a letter or digit - so phrases and whole
  // sentences match regardless of punctuation or case. "real-world" is
  // seen as ["real", "world"], "don't" as ["dont"].
  const findAtoms = (t) => String(t || '').toLowerCase().replace(/[''’]/g, '').split(/[^a-z0-9]+/).filter(Boolean);

  const findData = useMemo(() => {
    const qt = findAtoms(findQuery);
    const runs = [];
    if (qt.length && words.length) {
      const perWord = words.map((w) => findAtoms(w.text));
      if (qt.length === 1) {
        const q = qt[0];
        perWord.forEach((atoms, i) => {
          if (atoms.some((a) => a.includes(q))) runs.push([i, i]);
        });
      } else {
        const flat = [];
        const owner = [];
        perWord.forEach((atoms, i) => { atoms.forEach((a) => { flat.push(a); owner.push(i); }); });
        for (let k = 0; k + qt.length <= flat.length; k += 1) {
          let ok = true;
          for (let j = 0; j < qt.length; j += 1) {
            if (flat[k + j] !== qt[j]) { ok = false; break; }
          }
          if (ok) runs.push([owner[k], owner[k + qt.length - 1]]);
        }
      }
    }
    return { runs };
  }, [words, findQuery]);

  const findMatches = useMemo(() => findData.runs.map((r) => r[0]), [findData]);
  const findRunsRef = useRef([]);
  findRunsRef.current = findData.runs;

  const findSet = useMemo(() => {
    const st = new Set();
    findData.runs.forEach(([a, b]) => { for (let i = a; i <= b; i += 1) st.add(i); });
    return st;
  }, [findData]);
  const findCount = findMatches.length;
  const findPos = findCount === 0 ? 0 : ((findIndex % findCount) + findCount) % findCount;
  const currentMatch = findCount === 0 ? -1 : findMatches[findPos];

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && String(e.key || '').toLowerCase() === 'f') {
        if (!wordOpenRef.current) return;
        e.preventDefault();
        findInputRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (currentMatch < 0 || currentMatch === lastScrolledMatch.current) return;
    lastScrolledMatch.current = currentMatch;
    requestAnimationFrame(() => {
      wordAreaRef.current?.querySelector(`[data-word-index="${currentMatch}"]`)?.scrollIntoView({ block: 'center' });
    });
  }, [currentMatch]);

  const clearFind = () => {
    setFindQuery('');
    setFindIndex(0);
    lastScrolledMatch.current = -1;
  };

  const stepFind = (dir) => {
    if (findCount === 0) return;
    lastScrolledMatch.current = -1;
    setFindIndex((i) => i + dir);
  };

  const onFindQuery = (value) => {
    setFindQuery(value);
    setFindIndex(0);
    lastScrolledMatch.current = -1;
  };

  const onFindKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      stepFind(e.shiftKey ? -1 : 1);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.currentTarget.blur();
      clearFind();
    }
  };

  useLayoutEffect(() => {
    if (draggingWord || !words.length) return;
    if (skipDeriveRef.current) { skipDeriveRef.current = false; return; }
    let s = words.findIndex((w) => w.end > startSec);
    if (s === -1) s = words.length - 1;
    let e = -1;
    words.forEach((w, i) => { if (w.start < endSec) e = i; });
    if (e === -1) e = 0;
    setWordStart(s);
    setWordEnd(e);
  }, [words, startSec, endSec, draggingWord]);

  const wordStateRef = useRef(null);
  const skipDeriveRef = useRef(false);
  wordStateRef.current = {
    draggingWord, wordStart, wordEnd, words, startSec, endSec, duration,
    setWordStart, setWordEnd, setStartSec, setEndSec, flashCap,
  };
  const wordRafRef = useRef(0);
  const wordPendingRef = useRef({ x: 0, y: 0 });
  const wordDragCleanupRef = useRef(null);
  const handleStartRef = useRef(null);
  const handleEndRef = useRef(null);

  useEffect(() => () => { if (wordDragCleanupRef.current) wordDragCleanupRef.current(); }, []);

  const wordScrollArmedRef = useRef(false);
  const wordWasOpenRef = useRef(false);
  useEffect(() => {
    if (!wordClipperOpen) {
      wordWasOpenRef.current = false;
      wordScrollArmedRef.current = false;
      return;
    }
    if (!wordWasOpenRef.current) {
      wordWasOpenRef.current = true;
      wordScrollArmedRef.current = true;
    }
    if (!wordScrollArmedRef.current || !words.length) return undefined;
    const idx = wordStart;
    const id = requestAnimationFrame(() => {
      const el = wordAreaRef.current?.querySelector(`[data-word-index="${idx}"]`);
      if (el) el.scrollIntoView({ block: 'center' });
    });
    return () => cancelAnimationFrame(id);
  }, [wordClipperOpen, words.length, wordStart]);

  const disarmWordScroll = () => { wordScrollArmedRef.current = false; };

  const placeHandles = () => {
    const area = wordAreaRef.current;
    if (!area || !words.length) return;
    const areaRect = area.getBoundingClientRect();
    const place = (index, ref, atLeft) => {
      const node = ref.current;
      if (!node) return;
      const el = area.querySelector(`[data-word-index="${index}"]`);
      if (!el) { node.style.display = 'none'; return; }
      const r = el.getBoundingClientRect();
      node.style.display = 'block';
      node.style.left = `${r.left - areaRect.left + area.scrollLeft + (atLeft ? 0 : r.width)}px`;
      node.style.top = `${r.top - areaRect.top + area.scrollTop}px`;
      node.style.height = `${r.height}px`;
    };
    place(wordStart, handleStartRef, true);
    place(wordEnd, handleEndRef, false);
  };
  const placeHandlesRef = useRef(placeHandles);
  placeHandlesRef.current = placeHandles;

  // Was a dependency-less layout effect: it measured every word handle on every
  // render (10 times a second). Now it runs when the selection changes, and a
  // ResizeObserver re-places the handles if the panel is resized.
  useLayoutEffect(() => {
    placeHandles();
  }, [words, wordStart, wordEnd, wordClipperOpen, wordLoading, wordError]);

  useEffect(() => {
    const area = wordAreaRef.current;
    if (!area || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => placeHandlesRef.current());
    ro.observe(area);
    return () => ro.disconnect();
  }, [wordClipperOpen, words.length, wordLoading, wordError]);

  const onWordDoubleClick = useCallback((index) => {
    wordScrollArmedRef.current = false;
    wordClipUsedRef.current = true;
    const s = wordStateRef.current;
    if (!s.words.length) return;
    // A double-click inside a find match selects the whole phrase or
    // sentence, so multi-word finds clip in one action.
    let si = index;
    let ei = Math.min(index + 1, s.words.length - 1);
    const runs = findRunsRef.current || [];
    for (let r = 0; r < runs.length; r += 1) {
      if (index >= runs[r][0] && index <= runs[r][1]) {
        const spanEnd = Math.min(runs[r][1], s.words.length - 1);
        const spanT = Math.max(0, s.words[runs[r][0]].start);
        const spanE = Math.min(s.words[spanEnd].end, s.duration);
        if (spanE > spanT && spanE - spanT <= MAX_CLIP) { si = runs[r][0]; ei = spanEnd; }
        break;
      }
    }
    const w = s.words[si];
    if (!w || w.start >= s.duration) return;
    const t = Math.max(0, w.start);
    let e = Math.min(s.words[ei].end, s.duration);
    if (e <= t) return;
    skipDeriveRef.current = true;
    s.setWordStart(si);
    s.setWordEnd(ei);
    s.setStartSec(t);
    s.setEndSec(e);
    timesTouchedRef.current = true;
    // The 3-minute window follows the selection like a real seek does.
    lockWindowTo(t, s.duration);
  }, []);

  const onWordHandleEvent = useCallback((which, phase, e) => {
    if (phase !== 'down') return;
    wordClipUsedRef.current = true;
    e.preventDefault();
    e.stopPropagation();
    if (wordDragCleanupRef.current) return;
    wordScrollArmedRef.current = false;
    setDraggingWord(which);
    const move = (ev) => {
      ev.preventDefault();
      wordPendingRef.current = { x: ev.clientX, y: ev.clientY };
      if (wordRafRef.current) return;
      wordRafRef.current = requestAnimationFrame(() => {
        wordRafRef.current = 0;
        const s = wordStateRef.current;
        if (!s.draggingWord || !s.words.length) return;
        const { x, y } = wordPendingRef.current;
        const el = document.elementFromPoint(x, y);
        const wordEl = el && el.closest ? el.closest('[data-word-index]') : null;
        if (!wordEl) return;
        const best = Number(wordEl.getAttribute('data-word-index'));
        if (Number.isNaN(best) || !s.words[best]) return;
        if (s.draggingWord === 'start') {
          if (best > s.wordEnd) return;
          const t = Math.max(0, s.words[best].start);
          if (s.endSec - t > MAX_CLIP) { s.flashCap(); return; }
          skipDeriveRef.current = true;
          s.setWordStart(best);
          s.setStartSec(t);
          timesTouchedRef.current = true;
        } else {
          if (best < s.wordStart) return;
          const t = Math.min(s.words[best].end, s.duration);
          if (t - s.startSec > MAX_CLIP) { s.flashCap(); return; }
          skipDeriveRef.current = true;
          s.setWordEnd(best);
          s.setEndSec(t);
          timesTouchedRef.current = true;
        }
      });
    };
    const up = () => {
      if (wordRafRef.current) { cancelAnimationFrame(wordRafRef.current); wordRafRef.current = 0; }
      const st = wordStateRef.current;
      if (st && st.draggingWord === 'start' && st.words.length) {
        // The 3-minute window recenters on the dropped handle like a seek.
        lockWindowTo(Math.max(0, st.startSec), st.duration);
      }
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      wordDragCleanupRef.current = null;
      setDraggingWord(null);
    };
    wordDragCleanupRef.current = up;
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }, []);

  const toggleWordClipper = async () => {
    if (wordClipperOpen) {
      closeWordClipper();
      setFindQuery('');
      setFindIndex(0);
      return;
    }
    wordSnapRef.current = { s: startSec, e: endSec };
    setWordClipperOpen(true);
    if (segments || wordError) return;
    setWordLoading(true);
    setWordError('');
    try {
      const result = await fetchYouTubeTranscript(data.videoId);
      setSegments(result.segments || []);
    } catch (e) {
      setWordError(e.message || 'Could not load the transcript.');
    } finally {
      setWordLoading(false);
    }
  };

  const closeWordClipper = () => {
    const snap = wordSnapRef.current;
    setWordClipperOpen(false);
    if (snap && (startSec !== snap.s || endSec !== snap.e)) {
      markDirty();
      if (startSec !== snap.s) lockWindowTo(startSec);
      ytSeek(startSec);
      viewRef.current = { ...viewRef.current, s: startSec, e: endSec };
      // Confirmation moment: show what the words became so closing the
      // panel feels like finishing something, not rewinding.
      try {
        const ws = Math.max(0, Math.min(wordStart, words.length - 1));
        const we = Math.max(ws, Math.min(wordEnd, words.length - 1));
        const picked = words.length ? words.slice(ws, we + 1).map((w) => w.text).join(' ').trim() : '';
        setWordConfirm({
          s: startSec,
          e: endSec,
          n: words.length ? we - ws + 1 : 0,
          preview: picked.slice(0, 90),
        });
      } catch {}
    }
    wordSnapRef.current = null;
  };

  // The word-clip confirmation stays until the user changes the timeline:
  // any clip-range move clears it, playback and playhead motion do not.
  useEffect(() => {
    if (!wordConfirm) {
      setClipInfoOpen(false);
      return undefined;
    }
    if (startSec !== wordConfirm.s || endSec !== wordConfirm.e) setWordConfirm(null);
    return undefined;
  }, [wordConfirm, startSec, endSec]);

  // Popover below the word-clipped pill: toggle on the pill, close on
  // outside click or Escape.
  useEffect(() => {
    if (!clipInfoOpen) return undefined;
    const onDown = (e) => {
      if (!clipInfoWrapRef.current || !clipInfoWrapRef.current.contains(e.target)) setClipInfoOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setClipInfoOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [clipInfoOpen]);

  const canContinue = rec.state === 'done' || playMode === 'embed';
  const locked = rec.state === 'recording' || rec.state === 'done';

  const ytSend = (message) => {
    sendToActiveTab(message);
  };

  const ytSeek = (t, opts) => {
    if (ytAdRef.current) return false;
    seqRef.current += 1;
    lastSentSeqRef.current = seqRef.current;
    ytSend({ type: 'YT_SEEK', time: Math.max(0, Math.round(t)), seq: seqRef.current });
    if (opts && opts.hold) {
      releaseIgnoreRef.current = { target: Math.max(0, Math.round(t)), until: performance.now() + 600 };
    }
    return true;
  };

  const clampStartDrag = (t) => Math.max(0, Math.min(Math.round(t), tlDuration() - 1));

  const clampEndDrag = (t) => Math.max(Math.min(Math.round(t), tlDuration()), 1);

  const clearSelection = () => {
    selectedHandleRef.current = null;
    setSelectedHandle(null);
  };

  const selectHandle = (which) => {
    selectedHandleRef.current = which;
    setSelectedHandle(which);
  };

  const barGeom = (bar) => {
    if (bar === 'detail') return { from: winStartRef.current, span: winSpan() };
    return { from: 0, span: tlDuration() };
  };

  const handleAt = (bar, xPx, width) => {
    const g = barGeom(bar);
    const w = Math.max(1, width);
    const px = (t) => ((t - g.from) / Math.max(1, g.span)) * w;
    const inWin = (t) => t >= g.from - 0.001 && t <= g.from + g.span + 0.001;
    const ds = inWin(startSec) ? Math.abs(xPx - px(startSec)) : Infinity;
    const de = inWin(endSec) ? Math.abs(xPx - px(endSec)) : Infinity;
    if (Math.min(ds, de) > 14) return null;
    if (ds <= 14 && de <= 14) {
      const mid = (px(startSec) + px(endSec)) / 2;
      return xPx <= mid ? 'start' : 'end';
    }
    return ds <= 14 ? 'start' : 'end';
  };

  const xToSec = (bar, clientX, rect) => {
    const g = barGeom(bar);
    const w = Math.max(1, rect.width);
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    return g.from + (x / w) * g.span;
  };

  const seekThrottled = (t) => {
    pendingSeekRef.current = Math.max(0, Math.round(t));
    if (seekTimerRef.current) return;
    seekTimerRef.current = setTimeout(() => {
      seekTimerRef.current = 0;
      const v = pendingSeekRef.current;
      pendingSeekRef.current = null;
      if (v !== null && v !== undefined) {
        lastSeekRef.current = Date.now();
        ytSeek(v);
      }
    }, 120);
  };

  const applyDragValue = (kind, t, snap) => {
    const D = tlDuration();
    const v = viewRef.current;
    if (kind === 'playhead') {
      const c = Math.max(0, Math.min(t, D));
      // Seeking sets X and locks the 180s window (30s behind X). Y keeps
      // the current clip length so seeking never destroys your clip.
      let ns = v.s;
      let ne = v.e;
      if (snap && snap.bar === 'over') {
        ns = Math.max(0, Math.min(Math.round(c), D - 1));
        const len = Math.max(1, v.e - v.s);
        ne = Math.min(ns + len, D);
        timesTouchedRef.current = true;
        wordClipUsedRef.current = false;
        markDirty();
        setStartSec(ns);
        setEndSec(ne);
        lockWindowTo(ns);
      }
      viewRef.current = { ...v, t: c, s: ns, e: ne };
      setDragVal(c);
      seekThrottled(c);
      return c;
    }
    let c = Math.max(0, Math.min(t, D));
    if (snap && snap.bar === 'detail') {
      const g = barGeom('detail');
      c = Math.max(g.from, Math.min(c, g.from + g.span));
    }
    if (snap && kind !== 'playhead') {
      const w = Math.max(1, snap.width);
      const g = snap.bar === 'detail'
        ? { from: winStartRef.current, span: winSpan() }
        : { from: 0, span: D };
      const toPx = (tt) => ((tt - g.from) / Math.max(1, g.span)) * w;
      const x = toPx(c);
      let best = null;
      let bestD = 7;
      chapters.forEach((ch) => {
        if (ch.t < g.from || ch.t > g.from + g.span) return;
        const d = Math.abs(toPx(ch.t) - x);
        if (d < bestD) { bestD = d; best = ch.t; }
      });
      const pv = uiTimeRef.current;
      if (pv >= g.from && pv <= g.from + g.span) {
        const d = Math.abs(toPx(pv) - x);
        if (d < bestD) { bestD = d; best = pv; }
      }
      if (best !== null) {
        c = best;
        const key = `${snap.bar}-${kind}-${Math.round(best * 2)}`;
        if (frameRef.current.snapKey !== key) {
          frameRef.current.snapKey = key;
          pulseSnap(kind);
        }
      }
    }
    if (kind === 'start') {
      // X moves alone; the video keeps playing and the window stays locked.
      const over = v.e - c > MAX_CLIP;
      if (over && !frameRef.current.capped) flashCap();
      frameRef.current.capped = over;
      const s = Math.max(0, Math.min(Math.round(c), D - 1));
      const e = Math.max(v.e, s + 1);
      viewRef.current = { ...v, s, e: Math.min(e, D) };
      setDragVal(s);
      setStartSec(s);
      setEndSec(Math.min(e, D));
      timesTouchedRef.current = true;
      wordClipUsedRef.current = false;
      markDirty();
      ensureXVisible(s);
      return s;
    }
    // Y moves alone; the video keeps playing and the window stays locked.
    const over = c - v.s > MAX_CLIP;
    if (over && !frameRef.current.capped) flashCap();
    frameRef.current.capped = over;
    const e = Math.min(D, Math.max(Math.round(c), 1));
    const s = Math.min(v.s, e - 1);
    viewRef.current = { ...v, s: Math.max(s, 0), e };
    setDragVal(e);
    setStartSec(Math.max(s, 0));
    setEndSec(e);
    timesTouchedRef.current = true;
    wordClipUsedRef.current = false;
    markDirty();
    ensureXVisible(Math.max(s, 0));
    return e;
  };

  // Seek bar: the ONLY movable thing here is the dragger. Tapping
  // anywhere jumps it there and keeps seeking from it.
  const beginSeekPointer = (clientX) => {
    if (ytAdRef.current || locked || isLive) return;
    if (!overRef.current) return;
    beginDrag('over', clientX);
  };

  const beginDrag = (bar, clientX, jump, grabKind) => {
    if (ytAdRef.current || locked || isLive) return;
    const el = bar === 'detail' ? detailRef.current : overRef.current;
    if (!el) return;
    ytSend({ type: 'YT_PREVIEW_CANCEL' });
    const rect = el.getBoundingClientRect();
    // Only the seek bar pauses the video: placing clamps must not disturb
    // playback or the locked window.
    const wasPlaying = bar === 'over' && !ytPausedRef.current;
    if (wasPlaying) ytSend({ type: 'YT_PAUSE' });
    wasPlayingRef.current = wasPlaying;
    let kind = 'playhead';
    if (grabKind) {
      kind = grabKind;
      selectHandle(grabKind);
    } else if (bar === 'over') {
      // Seek bar carries the playback dragger only, never the X/Y handles.
      kind = 'playhead';
      clearSelection();
    } else {
      // Clip bars carry handles only: a tap moves the nearer handle here.
      const x = clientX - rect.left;
      const found = handleAt(bar, x, rect.width);
      if (found) {
        kind = found;
        selectHandle(found);
      } else {
        const t = xToSec(bar, clientX, rect);
        kind = Math.abs(t - startSec) <= Math.abs(t - endSec) ? 'start' : 'end';
        selectHandle(kind);
      }
    }
    dragRef.current = { kind, bar, el, lastX: clientX, value: 0 };
    if (jump !== false) {
      dragRef.current.value = applyDragValue(kind, xToSec(bar, clientX, rect), { bar, width: rect.width });
    } else if (kind === 'playhead') {
      dragRef.current.value = viewRef.current.t;
      setDragVal(viewRef.current.t);
    } else {
      dragRef.current.value = kind === 'start' ? viewRef.current.s : viewRef.current.e;
      setDragVal(dragRef.current.value);
    }
    setDragView({ kind, bar });
    const onMove = (e) => {
      const d = dragRef.current;
      if (!d || !d.el) return;
      const r = d.el.getBoundingClientRect();
      d.lastX = e.clientX;
      d.value = applyDragValue(d.kind, xToSec(d.bar, e.clientX, r), { bar: d.bar, width: r.width });
    };
    const detach = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      window.removeEventListener('blur', onUp);
      dragCleanupRef.current = null;
    };
    const onUp = () => {
      detach();
      const d = dragRef.current;
      dragRef.current = null;
      frameRef.current.capped = false;
      frameRef.current.snapKey = '';
      setDragView(null);
      if (!d) return;
      if (seekTimerRef.current) {
        clearTimeout(seekTimerRef.current);
        seekTimerRef.current = 0;
      }
      pendingSeekRef.current = null;
      if (typeof d.value === 'number') {
        const v = Math.round(d.value);
        if (d.kind === 'start') {
          const nv = updateStart(clampStartDrag(v));
          viewRef.current = { ...viewRef.current, s: nv };
        } else if (d.kind === 'end') {
          const nv = updateEnd(clampEndDrag(v));
          viewRef.current = { ...viewRef.current, e: nv };
        } else {
          // Seek release: the clip already follows the dot; seek the video.
          viewRef.current = { ...viewRef.current, t: v };
          ytSeek(v, { hold: true });
        }
      }
      if (wasPlayingRef.current) {
        wasPlayingRef.current = false;
        ytSend({ type: 'YT_RESUME' });
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    window.addEventListener('blur', onUp);
    dragCleanupRef.current = detach;
  };

  const overPct = (t) => Math.max(0, Math.min(100, (t / tlDuration()) * 100));

  const detailPct = (t) => {
    return Math.max(0, Math.min(100, ((t - winStart) / winSpan()) * 100));
  };

  const playValue = () => (dragView && dragView.kind === 'playhead' ? dragVal : uiTime);

  const markerKeyDown = (which) => (e) => {
    if (locked || ytAdRef.current) return;
    const step = e.shiftKey ? 5 : 1;
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    const dir = (e.key === 'ArrowLeft' || e.key === 'ArrowDown') ? -1 : 1;
    const cur = which === 'start' ? startSec : endSec;
    const t = cur + dir * step;
    // Clip edits never seek the video.
    if (which === 'start') {
      if ((endSec - t) > MAX_CLIP) flashCap();
      updateStart(clampStartDrag(t));
    } else {
      if ((t - startSec) > MAX_CLIP) flashCap();
      updateEnd(clampEndDrag(t));
    }
  };

  // Arrow scrub on the seek bar: seeks the video AND moves X + locks the
  // window, exactly like a pointer seek.
  const overKeyDown = (ev) => {
    if (ev.target !== ev.currentTarget) return;
    if (locked || ytAdRef.current || isLive) return;
    if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
    ev.preventDefault();
    const step = ev.shiftKey ? 5 : 1;
    const dir = ev.key === 'ArrowLeft' ? -1 : 1;
    const t = Math.max(0, Math.min(tlDuration(), Math.round(uiTimeRef.current) + dir * step));
    const len = Math.max(1, endSec - startSec);
    const ns = Math.max(0, Math.min(t, tlDuration() - 1));
    const ne = Math.min(ns + len, tlDuration());
    timesTouchedRef.current = true;
    wordClipUsedRef.current = false;
    markDirty();
    setStartSec(ns);
    setEndSec(ne);
    viewRef.current = { ...viewRef.current, s: ns, e: ne, t };
    lockWindowTo(ns);
    ytSeek(t, { hold: true });
  };

  const inDetailWin = (t) => t >= winStart && t <= winStart + winSpan();

  const beginChipEdit = (which) => {
    setEditingChip(which);
    setChipDraft(formatTime(which === 'start' ? startSec : endSec));
  };

  const commitChipEdit = (which) => {
    if (editingChip !== which) return;
    setEditingChip(null);
    const sec = parseTime(chipDraft);
    if (isNaN(sec) || sec < 0) return;
    // Clip edits never seek the video.
    if (which === 'start') {
      if ((endSec - sec) > MAX_CLIP) flashCap();
      updateStart(clampStartDrag(sec));
    } else {
      if ((sec - startSec) > MAX_CLIP) flashCap();
      updateEnd(clampEndDrag(sec));
    }
  };

  const stopNudgeHold = () => {
    const h = nudgeHoldRef.current;
    if (h) {
      clearTimeout(h.first);
      clearTimeout(h.rep);
      nudgeHoldRef.current = null;
    }
  };

  // Hold-repeat nudge: single step on press, repeat from 400ms, 90ms cadence after 1s held.
  const startNudgeHold = (which, dir) => {
    if (locked || ytAdRef.current) return;
    stopNudgeHold();
    let base = which === 'start' ? startSec : endSec;
    const step = () => {
      base += dir;
      const t = base;
      // Clip edits never seek the video.
      if (which === 'start') {
        if ((endSec - t) > MAX_CLIP) flashCap();
        updateStart(clampStartDrag(t));
      } else {
        if ((t - startSec) > MAX_CLIP) flashCap();
        updateEnd(clampEndDrag(t));
      }
    };
    step();
    const t0 = performance.now();
    const h = { first: 0, rep: 0 };
    h.first = setTimeout(() => {
      const tick = () => {
        step();
        h.rep = setTimeout(tick, performance.now() - t0 >= 1000 ? 90 : 150);
      };
      tick();
    }, 400);
    nudgeHoldRef.current = h;
  };

  const renderMarkers = (pctFn, bar) => {
    const sPos = dragView && dragView.kind === 'start' ? dragVal : startSec;
    const ePos = dragView && dragView.kind === 'end' ? dragVal : endSec;
    const mk = (which, pos) => {
      if (!inDetailWin(pos)) return null;
      const selected = selectedHandle === which;
      return (
        <div
          key={which}
          className={`tl-marker is-${which}${selected ? ' is-selected' : ''}${snapFlash === which ? ' is-snapped' : ''}`}
          style={{ left: `${pctFn(pos)}%` }}
        >
          <button
            type="button"
            className="tl-grip"
            role="slider"
            tabIndex={0}
            aria-label={which === 'start' ? 'Start time' : 'End time'}
            aria-valuemin={0}
            aria-valuemax={Math.round(tlDuration())}
            aria-valuenow={Math.round(pos)}
            aria-valuetext={ariaTimeText(pos)}
            onPointerDown={(e) => { e.stopPropagation(); beginDrag(bar, e.clientX, false, which); }}
            onKeyDown={markerKeyDown(which)}
          >
            <span className="tl-grip-glyph" aria-hidden="true">
              <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true">
                <rect x="1" y="1" width="3" height="8" rx="1" />
                <rect x="6" y="1" width="3" height="8" rx="1" />
              </svg>
            </span>
          </button>
          {editingChip === which ? (
            <input
              className={`tl-chip is-editing is-${which}`}
              type="text"
              value={chipDraft}
              autoFocus
              onChange={(e) => setChipDraft(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter') commitChipEdit(which);
                else if (e.key === 'Escape') setEditingChip(null);
              }}
              onBlur={() => commitChipEdit(which)}
              onPointerDown={(e) => e.stopPropagation()}
              aria-label={which === 'start' ? 'Edit start time' : 'Edit end time'}
            />
          ) : (
            <div className={`tl-chip is-${which}${selected ? ' is-selected' : ''}`} onPointerDown={(e) => e.stopPropagation()}>
              {selected && (
                <button
                  type="button"
                  className="tl-chip-arrow"
                  onPointerDown={(e) => { e.stopPropagation(); startNudgeHold(which, -1); }}
                  onPointerUp={stopNudgeHold}
                  onPointerCancel={stopNudgeHold}
                  onPointerLeave={stopNudgeHold}
                  aria-label={which === 'start' ? 'Nudge start earlier' : 'Nudge end earlier'}
                >‹</button>
              )}
              <button
                type="button"
                className="tl-chip-time"
                onClick={() => { if (selected) beginChipEdit(which); else selectHandle(which); }}
                aria-label={`${which === 'start' ? 'Start' : 'End'} ${ariaTimeText(pos)}. ${selected ? 'Edit time' : 'Select to adjust'}`}
              >{formatShort(pos)}</button>
              {selected && (
                <button
                  type="button"
                  className="tl-chip-arrow"
                  onPointerDown={(e) => { e.stopPropagation(); startNudgeHold(which, 1); }}
                  onPointerUp={stopNudgeHold}
                  onPointerCancel={stopNudgeHold}
                  onPointerLeave={stopNudgeHold}
                  aria-label={which === 'start' ? 'Nudge start later' : 'Nudge end later'}
                >›</button>
              )}
            </div>
          )}
        </div>
      );
    };
    return <>{mk('start', sPos)}{mk('end', ePos)}</>;
  };

  const renderRange = (pctFn, minPx) => {
    const s = dragView && dragView.kind === 'start' ? dragVal : startSec;
    const e = dragView && dragView.kind === 'end' ? dragVal : endSec;
    const lo = Math.min(s, e);
    const wPct = Math.abs(pctFn(e) - pctFn(s));
    return <div className="tl-range" style={{ left: `${pctFn(lo)}%`, width: `max(${wPct}%, ${minPx}px)` }} />;
  };

  const renderPlayhead = (pctFn, small) => {
    // Static initial left; the rAF loop owns style.left so React never fights it.
    return <div ref={small ? playOverRef : playMainRef} className={`tl-play${small ? ' is-dot' : ''}`} style={{ left: '0%' }} />;
  };

  const renderTickLabels = (pctFn) => detailTicks.map((k) => k.label && (
    <div
      key={`tl${k.t}`}
      className="tl-ticklabel"
      style={{ left: `${pctFn(k.t)}%` }}
      aria-hidden="true"
    >
      {formatShort(k.t)}
    </div>
  ));

  const renderBubble = (bar, pctFn) => {
    if (!dragView || dragView.bar !== bar) return null;
    const pct = Math.max(4, Math.min(96, pctFn(dragVal)));
    return <div className="tl-bubble" style={{ left: `${pct}%` }}>{formatShort(dragVal)}</div>;
  };

  const chapNow = currentChapter();
  const rulerSpan = winSpan();
  const rulerPx = detailBarW || 320;
  const { minor: minorStep, label: labelStep } = niceSteps(rulerSpan, rulerPx);
  const detailTicks = [];
  {
    const D = tlDuration();
    const rulerFrom = winStart;
    const first = Math.ceil(rulerFrom / minorStep) * minorStep;
    const last = Math.min(rulerFrom + rulerSpan, D);
    for (let t = first; t <= last; t += minorStep) {
      const x = ((t - rulerFrom) / rulerSpan) * rulerPx;
      const roomForLabel = x >= LABEL_EDGE_PX && x <= rulerPx - LABEL_EDGE_PX;
      detailTicks.push({
        t,
        label: t % labelStep === 0 && roomForLabel,
      });
    }
  }
  // Full-video ruler for the seek bar: minor ticks plus pinned 0:00 and
  // duration edge labels so the bare bar keeps time context.
  const seekTicks = [];
  {
    const D = tlDuration();
    const px = detailBarW || 320;
    const steps = niceSteps(D, px);
    for (let t = 0; t <= D; t += steps.minor) {
      const x = (t / D) * px;
      seekTicks.push({
        t,
        label: t % steps.label === 0 && x >= LABEL_EDGE_PX && x <= px - LABEL_EDGE_PX,
      });
    }
  }
  const sheetQuery = sheetSearch.trim().toLowerCase();
  const sheetChapters = sheetQuery
    ? chapters.filter((c) => (c.title || '').toLowerCase().includes(sheetQuery))
    : chapters;

  if (wordClipperOpen) {
    return (
      <div className="clip-body word-clipper-full">
        <div className="word-clipper">
          <div className="word-stickyhead">
            <div className="word-clipper-top">
              <span className="word-clipper-title">Word clipper</span>
              {words.length > 0 && (
                <span className="word-clipper-count">{wordEnd - wordStart + 1} words</span>
              )}
            </div>
            <div className="word-findbar">
              <input
                ref={findInputRef}
               
                className="input word-findinput"
                type="text"
                value={findQuery}
                onChange={(e) => onFindQuery(e.target.value)}
                onKeyDown={onFindKeyDown}
                placeholder="Find in transcript"
                aria-label="Find in transcript"
              />
              <span className="word-findcount">
                {findQuery.trim() ? (findCount > 0 ? `${findPos + 1}/${findCount}` : 'No matches') : ''}
              </span>
              <button type="button" className="word-findnav" onClick={() => stepFind(-1)} aria-label="Previous match" disabled={findCount === 0}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M6 15l6-6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <button type="button" className="word-findnav" onClick={() => stepFind(1)} aria-label="Next match" disabled={findCount === 0}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          </div>
          {wordLoading ? (
            <p className="word-clipper-msg">Loading transcript…</p>
          ) : wordError ? (
            <p className="word-clipper-msg error">{wordError}</p>
          ) : words.length === 0 ? (
            <p className="word-clipper-msg">No transcript available for this video.</p>
          ) : (
            <>
              <div className={`word-area${draggingWord ? ' is-dragging' : ''}`} data-drag={draggingWord || ''} ref={wordAreaRef} onWheel={disarmWordScroll} onTouchMove={disarmWordScroll}>
                {words.map((w, i) => (
                  <Word
                    key={i}
                    w={w}
                    index={i}
                    selected={i >= wordStart && i <= wordEnd}
                    isMatch={findSet.has(i)}
                    isCurrent={i === currentMatch}
                    onWordDoubleClick={onWordDoubleClick}
                  />
                ))}
                <div ref={handleStartRef} className="word-handle-float" data-handle="start" onPointerDown={(e) => onWordHandleEvent('start', 'down', e)} />
                <div ref={handleEndRef} className="word-handle-float" data-handle="end" onPointerDown={(e) => onWordHandleEvent('end', 'down', e)} />
              </div>
              <div className="word-bottombar">
                <div className="word-clipper-foot">
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {formatShort(words[wordStart]?.start ?? startSec)} – {formatShort(words[wordEnd]?.end ?? endSec)}
                    {' · '}
                    <span key={capFlash} className={`max${capFlash ? ' flash' : ''}`}>{formatShort(clipLen)} of {formatShort(MAX_CLIP)}</span>
                  </span>
                  <span className="word-clipper-hint">Double-click a word to select it · Drag the bars to adjust</span>
                </div>
                <div className="word-perma-continue">
                  <button type="button" className="btn-primary w-full" onClick={closeWordClipper}>Continue</button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="clip-body">
      {showTitle && (
        <div className="clip-titleblock">
          <span className="clip-kicker">YouTube</span>
          <h2 className="clip-title" title={data.title}>{data.title}</h2>
        </div>
      )}
      {rec.state === 'recording' ? (
        <div className="rec-card" role="status" aria-live="polite">
          <div className="rec-head">
            <span className="rec-dot" />
            <span className="rec-title">Recording</span>
            <span className="rec-time">{formatShort(rec.t)} of {formatShort(clipLen)}</span>
          </div>
          <div className="rec-bar">
            <div
              className="rec-bar-fill"
              style={{ width: `${Math.min(100, clipLen > 0 ? (rec.t / clipLen) * 100 : 0)}%` }}
            />
          </div>
          <p className="rec-note">Keep this tab open. Don't pause, seek or mute.</p>
          <button type="button" className="rec-cancel" onClick={cancelRecording}>Cancel</button>
        </div>
      ) : rec.state === 'done' && rec.url ? (
        <div className="rec-done">
          <div className="thumb">
            <video src={rec.url} controls preload="metadata" />
          </div>
          <p className="rec-meta">{formatLength(rec.t)}, {formatBytes(rec.blob ? rec.blob.size : 0)}</p>
          <div className="rec-actions">
            <button type="button" className="rec-cancel" onClick={reRecord}>Re-record</button>
            <button type="button" className="btn-ghost" onClick={useEmbedInstead}>Use embed instead</button>
          </div>
        </div>
      ) : (
        <div className="play-clip">
          <button
            type="button"
           
            className={`play-clip-btn play-clip-main${previewPlaying ? ' playing' : ''}`}
            onClick={togglePlay}
            disabled={locked}
            aria-label={previewPlaying ? 'Pause video' : 'Play clip'}
          >
            {previewPlaying ? (
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6 5h4v14H6zM14 5h4v14h-4z" fill="currentColor" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M8 5v14l11-7z" fill="currentColor" />
              </svg>
            )}
            <span>{previewPlaying ? 'Pause' : 'Play'}</span>
          </button>
          <button
            type="button"
            className="play-clip-btn"
            onClick={replayClip}
            disabled={locked}
            aria-label="Replay clip"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" fill="currentColor" />
            </svg>
            <span>Replay</span>
          </button>
          <span className="play-clip-time" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatShort(uiTime)} / {formatShort(duration)}</span>
        </div>
      )}

      <div className={`tl-group${ytAd || isLive ? ' is-disabled' : ''}${locked ? ' rec-lock' : ''}`}>
        {wordConfirm && (
          <div className="word-confirm" role="status">
            <div className="word-confirm-head">
              <span className="word-confirm-title">Clipped from your words</span>
              <button type="button" className="word-confirm-x" onClick={() => setWordConfirm(null)} aria-label="Dismiss">×</button>
            </div>
            <p className="word-confirm-range">{formatShort(wordConfirm.s)} – {formatShort(wordConfirm.e)}{wordConfirm.n > 0 ? ` · ${wordConfirm.n} word${wordConfirm.n === 1 ? '' : 's'}` : ''}</p>
            {wordConfirm.preview && <p className="word-confirm-quote">“{wordConfirm.preview}{wordConfirm.preview.length >= 90 ? '…' : ''}”</p>}
          </div>
        )}
        {ytAd && <div className="tl-ad" role="status">Ad playing</div>}
        {!ytAd && isLive && <div className="tl-ad" role="status">{"Live stream: clipping isn't available"}</div>}
        {chapters.length > 0 && chapNow && (
          <div className="tl-chapter" title={chapNow.title}>{chapNow.title}</div>
        )}
        <p className="clip-hint">Scrub the Full Video Timeline to the moment you want. The clip starts there inside a locked 3-minute window. Drag the handles to set its length, up to 1:30.</p>
        {hasWindow() && (
          <div className="tl-block">
            <div className="tl-barlabel" aria-hidden="true">Full Video Timeline <span>({formatShort(tlDuration())})</span></div>
          <div ref={overRef} className="tl-bar tl-over" style={BAR_TOUCH} role="slider" aria-label={`Seek the video, 0 to ${formatShort(tlDuration())}.`} aria-valuemin={0} aria-valuemax={Math.round(tlDuration())} aria-valuenow={Math.round(playValue())} aria-valuetext={ariaTimeText(playValue())} tabIndex={0} onKeyDown={overKeyDown} onPointerDown={(e) => beginSeekPointer(e.clientX)}>
            <div className="tl-track" />
            {chapters.map((c, i) => (
              <div key={`ct${i}`} className="tl-ctick" style={{ left: `${overPct(c.t)}%` }} />
            ))}
            {renderPlayhead(overPct, true)}
            {renderBubble('over', overPct)}
            {seekTicks.map((k) => (
              <div key={`stk${k.t}`} className="tl-stick" style={{ left: `${overPct(k.t)}%` }} />
            ))}
            {seekTicks.map((k) => k.label && (
              <div key={`stl${k.t}`} className="tl-ticklabel is-below" style={{ left: `${overPct(k.t)}%` }} aria-hidden="true">
                {formatShort(k.t)}
              </div>
            ))}
            <div className="tl-ticklabel is-below is-first" style={{ left: '0%' }} aria-hidden="true">0:00</div>
            <div className="tl-ticklabel is-below is-last" style={{ left: '100%' }} aria-hidden="true">{formatShort(tlDuration())}</div>
          </div>
          </div>
        )}
          <div className="tl-block">
          <div className="tl-card">
            <div className="tl-cardhead">
              {hasWindow() ? '3-Minute Clipping Window' : 'Clipping Window'}
              {wordConfirm && (
                <span className="word-clipped-wrap" ref={clipInfoWrapRef}>
                  <button
                    type="button"
                    className={`word-clipped-tag${clipInfoOpen ? ' is-open' : ''}`}
                    onClick={() => setClipInfoOpen((v) => !v)}
                    aria-expanded={clipInfoOpen}
                    aria-label="About this word clip"
                  >
                    Word Clipped
                  </button>
                  {clipInfoOpen && (
                    <span className="word-clipped-pop" role="dialog" aria-label="About this word clip">
                      <span className="word-clipped-pop-title">Clip set with Word clipper.</span>
                      <span className="word-clipped-pop-text">You clip by sentences. The clip starts and ends with the sentences you chose.</span>
                    </span>
                  )}
                </span>
              )}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                <circle cx="12" cy="12" r="9.2" />
                <path d="M12 11v5.4" />
                <circle cx="12" cy="7.8" r="0.6" fill="currentColor" />
              </svg>
            </div>
          <div
            ref={detailRef}
           
            className="tl-bar tl-detail"
            style={BAR_TOUCH}
            role="group"
            aria-label="Clip range. Drag the start or end handle, or tap the bar to move the nearer handle."
            onPointerDown={(e) => beginDrag('detail', e.clientX)}
          >
            <div className="tl-track" />
            {hasWindow() && chapters.map((c, i) => (
              c.t >= winStart && c.t <= winStart + winSpan() && (
              <div key={`ct${i}`} className="tl-ctick" style={{ left: `${detailPct(c.t)}%` }} />
              )
            ))}
            {detailTicks.map((k) => (
              <div key={`tk${k.t}`} className="tl-tick" style={{ left: `${detailPct(k.t)}%` }} />
            ))}
            {renderTickLabels(detailPct)}
            {renderRange(detailPct, 8)}
            {renderMarkers(detailPct, 'detail')}
            <div
              className="tl-bracket"
              aria-hidden="true"
              style={{
                left: `${detailPct(Math.min(startSec, endSec))}%`,
                width: `${Math.max(0, Math.abs(detailPct(endSec) - detailPct(startSec)))}%`,
              }}
            />
          </div>
            <div className="tl-cardfoot">
              <span className={`tl-pill${wordConfirm ? ' tl-pill-flash' : ''}`}>
                <span className="tl-pill-ic" aria-hidden="true">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10.2 13.8a4.2 4.2 0 0 0 5.9 0l3-3a4.2 4.2 0 0 0-5.9-5.9l-1.1 1.1" />
                    <path d="M13.8 10.2a4.2 4.2 0 0 0-5.9 0l-3 3a4.2 4.2 0 0 0 5.9 5.9l1.1-1.1" />
                  </svg>
                </span>
                <span className="tl-pill-k">Clip</span>
                <span className="tl-pill-r">{formatShort(startSec)} – {formatShort(endSec)}</span>
                <span className="tl-pill-d">({formatShort(clipLen)})</span>
              </span>
            </div>
          </div>
          </div>
        {!hasWindow() && (
          <div className="tl-block">
            <div className="tl-barlabel" aria-hidden="true">Full Video Timeline <span>({formatShort(tlDuration())})</span></div>
          <div ref={overRef} className="tl-bar tl-over" style={BAR_TOUCH} role="slider" aria-label={`Seek the video, 0 to ${formatShort(tlDuration())}.`} aria-valuemin={0} aria-valuemax={Math.round(tlDuration())} aria-valuenow={Math.round(playValue())} aria-valuetext={ariaTimeText(playValue())} tabIndex={0} onKeyDown={overKeyDown} onPointerDown={(e) => beginSeekPointer(e.clientX)}>
            <div className="tl-track" />
            {chapters.map((c, i) => (
              <div key={`ct${i}`} className="tl-ctick" style={{ left: `${overPct(c.t)}%` }} />
            ))}
            {renderPlayhead(overPct, true)}
            {renderBubble('over', overPct)}
            {seekTicks.map((k) => (
              <div key={`stk${k.t}`} className="tl-stick" style={{ left: `${overPct(k.t)}%` }} />
            ))}
            {seekTicks.map((k) => k.label && (
              <div key={`stl${k.t}`} className="tl-ticklabel is-below" style={{ left: `${overPct(k.t)}%` }} aria-hidden="true">
                {formatShort(k.t)}
              </div>
            ))}
            <div className="tl-ticklabel is-below is-first" style={{ left: '0%' }} aria-hidden="true">0:00</div>
            <div className="tl-ticklabel is-below is-last" style={{ left: '100%' }} aria-hidden="true">{formatShort(tlDuration())}</div>
          </div>
          </div>
        )}
      </div>

      <div className="find-tiles">
        <button type="button" className="find-tile" onClick={openChapters} aria-haspopup="dialog" disabled={locked}>
          <span className="find-tile-icon" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="5" cy="6" r="1.6" fill="currentColor" />
              <circle cx="5" cy="12" r="1.6" fill="currentColor" />
              <circle cx="5" cy="18" r="1.6" fill="currentColor" />
              <path d="M10 6h11M10 12h11M10 18h11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </span>
          <span className="find-tile-text">
            <span className="find-tile-title">Chapters</span>
            <span className="find-tile-cap">Jump to a section</span>
          </span>
          {chaptersLoading
            ? <span className="find-spin" aria-hidden="true" />
            : chapters.length > 0 && <span className="find-count">{chapters.length}</span>}
          <svg className="find-chev" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <button type="button" className="find-tile" onClick={toggleWordClipper} disabled={locked}>
          <span className="find-tile-icon" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M4 6h9M4 10h7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <circle cx="15" cy="15" r="4.5" stroke="currentColor" strokeWidth="2" />
              <path d="M18.5 18.5 21 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </span>
          <span className="find-tile-text">
            <span className="find-tile-title">Word clipper</span>
            <span className="find-tile-cap">Find it by words</span>
          </span>
          <svg className="find-chev" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {chaptersOpen && (
        <div className={`chapter-sheet${sheetClosing ? ' is-closing' : ''}`} role="dialog" aria-modal="true" aria-label="Chapters">
          <div className="chapter-sheet-backdrop" onPointerDown={closeSheet} />
          <div className="chapter-sheet-panel">
            <div className="chapter-sheet-grip" aria-hidden="true" />
            <div className="chapter-sheet-head">
              <span className="chapter-sheet-title">Chapters</span>
              <button type="button" className="chapter-sheet-close" onClick={closeSheet} aria-label="Close chapters">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            {chaptersLoading ? (
              <p className="chapter-sheet-empty"><span className="find-spin" aria-hidden="true" /> Loading chapters…</p>
            ) : chapters.length === 0 ? (
              <p className="chapter-sheet-empty">No chapters in this video.</p>
            ) : (
              <>
            <input
              className="chapter-sheet-search"
              type="text"
              value={sheetSearch}
              onChange={(e) => setSheetSearch(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Escape') closeSheet();
              }}
              placeholder="Search chapters"
              aria-label="Search chapters"
              autoFocus
            />
            <div className="chapter-sheet-list" role="listbox" aria-label="Chapters">
              {sheetChapters.map((c, i) => {
                const isCur = currentChapter() && currentChapter().t === c.t;
                return (
                  <button
                    key={`${c.t}-${i}`}
                    type="button"
                    role="option"
                    aria-selected={isCur}
                    className={`tl-chapter-row${isCur ? ' is-current' : ''}`}
                   
                    onClick={() => pickChapter(c)}
                  >
                    <span className="tl-chapter-time">{formatShort(c.t)}</span>
                    <span className="tl-chapter-name">{c.title}</span>
                  </button>
                );
              })}
              {sheetChapters.length === 0 && <p className="chapter-sheet-empty">No matching chapters</p>}
            </div>
              </>
            )}
          </div>
        </div>
      )}

      <div className={`play-section${locked ? ' rec-lock' : ''}`}>
        <p className="play-title">How should it play?</p>
        <div className="play-seg" role="radiogroup" aria-label="How should it play?">
          <button
            type="button"
            role="radio"
            aria-checked={playMode === 'embed'}
            disabled={locked}
            className={`play-seg-btn${playMode === 'embed' ? ' is-selected' : ''}`}
           
            onClick={() => setPlayMode('embed')}
          >
            Embed clip
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={playMode === 'record'}
            disabled={locked}
            className={`play-seg-btn${playMode === 'record' ? ' is-selected' : ''}`}
           
            onClick={() => setPlayMode('record')}
          >
            Record clip
          </button>
        </div>
        <p className="play-help-line">
          {playMode === 'embed'
            ? 'Plays from YouTube. Posts right away.'
            : `Saves a video with sound. Takes ${formatShort(clipLen)}.`}
        </p>
      </div>

      {rec.state === 'error' && rec.error && (
        <div className="rec-banner" role="alert">
          <p className="rec-banner-text">{rec.error}</p>
          <div className="rec-banner-actions">
            <button type="button" className="rec-banner-btn" onClick={startRecording}>Try again</button>
            <button
              type="button"
              className="rec-banner-btn"
              onClick={useEmbedInstead}
            >
              Use embed instead
            </button>
          </div>
        </div>
      )}

      {rec.state !== 'recording' && (
        <div className="continue-sticky">
          <button
           
            onClick={canContinue ? handleContinue : startRecording}
            disabled={clipLen > MAX_CLIP || clipLen <= 0 || endSec <= startSec || !durKnown || isLive}
            className="btn-primary w-full"
          >
            {canContinue ? (<>Continue <span aria-hidden="true">→</span></>) : 'Record clip'}
          </button>
        </div>
      )}
    </div>
  );
}
