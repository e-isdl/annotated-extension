-- Feature: dead clip-range strip under YouTube posts.
-- The strip needs the full video length to place the amber clip block; clips only
-- stored start_sec/end_sec, so this adds a nullable duration (seconds).
--
-- Additive only:
--   * one nullable integer column, no backfill in this file
--   * clips_with_scores gains c.duration (same column order, appended in place)
--   * both post-creation RPCs gain p_duration integer default null
--     (old signatures are dropped so PostgREST never sees overloads)
--
-- Existing callers that omit p_duration keep working: default null.
-- Applied to production 2026-09-29.

begin;

alter table public.clips
  add column if not exists duration integer;

drop function if exists public.create_extension_post(uuid, text, text, text, text, text, text, text, text, text, text, text, text, integer, integer, text, text, text);

drop function if exists public.create_annotated_post(uuid, text, text, text, text, text, text, text, integer, integer, text, text);

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
  p_duration integer default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
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
  if length(trim(p_title)) > 180 then raise exception 'Post title is too long'; end if;
  if length(coalesce(p_article_text, '')) > 2000 then raise exception 'Source context is too long'; end if;
  if p_annotation_type is null or p_annotation_type not in ('Reaction', 'Fact check', 'Explainer', 'Steelman', 'Found receipts') then
    raise exception 'Choose a valid post type';
  end if;
  if nullif(trim(p_annotation), '') is not null and length(trim(p_annotation)) > (case p_annotation_type
    when 'Reaction' then 280
    when 'Fact check' then 500
    when 'Explainer' then 600
    when 'Steelman' then 800
    else 1000
  end) then
    raise exception 'Commentary exceeds its type-specific character limit';
  end if;
  if p_source_url is null or p_source_url !~* '^https?://' then
    raise exception 'Source URL must use HTTP or HTTPS';
  end if;
  if p_source_type is null or p_source_type not in ('article', 'youtube', 'podcast', 'social') then
    raise exception 'Choose a supported source type';
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
    article_text, start_sec, end_sec, duration, slug
  ) values (
    actor, p_community_id, p_source_url, p_source_type, p_source_domain, p_source_title,
    p_author, p_thumbnail, p_youtube_id, p_source_audio_url, p_transcript, trim(p_title),
    p_annotation_type, nullif(trim(p_article_text), ''), p_start_sec, p_end_sec, safe_duration, p_slug
  ) returning * into created_clip;

  insert into public.annotations (clip_id, user_id, text_content, audio_url)
  values (created_clip.id, actor, nullif(trim(p_annotation), ''), nullif(trim(p_annotation_audio_url), ''));

  return jsonb_build_object('id', created_clip.id, 'slug', created_clip.slug);
end;
$function$;

create or replace function public.create_annotated_post(
  p_community_id uuid,
  p_title text,
  p_source_url text,
  p_source_type text,
  p_source_domain text,
  p_source_title text,
  p_annotation_type text,
  p_article_text text,
  p_start_sec integer,
  p_end_sec integer,
  p_slug text,
  p_annotation text,
  p_duration integer default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
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
  if nullif(trim(p_title), '') is null or nullif(trim(p_annotation), '') is null then
    raise exception 'A post title and annotation are required';
  end if;
  if length(trim(p_title)) > 180 then raise exception 'Post title is too long'; end if;
  if length(coalesce(p_article_text, '')) > 2000 then raise exception 'Source context is too long'; end if;
  if p_annotation_type is null or p_annotation_type not in ('Reaction', 'Fact check', 'Explainer', 'Steelman', 'Found receipts') then
    raise exception 'Choose a valid annotation type';
  end if;
  if length(trim(p_annotation)) > (case p_annotation_type
    when 'Reaction' then 280
    when 'Fact check' then 500
    when 'Explainer' then 600
    when 'Steelman' then 800
    else 1000
  end) then
    raise exception 'Annotation exceeds its type-specific character limit';
  end if;
  if p_source_url is not null and p_source_url !~* '^https?://' then
    raise exception 'Source URL must use HTTP or HTTPS';
  end if;
  if p_source_type is null or p_source_type not in ('article', 'youtube', 'podcast', 'social', 'text') then
    raise exception 'Choose a valid source type';
  end if;
  if (p_source_type = 'text') <> (p_source_url is null) then
    raise exception 'Text posts have no source URL; source posts require one';
  end if;
  if (p_start_sec is not null and (p_source_type <> 'youtube' or p_start_sec < 0 or p_end_sec is null or p_end_sec <= p_start_sec))
    or (p_start_sec is null and p_end_sec is not null) then
    raise exception 'Moment timestamps are invalid';
  end if;

  insert into public.clips (
    user_id, community_id, source_url, source_type, source_domain, source_title,
    title, annotation_type, article_text, start_sec, end_sec, duration, slug
  ) values (
    actor, p_community_id, p_source_url, p_source_type, p_source_domain, p_source_title,
    trim(p_title), p_annotation_type, nullif(trim(p_article_text), ''), p_start_sec, p_end_sec, safe_duration, p_slug
  ) returning * into created_clip;

  insert into public.annotations (clip_id, user_id, text_content)
  values (created_clip.id, actor, trim(p_annotation));

  return jsonb_build_object('id', created_clip.id, 'slug', created_clip.slug);
end;
$function$;

grant execute on function public.create_extension_post(uuid, text, text, text, text, text, text, text, text, text, text, text, text, integer, integer, text, text, text, integer)
  to postgres, authenticated, service_role;

grant execute on function public.create_annotated_post(uuid, text, text, text, text, text, text, text, integer, integer, text, text, integer)
  to postgres, authenticated, service_role;

create or replace view public.clips_with_scores
with (security_invoker = true) as
 SELECT c.id,
    c.user_id,
    c.source_url,
    c.source_type,
    c.title,
    c.thumbnail,
    c.youtube_id,
    c.start_sec,
    c.end_sec,
    c.article_text,
    c.author,
    c.audio_url,
    c.slug,
    c.parent_clip_id,
    c.thread_position,
    c.created_at,
    c.transcript,
    c.community_id,
    c.annotation_type,
    c.source_domain,
    c.source_title,
    c.source_image_url,
    c.source_excerpt,
    COALESCE(v.score, 0) AS score,
    COALESCE(cm.comments_count, 0) AS comments_count,
    ((COALESCE(v.score, 0) + (COALESCE(cm.comments_count, 0) * 3)))::numeric AS best_score,
    (((COALESCE(v.score, 0) + (COALESCE(cm.comments_count, 0) * 2)))::numeric / power(((EXTRACT(epoch FROM (now() - c.created_at)) / 3600.0) + 2)::numeric, 1.4)) AS hot_score,
    c.duration
   FROM ((clips c
     LEFT JOIN clip_scores v ON ((v.clip_id = c.id)))
     LEFT JOIN ( SELECT comments.clip_id,
            (count(*))::integer AS comments_count
           FROM comments
          GROUP BY comments.clip_id) cm ON ((cm.clip_id = c.id)));

commit;
