// Shared playback memory for feed videos. Positions survive player
// unmounts so a video that scrolls away and back resumes where it left
// off, and mounting is capped so the feed cannot drown in iframes.
// Least-recently-seen non-visible players are evicted first; visible ones
// are never evicted.

const positions = new Map();
const mounted = new Map();

export const MAX_MOUNTED_PLAYERS = 10;

export function savePlaybackPosition(key, pos, userPaused) {
  if (!key) return;
  positions.set(key, {
    pos: Math.max(0, Number(pos) || 0),
    userPaused: !!userPaused,
  });
}

export function getPlaybackPosition(key) {
  if (!key) return null;
  return positions.get(key) || null;
}

export function touchMounted(key, visible) {
  const entry = mounted.get(key);
  if (entry) {
    entry.lastSeen = Date.now();
    entry.visible = !!visible;
  }
}

export function registerMounted(key, destroy) {
  if (!key || typeof destroy !== 'function') return;
  mounted.set(key, { lastSeen: Date.now(), visible: false, destroy });
  evictIfNeeded(key);
}

export function unregisterMounted(key) {
  if (!key) return;
  mounted.delete(key);
}

function evictIfNeeded(exceptKey) {
  while (mounted.size > MAX_MOUNTED_PLAYERS) {
    let oldestKey = null;
    let oldestSeen = Infinity;
    for (const [key, entry] of mounted) {
      if (key === exceptKey || entry.visible) continue;
      if (entry.lastSeen < oldestSeen) {
        oldestSeen = entry.lastSeen;
        oldestKey = key;
      }
    }
    if (oldestKey == null) return;
    const victim = mounted.get(oldestKey);
    mounted.delete(oldestKey);
    try { victim.destroy(); } catch {}
  }
}
