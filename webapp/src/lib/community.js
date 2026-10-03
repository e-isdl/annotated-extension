export function communityHue(value = '') {
  let hash = 0;
  for (const char of String(value)) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return Math.abs(hash) % 360;
}

export function communityStyle(value = '') {
  return { '--community-hue': communityHue(value) };
}

const COMMUNITY_PFPS = {
  technology: '/pfps/technology.svg',
  'media-literacy': '/pfps/media-literacy.svg',
  startups: '/pfps/startups.svg',
  'internet-culture': '/pfps/internet-culture.svg',
  'tv-and-film': '/pfps/tv-and-film.svg',
  politics: '/pfps/politics.svg',
};

export function communityPfpUrl(slug = '') {
  return COMMUNITY_PFPS[String(slug || '').toLowerCase()] || null;
}
