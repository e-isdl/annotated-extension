import { useState, useEffect } from 'react';

function formatTime(s) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function parseTime(str) {
  const parts = str.split(':').map(Number);
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
  const [startInput, setStartInput] = useState('0:00');
  const [endInput, setEndInput] = useState('0:30');
  const [previewMode, setPreviewMode] = useState(false);

  useEffect(() => {
    if (data.duration && data.duration > 0) {
      setDuration(data.duration);
      setEndSec(Math.min(30, data.duration));
      setStartInput('0:00');
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

  return (
    <div className="p-6 flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <span className="badge badge-youtube">YouTube</span>
        <span className="text-sm text-text-secondary truncate">{data.title}</span>
      </div>

      {previewMode ? (
        <div className="rounded-xl overflow-hidden border border-border aspect-video bg-black">
          <a
            href={`https://www.youtube.com/watch?v=${data.videoId}&t=${Math.floor(startSec)}s`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-col items-center gap-4 text-center p-6"
          >
            <div className="w-18 h-18 rounded-full bg-accent/20 flex items-center justify-center">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor" className="text-accent">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
            <div>
              <p className="text-lg font-medium text-text-primary">Watch clip on YouTube</p>
              <p className="text-base text-text-secondary mt-1">{formatTime(startSec)} → {formatTime(endSec)}</p>
            </div>
          </a>
        </div>
      ) : (
        <div className="rounded-xl overflow-hidden border border-border aspect-video bg-bg-raised relative">
          <img
            src={`https://img.youtube.com/vi/${data.videoId}/hqdefault.jpg`}
            alt={data.title}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <div className="text-center">
              <p className="text-base text-white/80 mb-2">Clip from</p>
              <p className="text-3xl font-bold text-[var(--on-red)] font-mono">{formatTime(startSec)} → {formatTime(endSec)}</p>
              <p className="text-sm text-white/60 mt-1">{clipLen}s selected</p>
            </div>
          </div>
        </div>
      )}

      <button
        onClick={() => setPreviewMode(!previewMode)}
        className="text-sm font-medium text-accent-text hover:text-accent transition-colors"
      >
        {previewMode ? 'Hide preview' : 'Preview clip'}
      </button>

      {/* SLIDERS */}
      <div className="bg-bg-surface border border-border rounded-xl p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-mono text-text-secondary">{formatTime(startSec)}</span>
          <span className={`text-sm font-semibold ${clipLen > 90 ? 'text-[var(--red)]' : 'text-accent-text'}`}>{clipLen}s</span>
          <span className="text-sm font-mono text-text-secondary">{formatTime(endSec)}</span>
        </div>

        <div className="relative h-12 flex items-center">
          <div className="absolute w-full h-2 bg-bg-raised rounded-full">
            <div
              className="absolute h-full bg-accent rounded-full"
              style={{ left: `${startPct}%`, width: `${endPct - startPct}%` }}
            />
          </div>
          <input
            type="range"
            min="0"
            max={duration}
            value={startSec}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (v < endSec - 1) {
                setStartSec(v);
                setStartInput(formatTime(v));
              }
            }}
            className="absolute w-full h-8 appearance-none bg-transparent pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:h-8 [&::-webkit-slider-thumb]:rounded-sm [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow [&::-webkit-slider-thumb]:cursor-grab z-10"
          />
          <input
            type="range"
            min="0"
            max={duration}
            value={endSec}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (v > startSec + 1) {
                setEndSec(v);
                setEndInput(formatTime(v));
              }
            }}
            className="absolute w-full h-8 appearance-none bg-transparent pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:h-8 [&::-webkit-slider-thumb]:rounded-sm [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow [&::-webkit-slider-thumb]:cursor-grab z-20"
          />
        </div>

        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-mono text-text-secondary">0:00</span>
          <span className="text-sm font-mono text-text-secondary">{formatTime(duration)}</span>
        </div>
      </div>

      {/* TIME INPUTS + ADJUST BUTTONS */}
      <div className="bg-bg-surface border border-border rounded-xl p-4 flex items-center gap-3">
        <div className="flex-1">
          <label className="text-sm font-medium text-text-secondary block mb-1.5">Start</label>
          <div className="flex items-center gap-2">
            <button
              onClick={() => updateStart(startSec - 5)}
              className="px-3 py-2 text-sm rounded-lg bg-bg-raised text-text-secondary hover:text-text-primary border border-border transition-colors"
            >
              -5
            </button>
            <input
              type="text"
              value={startInput}
              onChange={(e) => handleStartInput(e.target.value)}
              onBlur={() => setStartInput(formatTime(startSec))}
              className="input text-base font-mono flex-1 text-center"
              placeholder="0:00"
            />
            <button
              onClick={() => updateStart(startSec + 5)}
              className="px-3 py-2 text-sm rounded-lg bg-bg-raised text-text-secondary hover:text-text-primary border border-border transition-colors"
            >
              +5
            </button>
          </div>
        </div>
        <span className="text-text-muted mt-4 text-sm">→</span>
        <div className="flex-1">
          <label className="text-sm font-medium text-text-secondary block mb-1.5">End</label>
          <div className="flex items-center gap-2">
            <button
              onClick={() => updateEnd(endSec - 5)}
              className="px-3 py-2 text-sm rounded-lg bg-bg-raised text-text-secondary hover:text-text-primary border border-border transition-colors"
            >
              -5
            </button>
            <input
              type="text"
              value={endInput}
              onChange={(e) => handleEndInput(e.target.value)}
              onBlur={() => setEndInput(formatTime(endSec))}
              className="input text-base font-mono flex-1 text-center"
              placeholder="0:30"
            />
            <button
              onClick={() => updateEnd(endSec + 5)}
              className="px-3 py-2 text-sm rounded-lg bg-bg-raised text-text-secondary hover:text-text-primary border border-border transition-colors"
            >
              +5
            </button>
          </div>
        </div>
      </div>

      {error && <p className="text-sm text-[var(--red)]">{error}</p>}

      <button
        onClick={handleContinue}
        disabled={clipLen > 90 || clipLen <= 0 || endSec <= startSec}
        className="btn-primary w-full disabled:opacity-40"
      >
        {clipLen > 90 ? `${clipLen}s (max 90s to annotate)` : 'Continue to Annotate'}
      </button>
    </div>
  );
}
