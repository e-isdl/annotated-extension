export async function createAnnotatedPost(client, payload) {
  const { data, error } = await client.rpc('create_annotated_post', {
    p_community_id: payload.community_id ?? null,
    p_title: payload.title,
    p_source_url: payload.source_url,
    p_source_type: payload.source_type,
    p_source_domain: payload.source_domain,
    p_source_title: payload.source_title,
    p_annotation_type: payload.annotation_type,
    p_article_text: payload.article_text,
    p_start_sec: payload.start_sec,
    p_end_sec: payload.end_sec,
    p_slug: payload.slug,
    p_annotation: payload.annotation,
  });
  if (error) throw error;
  return data;
}

export async function createExtensionPost(client, payload) {
  const { data, error } = await client.rpc('create_extension_post', {
    p_community_id: payload.community_id ?? null,
    p_title: payload.title,
    p_source_url: payload.source_url,
    p_source_type: payload.source_type,
    p_source_domain: payload.source_domain ?? null,
    p_source_title: payload.source_title ?? null,
    p_author: payload.author ?? null,
    p_thumbnail: payload.thumbnail ?? null,
    p_youtube_id: payload.youtube_id ?? null,
    p_source_audio_url: payload.source_audio_url ?? null,
    p_transcript: payload.transcript ?? null,
    p_annotation_type: payload.annotation_type,
    p_article_text: payload.article_text ?? null,
    p_start_sec: payload.start_sec ?? null,
    p_end_sec: payload.end_sec ?? null,
    p_duration: payload.duration ?? null,
    p_slug: payload.slug,
    p_annotation: payload.annotation ?? null,
    p_annotation_audio_url: payload.annotation_audio_url ?? null,
    p_video_url: payload.video_url ?? null,
    p_video_status: payload.video_status ?? null,
  });
  if (error) throw error;
  return data;
}

export async function castVote(client, clipId, userId, direction) {
  const { data, error } = await client.rpc('toggle_vote', {
    p_clip_id: clipId,
    p_direction: direction,
  });
  if (error) throw error;
  return data;
}

export async function createComment(client, payload) {
  const { data, error } = await client
    .from('comments')
    .insert(payload)
    .select('*, profiles(*)')
    .single();
  if (error) throw error;
  return data;
}
