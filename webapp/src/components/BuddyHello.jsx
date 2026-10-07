import { useEffect, useState } from 'react';
import { ThemeBuddy } from './BuddyArt';

// One-time corner greeting. No tracking, no tips, no ring: buddy pops in
// once per browser, says hi, and leaves after 9 seconds.
export default function BuddyHello() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    let t2 = 0;
    let alive = true;
    try {
      if (localStorage.getItem('annotated-buddy-greeted')) return undefined;
    } catch { /* fall through and greet anyway */ }
    const t1 = window.setTimeout(() => {
      if (!alive) return;
      try { localStorage.setItem('annotated-buddy-greeted', '1'); } catch {}
      setShow(true);
      t2 = window.setTimeout(() => { if (alive) setShow(false); }, 9000);
    }, 1000);
    return () => { alive = false; window.clearTimeout(t1); window.clearTimeout(t2); };
  }, []);

  if (!show) return null;

  return (
    <div className="buddy-hello" aria-hidden="true">
      <div className="buddy-hello-bubble">
        <p className="buddy-hello-title">Hi!</p>
        <p className="buddy-hello-text">Annotated lets you add your take to an exact part of a source. Try the themes button!</p>
      </div>
      <ThemeBuddy size={60} />
    </div>
  );
}
