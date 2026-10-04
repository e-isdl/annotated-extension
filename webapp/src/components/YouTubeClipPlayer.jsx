import { useEffect, useRef, useState } from 'react';
import { youtubeEmbedUrl } from '../lib/youtubeEmbedUrl';

const YT_STATE_ENDED = 0;
const YT_STATE_PLAYING = 1;
const YT_STATE_PAUSED = 2;
const YT_STATE_BUFFERING = 3;

// The IFrame Player API is loaded once per page, shared by every inline clip
// player. If it never arrives (blocked script, broken network), each player
// falls back to a plain iframe that still honours the clip bounds.
let apiPromise = null;

// Only one inline YouTube clip holds playback at a time. Opening another
// pauses and tears down the previous one through its stop callback.
let activeStop = null;
let suppressNavUntil = 0;

export function suppressCardNav(ms = 400) {
  suppressNavUntil = Date.now() + ms;
}

export function isCardNavSuppressed() {
  return Date.now() < suppressNavUntil;
}

function loadYouTubeApi() {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (window.YT && window.YT.Player) return Promise.resolve(window.YT);
  if (!apiPromise) {
    apiPromise = new Promise((resolve) => {
      const previous = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (typeof previous === 'function') previous();
        resolve(window.YT && window.YT.Player ? window.YT : null);
      };
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      script.onerror = () => resolve(null);
      document.head.appendChild(script);
      setTimeout(() => resolve(window.YT && window.YT.Player ? window.YT : null), 4000);
    });
  }
  return apiPromise;
}

function claimPlayback(stop) {
  if (activeStop && activeStop !== stop) {
    try { activeStop(); } catch {}
  }
  activeStop = stop;
}

function releasePlayback(stop) {
  if (activeStop === stop) activeStop = null;
}

