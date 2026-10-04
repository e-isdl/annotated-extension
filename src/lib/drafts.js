// Thin Supabase calls for annotation drafts. Mirrored in the extension and
// the web app (separate bundles); keep the two copies in sync.

async function ownerId(client) {
  const { data: { user } } = await client.auth.getUser();
  if (!user) throw new Error('Sign in first.');
  return user.id;
}

export async function listDrafts(client) {
  const { data, error } = await client
    .from('drafts')
    .select('*')
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function getDraft(client, id) {
  if (!id) return null;
  const { data, error } = await client.from('drafts').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function upsertDraft(client, draft) {
  const { id, ...fields } = draft || {};
  if (id) {
    const { data, error } = await client.from('drafts').update(fields).eq('id', id).select('id').maybeSingle();
    if (error) throw error;
    if (data?.id) return data.id;
  }
  const uid = await ownerId(client);
  const { data, error } = await client.from('drafts').insert({ ...fields, user_id: uid }).select('id').single();
  if (error) throw error;
  return data.id;
}

export async function deleteDraft(client, id) {
  if (!id) return;
  const { error } = await client.from('drafts').delete().eq('id', id);
  if (error) throw error;
}

export async function publishDraft(client, input) {
  const { data, error } = await client.rpc('create_extension_post', {
    p_community_id: input.communityId ?? null,
    p_title: input.title,
    p_source_url: input.sourceUrl,
    p_source_type: input.sourceType,
    p_source_domain: input.sourceDomain ?? null,
    p_source_title: input.sourceTitle ?? null,
    p_author: input.author ?? null,
    p_thumbnail: input.thumbnail ?? null,
    p_youtube_id: input.youtubeId ?? null,
    p_source_audio_url: input.sourceAudioUrl ?? null,
    p_transcript: input.transcript ?? null,
    p_annotation_type: input.kind,
    p_article_text: input.articleText ?? null,
    p_start_sec: input.startSec ?? null,
    p_end_sec: input.endSec ?? null,
    p_duration: input.duration ?? null,
    p_slug: input.slug,
    p_annotation: input.annotation ?? null,
    p_annotation_audio_url: input.annotationAudioUrl ?? null,
    p_video_url: null,
    p_video_status: null,
  });
  if (error) throw error;
  if (input.draftId) {
    try { await client.from('drafts').delete().eq('id', input.draftId); } catch {}
  }
  return data;
}
