-- 2026-09-29: allow X/social posts on clips
--
-- The create_extension_post / create_annotated_post RPCs validate
-- source_type against ('article', 'youtube', 'podcast', 'social'[, 'text']),
-- but the clips table still carried the original three-value CHECK, so any
-- social insert raised 23514 after the RPC had already accepted the call.
-- Relax the table constraint to match the RPC validation lists.

alter table public.clips drop constraint clips_source_type_check;

alter table public.clips add constraint clips_source_type_check
  check (source_type = any (array['youtube', 'article', 'podcast', 'social', 'text']));
