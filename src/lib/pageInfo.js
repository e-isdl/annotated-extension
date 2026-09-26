export function pageIdentity(info) {
  if (!info) return '';
  return `${info.type}:${info.url}`;
}

export function mergePageInfo(prev, next) {
  if (!next) return prev;
  if (!prev) return next;
  if (prev.url !== next.url) return next;

  const prevDuration = Number(prev.data?.duration) || 0;
  const nextDuration = Number(next.data?.duration) || 0;
  if (nextDuration > 0 || prevDuration === 0) return next;

  // Same page, but the tab reported no duration yet (player still loading, or a
  // moment where the ad hides the real runtime): keep the known duration.
  return { ...next, data: { ...next.data, duration: prevDuration } };
}
