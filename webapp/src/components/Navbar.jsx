import { useEffect, useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

const NOTIF_ICONS = {
  comment: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  ),
  follow: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/>
    </svg>
  ),
  claim: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
    </svg>
  ),
  like: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
    </svg>
  ),
  clip: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/>
    </svg>
  ),
};

export default function Navbar() {
  const [user, setUser] = useState(null);
  const [notifCount, setNotifCount] = useState(0);
  const [showNotifs, setShowNotifs] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [query, setQuery] = useState('');
  const navigate = useNavigate();
  const notifRef = useRef(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
      if (user) loadNotifications(user.id);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
      if (session?.user) loadNotifications(session.user.id);
      else { setNotifications([]); setNotifCount(0); }
    });
    return () => subscription.unsubscribe();
  }, []);

  // Real-time subscription
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('notifications-realtime')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${user.id}`,
      }, (payload) => {
        setNotifications(prev => [payload.new, ...prev].slice(0, 20));
        setNotifCount(prev => prev + 1);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  // Click outside to close
  useEffect(() => {
    if (!showNotifs) return;
    function handleClick(e) {
      if (notifRef.current && !notifRef.current.contains(e.target)) setShowNotifs(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showNotifs]);

  async function loadNotifications(userId) {
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20);
    if (data) {
      setNotifications(data);
      setNotifCount(data.filter(n => !n.read).length);
    }
  }

  async function markAllRead() {
    if (!user) return;
    const unread = notifications.filter(n => !n.read);
    if (unread.length === 0) return;
    setNotifications(notifications.map(n => ({ ...n, read: true })));
    setNotifCount(0);
    await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', user.id)
      .eq('read', false);
  }

  function notifLink(n) {
    if (n.type === 'follow') {
      const match = n.message.match(/^@(\S+)/);
      return match ? `/u/${match[1]}` : '/';
    }
    if (n.clip_id) return `/clip/${n.clip_id}`;
    return '#';
  }

  const signIn = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` }
    });
  };

  return (
    <nav className="border-b border-border-subtle bg-bg-base sticky top-0 z-10">
      <div className="max-w-[1440px] mx-auto px-6 h-14 flex items-center justify-between gap-5">
        <Link to="/" className="flex items-center gap-2 shrink-0">
          <div className="w-6 h-6 rounded bg-accent flex items-center justify-center">
            <span className="text-bg-base font-bold text-xs">A</span>
          </div>
          <span className="font-semibold text-sm text-text-primary">Annotated</span>
        </Link>

        <form
          onSubmit={(e) => { e.preventDefault(); if (query.trim()) navigate(`/search?q=${encodeURIComponent(query.trim())}`); }}
          className="flex-1 max-w-md mx-2"
        >
          <div className="relative">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search"
              className="w-full bg-bg-surface border border-border rounded-lg pl-8 pr-3 py-1.5 text-xs text-text-primary placeholder:text-text-muted outline-none focus:border-accent transition-colors"
            />
          </div>
        </form>

        <div className="flex items-center gap-4 shrink-0">
          <Link to="/explore" className="hidden sm:block text-xs text-text-secondary hover:text-text-primary transition-colors">Explore</Link>
          <Link to="/leaderboard" className="hidden md:block text-xs text-text-secondary hover:text-text-primary transition-colors">Leaderboard</Link>
          <Link to="/create" className="hidden sm:inline-flex btn-primary text-xs py-2 px-3">Create</Link>

          {user ? (
            <>
              <div className="relative" ref={notifRef}>
                <button
                  onClick={() => { setShowNotifs(!showNotifs); if (!showNotifs) markAllRead(); }}
                  className="relative text-text-secondary hover:text-text-primary transition-colors"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                    <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                  </svg>
                  {notifCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-accent text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                      {notifCount}
                    </span>
                  )}
                </button>

                {showNotifs && (
                  <div className="absolute right-0 top-full mt-2 w-80 bg-bg-surface border border-border rounded-xl shadow-xl z-50 max-h-96 overflow-y-auto">
                    <div className="p-3 border-b border-border flex items-center justify-between">
                      <span className="text-xs font-medium text-text-primary">Notifications</span>
                      {notifCount > 0 && (
                        <button onClick={markAllRead} className="text-[10px] text-accent-text hover:text-accent">Mark all read</button>
                      )}
                    </div>
                    {notifications.length === 0 ? (
                      <p className="p-4 text-xs text-text-muted text-center">No notifications yet.</p>
                    ) : (
                      notifications.map((n) => (
                        <Link
                          key={n.id}
                          to={notifLink(n)}
                          onClick={() => setShowNotifs(false)}
                          className={`flex items-start gap-2.5 p-3 border-b border-border last:border-0 hover:bg-bg-raised transition-colors no-underline ${!n.read ? 'bg-accent/5' : ''}`}
                        >
                          <span className="text-text-muted mt-0.5 shrink-0">{NOTIF_ICONS[n.type] || NOTIF_ICONS.clip}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-text-primary leading-relaxed">{n.message}</p>
                            <p className="text-[10px] text-text-muted mt-1 font-mono">{timeAgo(n.created_at)}</p>
                          </div>
                          {!n.read && <div className="w-1.5 h-1.5 rounded-full bg-accent shrink-0 mt-1.5" />}
                        </Link>
                      ))
                    )}
                  </div>
                )}
              </div>

              <Link to={`/u/${user.user_metadata?.user_name || user.id}`}>
                <img
                  src={user.user_metadata?.avatar_url}
                  alt="avatar"
                  className="w-7 h-7 rounded-full border border-border"
                />
              </Link>
            </>
          ) : (
            <button onClick={signIn} className="btn-primary text-xs py-1.5 px-3">
              Sign in
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
