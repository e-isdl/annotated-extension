// Shared view-state for the post currently open on the single post page.
// Lets the right rail render source-level cards without prop drilling.

let state = null;
const listeners = new Set();

export function setActivePost(next) {
  state = next;
  listeners.forEach((listener) => listener(state));
}

export function subscribeActivePost(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getActivePost() {
  return state;
}
