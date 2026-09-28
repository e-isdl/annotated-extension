export function postHref(clip) {
  const key = clip && (clip.slug || clip.id);
  if (!key) return '/';

  const embedded = Array.isArray(clip.communities) ? clip.communities[0] : clip.communities;
  const community = clip.community_slug || (embedded && embedded.slug);

  return community ? `/c/${community}/${key}` : `/post/${key}`;
}
