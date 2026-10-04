// Feed transcript visibility preference, shared between the Navbar toggle
// and the Feed. Same-tab updates propagate through subscribers.

const KEY = 'annotated-hide-transcripts';
const listeners = new Set();

export function getHideTranscripts() {
  try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
}

export function setHideTranscripts(value) {
  try { localStorage.setItem(KEY, value ? '1' : '0'); } catch {}
  listeners.forEach((fn) => { try { fn(value); } catch {} });
}

export function subscribeHideTranscripts(fn) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
