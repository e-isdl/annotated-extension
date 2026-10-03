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
  const [error, setError] = useState('');
  const [startInput, setStartInput] = useState('0:00:00');
  const [endInput, setEndInput] = useState('0:00:30');
  const [previewMode, setPreviewMode] = useState(false);
  const [dragging, setDragging] = useState(null);
  const trackRef = useRef(null);

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

  const getPageVideoTime = async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return null;
      const [res] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const v = document.querySelector('video');
          return v ? v.currentTime : null;
        },
      });
      return res?.result ?? null;
    } catch {
      return null;
    }
  };

  const setStartHere = async () => {
    const t = await getPageVideoTime();
    if (t == null) { setError('No video found on this page.'); return; }
    setError('');
    const sec = Math.min(duration, Math.max(0, Math.round(t)));
    setStartSec(sec);
    setStartInput(formatTime(sec));
  };

  const setEndHere = async () => {
    const t = await getPageVideoTime();
    if (t == null) { setError('No video found on this page.'); return; }
    setError('');
    const sec = Math.min(duration, Math.max(0, Math.round(t)));
    setEndSec(sec);
    setEndInput(formatTime(sec));
  };

  const handleContinue = () => {
    if (endSec <= startSec) { setError('End time must be after start time.'); return; }
    if (clipLen > 90) { setError('Clip must be 90 seconds or less.'); return; }
    if (clipLen <= 0) { setError('Clip must be at least 1 second.'); return; }
    setError('');
    onReady({
      source_url: pageInfo.url,
      source_type: 'youtube',
      title: data.title,
      youtube_id: data.videoId,
      start_sec: startSec,
      end_sec: endSec,
      duration: duration || null,
      thumbnail: `https://img.youtube.com/vi/${data.videoId}/hqdefault.jpg`,
    });
  };

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
      <div className="thumb">
        {previewMode ? (
          <iframe
            src={`https://www.youtube.com/embed/${data.videoId}?start=${Math.floor(startSec)}&end=${Math.ceil(endSec)}&autoplay=1&rel=0`}
            title="Clip preview"
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <img
            src={`https://img.youtube.com/vi/${data.videoId}/hqdefault.jpg`}
            alt={data.title}
          />
        )}
        <button
          type="button"
          className="chip thumb-preview"
          onClick={() => setPreviewMode(!previewMode)}
        >
          {previewMode ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
          )}
          {previewMode ? 'Stop' : 'Preview'}
        </button>
        <span className="chip thumb-duration">{formatShort(duration)}</span>
      </div>

      <div
        className="scrub"
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

      <div className="time-cards">
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
          <button type="button" className="btn-set" onClick={setStartHere}>Set start here</button>
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
          <button type="button" className="btn-set" onClick={setEndHere}>Set end here</button>
          <div className="nudge-row">
            <button type="button" className="nudge" onClick={() => updateEnd(endSec - 5)}>-5s</button>
            <button type="button" className="nudge" onClick={() => updateEnd(endSec + 5)}>+5s</button>
          </div>
        </div>
      </div>

      {endSec <= startSec && <p className="clip-error">End needs to come after the start.</p>}

      <div className="length-row">
        <span className={clipLen > 90 ? 'over' : ''}>Clip length {formatLength(clipLen)}</span>
        <span className="max">Max 1:30</span>
      </div>

      {error && <p className="clip-error">{error}</p>}

      <button
        onClick={handleContinue}
        disabled={clipLen > 90 || clipLen <= 0 || endSec <= startSec}
        className="btn-primary w-full"
      >
        {clipLen > 90 ? `${clipLen}s (max 90s to annotate)` : 'Continue to Annotate'}
      </button>
    </div>
  );
}
