-- Authenticated discussion and comment ranking.
-- Additive: existing comments and post votes are preserved.

alter table public.comments enable row level security;

do $$
declare
  policy_row record;
begin
  for policy_row in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'comments'
      and cmd in ('INSERT', 'ALL')
  loop
    execute format('drop policy if exists %I on public.comments', policy_row.policyname);
  end loop;
end;
$$;

create policy "Authenticated users can comment as themselves"
  on public.comments for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Comments are publicly readable" on public.comments;
create policy "Comments are publicly readable"
  on public.comments for select
  using (true);

drop policy if exists "Users can delete their own comments" on public.comments;
create policy "Users can delete their own comments"
  on public.comments for delete
  to authenticated
  using (auth.uid() = user_id);

-- Vote identities are private; public post totals continue to be served from
-- clips_with_scores, while a signed-in user can read only their own vote row.
alter table public.votes enable row level security;
do $$
declare
  policy_row record;
begin
  for policy_row in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'votes'
      and cmd in ('SELECT', 'ALL')
  loop
    execute format('drop policy if exists %I on public.votes', policy_row.policyname);
  end loop;
end;
$$;

create policy "Users can read their own votes"
  on public.votes for select
  to authenticated
  using (auth.uid() = user_id);

-- Normalize any legacy notification INSERT policies, then deny direct client
-- writes even if a dashboard/manual SQL policy was previously present.
alter table public.notifications enable row level security;
do $$
declare
  policy_row record;
begin
  for policy_row in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'notifications'
      and cmd in ('INSERT', 'ALL')
  loop
    execute format('drop policy if exists %I on public.notifications', policy_row.policyname);
  end loop;
end;
$$;
revoke insert on public.notifications from anon, authenticated;
drop policy if exists "Users read own notifications" on public.notifications;
create policy "Users read own notifications"
  on public.notifications for select
  to authenticated
  using (auth.uid() = user_id);
drop policy if exists "Users update own notifications" on public.notifications;
create policy "Users update own notifications"
  on public.notifications for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function public.toggle_vote(p_clip_id uuid, p_direction smallint)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  current_direction smallint;
begin
  if actor is null then raise exception 'Authentication required'; end if;
  if p_direction not in (-1, 1) then raise exception 'Vote direction must be -1 or 1'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_clip_id::text || actor::text, 0));
  select direction into current_direction
  from public.votes
  where clip_id = p_clip_id and user_id = actor
  for update;

  if found and current_direction = p_direction then
    delete from public.votes where clip_id = p_clip_id and user_id = actor;
    return 'removed';
  elsif found then
    update public.votes set direction = p_direction
    where clip_id = p_clip_id and user_id = actor;
    return 'switched';
  else
    insert into public.votes (clip_id, user_id, direction)
    values (p_clip_id, actor, p_direction);
    return 'added';
  end if;
end;
$$;

revoke all on function public.toggle_vote(uuid, smallint) from public;
grant execute on function public.toggle_vote(uuid, smallint) to authenticated;

create table if not exists public.comment_votes (
  comment_id uuid not null references public.comments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  direction smallint not null check (direction in (-1, 1)),
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

create index if not exists comment_votes_comment_idx
  on public.comment_votes(comment_id);

alter table public.comment_votes enable row level security;

drop policy if exists "Comment votes are publicly readable" on public.comment_votes;
drop policy if exists "Users can read their own comment votes" on public.comment_votes;
create policy "Users can read their own comment votes"
  on public.comment_votes for select
  to authenticated
  using (auth.uid() = user_id);

create or replace view public.comment_vote_scores as
select comment_id, sum(direction)::int as score, count(*)::int as vote_count
from public.comment_votes
group by comment_id;

grant select on public.comment_vote_scores to anon, authenticated;

drop policy if exists "Users can vote on comments as themselves" on public.comment_votes;
create policy "Users can vote on comments as themselves"
  on public.comment_votes for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can change their comment votes" on public.comment_votes;
create policy "Users can change their comment votes"
  on public.comment_votes for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can remove their comment votes" on public.comment_votes;
create policy "Users can remove their comment votes"
  on public.comment_votes for delete
  to authenticated
  using (auth.uid() = user_id);

create or replace function public.toggle_comment_vote(p_comment_id uuid, p_direction smallint)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  current_direction smallint;
begin
  if actor is null then raise exception 'Authentication required'; end if;
  if p_direction not in (-1, 1) then raise exception 'Vote direction must be -1 or 1'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_comment_id::text || actor::text, 0));

  select direction into current_direction
  from public.comment_votes
  where comment_id = p_comment_id and user_id = actor
  for update;

  if found and current_direction = p_direction then
    delete from public.comment_votes where comment_id = p_comment_id and user_id = actor;
    return 'removed';
  elsif found then
    update public.comment_votes set direction = p_direction
    where comment_id = p_comment_id and user_id = actor;
    return 'switched';
  else
    insert into public.comment_votes (comment_id, user_id, direction)
    values (p_comment_id, actor, p_direction);
    return 'added';
  end if;
end;
$$;

revoke all on function public.toggle_comment_vote(uuid, smallint) from public;
grant execute on function public.toggle_comment_vote(uuid, smallint) to authenticated;

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
  if p_community_id is null or not exists (select 1 from public.communities where id = p_community_id) then
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
  if length(trim(p_annotation)) > case p_annotation_type
    when 'Reaction' then 280
    when 'Fact check' then 500
    when 'Explainer' then 600
    when 'Steelman' then 800
    else 1000
  end then
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
