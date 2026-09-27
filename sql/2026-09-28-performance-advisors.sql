-- Fix: performance advisors 57 -> 15 (42 WARN -> 0 WARN)
-- Applied to production 2026-09-28. Each step ran in its own transaction with
-- assertions; a failed assertion rolls the whole step back.
--
--   auth_rls_initplan            25 -> 0
--   multiple_permissive_policies 16 -> 0
--   duplicate_index               1 -> 0
--   unindexed_foreign_keys       13 -> 0
--   unused_index                  2 -> 15 (13 are the indexes created below,
--                                       reported unused only because they
--                                       have not been queried yet)
--
-- Security advisors unchanged and still clean:
--   0 ERROR / 5 WARN (4 intentional app RPCs, 1 dashboard-only auth toggle)

BEGIN;

-- ===========================================================================
-- A. auth_rls_initplan: wrap auth.uid() so it is evaluated once per query
--    instead of once per row. auth.uid() is STABLE, so behaviour is identical.
--
--    Note: Postgres deparser renders the stored expression as
--          `(( SELECT auth.uid() AS uid) = col)` - uppercase SELECT plus the
--          AS-alias - which is why verification matches on `select auth.uid()`
--          with ILIKE rather than an exact lowercase substring.
-- ===========================================================================
DO $$
DECLARE
  p record;
  n_before int; n_after int; n_unfixed int; n_total int;
  to_clause text;
  cmd_sql text;
  USING_E text; CHECK_E text;
BEGIN
  SELECT count(*) INTO n_before FROM pg_policies
   WHERE schemaname='public'
     AND (coalesce(qual,'') LIKE '%auth.uid()%' OR coalesce(with_check,'') LIKE '%auth.uid()%');
  SELECT count(*) INTO n_total FROM pg_policies WHERE schemaname='public';

  FOR p IN SELECT * FROM pg_policies
            WHERE schemaname='public'
              AND (coalesce(qual,'') LIKE '%auth.uid()%' OR coalesce(with_check,'') LIKE '%auth.uid()%')
  LOOP
    SELECT string_agg(CASE WHEN r = 'public' THEN 'PUBLIC' ELSE quote_ident(r) END, ', ')
      INTO to_clause FROM unnest(p.roles) AS r;
    IF to_clause IS NULL OR to_clause = '' THEN to_clause := 'PUBLIC'; END IF;

    USING_E := CASE WHEN p.qual IS NULL     THEN NULL
                    ELSE replace(p.qual, 'auth.uid()', '(select auth.uid())') END;
    CHECK_E := CASE WHEN p.with_check IS NULL THEN NULL
                    ELSE replace(p.with_check, 'auth.uid()', '(select auth.uid())') END;

    IF p.cmd = 'INSERT' THEN
      cmd_sql := format('WITH CHECK (%s)', CHECK_E);
    ELSIF p.cmd = 'SELECT' THEN
      cmd_sql := format('USING (%s)', USING_E);
    ELSIF p.cmd = 'DELETE' THEN
      cmd_sql := format('USING (%s)', USING_E);
    ELSE -- UPDATE / ALL
      cmd_sql := format('USING (%s)%s', USING_E,
                        CASE WHEN CHECK_E IS NULL THEN ''
                             ELSE format(' WITH CHECK (%s)', CHECK_E) END);
    END IF;

    EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, p.tablename);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR %s TO %s %s',
                   p.policyname, p.tablename, p.cmd, to_clause, cmd_sql);
  END LOOP;

  SELECT count(*) INTO n_after FROM pg_policies WHERE schemaname='public';

  SELECT count(*) INTO n_unfixed FROM pg_policies
   WHERE schemaname='public'
     AND (   (coalesce(qual,'')       LIKE '%auth.uid()%' AND coalesce(qual,'')       NOT ILIKE '%select auth.uid()%')
          OR (coalesce(with_check,'') LIKE '%auth.uid()%' AND coalesce(with_check,'') NOT ILIKE '%select auth.uid()%'));

  IF n_after <> n_total THEN RAISE EXCEPTION 'A: policy count changed % -> %', n_total, n_after; END IF;
  IF n_unfixed <> 0       THEN RAISE EXCEPTION 'A: % unwrapped auth.uid() policies remain', n_unfixed; END IF;
  IF n_before <> 25       THEN RAISE EXCEPTION 'A: expected 25 candidates, got %', n_before; END IF;
END $$;

COMMIT;

BEGIN;

-- ===========================================================================
-- B. multiple_permissive_policies: drop the redundant member of each pair.
--    In every case the dropped policy is strictly weaker than or identical to
--    the one kept, and the kept policy uses roles=PUBLIC, so the surviving
--    behaviour for anon/authenticated is unchanged.
-- ===========================================================================
DO $$
DECLARE
  q text;
  n_total int;
  c_sel int; c_del int; p_sel int; p_upd int; f_sel int; f_mut int; n_all int;
