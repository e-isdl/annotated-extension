import { supabase } from './supabase';

export async function getClips(limit = 30) {
  const { data } = await supabase
    .from('clips_with_scores')
    .select('*, profiles(*), annotations(id, text_content, audio_url)')
    .order('created_at', { ascending: false })
    .limit(limit);
  return data || [];
}

export async function getClipById(id) {
  const { data } = await supabase
    .from('clips_with_scores')
    .select('*, profiles(*)')
    .or(`slug.eq.${id},id.eq.${id}`)
    .single();
  return data;
}

export async function getAnnotation(clipId) {
  const { data } = await supabase
    .from('annotations')
    .select('*')
    .eq('clip_id', clipId)
    .single();
  return data;
}

export async function getClipsByUser(userId) {
  const { data } = await supabase
    .from('clips_with_scores')
    .select('*, profiles(*), annotations(id, text_content, audio_url)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  return data || [];
}

export async function getComments(clipId) {
  const { data } = await supabase
    .from('comments')
    .select('*, profiles(*)')
    .eq('clip_id', clipId)
    .order('created_at', { ascending: true });
  return data || [];
}

export async function addComment(clipId, userId, body) {
  const { data } = await supabase
    .from('comments')
    .insert({ clip_id: clipId, user_id: userId, body })
    .select('*, profiles(*)')
    .single();
  return data;
}

export async function isFollowing(followerId, followingId) {
  const { data } = await supabase
    .from('follows')
    .select('*')
    .eq('follower_id', followerId)
    .eq('following_id', followingId)
    .single();
  return !!data;
}

export async function toggleFollow(followerId, followingId, currentlyFollowing) {
  if (currentlyFollowing) {
    await supabase
      .from('follows')
      .delete()
      .eq('follower_id', followerId)
      .eq('following_id', followingId);
    return false;
  } else {
    await supabase
      .from('follows')
      .insert({ follower_id: followerId, following_id: followingId });
    return true;
  }
}

export async function fileClaim(clipId, reason, email) {
  const { data } = await supabase
    .from('claims')
    .insert({ clip_id: clipId, reason, claimant_email: email });
  return data;
}

export async function castVote(supabase, clipId, userId, direction) {
  const { data: existing } = await supabase
    .from('votes')
    .select('id, direction')
    .eq('clip_id', clipId)
    .eq('user_id', userId)
    .single();

  if (existing) {
    if (existing.direction === direction) {
      await supabase.from('votes').delete().eq('id', existing.id);
      return 'removed';
    } else {
      await supabase.from('votes').update({ direction }).eq('id', existing.id);
      return 'switched';
    }
  } else {
    await supabase.from('votes').insert({ clip_id: clipId, user_id: userId, direction });
    return 'added';
  }
}

export async function getUserVote(supabase, clipId, userId) {
  if (!userId) return null;
  const { data } = await supabase
    .from('votes')
    .select('direction')
    .eq('clip_id', clipId)
    .eq('user_id', userId)
    .single();
  return data?.direction ?? null;
}

export function generateSlug(title) {
  if (!title) return Math.random().toString(36).slice(2, 10);

  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60)
    + '-' + Math.random().toString(36).slice(2, 7);
}

export async function deleteClip(clipId, userId) {
  const { error } = await supabase
    .from('clips')
    .delete()
    .eq('id', clipId)
    .eq('user_id', userId);
  if (error) throw error;
  return true;
}

export async function deleteComment(commentId, userId) {
  const { error } = await supabase
    .from('comments')
    .delete()
    .eq('id', commentId)
    .eq('user_id', userId);
  if (error) throw error;
  return true;
}
