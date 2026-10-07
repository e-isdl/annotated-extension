import { useEffect, useState } from 'react';

// The Tour button: mini buddy + "Tour" pill. Event-driven so it can live in
// the header while the tour overlay lives anywhere else. data-tour-ui keeps
// it clickable while the tour swallows real input elsewhere.
export default function TourButton({ label = 'Take the tour' }) {
  const [on, setOn] = useState(false);

  useEffect(() => {
    const f = (e) => setOn(!!(e && e.detail && e.detail.active));
    window.addEventListener('annotated:tour-state', f);
    return () => window.removeEventListener('annotated:tour-state', f);
  }, []);

  return (
    <button
      type="button"
      className={`tour-t${on ? ' is-on' : ''}`}
      aria-label={label}
      aria-pressed={on}
      title={label}
      data-tour-ui="true"
      onClick={() => window.dispatchEvent(new CustomEvent('annotated:tour-toggle'))}
    >
      <svg className="tour-t-buddy" width="18" height="18" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
        <ellipse cx="14" cy="13" rx="4" ry="7" fill="currentColor" transform="rotate(-18 14 13)" />
        <ellipse cx="30" cy="13" rx="4" ry="7" fill="currentColor" transform="rotate(18 30 13)" />
        <circle cx="22" cy="27" r="15" fill="currentColor" />
        <circle cx="17" cy="24.5" r="3.2" style={{ fill: 'var(--t-surface)' }} />
        <circle cx="27" cy="24.5" r="3.2" style={{ fill: 'var(--t-surface)' }} />
        <path d="M18 31.5 q4 4 8 0" fill="none" strokeWidth="2.6" strokeLinecap="round" style={{ stroke: 'var(--t-surface)' }} />
      </svg>
      <span>Tour</span>
    </button>
  );
}