BEGIN
  SELECT count(*) INTO n_total FROM pg_policies WHERE schemaname='public';

  -- identical qual=true SELECT policies: keep one
  DROP POLICY "Public comments readable"       ON public.comments;
  DROP POLICY "Profiles are publicly readable" ON public.profiles;

  -- both subsets of the surviving PUBLIC policy (same expression)
  DROP POLICY "Users can update their own profile" ON public.profiles;
  DROP POLICY "Users can delete their own comments" ON public.comments;

  -- follows cmd=ALL also counted as a second permissive SELECT policy.
  -- Split into mutations only; the separate PUBLIC SELECT policy already
  -- grants reads, so the resulting rights are identical to before.
  SELECT qual INTO q FROM pg_policies
   WHERE schemaname='public' AND tablename='follows' AND policyname='Users manage own follows';
  IF q IS NULL THEN RAISE EXCEPTION 'B: follows qual not found'; END IF;

  DROP POLICY "Users manage own follows" ON public.follows;
  EXECUTE format('CREATE POLICY %I ON public.follows FOR INSERT TO PUBLIC WITH CHECK (%s)',
                 'Users can insert own follows', q);
  EXECUTE format('CREATE POLICY %I ON public.follows FOR UPDATE TO PUBLIC USING (%s) WITH CHECK (%s)',
                 'Users can update own follows', q, q);
  EXECUTE format('CREATE POLICY %I ON public.follows FOR DELETE TO PUBLIC USING (%s)',
                 'Users can delete own follows', q);

  SELECT count(*) INTO c_sel FROM pg_policies WHERE schemaname='public' AND tablename='comments' AND cmd='SELECT';
  SELECT count(*) INTO c_del FROM pg_policies WHERE schemaname='public' AND tablename='comments' AND cmd='DELETE';
  SELECT count(*) INTO p_sel FROM pg_policies WHERE schemaname='public' AND tablename='profiles' AND cmd='SELECT';
  SELECT count(*) INTO p_upd FROM pg_policies WHERE schemaname='public' AND tablename='profiles' AND cmd='UPDATE';
  SELECT count(*) INTO f_sel FROM pg_policies WHERE schemaname='public' AND tablename='follows' AND cmd='SELECT';
  SELECT count(*) INTO f_mut FROM pg_policies WHERE schemaname='public' AND tablename='follows' AND cmd IN ('INSERT','UPDATE','DELETE');
  SELECT count(*) INTO n_all FROM pg_policies WHERE schemaname='public';

  IF c_sel <> 1 THEN RAISE EXCEPTION 'B: comments SELECT = %', c_sel; END IF;
  IF c_del <> 1 THEN RAISE EXCEPTION 'B: comments DELETE = %', c_del; END IF;
  IF p_sel <> 1 THEN RAISE EXCEPTION 'B: profiles SELECT = %', p_sel; END IF;
  IF p_upd <> 1 THEN RAISE EXCEPTION 'B: profiles UPDATE = %', p_upd; END IF;
  IF f_sel <> 1 THEN RAISE EXCEPTION 'B: follows SELECT = %', f_sel; END IF;
  IF f_mut <> 3 THEN RAISE EXCEPTION 'B: follows mutations = %', f_mut; END IF;
  IF n_all <> n_total - 2 THEN RAISE EXCEPTION 'B: total % expected %', n_all, n_total - 2; END IF;
END $$;

COMMIT;

BEGIN;

-- ===========================================================================
-- C. duplicate_index: votes_clip_user_unique is byte-identical to the index
--    backing the UNIQUE constraint votes_clip_id_user_id_key. Keep the
--    constraint-backed one, drop the plain twin.
-- ===========================================================================
DO $$
DECLARE n_identical int; n_constraint int;
BEGIN
  SELECT count(*) INTO n_identical
    FROM pg_index x
      JOIN pg_class i ON i.oid=x.indexrelid
      JOIN pg_class t ON t.oid=x.indrelid
   WHERE t.relname='votes'
     AND i.relname IN ('votes_clip_id_user_id_key','votes_clip_user_unique')
     AND x.indkey::text = (SELECT indkey::text FROM pg_index xi
                             JOIN pg_class ci ON ci.oid=xi.indexrelid
                            WHERE ci.relname='votes_clip_id_user_id_key');
  IF n_identical <> 2 THEN RAISE EXCEPTION 'C: indexes not identical: %', n_identical; END IF;

  SELECT count(*) INTO n_constraint
    FROM pg_constraint c
      JOIN pg_class t ON t.oid=c.conrelid
      JOIN pg_class i ON i.oid=c.conindid
   WHERE t.relname='votes' AND c.contype='u' AND i.relname='votes_clip_id_user_id_key';
  IF n_constraint <> 1 THEN RAISE EXCEPTION 'C: constraint twin missing: %', n_constraint; END IF;

  DROP INDEX public.votes_clip_user_unique;

  IF to_regclass('public.votes_clip_user_unique') IS NOT NULL THEN RAISE EXCEPTION 'C: index still present'; END IF;
  IF to_regclass('public.votes_clip_id_user_id_key') IS NULL     THEN RAISE EXCEPTION 'C: constraint index missing'; END IF;