function formatClipTime(s) {
  const total = Math.max(0, Number(s) || 0);
  const m = Math.floor(total / 60);
  const sec = Math.floor(total % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}

// A YouTube embed locked to one clip. The track, readout and seeks only ever
// know about [startSec, endSec]: clip time, never absolute video time.
// The iframe itself is never touchable: pointer events are off, it is out of
// the tab order, and a click shield sits above it. Self-hosted recordings
// keep their own player.
export default function YouTubeClipPlayer({ videoId, startSec, endSec, autoplay = false, onClose, startMuted = false }) {
  const frameRef = useRef(null);
  const hostRef = useRef(null);
  const playerRef = useRef(null);
  const boundsRef = useRef({ start: 0, end: 0 });
  const draggingRef = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const stopRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(startMuted);
  const mutedRef = useRef(startMuted);
  const [pos, setPos] = useState(0);
  const [apiFailed, setApiFailed] = useState(false);

  const start = Math.max(0, Number(startSec) || 0);
  const rawEnd = Number(endSec) || 0;
  const end = rawEnd > start ? rawEnd : start;
  const clipLen = Math.max(0, end - start);
  const rangeMax = Math.max(0.1, clipLen);
  boundsRef.current = { start, end };

  useEffect(() => {
    let cancelled = false;
    let player = null;
    let pollTimer = null;
    const mount = document.createElement('div');
    if (hostRef.current) hostRef.current.appendChild(mount);

    const resetToStart = (target) => {
      const bs = boundsRef.current.start;
      try { target?.pauseVideo(); } catch {}
      try { target?.seekTo(bs, true); } catch {}
      setPos(0);
      setPlaying(false);
    };

    const stop = () => {
      try { playerRef.current?.pauseVideo(); } catch {}
      try { onCloseRef.current?.(); } catch {}
    };
    stopRef.current = stop;

    loadYouTubeApi().then((YT) => {
      if (cancelled) return;
      if (!YT) { setApiFailed(true); return; }
      const bs = boundsRef.current.start;
      player = new YT.Player(mount, {
        videoId,
        playerVars: {
          start: Math.floor(bs),
          controls: 0,
          disablekb: 1,
          rel: 0,
          modestbranding: 1,
          iv_load_policy: 3,
          playsinline: 1,
          autoplay: autoplay ? 1 : 0,
        },
        events: {
          onReady: (event) => {
            if (cancelled) return;
            try {
              const frame = event.target.getIframe();
              frame.title = 'Source video';
              frame.style.pointerEvents = 'none';
              frame.tabIndex = -1;
              frame.setAttribute('tabindex', '-1');
            } catch {}
            if (startMuted) {
              try { event.target.mute(); } catch {}
            } else {
              try { event.target.unMute(); event.target.setVolume(100); } catch {}
            }
            if (autoplay) {
              claimPlayback(stop);
              try { event.target.seekTo(bs, true); } catch {}
              try { event.target.playVideo(); } catch {}
            }
          },
          onStateChange: (event) => {
            if (cancelled) return;
            const st = event.data;
            if (st === YT_STATE_PLAYING) {
              setPlaying(true);
              if (!mutedRef.current) { try { event.target.unMute(); event.target.setVolume(100); } catch {} }
            }
            else if (st === YT_STATE_PAUSED) setPlaying(false);
            else if (st === YT_STATE_BUFFERING) setPlaying(true);
            else if (st === YT_STATE_ENDED) resetToStart(event.target);
          },
        },
      });
      playerRef.current = player;
      pollTimer = setInterval(() => {
        if (cancelled || draggingRef.current) return;
        const p = playerRef.current;
        if (!p?.getCurrentTime) return;
        let cur = 0;
        try { cur = p.getCurrentTime() || 0; } catch { return; }
        const { start: bStart, end: bEnd } = boundsRef.current;
        if (bEnd > bStart && cur >= bEnd - 0.05) {
          resetToStart(p);
          return;
        }
        setPos(Math.min(Math.max(0, cur - bStart), Math.max(0, bEnd - bStart)));
      }, 100);
    });

    return () => {
      cancelled = true;
      if (pollTimer) clearInterval(pollTimer);
      releasePlayback(stop);
      try { player?.destroy(); } catch {}
      playerRef.current = null;
      try { mount.remove(); } catch {}
      setPlaying(false);
    };
  }, [videoId, startSec, endSec, autoplay]);

  const refocus = () => {
    try {
      const active = document.activeElement;
      if (active && active !== frameRef.current && hostRef.current?.contains(active)) active.blur();
    } catch {}
    try { frameRef.current?.focus({ preventScroll: true }); } catch {}
  };

  const play = () => {
    const p = playerRef.current;
    if (!p?.playVideo) return;
    claimPlayback(stopRef.current);
    const { start: bs, end: be } = boundsRef.current;
    let cur = bs;
    try { cur = p.getCurrentTime() ?? bs; } catch {}
    if (!(cur >= bs) || (be > bs && cur >= be - 0.05)) {
      try { p.seekTo(bs, true); } catch {}
      setPos(0);
    }
    try { p.playVideo(); } catch {}
  };

  const pause = () => {
    setPlaying(false);
    try { playerRef.current?.pauseVideo(); } catch {}
  };

  const unmuteAndPlay = () => {
    const p = playerRef.current;
    mutedRef.current = false;
    setMuted(false);
    if (!p) return;
    try { p.unMute(); p.setVolume(100); } catch {}
    try { p.playVideo(); } catch {}
  };

  const toggle = () => {
    if (muted) { unmuteAndPlay(); refocus(); return; }
    if (playing) pause();
    else play();
    refocus();
  };

  const closePlayer = (e) => {
    e.preventDefault();
    e.stopPropagation();
    try { playerRef.current?.pauseVideo(); } catch {}
    try { onCloseRef.current?.(); } catch {}
  };

  const seekToClipPos = (v) => {
    const { start: bs, end: be } = boundsRef.current;
    const clamped = Math.min(Math.max(0, Number(v) || 0), Math.max(0, be - bs));
    setPos(clamped);
    try { playerRef.current?.seekTo(bs + clamped, true); } catch {}
  };

  const shownPos = Math.min(pos, rangeMax);
  const fillPct = rangeMax > 0 ? (shownPos / rangeMax) * 100 : 0;

  return (
    <div
      className="ytclip"
      data-no-nav
      onDragStart={(e) => e.preventDefault()}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div
        ref={frameRef}
        className="ytclip-frame"
        tabIndex={-1}
        onClick={toggle}
      >
        {apiFailed ? (
          <iframe
            src={youtubeEmbedUrl(videoId, { startSec: start, endSec: end, autoplay })}
            className="ytclip-fallback"
            tabIndex="-1"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            title="Source video"
          />
        ) : (
          <div ref={hostRef} className="ytclip-host" />
        )}
        {!apiFailed && (
          <div className="ytclip-shield" onClick={toggle} aria-hidden="true" />
        )}
        {muted && !apiFailed && (
          <button
            type="button"
            className="ytclip-unmute"
            onClick={(e) => { e.stopPropagation(); unmuteAndPlay(); refocus(); }}
          >
            Tap for sound
          </button>
        )}
        {onClose && !apiFailed && (
          <button
            type="button"
            className="ytclip-close"
            onClick={closePlayer}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            aria-label="Close video"
          >
            ×
          </button>
        )}
      </div>
      {!apiFailed && (
        <div className="ytclip-bar">
          <button
            type="button"
            className="ytclip-play"
            onClick={toggle}
            aria-label={playing ? 'Pause clip' : 'Play clip'}
          >
            {playing ? (
              <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6 5h4v14H6zM14 5h4v14h-4z" fill="currentColor" />
              </svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M8 5v14l11-7z" fill="currentColor" />
              </svg>
            )}
          </button>
          <input
            type="range"
            className="ytclip-track"
            min={0}
            max={rangeMax}
            step={0.1}
            value={shownPos}
            draggable={false}
            onChange={(e) => seekToClipPos(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => {
              e.stopPropagation();
              suppressCardNav();
              draggingRef.current = true;
              try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
            }}
            onPointerUp={() => { draggingRef.current = false; suppressCardNav(); }}
            onPointerCancel={() => { draggingRef.current = false; }}
            onLostPointerCapture={() => { draggingRef.current = false; }}
            style={{ '--p': `${fillPct}%` }}
            aria-label="Seek within clip"
            aria-valuetext={`${formatClipTime(shownPos)} of ${formatClipTime(rangeMax)}`}
          />
          <span className="ytclip-time">{formatClipTime(shownPos)} / {formatClipTime(rangeMax)}</span>
        </div>
      )}
    </div>
  );
}
