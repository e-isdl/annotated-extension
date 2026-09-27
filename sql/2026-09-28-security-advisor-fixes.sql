-- Security advisor fixes for project eudkcsmfrvandajtcaaj (annotated)
-- Generated from Supabase security advisors (2026-09-28).
--
-- Scope: ONLY grants + search_path. No table, view, RLS or data changes.
-- Views (security_definer_view ERROR) are intentionally NOT touched here:
--   clips_with_scores / comment_vote_scores must stay SECURITY DEFINER or
--   vote scores break (votes RLS hides rows from anon and hides other
--   users' votes from authenticated). See report for options.
--
-- Verified before applying:
--   * Trigger functions (handle_new_user, notify_*) are only referenced by
--     triggers, never by application RPC code.
--   * Trigger firing does NOT require EXECUTE for the inserting role -
--     proven by a controlled test (revoke -> anon insert -> trigger fired).
--     signup already works while supabase_auth_admin holds no EXECUTE.
--   * Every app RPC is auth-gated in the UI before it is called:
--       create_annotated_post  -> CreatePage.jsx:93
--       create_extension_post  -> ClipCreator (only rendered with session)
--       toggle_vote            -> VoteButtons.jsx:38
--       toggle_comment_vote    -> CommentSection.jsx:99
--     so dropping `anon` EXECUTE cannot break a signed-out user.

-- ---------------------------------------------------------------------------
-- 1) handle_new_user: pin search_path (fixes function_search_path_mutable WARN)
--    Body only references public.profiles (qualified) + pg_catalog builtins,
--    so an empty search_path is safe and closes the shadow-object vector.
-- ---------------------------------------------------------------------------
ALTER FUNCTION public.handle_new_user() SET search_path = '';

-- ---------------------------------------------------------------------------
-- 2) Trigger-only functions: remove them from the PostgREST RPC surface.
--    Callers are triggers, which do not check EXECUTE, so behaviour is
--    unchanged. Fixes anon_security_definer_function_executable (5 findings).
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_claim_created() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_clip_created() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_comment_created() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_follow_created() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3) Application RPCs: keep them for authenticated (that is their purpose),
--    drop the anonymous grant (fixes 3 anon_security_definer findings).
--    service_role/postgres are left untouched.
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.create_annotated_post(
  uuid, text, text, text, text, text, text, text, integer, integer, text, text
) FROM anon;
REVOKE EXECUTE ON FUNCTION public.toggle_vote(uuid, smallint) FROM anon;
REVOKE EXECUTE ON FUNCTION public.toggle_comment_vote(uuid, smallint) FROM anon;

-- ---------------------------------------------------------------------------
-- Verification (performed after applying)
-- ---------------------------------------------------------------------------
-- Security advisors: 21 findings -> 7
--   anon_security_definer_function_executable ....... 8 -> 0
--   function_search_path_mutable .................... 1 -> 0
--   authenticated_security_definer_function_executable 9 -> 4 (intentional RPCs)
--   security_definer_view ........................... 2 -> 2 (not changed, see header)
--   auth_leaked_password_protection ................  1 -> 1 (dashboard setting)
--
-- Behavioural checks (no data modified):
--   SET ROLE anon        -> "permission denied for function toggle_vote/toggle_comment_vote/handle_new_user"
--   SET ROLE authenticated -> "Authentication required" (body reached, i.e. EXECUTE intact)
--   GET /rest/v1/clips_with_scores          -> 200 (feed/leaderboard still works)
--   GET /rest/v1/comment_vote_scores        -> 200
--   GET /rest/v1/clips                      -> 200 (RLS intact)
--   POST /rest/v1/rpc/toggle_vote (anon)    -> 401
--   POST /rest/v1/rpc/handle_new_user(anon) -> 404 PGRST202 (off the API surface)
--   Controlled trigger test: revoke -> anon INSERT -> trigger still fired (x=2)
--   Trigger functions still referenced by their triggers (count = 1 each)
