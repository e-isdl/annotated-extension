import { useState, useEffect, useRef } from 'react';

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
  const m = Math.floor(s / 60);
  const sec = s % 60;
  if (m && sec) return `${m} min ${sec} s`;
  if (m) return `${m} min`;
  return `${sec} s`;
}

function parseTime(str) {
  const parts = str.split(':').map(Number);
  if (parts.some((n) => isNaN(n))) return NaN;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 1) return parts[0];
  return 0;
}

export default function YouTubeClipper({ pageInfo, onReady }) {
  const { data } = pageInfo;
  const [duration, setDuration] = useState(data.duration || 300);
  const [startSec, setStartSec] = useState(0);
  const [endSec, setEndSec] = useState(Math.min(30, data.duration || 300));
  const [startInput, setStartInput] = useState('0:00:00');
  const [endInput, setEndInput] = useState('0:00:30');
  const [dragging, setDragging] = useState(null);
  const [playMode, setPlayMode] = useState('embed');
  const [rec, setRec] = useState({ state: 'idle', t: 0, error: null, blob: null, mime: null });
  const trackRef = useRef(null);
  const portRef = useRef(null);

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
          setRec({ state: 'done', t: msg.seconds || 0, error: null, blob, mime });
        } else if (msg.type === 'error') {
          finished = true;
          parts.length = 0;
          setRec((prev) => (prev.state === 'recording'
            ? { state: 'error', t: 0, error: msg.message || 'Recording stopped.', blob: null, mime: null }
            : prev));
        }
      });
      port.onDisconnect.addListener(() => {
        if (portRef.current === port) portRef.current = null;
        if (!finished) {
          parts.length = 0;
          setRec((prev) => (prev.state === 'recording'
            ? { state: 'error', t: 0, error: 'Recording stopped.', blob: null, mime: null }
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
    setRec({ state: 'recording', t: 0, error: null, blob: null, mime: null });
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
        state: 'error',
        t: 0,
        error: (res && res.message) || 'Open a YouTube video to record a clip.',
        blob: null,
        mime: null,
      });
    }
  };

  const cancelRecording = async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) await chrome.tabs.sendMessage(tab.id, { type: 'cancel-recording' });
    } catch (e) {}
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

  const canContinue = rec.state === 'done' || playMode === 'embed';

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
      ) : (
        <div className="thumb">
          <img
            src={`https://img.youtube.com/vi/${data.videoId}/hqdefault.jpg`}
            alt={data.title}
          />
          <span className="chip thumb-duration">{formatShort(duration)}</span>
        </div>
      )}

      <div
        className={`scrub${rec.state === 'recording' ? ' rec-lock' : ''}`}
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

      <div className={`time-cards${rec.state === 'recording' ? ' rec-lock' : ''}`}>
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

      <div className="length-row">
        <span className={clipLen > 90 ? 'over' : ''}>Clip length {formatLength(clipLen)}</span>
        <span className="max">Max 1:30</span>
      </div>

      <div className={`play-section${rec.state === 'recording' ? ' rec-lock' : ''}`}>
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
              onClick={() => {
                setPlayMode('embed');
                setRec({ state: 'idle', t: 0, error: null, blob: null, mime: null });
              }}
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
