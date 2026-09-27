const VOLATILE_PARAMS = ['t', 'start', 'time_continue', 'si', 'pp', 'feature', 'ab_channel'];

export function pageIdentity(info) {
  if (!info) return '';
  let url = String(info.url || '');
  try {
    const parsed = new URL(url);
    for (const param of VOLATILE_PARAMS) parsed.searchParams.delete(param);
    url = parsed.toString();
  } catch {
    // Unparseable URLs keep the raw string; identity stays deterministic.
  }
  return `${info.type}:${url}`;
}

export function mergePageInfo(prev, next) {
  if (!next) return prev;
  if (!prev) return next;
  if (pageIdentity(prev) !== pageIdentity(next)) return next;

  const prevDuration = Number(prev.data?.duration) || 0;
  const nextDuration = Number(next.data?.duration) || 0;
  if (nextDuration > 0 || prevDuration === 0) return next;

  // Same page, but the tab reported no duration yet (player still loading, or a
  // moment where the ad hides the real runtime): keep the known duration.
  return { ...next, data: { ...next.data, duration: prevDuration } };
}
