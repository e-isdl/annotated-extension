import { postHref } from './links.js';

// Repost toggles resharing a post into the feed under your name.
// Quote creates a new post with your commentary plus the quoted post.
export async function toggleRepost(client, clipId) {
  const { data, error } = await client.rpc('toggle_repost', { p_clip_id: clipId });
  if (error) throw error;
  return data;
}

export async function createQuote(client, { clipId, annotation, communityId = null }) {
  const { data, error } = await client.rpc('create_quote_post', {
    p_clip_id: clipId,
    p_annotation: annotation,
    p_community_id: communityId,
  });
  if (error) throw error;
  return data;
}

// Full quoted-post row for the rich inline card. Throws on database errors.
export async function fetchQuotedPost(client, clipId) {
  if (!clipId) return null;
  const { data, error } = await client
    .from('clips')
    .select('*, profiles(*), annotations(id,text_content)')
    .eq('id', clipId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Best static image for the quoted card. Never autoplays inside an embed.
export function quotedImage(post) {
  if (!post) return null;
  if (post.source_type === 'youtube' && post.youtube_id) {
    return `https://img.youtube.com/vi/${post.youtube_id}/hqdefault.jpg`;
  }
  return post.source_image_url || post.thumbnail || null;
}

// Whether this user already reshared this post. Never throws: unknown
// state reads as not reposted, matching the saved-state pattern.
export async function fetchRepostState(client, clipId, userId) {
  if (!clipId || !userId || String(clipId).startsWith('demo-')) return false;
  try {
    const { data, error } = await client
      .from('clips')
      .select('id')
      .eq('parent_clip_id', clipId)
      .eq('user_id', userId)
      .eq('annotation_type', 'Repost')
      .limit(1)
      .maybeSingle();
    if (error) return false;
    return Boolean(data);
  } catch {
    return false;
  }
}

export function hrefForNewPost(result, handle) {
  return postHref({ id: result?.id, slug: result?.slug, profiles: handle ? { handle } : null });
}
