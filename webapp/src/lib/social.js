const STATUS_PATTERN = /(?:twitter\.com|x\.com)\/([^/?#]+)\/status\/(\d+)/;

export function matchStatusUrl(url) {
  const match = STATUS_PATTERN.exec(String(url || ''));
  return match ? { handle: match[1], statusId: match[2] } : null;
}

export function isXPostUrl(url) {
  return matchStatusUrl(url) !== null;
}

export function xEmbedSrc(url) {
  const status = matchStatusUrl(url);
  return status ? `https://platform.twitter.com/embed/Tweet.html?id=${status.statusId}&theme=dark` : null;
}