END $$;

COMMIT;

BEGIN;

-- ===========================================================================
-- D. unindexed_foreign_keys: covering index for each FK that had none.
--    Guards: the column must exist and the index name must be free.
-- ===========================================================================
DO $$
DECLARE r record; n int; existing text;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('annotations',   'clip_id',           'annotations_clip_id_idx'),
      ('annotations',   'user_id',           'annotations_user_id_idx'),
      ('claims',        'clip_id',           'claims_clip_id_idx'),
      ('clips',         'parent_clip_id',    'clips_parent_clip_id_idx'),
      ('clips',         'user_id',           'clips_user_id_idx'),
      ('comment_votes', 'user_id',           'comment_votes_user_id_idx'),
      ('comments',      'parent_comment_id', 'comments_parent_comment_id_idx'),
      ('comments',      'user_id',           'comments_user_id_idx'),
      ('communities',   'created_by',        'communities_created_by_idx'),
      ('follows',       'following_id',      'follows_following_id_idx'),
      ('notifications', 'clip_id',           'notifications_clip_id_idx'),
      ('reports',       'reporter_id',       'reports_reporter_id_idx'),
      ('votes',         'user_id',           'votes_user_id_idx')
    ) AS t(tbl, col, idx)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema='public' AND table_name=r.tbl AND column_name=r.col) THEN
      RAISE EXCEPTION 'D: missing column %.%', r.tbl, r.col;
    END IF;

    SELECT c.relname INTO existing FROM pg_class c
      JOIN pg_namespace ns ON ns.oid=c.relnamespace
     WHERE ns.nspname='public' AND c.relname=r.idx;
    IF existing IS NOT NULL THEN RAISE EXCEPTION 'D: index name already exists: %', r.idx; END IF;

    EXECUTE format('CREATE INDEX %I ON public.%I (%I)', r.idx, r.tbl, r.col);

    IF to_regclass(format('public.%I', r.idx)) IS NULL THEN
      RAISE EXCEPTION 'D: index not created: %', r.idx;
    END IF;
  END LOOP;

  SELECT count(*) INTO n FROM pg_index x
    JOIN pg_class i ON i.oid=x.indexrelid
    JOIN pg_class t ON t.oid=x.indrelid
    JOIN pg_namespace ns ON ns.oid=i.relnamespace
   WHERE ns.nspname='public' AND i.relname IN
    ('annotations_clip_id_idx','annotations_user_id_idx','claims_clip_id_idx','clips_parent_clip_id_idx',
     'clips_user_id_idx','comment_votes_user_id_idx','comments_parent_comment_id_idx','comments_user_id_idx',
     'communities_created_by_idx','follows_following_id_idx','notifications_clip_id_idx',
     'reports_reporter_id_idx','votes_user_id_idx');
  IF n <> 13 THEN RAISE EXCEPTION 'D: expected 13 indexes, got %', n; END IF;
END $$;

COMMIT;

-- ===========================================================================
-- VERIFICATION RECORD (executed against production, 2026-09-28)
-- ===========================================================================
-- Policy count: 38 (after A) -> 36 (after B)
-- Post-B policy counts: comments SELECT=1 DELETE=1, profiles SELECT=1 UPDATE=1,
--                        follows SELECT=1 mutations=3
-- Indexes: votes has 2 (votes_pkey, votes_clip_id_user_id_key) + 1 unique
--          constraint; votes rows=13
-- PostgREST/anon probes after every step - all HTTP 200:
--   clips_with_scores + profiles(*) / + communities / + annotations / all three
--   community_id filter, hot_score desc sort, user_id filter
--   base profiles, clip_scores, base clips
--   rpc toggle_vote -> 401, rpc handle_new_user -> 404 (both still hidden)
--
-- Left as INFO, deliberately NOT changed:
--   unused_index on comments_parent_idx and reports_status_created_idx -
--   these predate this patch and may be needed by queries outside the
--   sampling window; dropping them is not reversible without regenerating.
--   The other 13 unused_index findings are the indexes created in step D.
--
-- Remaining security WARN (both accepted):
--   4x authenticated_security_definer_function_executable - the app's own
--     auth-gated RPCs (create_annotated_post, create_extension_post,
--     toggle_vote, toggle_comment_vote); revoking or de-definering them would
--     break posting and voting.
--   1x auth_leaked_password_protection - dashboard-only toggle
--     (Authentication -> Password -> HaveIBeenPwned).
