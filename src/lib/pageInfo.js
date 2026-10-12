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

  // Same page: never let a thin poll wipe known fields. The background
  // fallback (URL-only, no DOM) and a mid-load content read can arrive with
  // empty ogImage/selectedText/title after a good read already set them.
  const mergedData = { ...(prev.data || {}), ...Object.fromEntries(
    Object.entries(next.data || {}).filter(([, v]) => v !== '' && v !== null && v !== undefined),
  ) };

  const prevDuration = Number(prev.data?.duration) || 0;
  const nextDuration = Number(next.data?.duration) || 0;
  if (nextDuration > 0 || prevDuration === 0) return { ...next, data: mergedData };

  // Same page, but the tab reported no duration yet (player still loading, or a
  // moment where the ad hides the real runtime): keep the known duration.
  return { ...next, data: { ...mergedData, duration: prevDuration } };
}
