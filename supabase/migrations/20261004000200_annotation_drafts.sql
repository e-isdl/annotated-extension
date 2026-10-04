-- Replace the clip stash with annotation drafts. The stash never shipped in a
-- release and holds no rows, so its table and function are dropped.

drop function if exists public.create_clip_draft(uuid, text, text, text, text, text, text, text, text, text, text, text, integer, integer, integer, text, text);
drop table if exists public.clip_drafts;

create table public.drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users(id) on delete cascade,
  kind text not null,
  source_url text not null,
  title text,
  thumbnail_url text,
  community_id uuid,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index drafts_user_updated_idx
  on public.drafts (user_id, updated_at desc);
alter table public.drafts enable row level security;
create policy drafts_select_own on public.drafts for select
  using (user_id = auth.uid());
create policy drafts_insert_own on public.drafts for insert
  with check (user_id = auth.uid());
create policy drafts_update_own on public.drafts for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy drafts_delete_own on public.drafts for delete
  using (user_id = auth.uid());
create function public.touch_updated_at() returns trigger
  language plpgsql set search_path = public as $$
  begin new.updated_at = now(); return new; end $$;
create trigger drafts_touch before update on public.drafts
  for each row execute function public.touch_updated_at();
