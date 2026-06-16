export function detectPageType(url) {
  if (url.includes('youtube.com/watch')) return 'youtube';
  if (url.includes('youtube.com/shorts')) return 'youtube';
  if (url.includes('podcast') || url.includes('spotify.com/episode') || url.includes('overcast.fm')) return 'podcast';
  return 'article';
}

export function extractYouTubeId(url) {
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([^&\s]+)/);
  return match ? match[1] : null;
}
