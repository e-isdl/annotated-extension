import { useState, useEffect } from 'react';

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
        const player = document.querySelector('video');
        if (player && player.duration) {
          const d = Math.floor(player.duration);
          setDuration(d);
          setEndSec(Math.min(30, d));
          setEndInput(formatTime(Math.min(30, d)));
        }
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

  const jumpTo = (sec) => {
    const clamped = Math.max(0, Math.min(sec, duration));
    setStartSec(clamped);
    setStartInput(formatTime(clamped));
    const end = Math.min(clamped + 30, duration);
    setEndSec(end);
    setEndInput(formatTime(end));
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
        <div className="rounded-lg overflow-hidden border border-border aspect-video bg-black">
          <iframe
            src={`https://www.youtube.com/embed/${data.videoId}?start=${startSec}&end=${endSec}&autoplay=1&mute=1&rel=0`}
            className="w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
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

      {/* SLIDERS — main control */}
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
              if (v < endSec - 1 && endSec - v <= 90) {
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
              if (v > startSec + 1 && v - startSec <= 90) {
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

      {/* TIME INPUTS */}
      <div className="bg-bg-surface border border-border rounded-lg p-3 flex items-center gap-2">
        <div className="flex-1">
          <label className="text-[10px] text-text-muted block mb-1">Start</label>
          <input
            type="text"
            value={startInput}
            onChange={(e) => handleStartInput(e.target.value)}
            onBlur={() => setStartInput(formatTime(startSec))}
            className="input text-sm font-mono w-full text-center"
            placeholder="0:00"
          />
        </div>
        <span className="text-text-muted mt-4">→</span>
        <div className="flex-1">
          <label className="text-[10px] text-text-muted block mb-1">End</label>
          <input
            type="text"
            value={endInput}
            onChange={(e) => handleEndInput(e.target.value)}
            onBlur={() => setEndInput(formatTime(endSec))}
            className="input text-sm font-mono w-full text-center"
            placeholder="0:30"
          />
        </div>
      </div>

      {/* FINE-TUNE BUTTONS */}
      <div className="bg-bg-surface border border-border rounded-lg p-3">
        <p className="text-[10px] text-text-muted font-medium uppercase tracking-wide mb-2">Fine-tune start</p>
        <div className="flex gap-1.5">
          {[-30, -10, -5, -1, 1, 5, 10, 30].map((offset) => (
            <button
              key={`s${offset}`}
              onClick={() => updateStart(startSec + offset)}
              className="flex-1 px-1 py-1.5 text-[10px] rounded bg-bg-raised text-text-secondary hover:text-text-primary border border-border transition-colors font-mono"
            >
              {offset > 0 ? '+' : ''}{offset}s
            </button>
          ))}
        </div>
        <p className="text-[10px] text-text-muted font-medium uppercase tracking-wide mb-2 mt-3">Fine-tune end</p>
        <div className="flex gap-1.5">
          {[-30, -10, -5, -1, 1, 5, 10, 30].map((offset) => (
            <button
              key={`e${offset}`}
              onClick={() => updateEnd(endSec + offset)}
              className="flex-1 px-1 py-1.5 text-[10px] rounded bg-bg-raised text-text-secondary hover:text-text-primary border border-border transition-colors font-mono"
            >
              {offset > 0 ? '+' : ''}{offset}s
            </button>
          ))}
        </div>
      </div>

      {/* QUICK PRESETS + JUMP TO */}
      <div className="bg-bg-surface border border-border rounded-lg p-3">
        <p className="text-[10px] text-text-muted font-medium uppercase tracking-wide mb-2">Quick clip length</p>
        <div className="flex gap-2 mb-3">
          {[10, 15, 30, 60, 90].map((sec) => (
            <button
              key={sec}
              onClick={() => {
                const end = Math.min(startSec + sec, duration);
                setEndSec(end);
                setEndInput(formatTime(end));
              }}
              className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${
                clipLen === sec
                  ? 'bg-accent text-white'
                  : 'bg-bg-raised text-text-secondary hover:text-text-primary border border-border'
              }`}
            >
              {sec}s
            </button>
          ))}
        </div>
        <p className="text-[10px] text-text-muted font-medium uppercase tracking-wide mb-2">Jump to</p>
        <div className="flex gap-1.5 flex-wrap">
          {[0, 30, 60, 120, 180, 300, 600, 900, 1800].filter(t => t < duration).map((sec) => (
            <button
              key={sec}
              onClick={() => jumpTo(sec)}
              className="px-2 py-1.5 text-[10px] rounded bg-bg-raised text-text-secondary hover:text-text-primary border border-border transition-colors font-mono"
            >
              {formatTime(sec)}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <button onClick={handleContinue} className="btn-primary w-full">
        Continue to Annotate
      </button>
    </div>
  );
}
