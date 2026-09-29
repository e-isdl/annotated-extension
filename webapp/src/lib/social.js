const ALLOWED_HOSTS = new Set(['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com']);

export function matchStatusUrl(url) {
  let parsed;
  try {
    parsed = new URL(String(url || ''));
  } catch {
    return null;
  }
  if (!ALLOWED_HOSTS.has(parsed.hostname)) return null;
  const match = parsed.pathname.match(/^\/([^/?#]+)\/status\/(\d+)/);
  return match ? { handle: match[1], statusId: match[2] } : null;
}

export function isXPostUrl(url) {
  return matchStatusUrl(url) !== null;
}

export function tweetIdFromUrl(url) {
  const status = matchStatusUrl(url);
  return status ? status.statusId : null;
}
