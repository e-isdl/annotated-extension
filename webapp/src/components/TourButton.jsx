import { useEffect, useState } from 'react';

// Header switch for the corner buddy guide. Same look and label as the old
// Tour pill. data-tour-ui is gone with the tour; the button is a plain
// header control now.
function loadOn() {
  try {
    const v = localStorage.getItem('annotated-buddy');
    return v === null ? true : v === '1';
  } catch { return true; }
}

export default function TourButton({ label = 'Tour' }) {
  const [on, setOn] = useState(loadOn);

  useEffect(() => {
    const f = (e) => setOn(!!(e && e.detail && e.detail.enabled));
    window.addEventListener('annotated:buddy-state', f);
    return () => window.removeEventListener('annotated:buddy-state', f);
  }, []);

  return (
    <button
      type="button"
      data-buddy="tour-toggle"
      className={`tour-t${on ? ' is-on' : ''}`}
      aria-label="Buddy guide"
      aria-pressed={on}
      title={label}
      onClick={() => window.dispatchEvent(new CustomEvent('annotated:buddy-toggle'))}
    >
      <svg className="tour-t-buddy" width="18" height="18" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
        <ellipse cx="14" cy="13" rx="4" ry="7" fill="currentColor" transform="rotate(-18 14 13)" />
        <ellipse cx="30" cy="13" rx="4" ry="7" fill="currentColor" transform="rotate(18 30 13)" />
        <circle cx="22" cy="27" r="15" fill="currentColor" />
        <circle cx="17" cy="24.5" r="3.2" style={{ fill: 'var(--surface-2)' }} />
        <circle cx="27" cy="24.5" r="3.2" style={{ fill: 'var(--surface-2)' }} />
        <path d="M18 31.5 q4 4 8 0" fill="none" strokeWidth="2.6" strokeLinecap="round" style={{ stroke: 'var(--surface-2)' }} />
      </svg>
      <span>Tour</span>
    </button>
  );
}
