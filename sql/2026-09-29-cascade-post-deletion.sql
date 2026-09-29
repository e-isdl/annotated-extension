-- Deleting a post failed with "Failed to delete this post." whenever the post
-- had any notification, claim, or reply: those three foreign keys were created
-- as ON DELETE NO ACTION, so Postgres rejected the delete. Notifications and
-- claims are meaningless without the post and are removed with it; replies are
-- authored by other people, so they are kept and detached (parent set to null)
-- instead of being destroyed with the parent post.

alter table public.notifications
  drop constraint notifications_clip_id_fkey;
alter table public.notifications
  add constraint notifications_clip_id_fkey
  foreign key (clip_id) references public.clips (id) on delete cascade;

alter table public.claims
  drop constraint claims_clip_id_fkey;
alter table public.claims
  add constraint claims_clip_id_fkey
  foreign key (clip_id) references public.clips (id) on delete cascade;

alter table public.clips
  drop constraint clips_parent_clip_id_fkey;
alter table public.clips
  add constraint clips_parent_clip_id_fkey
  foreign key (parent_clip_id) references public.clips (id) on delete set null;

-- The score-sync triggers fire per row while the cascade is still running and
-- re-insert score rows for clips/comments that were just deleted, which aborted
-- the whole delete with an FK violation. Skip (and clean up) when the parent
-- row is already gone.

create or replace function public.recompute_clip_score(p_clip_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if not exists (select 1 from public.clips where id = p_clip_id) then
    delete from public.clip_scores where clip_id = p_clip_id;
    return;
  end if;
  insert into public.clip_scores (clip_id, score)
  select p_clip_id, coalesce(sum(v.direction), 0)::integer
    from public.votes v where v.clip_id = p_clip_id
  on conflict (clip_id) do update set score = excluded.score;
end;
$function$;

create or replace function public.recompute_comment_score(p_comment_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare n integer;
begin
  if not exists (select 1 from public.comments where id = p_comment_id) then
    delete from public.comment_score_totals where comment_id = p_comment_id;
    return;
  end if;
  insert into public.comment_score_totals (comment_id, score, vote_count)
  select p_comment_id, coalesce(sum(cv.direction), 0)::integer, count(*)::integer
    from public.comment_votes cv where cv.comment_id = p_comment_id
  on conflict (comment_id) do update
    set score = excluded.score, vote_count = excluded.vote_count;
  select vote_count into n from public.comment_score_totals where comment_id = p_comment_id;
  if coalesce(n, 0) = 0 then
    delete from public.comment_score_totals where comment_id = p_comment_id;
  end if;
end;
$function$;
