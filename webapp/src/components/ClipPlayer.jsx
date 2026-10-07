import { useEffect, useRef, useState, useCallback } from 'react';
import { getPlaybackPosition, savePlaybackPosition, unregisterMounted } from '../lib/feedPlayback';

function formatClock(s) {
  const total = Math.max(0, Math.floor(Number(s) || 0));
  const m = Math.floor(total / 60);
  const sec = total % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

export default function ClipPlayer({ src, onError, fallbackDuration, mutedAutoplay = false, positionKey }) {
  const wrapRef = useRef(null);
  const videoRef = useRef(null);
  const seekRef = useRef(null);
  const autoMutedRef = useRef(false);
  const mutedAutoplayRef = useRef(mutedAutoplay);
  const userPausedRef = useRef(getPlaybackPosition(positionKey)?.userPaused ?? false);
  const pendingSeekRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(() => getPlaybackPosition(positionKey)?.pos ?? 0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [muted, setMuted] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [scrubbing, setScrubbing] = useState(false);
  const playingRef = useRef(false);
  playingRef.current = playing;

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return undefined;
    if (mutedAutoplay) {
      try { v.muted = true; } catch {}
      autoMutedRef.current = false;
      mutedAutoplayRef.current = true;
      setMuted(true);
      setPlaying(false);
      const savedPos = getPlaybackPosition(positionKey)?.pos ?? 0;
      if (savedPos > 0) {
        if (Number.isFinite(v.duration) && v.duration > 0) {
          try { v.currentTime = Math.min(savedPos, v.duration); } catch {}
        } else {
          pendingSeekRef.current = savedPos;
        }
      }
      if (!userPausedRef.current) {
        let inView = true;
        try {
          const r = wrapRef.current?.getBoundingClientRect();
          if (r) inView = r.bottom > 0 && r.top < window.innerHeight;
        } catch {}
        if (inView) {
          try {
            const p = v.play();
            if (p && typeof p.catch === 'function') p.catch(() => {});
          } catch {}
        }
      }
      return undefined;
    }
    v.muted = false;
    autoMutedRef.current = false;
    mutedAutoplayRef.current = false;
    setMuted(false);
    setPlaying(false);
    const attempt = () => {
      try {
        const p = v.play();
        if (p && typeof p.catch === 'function') {
          p.catch(() => {
            try {
              v.muted = true;
              autoMutedRef.current = true;
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
    if (v.muted && (autoMutedRef.current || mutedAutoplayRef.current)) {
      try { v.muted = false; } catch {}
      autoMutedRef.current = false;
      setMuted(false);
      userPausedRef.current = false;
      if (v.paused) v.play().catch(() => {});
      return;
    }
    if (v.paused) {
      userPausedRef.current = false;
      v.play().catch(() => {});
    } else {
      userPausedRef.current = true;
      savePlaybackPosition(positionKey, v.currentTime, true);
      v.pause();
    }
  }, []);

  const readDuration = (video) => {
    const d = video?.duration;
    if (Number.isFinite(d) && d > 0) {
      setDuration(d);
      if (pendingSeekRef.current != null) {
        try { video.currentTime = Math.min(pendingSeekRef.current, d); } catch {}
        pendingSeekRef.current = null;
      }
    }
  };

  const fallbackTotal = Number.isFinite(Number(fallbackDuration)) && Number(fallbackDuration) > 0
    ? Number(fallbackDuration)
    : 0;
  const effectiveDuration = duration > 0 ? duration : fallbackTotal;

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
    savePlaybackPosition(positionKey, v.currentTime, userPausedRef.current);
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
    autoMutedRef.current = false;
    mutedAutoplayRef.current = false;
    setMuted(v.muted);
  };

  const unmuteNow = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    try { v.muted = false; } catch {}
    autoMutedRef.current = false;
    mutedAutoplayRef.current = false;
    setMuted(false);
  }, []);

  useEffect(() => {
    if (mutedAutoplay) return undefined;
    const unmute = () => {
      const v = videoRef.current;
      if (v && autoMutedRef.current && v.muted) unmuteNow();
    };
    window.addEventListener('pointerdown', unmute);
    window.addEventListener('keydown', unmute);
    return () => {
      window.removeEventListener('pointerdown', unmute);
      window.removeEventListener('keydown', unmute);
    };
  }, [src, unmuteNow, mutedAutoplay]);

  useEffect(() => {
    const root = wrapRef.current;
    if (!root || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) {
          if (playingRef.current) {
            try { videoRef.current?.pause(); } catch {}
            setPlaying(false);
          }
        } else if (mutedAutoplay && !userPausedRef.current) {
          const v = videoRef.current;
          if (v && v.paused) {
            try {
              const p = v.play();
              if (p && typeof p.catch === 'function') p.catch(() => {});
            } catch {}
          }
        }
      },
      { threshold: 0.2 },
    );
    observer.observe(root);
    const onVis = () => {
      if (document.hidden && playingRef.current) {
        try { videoRef.current?.pause(); } catch {}
        setPlaying(false);
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      unregisterMounted(positionKey);
    };
  }, [src]);

  const toggleFull = () => {
    try {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      else wrapRef.current?.requestFullscreen?.()?.catch?.(() => {});
    } catch {}
  };

  const playedPct = effectiveDuration > 0 ? Math.min(100, (current / effectiveDuration) * 100) : 0;
  const bufferedPct = effectiveDuration > 0 && buffered > 0 ? Math.min(100, (buffered / effectiveDuration) * 100) : 0;

  return (
    <div className="clip-player" ref={wrapRef}>
      <video
        ref={videoRef}
        className="clip-player-video"
        src={src}
        playsInline
        preload="auto"
        onClick={toggle}
        onPlay={() => { setPlaying(true); setWaiting(false); }}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(e) => {
          if (!scrubbing) {
            setCurrent(e.currentTarget.currentTime);
            savePlaybackPosition(positionKey, e.currentTarget.currentTime, userPausedRef.current);
          }
        }}
        onLoadedMetadata={(e) => readDuration(e.currentTarget)}
        onDurationChange={(e) => readDuration(e.currentTarget)}
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
        <span className="clip-player-time">{formatClock(current)} / {effectiveDuration > 0 ? formatClock(effectiveDuration) : '--:--'}</span>
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
