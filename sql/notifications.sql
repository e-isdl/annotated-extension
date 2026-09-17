-- Notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('comment', 'follow', 'claim', 'like', 'clip')),
  message text NOT NULL,
  clip_id uuid REFERENCES clips(id) ON DELETE SET NULL,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for fast queries
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications(user_id, created_at DESC);

-- RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Users can read their own notifications
CREATE POLICY "Users read own notifications"
  ON notifications FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert notifications (for others)
CREATE POLICY "Users insert notifications"
  ON notifications FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Users can mark their own as read
CREATE POLICY "Users update own notifications"
  ON notifications FOR UPDATE
  USING (auth.uid() = user_id);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
