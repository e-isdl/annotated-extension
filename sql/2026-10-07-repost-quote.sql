-- Repost and quote support. Both ride on the existing clips rows (with
-- parent_clip_id pointing at the original) so every feed, profile, vote,
-- comment, save and detail surface works unchanged. The takes queries
-- must exclude the 'Repost' and 'Quote' annotation types (client-side).
-- Mirrors the conventions of create_annotated_post (SECURITY DEFINER,
-- auth.uid actor, jsonb result). No table or view changes.

create or replace function public.toggle_repost(p_clip_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  actor uuid := auth.uid();
  target public.clips%rowtype;
  existing public.clips%rowtype;
  new_slug text;
begin
  if actor is null then raise exception 'Authentication required'; end if;
  select * into target from public.clips where id = p_clip_id;
  if not found then raise exception 'Post not found'; end if;
  -- Reposting a repost reshares the original, so counts stay in one place.
  if target.annotation_type = 'Repost' and target.parent_clip_id is not null then
    select * into target from public.clips where id = target.parent_clip_id;
    if not found then raise exception 'Post not found'; end if;
  end if;
  if target.user_id = actor then raise exception 'You cannot repost your own post'; end if;
  select * into existing from public.clips
    where parent_clip_id = target.id and user_id = actor and annotation_type = 'Repost'
    order by created_at desc limit 1;
  if found then
    delete from public.clips where id = existing.id;
    return jsonb_build_object('reposted', false);
  end if;
  new_slug := coalesce(target.slug, 'post') || '-repost-' || substr(md5(actor::text || target.id::text || now()::text), 1, 6);
  insert into public.clips (
    user_id, community_id, source_url, source_type, source_domain, source_title,
    title, thumbnail, youtube_id, start_sec, end_sec, article_text, author,
    duration, annotation_type, parent_clip_id, slug
  ) values (
    actor, target.community_id, target.source_url, target.source_type, target.source_domain, target.source_title,
    target.title, target.thumbnail, target.youtube_id, target.start_sec, target.end_sec, target.article_text, target.author,
    target.duration, 'Repost', target.id, new_slug
  ) returning * into existing;
  return jsonb_build_object('reposted', true, 'id', existing.id, 'slug', existing.slug);
end;
$function$;

create or replace function public.create_quote_post(p_clip_id uuid, p_annotation text, p_community_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  actor uuid := auth.uid();
  target public.clips%rowtype;
  community uuid;
  created_clip public.clips%rowtype;
  new_slug text;
begin
  if actor is null then raise exception 'Authentication required'; end if;
  select * into target from public.clips where id = p_clip_id;
  if not found then raise exception 'Post not found'; end if;
  if nullif(trim(p_annotation), '') is null then raise exception 'Add your take to quote this post'; end if;
  if length(trim(p_annotation)) > 1000 then raise exception 'Quote exceeds the 1000 character limit'; end if;
  community := coalesce(p_community_id, target.community_id);
  if community is not null and not exists (select 1 from public.communities where id = community) then
    raise exception 'Choose a valid community';
  end if;
  new_slug := coalesce(target.slug, 'post') || '-quote-' || substr(md5(actor::text || target.id::text || now()::text), 1, 6);
  insert into public.clips (
    user_id, community_id, source_url, source_type, source_domain, source_title,
    title, thumbnail, youtube_id, start_sec, end_sec, article_text, author,
    duration, annotation_type, parent_clip_id, slug
  ) values (
    actor, community, target.source_url, target.source_type, target.source_domain, target.source_title,
    coalesce(target.title, 'Quoted post'), target.thumbnail, target.youtube_id, target.start_sec, target.end_sec,
    target.article_text, target.author, target.duration, 'Quote', target.id, new_slug
  ) returning * into created_clip;

  insert into public.annotations (clip_id, user_id, text_content)
  values (created_clip.id, actor, trim(p_annotation));

  return jsonb_build_object('id', created_clip.id, 'slug', created_clip.slug);
end;
$function$;
