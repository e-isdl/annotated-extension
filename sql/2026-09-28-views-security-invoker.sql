-- Fix: security_definer_view ERROR (2 findings) -> Option B
--
-- Why B and not "just set security_invoker": flipping the views to invoker
-- would score 0 for anon and wrong scores for signed-in users, because
--   * public.votes  has RLS that returns NO rows to anon and only the
--     caller's own rows to authenticated (no INSERT policy at all)
--   * public.comment_votes is likewise caller-scoped
-- The aggregates therefore have to live in a real, publicly readable table
-- maintained by triggers. The views keep identical names, column order and
-- types, so no application code changes.
--
-- Safety design:
--   * one transaction; any failure or failed assertion rolls everything back
--   * views are dropped/recreated LAST, so a partial run never leaves the
--     app reading a half-built structure
--   * assertion compares the rebuilt views against the pre-migration
--     baseline before COMMIT
--   * trigger functions get EXECUTE from nobody (proven safe: triggers do
--     not check EXECUTE for the inserting role), so they do not add new
--     findings
--
-- Baseline captured 2026-09-28 before migration:
--   clips_with_scores    rows=15 sum(score)=13 sum(comments_count)=13
--                        sum(best_score)=52  (13 + 13*3)
--   comment_vote_scores  rows=3  sum(score)=3 sum(vote_count)=3

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Aggregate tables (same data the definer views exposed, nothing more)
-- ---------------------------------------------------------------------------
CREATE TABLE public.clip_scores (
  clip_id uuid PRIMARY KEY REFERENCES public.clips(id) ON DELETE CASCADE,
  score   integer NOT NULL DEFAULT 0
);

CREATE TABLE public.comment_score_totals (
  comment_id uuid PRIMARY KEY REFERENCES public.comments(id) ON DELETE CASCADE,
  score      integer NOT NULL DEFAULT 0,
  vote_count integer NOT NULL DEFAULT 0
);

