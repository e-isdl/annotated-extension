export function youtubeEmbedUrl(videoId, { startSec = 0, endSec = 0, muted = true, autoplay = false } = {}) {
  const start = Math.max(0, Math.floor(Number(startSec) || 0));
  const end = Math.max(0, Math.floor(Number(endSec) || 0));
  const params = new URLSearchParams({
    start: String(start),
    autoplay: autoplay ? '1' : '0',
    mute: muted ? '1' : '0',
    playsinline: '1',
    cc_load_policy: '0',
  });
  if (end > start) params.set('end', String(end));
  return `https://www.youtube.com/embed/${encodeURIComponent(videoId)}?${params.toString()}`;
}
