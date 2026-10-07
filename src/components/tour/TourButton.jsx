import { useEffect, useState } from 'react';

// The T (tour) button. Event-driven so it can live in the header while the
// tour overlay lives anywhere else. data-tour-ui keeps it clickable while
// the tour swallows real input elsewhere (T toggles = exit mid-tour).
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
      T
    </button>
  );
}
