import { useState, useEffect } from 'react';

function formatTime(s) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export default function YouTubeClipper({ pageInfo, onReady }) {
  const { data } = pageInfo;
  const [duration, setDuration] = useState(data.duration || 300);
  const [startSec, setStartSec] = useState(0);
  const [endSec, setEndSec] = useState(Math.min(90, data.duration || 300));
  const [error, setError] = useState('');

  useEffect(() => {
    if (data.duration && data.duration > 0) {
      setDuration(data.duration);
      setEndSec(Math.min(90, data.duration));
      return;
    }
    fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${data.videoId}&format=json`)
      .then(r => r.json())
      .then(() => {
        const player = document.querySelector('video');
        if (player && player.duration) {
          setDuration(Math.floor(player.duration));
          setEndSec(Math.min(90, Math.floor(player.duration)));
        }
      })
      .catch(() => {});
  }, [data.videoId, data.duration]);

  const clipLen = endSec - startSec;

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

      <div className="rounded-lg overflow-hidden border border-border aspect-video bg-bg-raised">
        <img
          src={`https://img.youtube.com/vi/${data.videoId}/hqdefault.jpg`}
          alt={data.title}
          className="w-full h-full object-cover"
        />
      </div>

      <div className="bg-bg-surface border border-border rounded-lg p-4 flex flex-col gap-4">
        <p className="text-xs text-text-secondary font-medium uppercase tracking-wide">Clip range</p>

        <div className="flex items-center justify-between text-xs font-mono text-text-muted">
          <span>{formatTime(startSec)}</span>
          <span className={`font-medium ${clipLen > 90 ? 'text-claim' : 'text-accent-text'}`}>{clipLen}s</span>
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
              if (v < endSec - 1 && endSec - v <= 90) setStartSec(v);
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
              if (v > startSec + 1 && v - startSec <= 90) setEndSec(v);
            }}
            className="absolute w-full h-5 appearance-none bg-transparent pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-bg-base [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-accent [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:cursor-grab z-20"
          />
        </div>

        <div className="flex items-center justify-between text-xs text-text-muted">
          <span>0:00</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {error && <p className="text-xs text-claim">{error}</p>}

      <button onClick={handleContinue} className="btn-primary w-full">
        Continue to Annotate
      </button>
    </div>
  );
}
