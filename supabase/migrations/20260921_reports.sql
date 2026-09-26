-- Separate community-conduct reports from source/copyright claims.
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  clip_id uuid not null references public.clips(id) on delete cascade,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (char_length(trim(reason)) between 3 and 2000),
  status text not null default 'open' check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
  created_at timestamptz not null default now(),
  unique (clip_id, reporter_id)
);

create index if not exists reports_status_created_idx
  on public.reports(status, created_at desc);

alter table public.reports enable row level security;

drop policy if exists "Users can file reports as themselves" on public.reports;
create policy "Users can file reports as themselves"
  on public.reports for insert
  to authenticated
  with check (auth.uid() = reporter_id);

drop policy if exists "Users can read their own reports" on public.reports;
create policy "Users can read their own reports"
  on public.reports for select
  to authenticated
  using (auth.uid() = reporter_id);
