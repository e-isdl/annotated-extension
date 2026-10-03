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

const IDLE_REC = { state: 'idle', t: 0, error: null, blob: null, mime: null, url: null };

const WordSpan = memo(function WordSpan({ w, selected, showStartHandle, showEndHandle, draggingWord, onHandleEvent }) {
  return (
    <span>
      {showStartHandle && (
        <span
          className={`word-handle${draggingWord === 'start' ? ' dragging' : ''}`}
          onPointerDown={(e) => onHandleEvent('start', 'down', e)}
          onPointerMove={(e) => onHandleEvent('start', 'move', e)}
          onPointerUp={(e) => onHandleEvent('start', 'up', e)}
          onPointerCancel={(e) => onHandleEvent('start', 'up', e)}
        />
      )}
      <span className={selected ? 'word is-selected' : 'word'}>{w.text} </span>
      {showEndHandle && (
        <span
          className={`word-handle${draggingWord === 'end' ? ' dragging' : ''}`}
          onPointerDown={(e) => onHandleEvent('end', 'down', e)}
          onPointerMove={(e) => onHandleEvent('end', 'move', e)}
          onPointerUp={(e) => onHandleEvent('end', 'up', e)}
          onPointerCancel={(e) => onHandleEvent('end', 'up', e)}
        />
      )}
    </span>
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

export default function YouTubeClipper({ pageInfo, onReady, published, embedRequest }) {
  const { data } = pageInfo;
  const [duration, setDuration] = useState(data.duration || 300);
  const [startSec, setStartSec] = useState(0);
  const [endSec, setEndSec] = useState(Math.min(30, data.duration || 300));
  const [startInput, setStartInput] = useState('0:00:00');
  const [endInput, setEndInput] = useState('0:00:30');
  const [dragging, setDragging] = useState(null);
  const [playMode, setPlayMode] = useState('embed');
  const [rec, setRec] = useState(IDLE_REC);
  const trackRef = useRef(null);
  const portRef = useRef(null);
  const [wordClipperOpen, setWordClipperOpen] = useState(false);
  const [segments, setSegments] = useState(null);
  const [wordLoading, setWordLoading] = useState(false);
  const [wordError, setWordError] = useState('');
  const [wordStart, setWordStart] = useState(0);
  const [wordEnd, setWordEnd] = useState(0);
  const [draggingWord, setDraggingWord] = useState(null);
  const wordAreaRef = useRef(null);

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
      setEndSec(Math.min(30, data.duration));
      setStartInput(formatTime(0));
      setEndInput(formatTime(Math.min(30, data.duration)));
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
              setEndSec(Math.min(30, d));
              setEndInput(formatTime(Math.min(30, d)));
            }
          });
        });
      })
      .catch(() => {});
  }, [data.videoId, data.duration]);

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
            parts.push(bytes);
          } catch (e) {}
        } else if (msg.type === 'done') {
          finished = true;
          const mime = msg.mime || 'video/webm';
          const blob = new Blob(parts, { type: mime });
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

  const [previewPlaying, setPreviewPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
        if (!tab?.id) return;
        chrome.tabs.sendMessage(tab.id, { type: 'VIDEO_TIME', end: endSec }, (res) => {
          if (res && res.ok) {
            setCurrentTime(res.time);
            setPreviewPlaying(!res.paused);
          }
        }).catch(() => {});
      });
    }, 500);
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
    const clamped = Math.max(0, Math.min(sec, endSec - 1));
    setStartSec(clamped);
    setStartInput(formatTime(clamped));
  };

  const updateEnd = (sec) => {
    const clamped = Math.min(duration, Math.max(sec, startSec + 1));
    setEndSec(clamped);
    setEndInput(formatTime(clamped));
  };

  const handleStartInput = (val) => {
    setStartInput(val);
    const sec = parseTime(val);
    if (!isNaN(sec) && sec >= 0 && sec < endSec) setStartSec(sec);
  };

  const handleEndInput = (val) => {
    setEndInput(val);
    const sec = parseTime(val);
    if (!isNaN(sec) && sec > startSec && sec <= duration) setEndSec(sec);
  };

  const handleContinue = () => {
    if (endSec <= startSec || clipLen <= 0 || clipLen > 90) return;
    onReady({
      source_url: pageInfo.url,
      source_type: 'youtube',
      title: data.title,
      youtube_id: data.videoId,
      start_sec: startSec,
      end_sec: endSec,
      duration: duration || null,
      thumbnail: `https://img.youtube.com/vi/${data.videoId}/hqdefault.jpg`,
      ...(playMode === 'record' && rec.blob
        ? { recorded_clip: { blob: rec.blob, mime: rec.mime, seconds: rec.t } }
        : {}),
    });
  };

  const words = useMemo(() => {
    if (!segments?.length) return [];
    const SENTENCE_END = /[.!?]["')\]]*$/;
    let from = segments.findIndex((s) => s.end > startSec);
    if (from === -1) from = segments.length - 1;
    let to = -1;
    segments.forEach((s, i) => { if (s.start < endSec) to = i; });
    if (to === -1) to = 0;
    while (from > 0 && !SENTENCE_END.test(String(segments[from - 1]?.text || '').trim())) from -= 1;
    while (to < segments.length - 1 && !SENTENCE_END.test(String(segments[to]?.text || '').trim())) to += 1;
    const segs = segments.slice(from, to + 1);
    const out = [];
    segs.forEach((seg) => {
      const cleaned = cleanTranscript(seg.text);
      const parts = cleaned.trim().split(/\s+/).filter(Boolean);
      const span = Math.max(0.001, seg.end - seg.start);
      parts.forEach((text, i) => {
        out.push({
          text,
          start: seg.start + (span * i) / parts.length,
          end: seg.start + (span * (i + 1)) / parts.length,
        });
      });
    });
    return out;
  }, [segments, startSec, endSec]);

  useLayoutEffect(() => {
    if (!words.length) return;
    let s = words.findIndex((w) => w.end > startSec);
    if (s === -1) s = words.length - 1;
    let e = -1;
    words.forEach((w, i) => { if (w.start < endSec) e = i; });
    if (e === -1) e = 0;
    setWordStart(s);
    setWordEnd(e);
  }, [words, startSec, endSec]);

  const wordStateRef = useRef(null);
  wordStateRef.current = {
    draggingWord, wordStart, wordEnd, words, updateStart, updateEnd, setWordStart, setWordEnd,
  };
  const wordRectsRef = useRef(null);
  const wordRafRef = useRef(0);
  const wordPendingXRef = useRef(0);

  const onWordHandleEvent = useCallback((which, phase, e) => {
    const st = wordStateRef.current;
    if (phase === 'down') {
      e.preventDefault();
      e.stopPropagation();
      setDraggingWord(which);
      const area = wordAreaRef.current;
      if (area) {
        const els = area.querySelectorAll('[data-word-index]');
        const rects = [];
        els.forEach((el) => {
          const r = el.getBoundingClientRect();
          rects.push(r.left + r.width / 2);
        });
        wordRectsRef.current = rects;
      }
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) {}
      return;
    }
    if (phase === 'up') {
      setDraggingWord(null);
      wordRectsRef.current = null;
      if (wordRafRef.current) {
        cancelAnimationFrame(wordRafRef.current);
        wordRafRef.current = 0;
      }
      return;
    }
    if (!st.draggingWord) return;
    wordPendingXRef.current = e.clientX;
    if (wordRafRef.current) return;
    wordRafRef.current = requestAnimationFrame(() => {
      wordRafRef.current = 0;
      const rects = wordRectsRef.current;
      if (!rects || !rects.length) return;
      const x = wordPendingXRef.current;
      let best = 0;
      let bestDist = Infinity;
      for (let i = 0; i < rects.length; i++) {
        const d = Math.abs(x - rects[i]);
        if (d < bestDist) { bestDist = d; best = i; }
      }
      const s = wordStateRef.current;
      if (s.draggingWord === 'start') {
        const clamped = Math.min(best, s.wordEnd);
        s.setWordStart(clamped);
        s.updateStart(s.words[clamped].start);
      } else {
        const clamped = Math.max(best, s.wordStart);
        s.setWordEnd(clamped);
        s.updateEnd(s.words[clamped].end);
      }
    });
  }, []);

  const toggleWordClipper = async () => {
    if (wordClipperOpen) {
      setWordClipperOpen(false);
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

  const canContinue = rec.state === 'done' || playMode === 'embed';
  const locked = rec.state === 'recording' || rec.state === 'done';

  const startPct = (startSec / duration) * 100;
  const endPct = (endSec / duration) * 100;

  const secFromClientX = (clientX) => {
    const el = trackRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const pct = rect.width > 0 ? (clientX - rect.left) / rect.width : 0;
    return Math.min(duration, Math.max(0, pct * duration));
  };

  const applyDrag = (which, sec) => {
    if (which === 'start') updateStart(Math.round(Math.min(sec, endSec - 1)));
    else updateEnd(Math.round(Math.max(sec, startSec + 1)));
  };

  const onTrackPointerDown = (e) => {
    const sec = secFromClientX(e.clientX);
    const which = Math.abs(sec - startSec) <= Math.abs(sec - endSec) ? 'start' : 'end';
    setDragging(which);
    e.currentTarget.setPointerCapture(e.pointerId);
    applyDrag(which, sec);
  };

  const onHandlePointerDown = (which) => (e) => {
    e.stopPropagation();
    setDragging(which);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onTrackPointerMove = (e) => {
    if (!dragging) return;
    applyDrag(dragging, secFromClientX(e.clientX));
  };

  const onTrackPointerUp = () => setDragging(null);

  const onHandleKeyDown = (which) => (e) => {
    const step = e.shiftKey ? 5 : 1;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      if (which === 'start') updateStart(startSec - step); else updateEnd(endSec - step);
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (which === 'start') updateStart(startSec + step); else updateEnd(endSec + step);
    }
  };

  if (wordClipperOpen) {
    return (
      <div className="clip-body word-clipper-full">
        <div className="word-clipper">
          <div className="word-clipper-head">
            <span className="word-clipper-title">Word clipper</span>
            {words.length > 0 && (
              <span className="word-clipper-count">{wordEnd - wordStart + 1} words</span>
            )}
            <button type="button" className="word-clipper-close" onClick={() => setWordClipperOpen(false)} aria-label="Close word clipper">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          {wordLoading ? (
            <p className="word-clipper-msg">Loading transcript…</p>
          ) : wordError ? (
            <p className="word-clipper-msg error">{wordError}</p>
          ) : words.length === 0 ? (
            <p className="word-clipper-msg">No transcript in this time range.</p>
          ) : (
            <>
              <div className="word-area" ref={wordAreaRef}>
                {words.map((w, i) => (
                  <WordSpan
                    key={i}
                    w={w}
                    selected={i >= wordStart && i <= wordEnd}
                    showStartHandle={i === wordStart}
                    showEndHandle={i === wordEnd}
                    draggingWord={draggingWord}
                    onHandleEvent={onWordHandleEvent}
                  />
                ))}
              </div>
              <div className="word-clipper-foot">
                <span>{formatShort(words[wordStart]?.start ?? startSec)} – {formatShort(words[wordEnd]?.end ?? endSec)}</span>
                <span className="word-clipper-hint">Drag the bars to clip by words</span>
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
          <span className="play-clip-range">{formatShort(currentTime)}</span>
        </div>
      )}

      <div
        className={`scrub${locked ? ' rec-lock' : ''}`}
        ref={trackRef}
        onPointerDown={onTrackPointerDown}
        onPointerMove={onTrackPointerMove}
        onPointerUp={onTrackPointerUp}
        onPointerCancel={onTrackPointerUp}
      >
        <div className="scrub-track">
          <div
            className="scrub-fill"
            style={{ left: `${startPct}%`, width: `${Math.max(0, endPct - startPct)}%` }}
          />
          <div
            className="scrub-handle is-start"
            role="slider"
            tabIndex={0}
            aria-label="Start time"
            aria-valuemin={0}
            aria-valuemax={duration}
            aria-valuenow={startSec}
            aria-valuetext={formatTime(startSec)}
            style={{ left: `${startPct}%` }}
            onPointerDown={onHandlePointerDown('start')}
            onKeyDown={onHandleKeyDown('start')}
          />
          <div
            className="scrub-handle is-end"
            role="slider"
            tabIndex={0}
            aria-label="End time"
            aria-valuemin={0}
            aria-valuemax={duration}
            aria-valuenow={endSec}
            aria-valuetext={formatTime(endSec)}
            style={{ left: `${endPct}%` }}
            onPointerDown={onHandlePointerDown('end')}
            onKeyDown={onHandleKeyDown('end')}
          />
        </div>
      </div>

      <div className={`time-cards${locked ? ' rec-lock' : ''}`}>
        <div className="time-card">
          <span className="time-card-label">Start</span>
          <input
            type="text"
            className="time-input"
            value={startInput}
            onChange={(e) => handleStartInput(e.target.value)}
            onBlur={() => setStartInput(formatTime(startSec))}
            placeholder="0:00:00"
            aria-label="Start time"
          />
          <div className="nudge-row">
            <button type="button" className="nudge" onClick={() => updateStart(startSec - 5)}>-5s</button>
            <button type="button" className="nudge" onClick={() => updateStart(startSec + 5)}>+5s</button>
          </div>
        </div>
        <div className="time-card">
          <span className="time-card-label">End</span>
          <input
            type="text"
            className="time-input"
            value={endInput}
            onChange={(e) => handleEndInput(e.target.value)}
            onBlur={() => setEndInput(formatTime(endSec))}
            placeholder="0:00:30"
            aria-label="End time"
          />
          <div className="nudge-row">
            <button type="button" className="nudge" onClick={() => updateEnd(endSec - 5)}>-5s</button>
            <button type="button" className="nudge" onClick={() => updateEnd(endSec + 5)}>+5s</button>
          </div>
        </div>
      </div>

      <button type="button" className="btn-ghost word-clipper-toggle" onClick={toggleWordClipper}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M4 6h16M4 12h16M4 18h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        Open word clipper
      </button>

      <div className="length-row">
        <span className={clipLen > 90 ? 'over' : ''}>Clip length {formatLength(clipLen)}</span>
        <span className="max">Max 1:30</span>
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
        <button
          onClick={canContinue ? handleContinue : startRecording}
          disabled={clipLen > 90 || clipLen <= 0 || endSec <= startSec}
          className="btn-primary w-full"
        >
          {canContinue ? 'Continue' : 'Record clip'}
        </button>
      )}
    </div>
  );
}
