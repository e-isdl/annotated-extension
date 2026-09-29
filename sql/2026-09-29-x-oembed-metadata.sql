-- Feature: X post metadata (author + post text) fetched on the server at post creation.
--
-- How it works:
--   * An AFTER INSERT trigger on clips queues a pg_net GET to
--     https://publish.twitter.com/oembed?omit_script=true&url=<source_url> for
--     source_type='social' X status URLs. The request only fires once the creating
--     transaction commits, so creation stays atomic and never waits on X.
--   * public.refresh_x_metadata(clip_id) reads the response when it lands, takes
--     author_name / author_url from the JSON and the <p> text from the returned
--     blockquote, strips all HTML tags and decodes entities, then stores the plain
--     text on clips.author / clips.author_url / clips.source_excerpt. The returned
--     HTML is never stored or rendered.
--   * Failures (timeout, non-200, unparseable body) are recorded once in
--     x_oembed_requests.failed and never retried, so a dead post cannot loop.
--   * The webapp renders a compact card by default and polls refresh_x_metadata
--     until the metadata lands; widgets.js is only loaded when the reader expands.
--
-- Additive only:
--   * one nullable column (clips.author_url)
--   * one bookkeeping table (x_oembed_requests, RLS on with no policies)
--   * helper functions + one trigger + public.refresh_x_metadata
--   * both post-creation RPCs gain a social-URL check (signatures unchanged)
--   * clips_with_scores gains c.author_url (appended in place)
--
-- Applied to production 2026-09-29.

begin;

create extension if not exists pg_net with schema extensions;

alter table public.clips
  add column if not exists author_url text;

