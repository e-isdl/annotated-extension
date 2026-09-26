export function communityHue(value = '') {
  let hash = 0;
  for (const char of String(value)) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return Math.abs(hash) % 360;
}

export function communityStyle(value = '') {
  return { '--community-hue': communityHue(value) };
}
