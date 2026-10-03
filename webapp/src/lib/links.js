export function postHref(clip, suffix = '') {
  if (!clip) return '/';
  const key = clip.slug || clip.id;
  if (!key) return '/';

  const handle = clip.profiles?.handle || clip.handle;
  if (!handle) return `/post/${key}`;

  return `/@${String(handle).toLowerCase()}/post/${key}${suffix}`;
}

export function commentHref(clip, commentId) {
  return postHref(clip, `/comment/${commentId}`);
}
