import { useEffect, useRef } from 'react';

// Player for recorded X media. Loops repeat silently like a GIF; plain clips
// play once as a normal video (tap replays in feed, native controls on detail).
// Autoplay is always muted; reduced-motion users get the poster with tap-to-play.
export default function LoopPlayer({ src, poster, autoPlay = true, label, loop = true, controls = false, w, h }) {
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

  const replay = (event) => {
    if (loop && !reduceMotion) return;
    event.preventDefault();
    event.stopPropagation();
    const el = ref.current;
    if (!el) return;
    try {
      if (el.paused || el.ended) {
        if (el.ended) el.currentTime = 0;
        el.play().catch(() => {});
      } else {
        el.pause();
      }
    } catch {}
  };

  const needsTap = !loop || reduceMotion;
  const ratio = Number(w) > 0 && Number(h) > 0 ? `${w} / ${h}` : undefined;
  return (
    <video
      ref={ref}
      src={src}
      poster={poster || undefined}
      loop={loop}
      muted
      playsInline
      autoPlay={!reduceMotion && autoPlay}
      preload="metadata"
      controls={controls}
      className="source-loop-video"
      style={ratio ? { aspectRatio: ratio } : undefined}
      aria-label={label || (loop ? 'Recorded loop, silent' : 'Recorded video, silent')}
      {...(needsTap && !controls ? { 'data-no-nav': true, onClick: replay, role: 'button', tabIndex: 0 } : {})}
    />
  );
}
