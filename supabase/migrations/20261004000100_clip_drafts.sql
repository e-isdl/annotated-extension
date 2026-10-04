-- Stashed clips: save now, annotate later. Owner-only by construction so
-- drafts can never leak into any public surface (feed, profiles, search).

create table if not exists public.clip_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  community_id uuid null,
  title text not null,
  source_url text not null,
  source_type text not null,
  source_domain text null,
  source_title text null,
  author text null,
  thumbnail text null,
  youtube_id text null,
  source_audio_url text null,
  transcript text null,
  article_text text null,
  start_sec integer null,
  end_sec integer null,
  duration integer null,
  video_url text null,
  video_status text not null default 'ready',
  created_at timestamptz not null default now()
);

alter table public.clip_drafts enable row level security;

drop policy if exists clip_drafts_owner_select on public.clip_drafts;
create policy clip_drafts_owner_select on public.clip_drafts
  for select to authenticated using (user_id = auth.uid());

drop policy if exists clip_drafts_owner_insert on public.clip_drafts;
create policy clip_drafts_owner_insert on public.clip_drafts
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists clip_drafts_owner_delete on public.clip_drafts;
create policy clip_drafts_owner_delete on public.clip_drafts
  for delete to authenticated using (user_id = auth.uid());

create or replace function public.create_clip_draft(
  p_community_id uuid,
  p_title text,
  p_source_url text,
  p_source_type text,
  p_source_domain text default null,
  p_source_title text default null,
  p_author text default null,
  p_thumbnail text default null,
  p_youtube_id text default null,
  p_source_audio_url text default null,
  p_transcript text default null,
  p_article_text text default null,
  p_start_sec integer default null,
  p_end_sec integer default null,
  p_duration integer default null,
  p_video_url text default null,
  p_video_status text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  draft_id uuid;
begin
  if actor is null then raise exception 'Authentication required'; end if;
  if p_community_id is not null and not exists (select 1 from public.communities where id = p_community_id) then
    raise exception 'Choose a valid community';
  end if;
  if nullif(trim(p_title), '') is null then raise exception 'A clip title is required'; end if;
  if length(trim(p_title)) > 500 then raise exception 'Clip title is too long'; end if;
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
    raise exception 'Audio URL is only valid for podcast clips';
  end if;
  if p_video_url is not null and (p_source_type <> 'youtube' or p_video_url !~* '^https?://') then
    raise exception 'Clip file is only valid for video clips';
  end if;
  if p_video_status is not null and p_video_status not in ('uploading', 'ready', 'failed') then
    raise exception 'Invalid video status';
  end if;
  if p_transcript is not null and p_source_type <> 'youtube' then
    raise exception 'Transcripts are only supported for YouTube clips';
  end if;
  if (p_start_sec is not null and (p_source_type <> 'youtube' or p_start_sec < 0 or p_end_sec is null or p_end_sec <= p_start_sec))
    or (p_start_sec is null and p_end_sec is not null) then
    raise exception 'Moment timestamps are invalid';
  end if;

  insert into public.clip_drafts (
    user_id, community_id, title, source_url, source_type, source_domain,
    source_title, author, thumbnail, youtube_id, source_audio_url, transcript,
    article_text, start_sec, end_sec, duration, video_url, video_status
  ) values (
    actor, p_community_id, trim(p_title), p_source_url, p_source_type, p_source_domain,
    p_source_title, p_author, p_thumbnail, p_youtube_id, p_source_audio_url, p_transcript,
    nullif(trim(p_article_text), ''), p_start_sec, p_end_sec, p_duration, p_video_url,
    coalesce(p_video_status, 'ready')
  ) returning id into draft_id;

  return jsonb_build_object('id', draft_id);
end;
$$;

revoke all on function public.create_clip_draft(uuid, text, text, text, text, text, text, text, text, text, text, text, integer, integer, integer, text, text) from public, anon;
grant execute on function public.create_clip_draft(uuid, text, text, text, text, text, text, text, text, text, text, text, integer, integer, integer, text, text) to authenticated;
