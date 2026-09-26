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
  p_annotation text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  created_clip public.clips%rowtype;
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
    title, annotation_type, article_text, start_sec, end_sec, slug
  ) values (
    actor, p_community_id, p_source_url, p_source_type, p_source_domain, p_source_title,
    trim(p_title), p_annotation_type, nullif(trim(p_article_text), ''), p_start_sec, p_end_sec, p_slug
  ) returning * into created_clip;

  insert into public.annotations (clip_id, user_id, text_content)
  values (created_clip.id, actor, trim(p_annotation));

  return jsonb_build_object('id', created_clip.id, 'slug', created_clip.slug);
end;
$$;

revoke all on function public.create_annotated_post(uuid, text, text, text, text, text, text, text, integer, integer, text, text) from public;
grant execute on function public.create_annotated_post(uuid, text, text, text, text, text, text, text, integer, integer, text, text) to authenticated;
