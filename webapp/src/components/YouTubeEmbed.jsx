import { useEffect, useRef, useState } from 'react';
import { youtubeEmbedUrl } from '../lib/youtubeEmbedUrl';

const YT_STATE_ENDED = 0;
const YT_STATE_PLAYING = 1;

// The IFrame Player API is loaded once per page. If it never arrives (blocked
// script, broken network), the component falls back to the plain iframe,
// which still honours the start/end clip bounds as before.
let apiPromise = null;

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

// Clip playback: the video starts at the clip's start time, is forced to stop
// at the clip's end time, and offers a replay control that restarts at the
// clip start. The native YouTube replay control is deliberately covered by
// the overlay, because it would restart the full video from 0:00.
export default function YouTubeEmbed({ videoId, startSec, endSec, autoplay = false }) {
  const hostRef = useRef(null);
  const playerRef = useRef(null);
  const boundsRef = useRef({ start: 0, end: 0 });
  const [ended, setEnded] = useState(false);
  const [apiFailed, setApiFailed] = useState(false);

  const start = Math.max(0, Math.floor(Number(startSec) || 0));
  const end = Math.max(0, Math.floor(Number(endSec) || 0));
  boundsRef.current = { start, end };

  useEffect(() => {
    let cancelled = false;
    let player = null;
    let pollTimer = null;

    const mount = document.createElement('div');
    if (hostRef.current) hostRef.current.appendChild(mount);

    loadYouTubeApi().then((YT) => {
      if (cancelled) return;
      if (!YT) { setApiFailed(true); return; }
      player = new YT.Player(mount, {
        videoId,
        playerVars: {
          start: boundsRef.current.start,
          ...(boundsRef.current.end > boundsRef.current.start ? { end: boundsRef.current.end } : {}),
          autoplay: autoplay ? 1 : 0,
          playsinline: 1,
        },
        events: {
          onReady: (event) => {
            try { event.target.getIframe().title = 'Source video'; } catch (e) { /* ignore */ }
            // Clips always start with sound: the embed is never left muted.
            try {
              event.target.unMute();
              event.target.setVolume(100);
              if (autoplay) event.target.playVideo();
            } catch (e) { /* ignore */ }
            // The `end` playerVar usually stops playback, but it is not
            // guaranteed on every client, so playing past the clip end is
            // enforced here as a safety net.
            pollTimer = setInterval(() => {
              try {
                if (event.target.getPlayerState() === YT_STATE_PLAYING
                  && boundsRef.current.end > boundsRef.current.start
                  && event.target.getCurrentTime() >= boundsRef.current.end) {
                  event.target.pauseVideo();
                  setEnded(true);
                }
              } catch (e) { /* ignore */ }
            }, 500);
          },
          onStateChange: (event) => {
            if (event.data === YT_STATE_PLAYING) {
              try { event.target.unMute(); event.target.setVolume(100); } catch (e) { /* ignore */ }
            }
            if (event.data === YT_STATE_ENDED) setEnded(true);
          },
        },
      });
      playerRef.current = player;
    });

    return () => {
      cancelled = true;
      if (pollTimer) clearInterval(pollTimer);
      try { player?.destroy(); } catch (e) { /* ignore */ }
      playerRef.current = null;
      mount.remove();
      setEnded(false);
    };
  }, [videoId, autoplay]);

  const replayClip = () => {
    const player = playerRef.current;
    if (!player?.seekTo) return;
    try {
      player.seekTo(boundsRef.current.start, true);
      player.playVideo();
      setEnded(false);
    } catch (e) { /* ignore */ }
  };

  return (
    <div className="yt-frame">
      <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
        {apiFailed ? (
          <iframe
            src={youtubeEmbedUrl(videoId, { startSec: start, endSec: end, autoplay })}
            className="absolute inset-0 w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            title="Source video"
          />
        ) : (
          <div ref={hostRef} className="yt-player-host" />
        )}
        {ended && !apiFailed && (
          <button type="button" className="yt-replay" aria-label="Replay clip from its start" onClick={replayClip}>
            <span className="yt-replay__icon" aria-hidden="true">↻</span>
            <span className="yt-replay__label">Replay clip</span>
          </button>
        )}
      </div>
    </div>
  );
}
