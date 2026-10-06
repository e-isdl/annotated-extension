import { useEffect, useState } from 'react';

// Full-bleed theme photography, delivered as a real <img> (proven to load
// where CSS url() layers silently fail). Veil + glows stay in the body
// background above it; rain lines drift above that.
const BACKDROPS = {
  tokyo: '/themes/tokyo-night.jpg',
};

export default function ThemeBackdrop() {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || 'light');

  useEffect(() => {
    const sync = () => setTheme(document.documentElement.dataset.theme || 'light');
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  const src = BACKDROPS[theme];
  if (!src) return null;
  return (
    <>
      <img
        src={src}
        alt=""
        aria-hidden="true"
        draggable={false}
        className="theme-backdrop-photo"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          objectFit: 'cover',
          zIndex: -1,
          pointerEvents: 'none',
        }}
      />
      <div className="theme-backdrop-veil" aria-hidden="true" />
    </>
  );
}
