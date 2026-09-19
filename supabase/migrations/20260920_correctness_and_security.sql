-- Annotated correctness, engagement counts, and notification security.
-- Review and apply through the normal Supabase migration flow. This migration
-- deliberately does not delete or rewrite existing user data.

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('comment', 'follow', 'claim', 'like', 'clip')),
  message text not null,
  clip_id uuid references public.clips(id) on delete set null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_notifications_user_created
  on public.notifications(user_id, created_at desc);

-- A vote is a per-user state, not an append-only event.
create unique index if not exists votes_clip_user_unique
  on public.votes(clip_id, user_id);

drop view if exists public.clips_with_scores;
create view public.clips_with_scores as
select
  c.*,
  coalesce(v.score, 0)::int as score,
  coalesce(cm.comments_count, 0)::int as comments_count,
  (
    coalesce(v.score, 0) + coalesce(cm.comments_count, 0) * 3
  )::numeric as best_score,
  (
    coalesce(v.score, 0) + coalesce(cm.comments_count, 0) * 2
  ) / power(extract(epoch from (now() - c.created_at)) / 3600.0 + 2, 1.4) as hot_score
from public.clips c
left join (
  select clip_id, sum(direction)::int as score
  from public.votes
  group by clip_id
) v on v.clip_id = c.id
left join (
  select clip_id, count(*)::int as comments_count
  from public.comments
  group by clip_id
) cm on cm.clip_id = c.id;

alter table public.notifications enable row level security;
drop policy if exists "Users insert notifications" on public.notifications;
drop policy if exists "Users can insert notifications" on public.notifications;
drop policy if exists "Users read own notifications" on public.notifications;
drop policy if exists "Users update own notifications" on public.notifications;

create policy "Users read own notifications"
  on public.notifications for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users update own notifications"
  on public.notifications for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

revoke insert on public.notifications from anon, authenticated;

create or replace function public.toggle_vote(p_clip_id uuid, p_direction smallint)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_vote public.votes%rowtype;
  actor uuid := auth.uid();
begin
  if actor is null then
    raise exception 'Authentication required';
  end if;
  if p_direction not in (-1, 1) then
    raise exception 'Vote direction must be -1 or 1';
  end if;

  select * into existing_vote
  from public.votes
  where clip_id = p_clip_id and user_id = actor
  for update;

  if found and existing_vote.direction = p_direction then
    delete from public.votes where id = existing_vote.id;
    return 'removed';
  elsif found then
    update public.votes set direction = p_direction where id = existing_vote.id;
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

create or replace function public.notify_comment_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_id uuid;
  clip_title text;
  actor_handle text;
begin
  select user_id, title into owner_id, clip_title from public.clips where id = new.clip_id;
  if owner_id is null or owner_id = new.user_id then return new; end if;
  select handle into actor_handle from public.profiles where id = new.user_id;
  insert into public.notifications (user_id, type, message, clip_id)
  values (owner_id, 'comment', '@' || coalesce(actor_handle, 'Someone') || ' commented on "' || coalesce(clip_title, 'your post') || '": ' || left(new.body, 80), new.clip_id);
  return new;
end;
$$;

create or replace function public.notify_follow_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_handle text;
begin
  if new.follower_id = new.following_id then return new; end if;
  select handle into actor_handle from public.profiles where id = new.follower_id;
  insert into public.notifications (user_id, type, message)
  values (new.following_id, 'follow', '@' || coalesce(actor_handle, 'Someone') || ' started following you');
  return new;
end;
$$;

create or replace function public.notify_claim_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_id uuid;
  clip_title text;
begin
  select user_id, title into owner_id, clip_title from public.clips where id = new.clip_id;
  if owner_id is null then return new; end if;
  insert into public.notifications (user_id, type, message, clip_id)
  values (owner_id, 'claim', 'A new claim was filed on "' || coalesce(clip_title, 'your post') || '" by ' || new.claimant_email || ': ' || left(new.reason, 100), new.clip_id);
  return new;
end;
$$;

create or replace function public.notify_clip_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_handle text;
begin
  select handle into actor_handle from public.profiles where id = new.user_id;
  insert into public.notifications (user_id, type, message, clip_id)
  select follower_id, 'clip', '@' || coalesce(actor_handle, 'Someone') || ' posted a new annotation', new.id
  from public.follows
  where following_id = new.user_id and follower_id <> new.user_id;
  return new;
end;
$$;

drop trigger if exists notifications_after_comment on public.comments;
create trigger notifications_after_comment
after insert on public.comments
for each row execute function public.notify_comment_created();

drop trigger if exists notifications_after_follow on public.follows;
create trigger notifications_after_follow
after insert on public.follows
for each row execute function public.notify_follow_created();

drop trigger if exists notifications_after_claim on public.claims;
create trigger notifications_after_claim
after insert on public.claims
for each row execute function public.notify_claim_created();

drop trigger if exists notifications_after_clip on public.clips;
create trigger notifications_after_clip
after insert on public.clips
for each row execute function public.notify_clip_created();
