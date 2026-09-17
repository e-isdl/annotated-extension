-- Annotated community foundation.
-- This migration is additive and intentionally does not change existing clip
-- behavior. Review and apply it through the normal Supabase migration flow.

create table if not exists public.communities (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  description text not null default '',
  rules text not null default '',
  icon_url text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.community_members (
  community_id uuid not null references public.communities(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('member', 'moderator', 'owner')),
  created_at timestamptz not null default now(),
  primary key (community_id, user_id)
);

create table if not exists public.post_saves (
  clip_id uuid not null references public.clips(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (clip_id, user_id)
);

alter table public.clips add column if not exists community_id uuid references public.communities(id) on delete set null;
alter table public.clips add column if not exists annotation_type text;
alter table public.clips add column if not exists source_domain text;
alter table public.clips add column if not exists source_title text;
alter table public.clips add column if not exists source_image_url text;
alter table public.clips add column if not exists source_excerpt text;
alter table public.comments add column if not exists parent_comment_id uuid references public.comments(id) on delete cascade;

create index if not exists communities_slug_idx on public.communities(slug);
create index if not exists community_members_user_idx on public.community_members(user_id);
create index if not exists clips_community_created_idx on public.clips(community_id, created_at desc);
create index if not exists post_saves_user_idx on public.post_saves(user_id, created_at desc);
create index if not exists comments_parent_idx on public.comments(clip_id, parent_comment_id, created_at);

insert into public.communities (slug, name, description, rules)
values
  ('media-literacy', 'Media Literacy', 'Break down the stories, screenshots, and claims shaping the internet.', 'Point to the source. Separate what is visible from what is inferred.'),
  ('technology', 'Technology', 'Products, platforms, and the ideas behind them.', 'Bring a source and explain why it matters.'),
  ('startups', 'Startups', 'The building, shipping, and thinking behind new companies.', 'Share the useful part, not just the announcement.'),
  ('internet-culture', 'Internet Culture', 'The posts, memes, and moments that become the internet.', 'Preserve context and credit the original creator.')
on conflict (slug) do nothing;

alter table public.communities enable row level security;
alter table public.community_members enable row level security;
alter table public.post_saves enable row level security;

drop policy if exists "Communities are publicly readable" on public.communities;
create policy "Communities are publicly readable"
  on public.communities for select
  using (true);

drop policy if exists "Authenticated users can create communities" on public.communities;
create policy "Authenticated users can create communities"
  on public.communities for insert
  to authenticated
  with check (auth.uid() = created_by);

drop policy if exists "Community members are publicly readable" on public.community_members;
create policy "Community members are publicly readable"
  on public.community_members for select
  using (true);

drop policy if exists "Users can join communities as themselves" on public.community_members;
create policy "Users can join communities as themselves"
  on public.community_members for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can leave communities as themselves" on public.community_members;
create policy "Users can leave communities as themselves"
  on public.community_members for delete
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can read their saved posts" on public.post_saves;
create policy "Users can read their saved posts"
  on public.post_saves for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can save posts as themselves" on public.post_saves;
create policy "Users can save posts as themselves"
  on public.post_saves for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can unsave posts as themselves" on public.post_saves;
create policy "Users can unsave posts as themselves"
  on public.post_saves for delete
  to authenticated
  using (auth.uid() = user_id);
