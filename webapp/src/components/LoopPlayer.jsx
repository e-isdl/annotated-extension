import { useEffect, useRef } from 'react';

// Chromeless looping player for recorded X video/GIF loops. Ambient autoplay
// in feeds (muted, plays inline), pausing offscreen; reduced-motion users get
// the poster frame with tap-to-play instead of autoplay.
export default function LoopPlayer({ src, poster, autoPlay = true, label }) {
  const ref = useRef(null);
  const reduceMotion = typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => {
        try {
          if (entry.intersectionRatio >= 0.6) {
            if (!reduceMotion && autoPlay) el.play().catch(() => {});
          } else {
            el.pause();
          }
        } catch {}
      },
      { threshold: [0, 0.6, 1] },
    );
    observer.observe(el);
    const onVisibility = () => {
      try { if (document.hidden) el.pause(); } catch {}
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [src, autoPlay, reduceMotion]);

  const togglePaused = (event) => {
    if (!reduceMotion) return;
    event.preventDefault();
    event.stopPropagation();
    const el = ref.current;
    if (!el) return;
    try {
      if (el.paused) el.play().catch(() => {});
      else el.pause();
    } catch {}
  };

  return (
    <video
      ref={ref}
      src={src}
      poster={poster || undefined}
      loop
      muted
      playsInline
      autoPlay={!reduceMotion && autoPlay}
      preload="metadata"
      className="source-loop-video"
      aria-label={label || 'Recorded loop, silent'}
      {...(reduceMotion ? { 'data-no-nav': true, onClick: togglePaused, role: 'button', tabIndex: 0 } : {})}
    />
  );
}
