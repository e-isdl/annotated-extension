-- Article thumbnails for webapp posts.
-- create_annotated_post (used by CreatePage) never accepted a thumbnail, so
-- webapp-created articles always stored NULL and the feed had no image to show.
-- Extension posts use create_extension_post with p_thumbnail and work fine.
--
-- Additive only:
--   * create_annotated_post gains p_thumbnail + p_source_image_url (default null)
--     (old signatures are dropped so PostgREST never sees overloads)
--   * both URLs validated as http(s) when present
--   * clips.thumbnail / clips.source_image_url written on insert
--
-- Existing callers that omit the new params keep working: default null.
-- Do NOT apply without review: production change, needs `supabase db push` + deploy.

begin;

drop function if exists public.create_annotated_post(uuid, text, text, text, text, text, text, text, integer, integer, text, text);
drop function if exists public.create_annotated_post(uuid, text, text, text, text, text, text, text, integer, integer, text, text, integer);
drop function if exists public.create_annotated_post(uuid, text, text, text, text, text, text, text, integer, integer, text, text, integer, text, text);

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
  p_duration integer default null,
  p_thumbnail text default null,
  p_source_image_url text default null
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
  if length(trim(p_title)) > (case when p_source_type = 'social' then 25000 else 180 end) then
    raise exception 'Post title is too long';
  end if;
  if length(coalesce(p_article_text, '')) > (case when p_source_type = 'social' then 25000 else 2000 end) then
    raise exception 'Source context is too long';
  end if;
  if p_annotation_type is null or p_annotation_type not in ('Reaction', 'Fact check', 'Explainer', 'Hot take', 'Question') then
    raise exception 'Choose a valid annotation type';
  end if;
  if length(trim(p_annotation)) > 1000 then
    raise exception 'Annotation exceeds its type-specific character limit';
  end if;
  if p_source_url is not null and p_source_url !~* '^https?://' then
    raise exception 'Source URL must use HTTP or HTTPS';
  end if;
  if p_thumbnail is not null and p_thumbnail !~* '^https?://' then
    raise exception 'Thumbnail URL must use HTTP or HTTPS';
  end if;
  if p_source_image_url is not null and p_source_image_url !~* '^https?://' then
    raise exception 'Source image URL must use HTTP or HTTPS';
  end if;
  if p_source_type is null or p_source_type not in ('article', 'youtube', 'podcast', 'social', 'text') then
    raise exception 'Choose a valid source type';
  end if;
  if (p_source_type = 'text') <> (p_source_url is null) then
    raise exception 'Text posts have no source URL; source posts require one';
  end if;
  if p_source_type = 'social' and not public.is_x_status_url(p_source_url) then
    raise exception 'Share an X post link, like https://x.com/user/status/123';
  end if;
  if (p_start_sec is not null and (p_source_type <> 'youtube' or p_start_sec < 0 or p_end_sec is null or p_end_sec <= p_start_sec))
    or (p_start_sec is null and p_end_sec is not null) then
    raise exception 'Moment timestamps are invalid';
  end if;

  insert into public.clips (
    user_id, community_id, source_url, source_type, source_domain, source_title,
    title, annotation_type, article_text, start_sec, end_sec, duration, slug,
    thumbnail, source_image_url
  ) values (
    actor, p_community_id, p_source_url, p_source_type, p_source_domain, p_source_title,
    trim(p_title), p_annotation_type, nullif(trim(p_article_text), ''), p_start_sec, p_end_sec, safe_duration, p_slug,
    nullif(trim(p_thumbnail), ''), nullif(trim(p_source_image_url), '')
  ) returning * into created_clip;

  insert into public.annotations (clip_id, user_id, text_content)
  values (created_clip.id, actor, trim(p_annotation));

  return jsonb_build_object('id', created_clip.id, 'slug', created_clip.slug);
end;
$function$;

grant execute on function public.create_annotated_post(uuid, text, text, text, text, text, text, text, integer, integer, text, text, integer, text, text)
  to postgres, authenticated, service_role;

commit;
