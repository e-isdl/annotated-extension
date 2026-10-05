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

const DETAIL_WIN = 120;

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
  const parts = str.split(':').map(Number);
  if (parts.some((n) => isNaN(n))) return NaN;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 1) return parts[0];
  return 0;
}

export default function YouTubeClipper({ pageInfo, onReady, published, embedRequest, resumeRange }) {
  const { data } = pageInfo;
  const [duration, setDuration] = useState(data.duration || 300);
  const [startSec, setStartSec] = useState(resumeRange?.start_sec ?? 0);
  const [endSec, setEndSec] = useState(resumeRange?.end_sec ?? Math.min(30, data.duration || 300));
  const [startInput, setStartInput] = useState(formatTime(resumeRange?.start_sec ?? 0));
  const [endInput, setEndInput] = useState(formatTime(resumeRange?.end_sec ?? Math.min(30, data.duration || 300)));
  const [ytTime, setYtTime] = useState(0);
  const [ytPaused, setYtPaused] = useState(true);
  const [ytAd, setYtAd] = useState(false);
  const [winStart, setWinStart] = useState(0);
  const [dragView, setDragView] = useState(null);
  const [dragVal, setDragVal] = useState(0);
  const [capFlash, setCapFlash] = useState(0);
  const [chapters, setChapters] = useState([]);
  const [chaptersOpen, setChaptersOpen] = useState(false);
  const [overW, setOverW] = useState(0);
  const [playMode, setPlayMode] = useState('embed');
  const [rec, setRec] = useState(IDLE_REC);
  const overRef = useRef(null);
  const detailRef = useRef(null);
  const dragRef = useRef(null);
  const ytTimeRef = useRef(0);
  const ytPausedRef = useRef(true);
  const ytAdRef = useRef(false);
  const wasPlayingRef = useRef(false);
  const lastSeekRef = useRef(0);
  const winStartRef = useRef(0);
  const easeRafRef = useRef(null);
  const portRef = useRef(null);
  const [wordClipperOpen, setWordClipperOpen] = useState(false);
  const [segments, setSegments] = useState(null);
  const [wordLoading, setWordLoading] = useState(false);
  const [wordError, setWordError] = useState('');
  const [wordStart, setWordStart] = useState(0);
  const [wordEnd, setWordEnd] = useState(0);
  const [draggingWord, setDraggingWord] = useState(null);
  const wordAreaRef = useRef(null);
  const durationRef = useRef(0);
  durationRef.current = duration;
  const timesTouchedRef = useRef(false);
  const wordClipUsedRef = useRef(false);

  const syncStartToVideoTime = (dur) => {
    if (timesTouchedRef.current) return;
    try {
      chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
        if (!tab?.id || timesTouchedRef.current) return;
        chrome.tabs.sendMessage(tab.id, { type: 'VIDEO_TIME' }, (res) => {
          if (!res || !res.ok || typeof res.time !== 'number') return;
          if (timesTouchedRef.current) return;
          const safeDur = dur > 0 ? dur : 300;
          const t = Math.floor(res.time);
          if (!(t >= 0)) return;
          const s = Math.max(0, Math.min(t, Math.max(0, safeDur - 1)));
          const e = Math.min(s + 30, safeDur);
          if (!(e > s)) return;
          setStartSec(s);
          setStartInput(formatTime(s));
          setEndSec(e);
          setEndInput(formatTime(e));
        }).catch(() => {});
      });
    } catch (e) {}
  };

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
      syncStartToVideoTime(data.duration);
      return;
    }
    fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${data.videoId}&format=json`)
      .then((r) => r.json())
      .then(() => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (!tabs[0]?.id) return;
          chrome.scripting.executeScript({
            target: { tabId: tabs[0].id },
            func: () => {
              const v = document.querySelector('video');
              return v ? Math.floor(v.duration) : null;
            },
          }, (results) => {
            const d = results?.[0]?.result;
            if (d && d > 0) {
              setDuration(d);
              syncStartToVideoTime(d);
            }
          });
        });
      })
      .catch(() => {});
  }, [data.videoId, data.duration]);

  useEffect(() => {
    if (!resumeRange) return;
    const s = Math.max(0, resumeRange.start_sec ?? 0);
    const e = resumeRange.end_sec ?? Math.min(30, data.duration || 300);
    if (!(e > s)) return;
    setStartSec(s);
    setEndSec(e);
    setStartInput(formatTime(s));
    setEndInput(formatTime(e));
  }, [resumeRange]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible') syncStartToVideoTime(durationRef.current || 0);
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  useEffect(() => {
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
    let res = null;
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        res = await chrome.tabs.sendMessage(tab.id, { type: 'record-clip', start: startSec, end: endSec });
      }
    } catch (e) {
      res = null;
    }
    if (!res?.ok) {
      setRec({
        ...IDLE_REC,
        state: 'error',
        error: (res && res.message) || 'Open a YouTube video to record a clip.',
      });
    }
  };

  const loadChapters = async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return;
      try {
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
      } catch (e) {}
      const res = await chrome.tabs.sendMessage(tab.id, { type: 'YT_CHAPTERS' }).catch(() => null);
      if (res && res.ok && Array.isArray(res.chapters)) setChapters(res.chapters);
    } catch (e) {}
  };

  useEffect(() => {
    setChapters([]);
    setChaptersOpen(false);
    loadChapters();
  }, [data.videoId]);

  useEffect(() => {
    const measure = () => {
      if (overRef.current) setOverW(overRef.current.clientWidth || 0);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  useEffect(() => {
    const maxStart = Math.max(0, tlDuration() - DETAIL_WIN);
    const ws = Math.max(0, Math.min(Math.round(startSec - DETAIL_WIN / 2), maxStart));
    winStartRef.current = ws;
    setWinStart(ws);
  }, []);

  const toggleChapters = () => {
    if (!chapters.length) return;
    setChaptersOpen((v) => !v);
  };

  const pickChapter = (ch) => {
    if (locked || ytAdRef.current) return;
    ytSeek(Math.round(ch.t));
    setChaptersOpen(false);
  };

  const currentChapter = () => {
    let cur = null;
    const pos = playValue() + 0.5;
    chapters.forEach((c) => { if (c.t <= pos && (!cur || c.t > cur.t)) cur = c; });
    return cur;
  };

  const [previewPlaying, setPreviewPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
        if (!tab?.id) return;
        chrome.tabs.sendMessage(tab.id, { type: 'YT_STATE', end: endSec }, (res) => {
          if (!res || !res.ok) return;
          if (!dragRef.current && typeof res.time === 'number') {
            ytTimeRef.current = res.time;
            setYtTime(res.time);
            setCurrentTime(res.time);
          }
          if (typeof res.paused === 'boolean') {
            ytPausedRef.current = res.paused;
            setYtPaused(res.paused);
            setPreviewPlaying(!res.paused);
          }
          if (typeof res.duration === 'number' && res.duration > 0) {
            const d = Math.floor(res.duration);
            setDuration((prev) => (prev !== d ? d : prev));
          }
          const ad = !!res.ad;
          ytAdRef.current = ad;
          setYtAd((prev) => (prev === ad ? prev : ad));
        }).catch(() => {});
      });
    }, 250);
    return () => clearInterval(id);
  }, [endSec]);

  const sendToTab = (message, onResponse) => {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (!tab?.id) return;
      chrome.tabs.sendMessage(tab.id, message, (res) => {
        if (onResponse) onResponse(res);
      }).catch(() => {});
    });
  };

  const togglePlay = () => {
    sendToTab({ type: 'PLAY_FROM', start: startSec, end: endSec, action: 'toggle' }, (res) => {
      if (res && typeof res.playing === 'boolean') {
        setPreviewPlaying(res.playing);
        if (res.ok && typeof res.time === 'number') setCurrentTime(res.time);
      }
    });
  };

  const replayClip = () => {
    sendToTab({ type: 'PLAY_FROM', start: startSec, end: endSec, action: 'replay' });
  };

  const cancelRecording = async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) await chrome.tabs.sendMessage(tab.id, { type: 'cancel-recording' });
    } catch (e) {}
  };

  const useEmbedInstead = () => {
    setPlayMode('embed');
    setRec(IDLE_REC);
  };

  const reRecord = () => {
    setRec(IDLE_REC);
    setPlayMode('record');
  };

  const clipLen = endSec - startSec;

  const updateStart = (sec) => {
    timesTouchedRef.current = true;
    wordClipUsedRef.current = false;
    const clamped = Math.max(0, Math.min(sec, endSec - 1));
    setStartSec(clamped);
    setStartInput(formatTime(clamped));
    return clamped;
  };

  const updateEnd = (sec) => {
    timesTouchedRef.current = true;
    wordClipUsedRef.current = false;
    const clamped = Math.min(duration, Math.max(sec, startSec + 1));
    setEndSec(clamped);
    setEndInput(formatTime(clamped));
    return clamped;
  };

  const handleStartInput = (val) => {
    timesTouchedRef.current = true;
    wordClipUsedRef.current = false;
    setStartInput(val);
    const sec = parseTime(val);
    if (!isNaN(sec) && sec >= 0 && sec < endSec) setStartSec(sec);
  };

  const handleEndInput = (val) => {
    timesTouchedRef.current = true;
    wordClipUsedRef.current = false;
    setEndInput(val);
    const sec = parseTime(val);
    if (!isNaN(sec) && sec > startSec && sec <= duration) setEndSec(sec);
  };

  const handleContinue = () => {
    if (endSec <= startSec || clipLen <= 0 || clipLen > 90) return;
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

  const findMatches = useMemo(() => {
    const q = findQuery.trim().toLowerCase();
    if (!q) return [];
    const out = [];
    words.forEach((w, i) => {
      if (w.text.toLowerCase().includes(q)) out.push(i);
    });
    return out;
  }, [words, findQuery]);

  const findSet = useMemo(() => new Set(findMatches), [findMatches]);
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
  const skipDeriveRef = useRef(false);  wordStateRef.current = {
    draggingWord, wordStart, wordEnd, words, startSec, endSec, duration,
    setWordStart, setWordEnd, setStartSec, setEndSec, setStartInput, setEndInput,
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

  useLayoutEffect(() => {
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
  });

  const onWordDoubleClick = useCallback((index) => {
    wordScrollArmedRef.current = false;
    wordClipUsedRef.current = true;
    const s = wordStateRef.current;
    if (!s.words.length) return;
    const w = s.words[index];
    if (!w || w.start >= s.duration) return;
    const ei = Math.min(index + 1, s.words.length - 1);
    const t = Math.max(0, w.start);
    let e = Math.min(s.words[ei].end, s.duration);
    if (e <= t) return;
    skipDeriveRef.current = true;
    s.setWordStart(index);
    s.setWordEnd(ei);
    s.setStartSec(t);
    s.setStartInput(formatTime(t));
    s.setEndSec(e);
    s.setEndInput(formatTime(e));
    timesTouchedRef.current = true;
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
          skipDeriveRef.current = true;
          s.setWordStart(best);
          s.setStartSec(t);
          s.setStartInput(formatTime(t));
          timesTouchedRef.current = true;
        } else {
          if (best < s.wordStart) return;
          const t = Math.min(s.words[best].end, s.duration);
          skipDeriveRef.current = true;
          s.setWordEnd(best);
          s.setEndSec(t);
          s.setEndInput(formatTime(t));
          timesTouchedRef.current = true;
        }
      });
    };
    const up = () => {
      if (wordRafRef.current) { cancelAnimationFrame(wordRafRef.current); wordRafRef.current = 0; }
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
      setWordClipperOpen(false);
      setFindQuery('');
      setFindIndex(0);
      return;
    }
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
    setWordClipperOpen(false);
  };

  const canContinue = rec.state === 'done' || playMode === 'embed';
  const locked = rec.state === 'recording' || rec.state === 'done';

  const tlDuration = () => Math.max(1, duration || 0);
  const effOverW = overW > 0 ? overW : 360;
  const showDetail = tlDuration() / effOverW > 0.5;

  const ytSend = (message) => {
    try {
      chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
        if (!tab?.id) return;
        chrome.tabs.sendMessage(tab.id, message, () => {}).catch(() => {});
      });
    } catch (e) {}
  };

  const ytSeek = (t) => {
    if (ytAdRef.current) return false;
    ytSend({ type: 'YT_SEEK', time: Math.max(0, Math.round(t)) });
    return true;
  };

  const applyTimes = (s, e) => {
    const D = tlDuration();
    const cs = Math.max(0, Math.min(Math.round(s), D));
    const ce = Math.max(cs + 1, Math.min(Math.round(e), D));
    if (!(ce > cs)) return null;
    timesTouchedRef.current = true;
    wordClipUsedRef.current = false;
    setStartSec(cs);
    setStartInput(formatTime(cs));
    setEndSec(ce);
    setEndInput(formatTime(ce));
    return [cs, ce];
  };

  const clampStartDrag = (t) => {
    const lo = Math.max(0, endSec - 90);
    return Math.min(Math.max(Math.round(t), lo), endSec - 1);
  };

  const clampEndDrag = (t) => {
    const hi = Math.min(tlDuration(), startSec + 90);
    return Math.max(Math.min(Math.round(t), hi), startSec + 1);
  };

  const flashCap = () => setCapFlash((n) => n + 1);

  const stampStart = () => {
    const t = Math.round(ytTimeRef.current);
    if (t >= endSec || endSec - t > 90) {
      const e2 = Math.min(tlDuration(), t + 30);
      if (!(e2 > t)) return null;
      return applyTimes(t, e2);
    }
    return applyTimes(t, endSec);
  };

  const stampEnd = () => {
    const t = Math.round(ytTimeRef.current);
    if (t <= startSec || t - startSec > 90) {
      const s2 = Math.max(0, t - 30);
      if (!(t > s2)) return null;
      return applyTimes(s2, t);
    }
    return applyTimes(startSec, t);
  };

  // Window recentering always eases (see easeWinTo); no instant version remains.

  const nudgeStart = (d) => {
    if (locked || ytAdRef.current) return;
    const s = updateStart(startSec + d);
    ytSeek(s);
  };

  const nudgeEnd = (d) => {
    if (locked || ytAdRef.current) return;
    const e = updateEnd(endSec + d);
    ytSeek(e);
  };

  const easeWinTo = (pos) => {
    const D = tlDuration();
    const clamped = Math.max(0, Math.min(Math.round(pos - DETAIL_WIN / 2), Math.max(0, D - DETAIL_WIN)));
    const from = winStartRef.current;
    if (from === clamped) return;
    if (easeRafRef.current) cancelAnimationFrame(easeRafRef.current);
    const t0 = performance.now();
    const tick = (now) => {
      const k = Math.min(1, (now - t0) / 150);
      const e = 1 - Math.pow(1 - k, 2);
      const ws = Math.round(from + (clamped - from) * e);
      winStartRef.current = ws;
      setWinStart(ws);
      if (k < 1) easeRafRef.current = requestAnimationFrame(tick);
      else easeRafRef.current = null;
    };
    easeRafRef.current = requestAnimationFrame(tick);
  };

  const detailHandleAt = (xPx, width) => {
    const w = Math.max(1, width);
    const inWin = (t) => t >= winStart && t <= winStart + DETAIL_WIN;
    const px = (t) => ((t - winStart) / DETAIL_WIN) * w;
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
    const w = Math.max(1, rect.width);
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    if (bar === 'over') return Math.round((x / w) * tlDuration());
    return Math.round(winStartRef.current + (x / w) * DETAIL_WIN);
  };

  const seekThrottled = (t) => {
    const now = Date.now();
    if (now - lastSeekRef.current < 150) return;
    lastSeekRef.current = now;
    ytSeek(t);
  };

  const applyDragValue = (kind, t) => {
    const D = tlDuration();
    const c = Math.max(0, Math.min(Math.round(t), D));
    if (kind === 'playhead') {
      setDragVal(c);
      seekThrottled(c);
      return c;
    }
    if (kind === 'start') {
      if (endSec - c > 90) flashCap();
      const s = clampStartDrag(c);
      updateStart(s);
      setDragVal(s);
      seekThrottled(s);
      return s;
    }
    if (c - startSec > 90) flashCap();
    const e = clampEndDrag(c);
    updateEnd(e);
    setDragVal(e);
    seekThrottled(e);
    return e;
  };

  const beginDrag = (bar, clientX, jump, grabKind) => {
    if (ytAdRef.current || locked) return;
    if (easeRafRef.current) { cancelAnimationFrame(easeRafRef.current); easeRafRef.current = null; }
    const el = bar === 'over' ? overRef.current : detailRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const wasPlaying = !ytPausedRef.current;
    if (wasPlaying) ytSend({ type: 'YT_PAUSE' });
    wasPlayingRef.current = wasPlaying;
    let kind = 'playhead';
    if (bar === 'detail' && grabKind) kind = grabKind;
    else if (bar === 'detail') kind = detailHandleAt(clientX - rect.left, rect.width) || 'playhead';
    dragRef.current = { kind, bar, el, lastX: clientX, value: 0 };
    if (jump !== false) {
      dragRef.current.value = applyDragValue(kind, xToSec(bar, clientX, rect));
    } else if (kind === 'playhead') {
      dragRef.current.value = Math.round(ytTimeRef.current);
      setDragVal(dragRef.current.value);
    } else {
      const v = kind === 'start' ? startSec : endSec;
      dragRef.current.value = v;
      setDragVal(v);
    }
    setDragView({ kind, bar });
    const onMove = (e) => {
      const d = dragRef.current;
      if (!d || !d.el) return;
      const r = d.el.getBoundingClientRect();
      d.lastX = e.clientX;
      d.value = applyDragValue(d.kind, xToSec(d.bar, e.clientX, r));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      window.removeEventListener('blur', onUp);
      const d = dragRef.current;
      dragRef.current = null;
      setDragView(null);
      setDragVal(0);
      if (!d) return;
      if (typeof d.value === 'number') ytSeek(d.value);
      if (wasPlayingRef.current) {
        wasPlayingRef.current = false;
        ytSend({ type: 'YT_RESUME' });
      }
      const lo = winStartRef.current + 0.2 * DETAIL_WIN;
      const hi = winStartRef.current + 0.8 * DETAIL_WIN;
      if (d.value < lo || d.value > hi) easeWinTo(d.value);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    window.addEventListener('blur', onUp);
  };

  const overPct = (t) => Math.max(0, Math.min(100, (t / tlDuration()) * 100));

  const detailPct = (t) => {
    return Math.max(0, Math.min(100, ((t - winStart) / DETAIL_WIN) * 100));
  };

  const markerValue = (which) => {
    if (dragView && dragView.kind === which) return dragVal;
    return which === 'start' ? startSec : endSec;
  };

  const playValue = () => (dragView && dragView.kind === 'playhead' ? dragVal : ytTime);

  const markerKeyDown = (which) => (e) => {
    if (locked || ytAdRef.current) return;
    const step = e.shiftKey ? 5 : 1;
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    const dir = (e.key === 'ArrowLeft' || e.key === 'ArrowDown') ? -1 : 1;
    const cur = which === 'start' ? startSec : endSec;
    const t = cur + dir * step;
    if (which === 'start') {
      if ((endSec - t) > 90) flashCap();
      ytSeek(updateStart(clampStartDrag(t)));
    } else {
      if ((t - startSec) > 90) flashCap();
      ytSeek(updateEnd(clampEndDrag(t)));
    }
  };

  const inDetailWin = (t) => t >= winStart && t <= winStart + DETAIL_WIN;

  const renderMarkers = (pctFn) => {
    const sPos = dragView && dragView.kind === 'start' ? dragVal : startSec;
    const ePos = dragView && dragView.kind === 'end' ? dragVal : endSec;
    const mk = (which, pos) => {
      if (!inDetailWin(pos)) return null;
      return (
        <div
          key={which}
          className={`tl-marker is-${which}`}
          style={{ left: `${pctFn(pos)}%` }}
          role="slider"
          tabIndex={0}
          aria-label={which === 'start' ? 'Start time' : 'End time'}
          aria-valuemin={0}
          aria-valuemax={Math.round(tlDuration())}
          aria-valuenow={Math.round(pos)}
          aria-valuetext={formatTime(pos)}
          onPointerDown={(e) => { e.stopPropagation(); beginDrag('detail', e.clientX, false, which); }}
          onKeyDown={markerKeyDown(which)}
        >
          <span className="tl-marker-line" aria-hidden="true" />
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
    const p = dragView && dragView.kind === 'playhead' ? dragVal : ytTime;
    return <div className={`tl-play${small ? ' is-dot' : ''}`} style={{ left: `${pctFn(p)}%` }} />;
  };

  const renderBubble = (bar, pctFn) => {
    if (!dragView || dragView.bar !== bar) return null;
    const pct = Math.max(4, Math.min(96, pctFn(dragVal)));
    return <div className="tl-bubble" style={{ left: `${pct}%` }}>{formatShort(dragVal)}</div>;
  };

  const chapNow = currentChapter();
  const detailTicks = [];
  if (showDetail) {
    const D = tlDuration();
    const first = Math.ceil(winStart / 10) * 10;
    for (let t = first; t <= Math.min(winStart + DETAIL_WIN, D); t += 10) {
      detailTicks.push({ t, label: t % 30 === 0 });
    }
  }
  const edgeChips = (() => {
    if (!showDetail) return [];
    const out = [];
    const sIn = startSec >= winStart && startSec <= winStart + DETAIL_WIN;
    const eIn = endSec >= winStart && endSec <= winStart + DETAIL_WIN;
    if (sIn && eIn) return out;
    const sSide = startSec < winStart ? 'left' : 'right';
    const eSide = endSec < winStart ? 'left' : 'right';
    if (!sIn && !eIn && sSide === eSide) {
      const useStart = sSide === 'left' ? startSec >= endSec : startSec <= endSec;
      const t = useStart ? startSec : endSec;
      out.push({ side: sSide, t });
      return out;
    }
    if (!sIn) out.push({ side: sSide, t: startSec });
    if (!eIn) out.push({ side: eSide, t: endSec });
    return out;
  })();

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
                  <span>{formatShort(words[wordStart]?.start ?? startSec)} – {formatShort(words[wordEnd]?.end ?? endSec)}</span>
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
          <span className="play-clip-time">{formatShort(dragView && dragView.kind === 'playhead' ? dragVal : ytTime)} / {formatShort(duration)}</span>
        </div>
      )}

      <div className={`tl-group${ytAd ? ' is-disabled' : ''}${locked ? ' rec-lock' : ''}`}>
        {ytAd && <div className="tl-ad" role="status">Ad playing</div>}
        {chapters.length > 0 && chapNow && (
          <div className="tl-chapter" title={chapNow.title}>{chapNow.title}</div>
        )}
        <div ref={overRef} className="tl-bar tl-over" onPointerDown={(e) => beginDrag('over', e.clientX)}>
          <div className="tl-track" />
          {chapters.map((c, i) => (
            <div key={`ct${i}`} className="tl-ctick" style={{ left: `${overPct(c.t)}%` }} />
          ))}
          {showDetail && (
            <div className="tl-window" style={{ left: `${overPct(winStart)}%`, width: `${Math.max(0, overPct(winStart + DETAIL_WIN) - overPct(winStart))}%` }} />
          )}
          {renderRange(overPct, 6)}
          {renderPlayhead(overPct, true)}
          {renderBubble('over', overPct)}
        </div>
        {showDetail && (
          <div ref={detailRef} className="tl-bar tl-detail" onPointerDown={(e) => beginDrag('detail', e.clientX)}>
            <div className="tl-track" />
            {detailTicks.map((k) => (
              <div key={`tk${k.t}`} className="tl-tick" style={{ left: `${detailPct(k.t)}%` }} />
            ))}
            {detailTicks.map((k) => k.label && (
              <div key={`tl${k.t}`} className="tl-ticklabel" style={{ left: `${detailPct(k.t)}%` }}>{formatShort(k.t)}</div>
            ))}
            {renderRange(detailPct, 8)}
            {renderMarkers(detailPct)}
            {renderPlayhead(detailPct, false)}
            {renderBubble('detail', detailPct)}
            {edgeChips.map((chip) => (
              <button
                key={`${chip.side}-${chip.t}`}
                type="button"
                className={`tl-edgechip is-${chip.side}`}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); ytSeek(chip.t); }}
                aria-label={`Move playhead to ${formatTime(chip.t)}`}
              >
                {chip.side === 'left' ? `< ${formatShort(chip.t)}` : `${formatShort(chip.t)} >`}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className={`time-cards${locked ? ' rec-lock' : ''}`}>
        <div className="time-card">
          <div className="time-card-top">
            <span className="time-card-label">Start</span>
            <button type="button" className="set-btn" disabled={locked || ytAd} onClick={() => stampStart()}>Set start</button>
          </div>
          <div className="time-card-bottom">
            <input
              type="text"
              className="time-input"
              value={startInput}
              onChange={(e) => handleStartInput(e.target.value)}
              onBlur={() => setStartInput(formatTime(startSec))}
              placeholder="0:00:00"
              aria-label="Start time"
            />
            <button type="button" className="nudge-sm" disabled={locked || ytAd} onClick={() => nudgeStart(-5)} aria-label="Back 5 seconds">-5s</button>
            <button type="button" className="nudge-sm" disabled={locked || ytAd} onClick={() => nudgeStart(5)} aria-label="Forward 5 seconds">+5s</button>
          </div>
        </div>
        <div className="time-card">
          <div className="time-card-top">
            <span className="time-card-label">End</span>
            <button type="button" className="set-btn" disabled={locked || ytAd} onClick={() => stampEnd()}>Set end</button>
          </div>
          <div className="time-card-bottom">
            <input
              type="text"
              className="time-input"
              value={endInput}
              onChange={(e) => handleEndInput(e.target.value)}
              onBlur={() => setEndInput(formatTime(endSec))}
              placeholder="0:00:30"
              aria-label="End time"
            />
            <button type="button" className="nudge-sm" disabled={locked || ytAd} onClick={() => nudgeEnd(-5)} aria-label="Back 5 seconds">-5s</button>
            <button type="button" className="nudge-sm" disabled={locked || ytAd} onClick={() => nudgeEnd(5)} aria-label="Forward 5 seconds">+5s</button>
          </div>
        </div>
      </div>

      <div className="word-toggle-row">
        <button type="button" className="btn-ghost word-clipper-toggle" onClick={toggleChapters} disabled={!chapters.length} title={chapters.length ? 'Jump to a chapter' : 'No chapters'}>
          Chapters{chapters.length ? ` (${chapters.length})` : ''}
        </button>
        <button type="button" className="btn-ghost word-clipper-toggle" onClick={toggleWordClipper}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M4 6h16M4 12h16M4 18h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          Open word clipper
        </button>
      </div>

      {chaptersOpen && chapters.length > 0 && (
        <div className="tl-chapters" role="listbox" aria-label="Chapters">
          {chapters.map((c, i) => {
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
        </div>
      )}

      <div className="length-row">
        <span className={clipLen > 90 ? 'over' : ''}>Clip length {formatLength(clipLen)}</span>
        <span key={capFlash} className={`max${capFlash ? ' flash' : ''}`}>Max 1:30</span>
      </div>

      <div className={`play-section${locked ? ' rec-lock' : ''}`}>
        <p className="play-title">How should it play?</p>
        <div className="play-options" role="radiogroup" aria-label="How should it play?">
          <button
            type="button"
            role="radio"
            aria-checked={playMode === 'embed'}
            className={`play-card${playMode === 'embed' ? ' is-selected' : ''}`}
            onClick={() => setPlayMode('embed')}
          >
            <span className="play-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
                <path d="M10 8.5v7l5.5-3.5L10 8.5Z" fill="currentColor" />
              </svg>
            </span>
            <span className="play-text">
              <span className="play-card-title">Embed clip</span>
              <span className="play-help">Plays from YouTube. Posts right away.</span>
            </span>
            <span className="play-radio" aria-hidden="true" />
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={playMode === 'record'}
            className={`play-card${playMode === 'record' ? ' is-selected' : ''}`}
            onClick={() => setPlayMode('record')}
          >
            <span className="play-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
                <circle cx="12" cy="12" r="4" fill="currentColor" />
              </svg>
            </span>
            <span className="play-text">
              <span className="play-card-title">Record clip</span>
              <span className="play-help">Saves a video with sound. Takes {formatLength(clipLen)}.</span>
            </span>
            <span className="play-radio" aria-hidden="true" />
          </button>
        </div>
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
            disabled={clipLen > 90 || clipLen <= 0 || endSec <= startSec}
            className="btn-primary w-full"
          >
            {canContinue ? 'Continue' : 'Record clip'}
          </button>
        </div>
      )}
    </div>
  );
}