create table if not exists public.x_oembed_requests (
  clip_id uuid primary key references public.clips (id) on delete cascade,
  request_id bigint,
  failed boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.x_oembed_requests enable row level security;

-- X status URLs: x.com|twitter.com (optional www) + /<handle>/status/<numeric id>.
-- Mirrors webapp/src/lib/social.js matchStatusUrl.
create or replace function public.is_x_status_url(p_url text)
returns boolean
language sql
immutable
set search_path to 'public'
as $function$
  select p_url ~* '^https?://(www\.)?(x|twitter)\.com/[^/?#]+/status/[0-9]+';
$function$;

create or replace function public.x_oembed_urlencode(p_url text)
returns text
language sql
immutable
set search_path to 'public'
as $function$
  select replace(replace(replace(replace(replace(replace(replace(replace(
    p_url, '%', '%25'), ':', '%3A'), '/', '%2F'), '?', '%3F'),
    '&', '%26'), '=', '%3D'), '#', '%23'), '+', '%2B');
$function$;

-- Best-effort decoder for the entities X's oEmbed HTML uses: common named
-- entities plus decimal and hexadecimal numeric references.
create or replace function public.decode_html_entities(p_text text)
returns text
language plpgsql
immutable
set search_path to 'public'
as $function$
declare
  v_entity text;
  v_digits text;
  v_code bigint;
begin
  if p_text is null then
    return null;
  end if;

  p_text := replace(p_text, '&nbsp;', ' ');
  p_text := replace(p_text, '&quot;', '"');
  p_text := replace(p_text, '&#39;', '''');
  p_text := replace(p_text, '&apos;', '''');
  p_text := replace(p_text, '&lt;', '<');
  p_text := replace(p_text, '&gt;', '>');
  p_text := replace(p_text, '&mdash;', '—');
  p_text := replace(p_text, '&ndash;', '–');
  p_text := replace(p_text, '&hellip;', '…');
  p_text := replace(p_text, '&amp;', '&');

  loop
    v_entity := substring(p_text from '&#[0-9]+;');
    exit when v_entity is null;
    v_digits := substring(v_entity from '[0-9]+');
    if length(v_digits) <= 7 then
      v_code := v_digits::bigint;
    else
      v_code := -1;
    end if;
    if v_code between 1 and 1114111 and (v_code < 55296 or v_code > 57343) then
      p_text := replace(p_text, v_entity, chr(v_code::integer));
    else
      p_text := replace(p_text, v_entity, '');
    end if;
  end loop;

  loop
    v_entity := substring(p_text from '&#[xX][0-9a-fA-F]+;');
    exit when v_entity is null;
    v_digits := substring(v_entity from '[0-9a-fA-F]+');
    if length(v_digits) <= 6 then
      v_code := (('x' || lpad(lower(v_digits), 6, '0'))::text)::bit(24)::int;
    else
      v_code := -1;
    end if;
    if v_code between 1 and 1114111 and (v_code < 55296 or v_code > 57343) then
      p_text := replace(p_text, v_entity, chr(v_code::integer));
    else
      p_text := replace(p_text, v_entity, '');
    end if;
  end loop;

  return p_text;
end;
$function$;

create or replace function public.queue_x_oembed(p_clip_id uuid, p_source_url text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_request_id bigint;
begin
  if p_source_url is null or not public.is_x_status_url(p_source_url) then
    return;
  end if;

  insert into public.x_oembed_requests (clip_id)
  values (p_clip_id)
  on conflict (clip_id) do nothing;

  select r.request_id into v_request_id
    from public.x_oembed_requests r
   where r.clip_id = p_clip_id;

  if v_request_id is null then
    select net.http_get(
      'https://publish.twitter.com/oembed?omit_script=true&url='
        || public.x_oembed_urlencode(p_source_url)
    ) into v_request_id;

    update public.x_oembed_requests
       set request_id = v_request_id,
           created_at = now()
     where clip_id = p_clip_id;
  end if;
end;
$function$;

create or replace function public.clips_queue_x_oembed()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if NEW.source_type = 'social' then
    perform public.queue_x_oembed(NEW.id, NEW.source_url);
  end if;
  return NEW;
end;
$function$;

drop trigger if exists clips_queue_x_oembed_trigger on public.clips;
create trigger clips_queue_x_oembed_trigger
  after insert on public.clips
  for each row
  execute function public.clips_queue_x_oembed();

-- Reads the queued oEmbed response, strips the blockquote HTML down to plain
-- text, and stores author/author_url/text on the clip. Returns null while the
-- request is in flight or after a terminal failure so callers can stop polling.
create or replace function public.refresh_x_metadata(p_clip_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_clip public.clips%rowtype;
  v_request record;
  v_response record;
  v_doc jsonb;
  v_html text;
  v_paragraph text;
  v_author text;
  v_author_url text;
  v_text text;
begin
  select * into v_clip from public.clips where id = p_clip_id;
  if not found then
    return null;
  end if;
  if v_clip.source_type is distinct from 'social'
    or not public.is_x_status_url(v_clip.source_url) then
    return null;
  end if;

  select * into v_request from public.x_oembed_requests where clip_id = p_clip_id;

  if not found then
    if v_clip.source_excerpt is not null then
      return jsonb_build_object(
        'author', v_clip.author,
        'author_url', v_clip.author_url,
        'text', v_clip.source_excerpt
      );
    end if;
    perform public.queue_x_oembed(p_clip_id, v_clip.source_url);
    return null;
  end if;

  if v_request.failed or v_request.request_id is null then
    return null;
  end if;

  select * into v_response from net._http_response where id = v_request.request_id;
  if not found then
    return null;
  end if;

  if v_response.timed_out
    or v_response.error_msg is not null
    or v_response.status_code is distinct from 200 then
    update public.x_oembed_requests set failed = true where clip_id = p_clip_id;
    return null;
  end if;

  begin
    v_doc := v_response.content::jsonb;
  exception when others then
    update public.x_oembed_requests set failed = true where clip_id = p_clip_id;
    return null;
  end;

  v_author := nullif(trim(coalesce(v_doc->>'author_name', '')), '');
  v_author_url := nullif(trim(coalesce(v_doc->>'author_url', '')), '');
  v_html := v_doc->>'html';

  if v_html is not null then
    v_paragraph := substring(v_html from '<p[^>]*>(.*?)</p>');
    if v_paragraph is not null then
      v_paragraph := regexp_replace(v_paragraph, '<br[[:space:]]*/?>', E'\n', 'gi');
      v_paragraph := regexp_replace(v_paragraph, '<[^>]+>', '', 'g');
      v_text := nullif(trim(public.decode_html_entities(v_paragraph)), '');
    end if;
  end if;

  if v_text is null then
    update public.x_oembed_requests set failed = true where clip_id = p_clip_id;
    return null;
  end if;

  update public.clips
     set author = coalesce(v_author, author),
         author_url = coalesce(v_author_url, author_url),
         source_excerpt = v_text
   where id = p_clip_id;

  delete from public.x_oembed_requests where clip_id = p_clip_id;

  return jsonb_build_object('author', v_author, 'author_url', v_author_url, 'text', v_text);
end;
$function$;

revoke execute on function public.is_x_status_url(text) from public;
revoke execute on function public.x_oembed_urlencode(text) from public;
revoke execute on function public.decode_html_entities(text) from public;
revoke execute on function public.queue_x_oembed(uuid, text) from public;
revoke execute on function public.clips_queue_x_oembed() from public;
revoke execute on function public.refresh_x_metadata(uuid) from public;

grant execute on function public.refresh_x_metadata(uuid)
  to postgres, authenticated, anon, service_role;

-- Social posts must be X status URLs (validated before the type/XOR checks).
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
  if p_source_type = 'social' and not public.is_x_status_url(p_source_url) then
    raise exception 'Share an X post link, like https://x.com/user/status/123';
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
    c.duration,
    c.author_url
   FROM ((clips c
     LEFT JOIN clip_scores v ON ((v.clip_id = c.id)))
     LEFT JOIN ( SELECT comments.clip_id,
            (count(*))::integer AS comments_count
           FROM comments
          GROUP BY comments.clip_id) cm ON ((cm.clip_id = c.id)));

commit;
