import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { getCurrentUser } from '../lib/authUser';

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function load() {
      const user = await getCurrentUser();
      if (!user) { setLoading(false); return; }
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(100);
      if (active) {
        setNotifications(data || []);
        setLoading(false);
        await supabase.from('notifications').update({ read: true }).eq('user_id', user.id).eq('read', false);
      }
    }
    load();
    return () => { active = false; };
  }, []);

  if (loading) return <div className="section-page"><p className="text-sm text-text-muted">Loading notifications…</p></div>;

  return (
    <section className="section-page notifications-page">
      <p className="eyebrow">Your activity</p>
      <h1 className="section-title">Notifications</h1>
      <p className="section-subtitle">Replies, follows, claims, and other signals around your annotations.</p>
      {!notifications.length ? <p className="empty-state text-sm text-text-muted">Nothing new here yet.</p> : (
        <div className="notification-list">
          {notifications.map((notification) => (
            <Link key={notification.id} to={notification.clip_id ? `/post/${notification.clip_id}` : '/'} className="notification-row no-underline">
              <span className="notification-type">{notification.type}</span>
              <span className="notification-message">{notification.message}</span>
              <span className="notification-time">{timeAgo(notification.created_at)}</span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

function timeAgo(value) {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
