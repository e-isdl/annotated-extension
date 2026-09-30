-- Let post owners edit the annotation text of their own posts from the webapp.
-- The webapp calls public.update_annotation(clip_id, text); the function is
-- security definer so it works no matter how RLS is configured on annotations,
-- and it enforces ownership plus the same per-type character limits the two
-- publish RPCs apply (2026-09-29-annotation-types.sql).
-- Deliberately does not touch columns that may not exist on older installs;
-- only text_content is written.

create or replace function public.update_annotation(
  p_clip_id uuid,
  p_text text
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  actor uuid := auth.uid();
  annotation_row public.annotations%rowtype;
  clip_type text;
  max_len integer;
begin
  if actor is null then
    raise exception 'Sign in to edit your annotation';
  end if;
  if p_clip_id is null then
    raise exception 'Missing post';
  end if;

  select * into annotation_row
  from public.annotations
  where clip_id = p_clip_id;
  if not found then
    raise exception 'This post has no annotation to edit';
  end if;
  if annotation_row.user_id is distinct from actor then
    raise exception 'You can only edit your own annotation';
  end if;

  select c.annotation_type into clip_type
  from public.clips c
  where c.id = p_clip_id;

  max_len := case clip_type
    when 'Reaction' then 280
    when 'Fact check' then 500
    when 'Explainer' then 600
    when 'Hot take' then 800
    when 'Question' then 1000
    else 1000
  end;

  if length(trim(p_text)) > max_len then
    raise exception 'This annotation is limited to % characters', max_len;
  end if;

  update public.annotations
  set text_content = nullif(trim(p_text), '')
  where clip_id = p_clip_id
    and user_id = actor;
end;
$function$;

revoke all on function public.update_annotation(uuid, text) from anon;
grant execute on function public.update_annotation(uuid, text) to authenticated;
