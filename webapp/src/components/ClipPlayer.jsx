import { useEffect, useRef, useState, useCallback } from 'react';

function formatClock(s) {
  const total = Math.max(0, Math.floor(Number(s) || 0));
  const m = Math.floor(total / 60);
  const sec = total % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

export default function ClipPlayer({ src, onError }) {
  const wrapRef = useRef(null);
  const videoRef = useRef(null);
  const seekRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [muted, setMuted] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [scrubbing, setScrubbing] = useState(false);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return undefined;
    v.muted = false;
    setMuted(false);
    setPlaying(false);
    const attempt = () => {
      try {
        const p = v.play();
        if (p && typeof p.catch === 'function') {
          p.catch(() => {
            try {
              v.muted = true;
              setMuted(true);
              const p2 = v.play();
              if (p2 && typeof p2.catch === 'function') p2.catch(() => {});
            } catch {}
          });
        }
      } catch {}
    };
    if (v.readyState >= 2) attempt();
    else {
      v.addEventListener('canplay', attempt, { once: true });
      return () => v.removeEventListener('canplay', attempt);
    }
    return undefined;
  }, [src]);

  const toggle = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  }, []);

  const ratioForEvent = (clientX) => {
    const el = seekRef.current;
    if (!el) return 0;
    const r = el.getBoundingClientRect();
    return Math.min(1, Math.max(0, (clientX - r.left) / Math.max(1, r.width)));
  };

  const seekTo = (ratio) => {
    const v = videoRef.current;
    if (!v || !Number.isFinite(v.duration) || v.duration <= 0) return;
    v.currentTime = ratio * v.duration;
    setCurrent(v.currentTime);
  };

  const onSeekDown = (e) => {
    e.preventDefault();
    setScrubbing(true);
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
    seekTo(ratioForEvent(e.clientX));
  };

  const onSeekMove = (e) => {
    if (scrubbing) seekTo(ratioForEvent(e.clientX));
  };

  const onSeekUp = () => setScrubbing(false);

  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  };

  const toggleFull = () => {
    try {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      else wrapRef.current?.requestFullscreen?.()?.catch?.(() => {});
    } catch {}
  };

  const playedPct = duration > 0 ? (current / duration) * 100 : 0;
  const bufferedPct = duration > 0 ? Math.min(100, (buffered / duration) * 100) : 0;

  return (
    <div className="clip-player" ref={wrapRef}>
      <video
        ref={videoRef}
        className="clip-player-video"
        src={src}
        playsInline
        preload="metadata"
        onClick={toggle}
        onPlay={() => { setPlaying(true); setWaiting(false); }}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(e) => { if (!scrubbing) setCurrent(e.currentTarget.currentTime); }}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
        onProgress={(e) => {
          const v = e.currentTarget;
          try { if (v.buffered.length) setBuffered(v.buffered.end(v.buffered.length - 1)); } catch {}
        }}
        onWaiting={() => setWaiting(true)}
        onPlaying={() => setWaiting(false)}
        onCanPlay={() => setWaiting(false)}
        onEnded={() => setPlaying(false)}
        onError={onError}
      />
      {waiting && playing && (
        <div className="clip-player-waiting" aria-hidden="true"><span /></div>
      )}
      {!playing && (
        <button type="button" className="clip-player-bigplay" onClick={toggle} aria-label="Play">
          <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M8 5v14l11-7z" fill="currentColor" />
          </svg>
        </button>
      )}
      <div className="clip-player-bar">
        <button type="button" className="clip-player-btn" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}>
          {playing ? (
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 5h4v14H6zM14 5h4v14h-4z" fill="currentColor" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M8 5v14l11-7z" fill="currentColor" />
            </svg>
          )}
        </button>
        <span className="clip-player-time">{formatClock(current)} / {formatClock(duration)}</span>
        <div
          className="clip-player-seek"
          ref={seekRef}
          onPointerDown={onSeekDown}
          onPointerMove={onSeekMove}
          onPointerUp={onSeekUp}
          onPointerCancel={onSeekUp}
        >
          <div className="clip-player-buffered" style={{ width: `${bufferedPct}%` }} />
          <div className="clip-player-played" style={{ width: `${playedPct}%` }} />
          <div className="clip-player-knob" style={{ left: `${playedPct}%` }} />
        </div>
        <button type="button" className="clip-player-btn" onClick={toggleMute} aria-label={muted ? 'Unmute' : 'Mute'}>
          {muted ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M11 5 6 9H2v6h4l5 4V5z" fill="currentColor" stroke="none" />
              <line x1="23" y1="9" x2="17" y2="15" />
              <line x1="17" y1="9" x2="23" y2="15" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M11 5 6 9H2v6h4l5 4V5z" fill="currentColor" stroke="none" />
              <path d="M15.5 8.5a5 5 0 0 1 0 7" />
              <path d="M18.5 5.5a9 9 0 0 1 0 13" />
            </svg>
          )}
        </button>
        <button type="button" className="clip-player-btn" onClick={toggleFull} aria-label="Fullscreen">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M8 3H5a2 2 0 0 0-2 2v3" />
            <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
            <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
            <path d="M3 16v3a2 2 0 0 0 2 2h3" />
          </svg>
        </button>
      </div>
    </div>
  );
}
