-- Whole-tweet screen recordings: non-looping clips up to 60s.
-- Relaxes the loop-only media_kind check and the 6s duration cap.

drop function if exists public.create_extension_post(uuid, text, text, text, text, text, text, text, text, text, text, text, text, integer, integer, text, text, text, integer, text, text, text, text, integer, integer, integer, text);

create or replace function public.create_extension_post(
  p_community_id uuid,
  p_title text,
  p_source_url text,
  p_source_type text,
  p_source_domain text,
  p_source_title text,
  p_author text,
  p_thumbnail text,
  p_youtube_id text,
  p_source_audio_url text,
  p_transcript text,
  p_annotation_type text,
  p_article_text text,
  p_start_sec integer,
  p_end_sec integer,
  p_slug text,
  p_annotation text,
  p_annotation_audio_url text,
  p_duration integer default null,
  p_video_url text default null,
  p_video_status text default null,
  p_media_url text default null,
  p_media_kind text default null,
  p_media_w integer default null,
  p_media_h integer default null,
  p_media_duration_ms integer default null,
  p_poster_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  created_clip public.clips%rowtype;
  safe_duration integer := case
    when p_duration is not null and p_duration > coalesce(p_end_sec, 0)
    then p_duration
  end;
begin
  if actor is null then raise exception 'Authentication required'; end if;
  if p_community_id is not null and not exists (select 1 from public.communities where id = p_community_id) then
    raise exception 'Choose a valid community';
  end if;
  if nullif(trim(p_title), '') is null then raise exception 'A post title is required'; end if;
  if nullif(trim(p_annotation), '') is null and nullif(trim(p_annotation_audio_url), '') is null then
    raise exception 'Add text or audio commentary';
  end if;
  if length(trim(p_title)) > (case when p_source_type = 'social' then 25000 else 180 end) then
    raise exception 'Post title is too long';
  end if;
  if length(coalesce(p_article_text, '')) > (case when p_source_type = 'social' then 25000 else 2000 end) then
    raise exception 'Source context is too long';
  end if;
  if p_annotation_type is null or p_annotation_type not in ('Reaction', 'Fact check', 'Explainer', 'Hot take', 'Question') then
    raise exception 'Choose a valid post type';
  end if;
  if nullif(trim(p_annotation), '') is not null and length(trim(p_annotation)) > 1000 then
    raise exception 'Commentary exceeds its type-specific character limit';
  end if;
  if p_source_url is null or p_source_url !~* '^https?://' then
    raise exception 'Source URL must use HTTP or HTTPS';
  end if;
  if p_source_type is null or p_source_type not in ('article', 'youtube', 'podcast', 'social') then
    raise exception 'Choose a supported source type';
  end if;
  if p_source_type = 'social' and not public.is_x_status_url(p_source_url) then
    raise exception 'Share an X post link, like https://x.com/user/status/123';
  end if;
  if p_thumbnail is not null and p_thumbnail !~* '^https?://' then
    raise exception 'Thumbnail URL must use HTTP or HTTPS';
  end if;
  if p_source_audio_url is not null and (p_source_type <> 'podcast' or p_source_audio_url !~* '^https?://') then
    raise exception 'Audio URL is only valid for podcast posts';
  end if;
  if p_annotation_audio_url is not null and p_annotation_audio_url !~* '^https?://' then
    raise exception 'Commentary audio URL must use HTTP or HTTPS';
  end if;
  if p_video_url is not null and (p_source_type <> 'youtube' or p_video_url !~* '^https?://') then
    raise exception 'Clip file is only valid for video posts';
  end if;
  if p_video_status is not null and p_video_status not in ('uploading', 'ready', 'failed') then
    raise exception 'Invalid video status';
  end if;
  if p_media_url is not null and (p_source_type <> 'social' or p_media_url !~* '^https?://') then
    raise exception 'Post media is only valid for X posts';
  end if;
  if p_media_url is null and p_media_kind is not null then
    raise exception 'Media kind requires a media file';
  end if;
  if p_media_url is not null and p_media_kind is null then
    raise exception 'Media file requires a media kind';
  end if;
  if p_media_kind is not null and p_media_kind not in ('loop', 'clip') then
    raise exception 'Invalid media kind';
  end if;
  if (p_media_w is not null and p_media_w <= 0) or (p_media_h is not null and p_media_h <= 0) then
    raise exception 'Media dimensions are invalid';
  end if;
  if p_media_duration_ms is not null and (p_media_duration_ms <= 0 or p_media_duration_ms > 65000) then
    raise exception 'Media duration is invalid';
  end if;
  if p_poster_url is not null and (p_media_url is null or p_poster_url !~* '^https?://') then
    raise exception 'Media poster must use HTTP or HTTPS';
  end if;
  if p_transcript is not null and p_source_type <> 'youtube' then
    raise exception 'Transcripts are only supported for YouTube posts';
  end if;
  if (p_start_sec is not null and (p_source_type <> 'youtube' or p_start_sec < 0 or p_end_sec is null or p_end_sec <= p_start_sec))
    or (p_start_sec is null and p_end_sec is not null) then
    raise exception 'Moment timestamps are invalid';
  end if;

  insert into public.clips (
    user_id, community_id, source_url, source_type, source_domain, source_title,
    author, thumbnail, youtube_id, audio_url, transcript, title, annotation_type,
    article_text, start_sec, end_sec, duration, slug, video_url, video_status,
    media_url, media_kind, media_w, media_h, media_duration_ms, poster_url
  ) values (
    actor, p_community_id, p_source_url, p_source_type, p_source_domain, p_source_title,
    p_author, p_thumbnail, p_youtube_id, p_source_audio_url, p_transcript, trim(p_title),
    p_annotation_type, nullif(trim(p_article_text), ''), p_start_sec, p_end_sec, safe_duration, p_slug, p_video_url, coalesce(p_video_status, 'ready'),
    p_media_url, p_media_kind, p_media_w, p_media_h, p_media_duration_ms, p_poster_url
  ) returning * into created_clip;

  insert into public.annotations (clip_id, user_id, text_content, audio_url)
  values (created_clip.id, actor, nullif(trim(p_annotation), ''), nullif(trim(p_annotation_audio_url), ''));

  return jsonb_build_object('id', created_clip.id, 'slug', created_clip.slug);
end;
$$;

revoke all on function public.create_extension_post(uuid, text, text, text, text, text, text, text, text, text, text, text, text, integer, integer, text, text, text, integer, text, text, text, text, integer, integer, integer, text) from public, anon;
grant execute on function public.create_extension_post(uuid, text, text, text, text, text, text, text, text, text, text, text, text, integer, integer, text, text, text, integer, text, text, text, text, integer, integer, integer, text) to authenticated;
