-- Fix SECURITY DEFINER on clips_with_scores
DROP VIEW IF EXISTS public.clips_with_scores;

CREATE VIEW public.clips_with_scores AS
SELECT
  c.*,
  COALESCE(SUM(v.direction), 0)::int AS score
FROM public.clips c
LEFT JOIN public.votes v ON v.clip_id = c.id
GROUP BY c.id;

-- Enable RLS on notifications
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Notifications policies (safe to re-run)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users read own notifications' AND tablename = 'notifications') THEN
    CREATE POLICY "Users read own notifications" ON public.notifications FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users insert notifications' AND tablename = 'notifications') THEN
    CREATE POLICY "Users insert notifications" ON public.notifications FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users update own notifications' AND tablename = 'notifications') THEN
    CREATE POLICY "Users update own notifications" ON public.notifications FOR UPDATE USING (auth.uid() = user_id);
  END IF;
END $$;

-- Enable realtime on notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