-- ---------------------------------------------------------------------------
-- 2. Recompute helpers + row triggers (SECURITY DEFINER, pinned search_path)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recompute_clip_score(p_clip_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
BEGIN
  INSERT INTO public.clip_scores (clip_id, score)
  SELECT p_clip_id, coalesce(sum(v.direction), 0)::integer
    FROM public.votes v WHERE v.clip_id = p_clip_id
  ON CONFLICT (clip_id) DO UPDATE SET score = EXCLUDED.score;
END $fn$;

CREATE OR REPLACE FUNCTION public.recompute_comment_score(p_comment_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE n integer;
BEGIN
  INSERT INTO public.comment_score_totals (comment_id, score, vote_count)
  SELECT p_comment_id, coalesce(sum(cv.direction), 0)::integer, count(*)::integer
    FROM public.comment_votes cv WHERE cv.comment_id = p_comment_id
  ON CONFLICT (comment_id) DO UPDATE
    SET score = EXCLUDED.score, vote_count = EXCLUDED.vote_count;

  SELECT vote_count INTO n FROM public.comment_score_totals WHERE comment_id = p_comment_id;
  -- the original view only listed comment_ids that had at least one vote
  IF coalesce(n, 0) = 0 THEN
    DELETE FROM public.comment_score_totals WHERE comment_id = p_comment_id;
  END IF;
END $fn$;

CREATE OR REPLACE FUNCTION public.trg_sync_clip_score() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
BEGIN
  IF TG_OP IN ('DELETE', 'UPDATE') THEN
    PERFORM public.recompute_clip_score(OLD.clip_id);
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    PERFORM public.recompute_clip_score(NEW.clip_id);
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $fn$;

CREATE OR REPLACE FUNCTION public.trg_sync_comment_score() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
BEGIN
  IF TG_OP IN ('DELETE', 'UPDATE') THEN
    PERFORM public.recompute_comment_score(OLD.comment_id);
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    PERFORM public.recompute_comment_score(NEW.comment_id);
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $fn$;

-- ---------------------------------------------------------------------------
-- 3. Backfill from existing data
-- ---------------------------------------------------------------------------
INSERT INTO public.clip_scores (clip_id, score)
SELECT clip_id, coalesce(sum(direction), 0)::integer
  FROM public.votes GROUP BY clip_id
ON CONFLICT (clip_id) DO UPDATE SET score = EXCLUDED.score;

INSERT INTO public.comment_score_totals (comment_id, score, vote_count)
SELECT comment_id, coalesce(sum(direction), 0)::integer, count(*)::integer
  FROM public.comment_votes GROUP BY comment_id
ON CONFLICT (comment_id) DO UPDATE
  SET score = EXCLUDED.score, vote_count = EXCLUDED.vote_count;

DELETE FROM public.comment_score_totals WHERE vote_count = 0;

-- ---------------------------------------------------------------------------
-- 4. Attach triggers
-- ---------------------------------------------------------------------------
CREATE TRIGGER sync_clip_score
  AFTER INSERT OR UPDATE OR DELETE ON public.votes
  FOR EACH ROW EXECUTE FUNCTION public.trg_sync_clip_score();

CREATE TRIGGER sync_comment_score
  AFTER INSERT OR UPDATE OR DELETE ON public.comment_votes
  FOR EACH ROW EXECUTE FUNCTION public.trg_sync_comment_score();

-- ---------------------------------------------------------------------------
-- 5. Grants: aggregates readable (they replace a publicly readable view),
--    trigger machinery NOT callable through PostgREST
-- ---------------------------------------------------------------------------
GRANT SELECT ON public.clip_scores TO anon, authenticated, service_role;
GRANT SELECT ON public.comment_score_totals TO anon, authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.recompute_clip_score(uuid)   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recompute_comment_score(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_sync_clip_score()         FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_sync_comment_score()      FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. Rebuild the views as SECURITY INVOKER with identical shape
--    (DROP first: security_invoker cannot be toggled via OR REPLACE)
-- ---------------------------------------------------------------------------
DROP VIEW public.comment_vote_scores;

CREATE VIEW public.comment_vote_scores WITH (security_invoker = true) AS
SELECT comment_id,
       score,
       vote_count
  FROM public.comment_score_totals;

DROP VIEW public.clips_with_scores;

CREATE VIEW public.clips_with_scores WITH (security_invoker = true) AS
 SELECT c.id,
    c.user_id,
    c.source_url,
    c.source_type,
    c.title,
    c.thumbnail,
    c.youtube_id,
    c.start_sec,
    c.end_sec,
    c.article_text,
    c.author,
    c.audio_url,
    c.slug,
    c.parent_clip_id,
    c.thread_position,
    c.created_at,
    c.transcript,
    c.community_id,
    c.annotation_type,
    c.source_domain,
    c.source_title,
    c.source_image_url,
    c.source_excerpt,
    COALESCE(v.score, 0) AS score,
    COALESCE(cm.comments_count, 0) AS comments_count,
    (COALESCE(v.score, 0) + COALESCE(cm.comments_count, 0) * 3)::numeric AS best_score,
    (COALESCE(v.score, 0) + COALESCE(cm.comments_count, 0) * 2)::numeric
      / power(EXTRACT(epoch FROM now() - c.created_at) / 3600.0 + 2::numeric, 1.4) AS hot_score
   FROM public.clips c
     LEFT JOIN public.clip_scores v ON v.clip_id = c.id
     LEFT JOIN ( SELECT comments.clip_id,
            count(*)::integer AS comments_count
           FROM public.comments
          GROUP BY comments.clip_id) cm ON cm.clip_id = c.id;

GRANT SELECT ON public.comment_vote_scores TO anon, authenticated, service_role;
GRANT SELECT ON public.clips_with_scores TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7. Assertions - RAISE aborts the transaction and rolls everything back
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r_cws int; s_score int; s_comm int; s_best numeric;
  h_new numeric; h_ref numeric;
  r_cvs int; c_score int; c_votes int;
BEGIN
  SELECT count(*), coalesce(sum(score),0), coalesce(sum(comments_count),0), coalesce(sum(best_score),0)
    INTO r_cws, s_score, s_comm, s_best
    FROM public.clips_with_scores;

  SELECT count(*), coalesce(sum(score),0), coalesce(sum(vote_count),0)
    INTO r_cvs, c_score, c_votes
    FROM public.comment_vote_scores;

  -- hot_score is time-dependent, so compare against an independent
  -- recomputation of the ORIGINAL formula rather than a stored number
  SELECT coalesce(sum(h), 0) INTO h_new FROM (
    SELECT (COALESCE(v.score,0) + COALESCE(cm.comments_count,0) * 2)::numeric
             / power(EXTRACT(epoch FROM now() - c.created_at) / 3600.0 + 2::numeric, 1.4) AS h
      FROM public.clips c
      LEFT JOIN public.clip_scores v ON v.clip_id = c.id
      LEFT JOIN (SELECT clip_id, count(*)::integer AS comments_count
                   FROM public.comments GROUP BY clip_id) cm ON cm.clip_id = c.id
  ) x;

  SELECT coalesce(sum(h), 0) INTO h_ref FROM (
    SELECT (COALESCE(vs.score,0) + COALESCE(cc.comments_count,0) * 2)::numeric
             / power(EXTRACT(epoch FROM now() - c.created_at) / 3600.0 + 2::numeric, 1.4) AS h
      FROM public.clips c
      LEFT JOIN (SELECT clip_id, sum(direction)::integer AS score
                   FROM public.votes GROUP BY clip_id) vs ON vs.clip_id = c.id
      LEFT JOIN (SELECT clip_id, count(*)::integer AS comments_count
                   FROM public.comments GROUP BY clip_id) cc ON cc.clip_id = c.id
  ) y;

  IF r_cws <> 15 THEN RAISE EXCEPTION 'ASSERT clips_with_scores rows: expected 15, got %', r_cws; END IF;
  IF s_score <> 13 THEN RAISE EXCEPTION 'ASSERT clips score sum: expected 13, got %', s_score; END IF;
  IF s_comm <> 13 THEN RAISE EXCEPTION 'ASSERT clips comments sum: expected 13, got %', s_comm; END IF;
  IF s_best <> 52  THEN RAISE EXCEPTION 'ASSERT best_score sum: expected 52, got %', s_best; END IF;
  IF abs(h_new - h_ref) > 0.000001 THEN RAISE EXCEPTION 'ASSERT hot_score mismatch: % vs %', h_new, h_ref; END IF;

  IF r_cvs <> 3     THEN RAISE EXCEPTION 'ASSERT comment_vote_scores rows: expected 3, got %', r_cvs; END IF;
  IF c_score <> 3   THEN RAISE EXCEPTION 'ASSERT comment score sum: expected 3, got %', c_score; END IF;
  IF c_votes <> 3   THEN RAISE EXCEPTION 'ASSERT comment vote_count sum: expected 3, got %', c_votes; END IF;

  RAISE NOTICE 'ALL ASSERTIONS PASSED';
END $$;

-- ---------------------------------------------------------------------------
-- 8. RLS on the new aggregate tables
--    (the security linter flags any public table without RLS, and the views
--     are security_invoker, so anon reads through these policies)
--    No write policy: anon/authenticated cannot touch the aggregates.
--    The recompute functions are SECURITY DEFINER owned by postgres, i.e.
--     the table owner, so triggers keep working - verified after this ran.
-- ---------------------------------------------------------------------------
ALTER TABLE public.clip_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comment_score_totals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clip_scores readable by everyone" ON public.clip_scores
  FOR SELECT USING (true);

CREATE POLICY "comment_score_totals readable by everyone" ON public.comment_score_totals
  FOR SELECT USING (true);

COMMIT;

-- ===========================================================================
-- VERIFICATION RECORD (2026-09-28, executed in production)
-- ===========================================================================
-- Migration result: COMMITTED, all assertions passed.
--
-- View state
--   clips_with_scores    reloptions=security_invoker=true  columns=27
--   comment_vote_scores  reloptions=security_invoker=true  columns=3
--
-- Baseline equality (unchanged after migration)
--   clips_with_scores    rows=15 score=13 comments=13 best=52
--   comment_vote_scores  rows=3  score=3  vote_count=3
--   votes rows=13  comment_votes rows=3
--
-- Trigger test (intentional exception => transaction rolled back, no writes)
--   before RLS:  TRIGGER_OK   clip=d1688836 score 1 -> -1
--   after  RLS:  TRIGGER_OK_RLS clip=d1688836 score 1 -> -1
--   post-check:  score=1, direction=1, votes=13  (data restored)
--
-- PostgREST / anon API probes - all HTTP 200
--   clips_with_scores + profiles(*)                       3 rows
--   clips_with_scores + profiles + communities            3 rows
--   clips_with_scores + profiles + annotations            3 rows
--   clips_with_scores + all three embeds                  3 rows
--   community_id filter + embed                           1 row
--   hot_score desc sort (leaderboard)                     3 rows
--   user_id filter (profile page)                         3 rows
--   base table profiles                                   2 rows
--   clip_scores (new table, read)                         3 rows
--   rpc toggle_vote  -> 401 (denied)   rpc handle_new_user -> 404 (hidden)
--
-- Security advisors (supabase_get_advisors, type=security)
--   BEFORE this project: 21 findings (8 ERROR / 13 WARN)
--   after sql/2026-09-28-security-advisor-fixes.sql: 7 findings (3 ERROR / 4 WARN)
--   after this file:     5 findings (0 ERROR / 5 WARN)
--   security_definer_view:     2 -> 0
--   rls_disabled_in_public:    0 -> 2 -> 0   (introduced, then fixed in step 8)
--   remaining WARN, all accepted:
--     4x authenticated_security_definer_function_executable
--       (create_annotated_post, create_extension_post, toggle_vote,
--        toggle_comment_vote - the app's own auth-gated RPCs)
--     1x auth_leaked_password_protection (dashboard toggle only:
--        Authentication -> Password -> HaveIBeenPwned)
