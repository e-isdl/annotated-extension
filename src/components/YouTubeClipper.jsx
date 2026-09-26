import { useState, useEffect } from 'react';
import { getCurrentVideoState } from '../lib/videoState';

function formatTime(s) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
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
  const [videoState, setVideoState] = useState(null);
  const [quickStep, setQuickStep] = useState('start');

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      const state = await getCurrentVideoState();
      if (!cancelled && state) setVideoState(state);
    };
    poll();
    const id = setInterval(poll, 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    if (data.duration && data.duration > 0) {
      setDuration(data.duration);
      setEndSec(Math.min(30, data.duration));
      setStartInput('0:00');
      setEndInput(formatTime(Math.min(30, data.duration)));
      return;
    }
    fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${data.videoId}&format=json`)
      .then(r => r.json())
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

  const adPlaying = Boolean(videoState?.adPlaying);

  const setPointFromPlayback = async (which) => {
    const state = await getCurrentVideoState();
    if (state) setVideoState(state);
    if (!state || state.adPlaying) return;
    const position = Math.floor(state.currentTime || 0);
    if (which === 'start') {
      updateStart(position);
      setQuickStep('end');
    } else {
      updateEnd(Math.max(position, startSec + 1));
      setQuickStep('done');
    }
  };

  const resetQuick = () => {
    setStartSec(0);
    setStartInput('0:00');
    const end = Math.min(30, duration);
    setEndSec(end);
    setEndInput(formatTime(end));
    setQuickStep('start');
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
      thumbnail: `https://img.youtube.com/vi/${data.videoId}/hqdefault.jpg`,
    });
  };

  const startPct = (startSec / duration) * 100;
  const endPct = (endSec / duration) * 100;

  return (
    <div className="p-4 flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span className="badge badge-youtube">YouTube</span>
        <span className="text-xs text-text-secondary truncate">{data.title}</span>
      </div>

      {previewMode ? (
        <div className="rounded-lg overflow-hidden border border-border aspect-video bg-black flex items-center justify-center">
          <a
            href={`https://www.youtube.com/watch?v=${data.videoId}&t=${Math.floor(startSec)}s`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-col items-center gap-3 text-center p-6"
          >
            <div className="w-16 h-16 rounded-full bg-accent/20 flex items-center justify-center">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" className="text-accent ml-1">
                <path d="M8 5v14l11-7z"/>
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-text-primary">Watch clip on YouTube</p>
              <p className="text-xs text-text-muted mt-1">{formatTime(startSec)} → {formatTime(endSec)}</p>
            </div>
          </a>
        </div>
      ) : (
        <div className="rounded-lg overflow-hidden border border-border aspect-video bg-bg-raised relative">
          <img
            src={`https://img.youtube.com/vi/${data.videoId}/hqdefault.jpg`}
            alt={data.title}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <div className="text-center">
              <p className="text-sm text-white/80 mb-1">Clip from</p>
              <p className="text-2xl font-bold text-white font-mono">{formatTime(startSec)} → {formatTime(endSec)}</p>
              <p className="text-xs text-white/60 mt-1">{clipLen}s selected</p>
            </div>
          </div>
        </div>
      )}

      <button
        onClick={() => setPreviewMode(!previewMode)}
        className="text-xs text-accent-text hover:text-accent transition-colors text-center"
      >
        {previewMode ? 'Hide preview' : 'Preview clip'}
      </button>

      {/* SLIDERS */}
      <div className="bg-bg-surface border border-border rounded-lg p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between text-xs font-mono text-text-muted">
          <span>{formatTime(startSec)}</span>
          <span className={`font-medium ${clipLen > 90 ? 'text-red-400' : 'text-accent-text'}`}>{clipLen}s</span>
          <span>{formatTime(endSec)}</span>
        </div>

        <div className="relative h-10 flex items-center">
          <div className="absolute w-full h-1.5 bg-bg-raised rounded-full">
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
            className="absolute w-full h-5 appearance-none bg-transparent pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-bg-base [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:cursor-grab z-10"
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
            className="absolute w-full h-5 appearance-none bg-transparent pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-bg-base [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-accent [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:cursor-grab z-20"
          />
        </div>

        <div className="flex items-center justify-between text-xs text-text-muted">
          <span>0:00</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {/* TIME INPUTS + ADJUST BUTTONS */}
      <div className="bg-bg-surface border border-border rounded-lg p-3 flex items-center gap-2">
        <div className="flex-1">
          <label className="text-[10px] text-text-muted block mb-1">Start</label>
          <div className="flex items-center gap-1">
            <button
              onClick={() => updateStart(startSec - 5)}
              className="px-2 py-1.5 text-xs rounded bg-bg-raised text-text-secondary hover:text-text-primary border border-border transition-colors"
            >
              -5
            </button>
            <input
              type="text"
              value={startInput}
              onChange={(e) => handleStartInput(e.target.value)}
              onBlur={() => setStartInput(formatTime(startSec))}
              className="input text-sm font-mono flex-1 text-center"
              placeholder="0:00"
            />
            <button
              onClick={() => updateStart(startSec + 5)}
              className="px-2 py-1.5 text-xs rounded bg-bg-raised text-text-secondary hover:text-text-primary border border-border transition-colors"
            >
              +5
            </button>
          </div>
        </div>
        <span className="text-text-muted mt-4">→</span>
        <div className="flex-1">
          <label className="text-[10px] text-text-muted block mb-1">End</label>
          <div className="flex items-center gap-1">
            <button
              onClick={() => updateEnd(endSec - 5)}
              className="px-2 py-1.5 text-xs rounded bg-bg-raised text-text-secondary hover:text-text-primary border border-border transition-colors"
            >
              -5
            </button>
            <input
              type="text"
              value={endInput}
              onChange={(e) => handleEndInput(e.target.value)}
              onBlur={() => setEndInput(formatTime(endSec))}
              className="input text-sm font-mono flex-1 text-center"
              placeholder="0:30"
            />
            <button
              onClick={() => updateEnd(endSec + 5)}
              className="px-2 py-1.5 text-xs rounded bg-bg-raised text-text-secondary hover:text-text-primary border border-border transition-colors"
            >
              +5
            </button>
          </div>
        </div>
      </div>

      {/* QUICK SET — optional big buttons, the sliders above work on their own */}
      <div className="bg-bg-surface border border-border rounded-lg p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-text-secondary">Quick set</span>
          <span className="text-[11px] font-mono text-text-muted">
            {videoState ? `video at ${formatTime(videoState.currentTime)}` : 'reading video…'}
          </span>
        </div>

        {adPlaying && (
          <p className="text-xs text-amber-400">An ad is playing — the buttons resume when the video does.</p>
        )}

        <div className={quickStep === 'done' ? 'grid grid-cols-2 gap-2' : 'flex flex-col gap-2'}>
          <button
            onClick={() => setPointFromPlayback('start')}
            disabled={adPlaying || !videoState}
            className="w-full py-4 rounded-xl bg-accent text-white text-base font-semibold hover:opacity-90 active:scale-[0.99] transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {quickStep === 'done' ? 'Start point' : 'Set start point'}
          </button>
          {quickStep !== 'start' && (
            <button
              onClick={() => setPointFromPlayback('end')}
              disabled={adPlaying || !videoState}
              className="w-full py-4 rounded-xl bg-accent text-white text-base font-semibold hover:opacity-90 active:scale-[0.99] transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {quickStep === 'done' ? 'End point' : 'Set end point'}
            </button>
          )}
        </div>

        {quickStep === 'done' && (
          <button
            onClick={resetQuick}
            className="text-xs text-text-muted hover:text-text-secondary transition-colors text-center"
          >
            Reset quick set
          </button>
        )}
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <button
        onClick={handleContinue}
        disabled={clipLen > 90 || clipLen <= 0 || endSec <= startSec}
        className="btn-primary w-full disabled:opacity-40"
      >
        {clipLen > 90 ? `${clipLen}s — max 90s to annotate` : 'Continue to Annotate'}
      </button>
    </div>
  );
}
