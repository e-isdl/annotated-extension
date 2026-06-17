import { supabase } from './supabase';

export async function notify({ userId, type, message, clipId = null }) {
  try {
    const { error } = await supabase.from('notifications').insert({
      user_id: userId,
      type,
      message,
      clip_id: clipId,
    });
    if (error) console.error('Notification failed:', error);
  } catch (err) {
    console.error('Notification failed:', err);
  }
}
