import { useEffect, useState, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { getCurrentUser } from '../lib/authUser';
import { useToast } from './ToastProvider';
import { postHref } from '../lib/links';
import { THEMES, isThemeId, themeLabel, syncThemeMeta } from '../lib/themes';
import Avatar from './Avatar';

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
  const [profile, setProfile] = useState(null);
  const [notifCount, setNotifCount] = useState(0);
  const [showNotifs, setShowNotifs] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [notifClips, setNotifClips] = useState({});
  const [query, setQuery] = useState('');
  const navigate = useNavigate();
  const location = useLocation();
  const notifRef = useRef(null);
  const menuRef = useRef(null);
  const themeRef = useRef(null);
  const [showMenu, setShowMenu] = useState(false);
  const [showThemes, setShowThemes] = useState(false);
  const [theme, setTheme] = useState(() => {
    const current = document.documentElement.dataset.theme;
    return isThemeId(current) ? current : 'light';
  });
  const { push } = useToast();

  useEffect(() => {
    let active = true;
    async function loadProfile(userId) {
      const { data } = await supabase
        .from('profiles')
        .select('handle, display_name, avatar_url')
        .eq('id', userId)
        .single();
      if (active) setProfile(data || null);
    }
    getCurrentUser().then((currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        loadProfile(currentUser.id);
        loadNotifications(currentUser.id);
      }
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        loadProfile(session.user.id);
        loadNotifications(session.user.id);
      } else {
        setProfile(null);
        setNotifications([]);
        setNotifCount(0);
      }
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  // Re-read the profile row as the user navigates so a freshly saved avatar
  // or handle shows up in the top right immediately.
  useEffect(() => {
    if (!user?.id) return;
    let active = true;
    supabase
      .from('profiles')
      .select('handle, display_name, avatar_url')
      .eq('id', user.id)
      .single()
      .then(({ data }) => { if (active) setProfile(data || null); });
    const onProfileUpdated = (event) => {
      if (event.detail?.id === user.id) setProfile(event.detail);
    };
    window.addEventListener('annotated:profile-updated', onProfileUpdated);
    return () => { active = false; window.removeEventListener('annotated:profile-updated', onProfileUpdated); };
  }, [user?.id, location.pathname]);

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

  // Click outside to close the account menu
  useEffect(() => {
    if (!showMenu) return;
    function handleClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setShowMenu(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showMenu]);

  // Click outside / Escape to close the theme menu
  useEffect(() => {
    if (!showThemes) return;
    function handleClick(e) {
      if (themeRef.current && !themeRef.current.contains(e.target)) setShowThemes(false);
    }
    function handleKey(e) {
      if (e.key === 'Escape') setShowThemes(false);
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [showThemes]);

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
      const ids = [...new Set(data.map((n) => n.clip_id).filter(Boolean))];
      if (ids.length) {
        const { data: clips } = await supabase.from('clips').select('id, slug, profiles(handle)').in('id', ids);
        setNotifClips(Object.fromEntries((clips || []).map((c) => [c.id, c])));
      }
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
    if (n.clip_id) return notifClips[n.clip_id] ? postHref(notifClips[n.clip_id]) : `/post/${n.clip_id}`;
    return '#';
  }

  const signIn = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` }
    });
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
    } finally {
      push('Signed out.', 'neutral');
      navigate('/');
    }
  };

  const accountHandle = profile?.handle || user?.user_metadata?.user_name || user?.id || '';

  const applyTheme = (id) => {
    if (!isThemeId(id)) return;
    setTheme(id);
    document.documentElement.dataset.theme = id;
    syncThemeMeta(id);
    try { localStorage.setItem('annotated-theme', id); } catch {}
    setShowThemes(false);
  };


  return (
    <nav className="border-b border-border-subtle bg-bg-base sticky top-0 z-10">
      <div className="max-w-[1440px] mx-auto px-6 h-14 flex items-center justify-between gap-5">
        <Link to="/" className="flex items-center gap-2 shrink-0">
          <div className="w-6 h-6 rounded-md bg-accent flex items-center justify-center">
            <span className="text-[var(--on-red)] font-bold text-xs">A</span>
          </div>
          <span className="font-semibold text-sm text-text-primary navbar-logo-text">Annotated</span>
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
          <div className="relative" ref={themeRef}>
            <button
              type="button"
              onClick={() => setShowThemes((value) => !value)}
              aria-label={`Theme: ${themeLabel(theme)}. Change theme`}
              aria-haspopup="menu"
              aria-expanded={showThemes}
              title={`Theme: ${themeLabel(theme)}`}
              className="flex items-center justify-center w-9 h-9 rounded-full text-text-secondary hover:text-text-primary hover:bg-bg-raised transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
                <path d="M12 3a9 9 0 0 1 0 18c-1.5 0-2-1-1.4-2.2.7-1.5-.1-3.1-1.8-3.4-1.6-.3-2.3-1.7-1.4-3.1.9-1.5.3-3.4-1.4-3.9-1.1-.3-1.4-1.4-.9-2.5C5.7 3.9 8.5 3 12 3z" fill="currentColor" opacity="0.35" stroke="none" />
                <circle cx="12" cy="12" r="3.2" fill="currentColor" />
              </svg>
            </button>
            {showThemes && (
              <div className="account-menu theme-menu" role="menu" aria-label="Themes">
                <p className="theme-menu-caption">Theme</p>
                {THEMES.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={theme === item.id}
                    onClick={() => applyTheme(item.id)}
                    className={`account-menu-item theme-menu-item${theme === item.id ? ' is-active' : ''}`}
                  >
                    <span className="theme-swatches" aria-hidden="true">
                      {item.swatches.map((color) => (
                        <span key={color} className="theme-swatch" style={{ background: color }} />
                      ))}
                    </span>
                    <span className="theme-menu-text">
                      <span className="theme-menu-label">{item.label}</span>
                      <span className="theme-menu-hint">{item.hint}</span>
                    </span>
                    {theme === item.id && (
                      <svg className="theme-check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M4 12.5l5 5L20 6.5" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
          <Link to="/explore" className="hidden sm:inline-flex items-center h-9 text-xs text-text-secondary hover:text-text-primary transition-colors">Explore</Link>
          <Link to="/leaderboard" className="hidden md:inline-flex items-center h-9 text-xs text-text-secondary hover:text-text-primary transition-colors">Leaderboard</Link>
          <Link to="/create" className="btn-primary h-9 text-xs">Create</Link>

          {user ? (
            <>
              <div className="relative" ref={notifRef}>
                  <button
                  aria-label="Open notifications"
                  onClick={() => { setShowNotifs(!showNotifs); if (!showNotifs) markAllRead(); }}
                  className="relative flex items-center justify-center w-9 h-9 rounded-full text-text-secondary hover:text-text-primary hover:bg-bg-raised transition-colors"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                    <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                  </svg>
                  {notifCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-accent text-[var(--on-red)] text-[9px] font-bold rounded-full flex items-center justify-center">
                      {notifCount}
                    </span>
                  )}
                </button>

                {showNotifs && (
                  <div className="absolute right-0 top-full mt-2 w-80 bg-bg-surface border border-border rounded-xl shadow-xl z-50 max-h-96 overflow-y-auto">
                    <div className="p-3 border-b border-border flex items-center justify-between">
                      <Link to="/notifications" onClick={() => setShowNotifs(false)} className="text-xs font-medium text-text-primary no-underline">Notifications</Link>
                      {notifCount > 0 && (
                        <button onClick={markAllRead} className="text-[10px] text-accent-2 hover:text-accent-2">Mark all read</button>
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
                            <p className="text-xs text-text-primary leading-relaxed">{n.message.replace(/^@(?=\S)/, '')}</p>
                            <p className="text-[10px] text-text-muted mt-1 font-mono">{timeAgo(n.created_at)}</p>
                          </div>
                          {!n.read && <div className="w-1.5 h-1.5 rounded-full bg-accent shrink-0 mt-1.5" />}
                        </Link>
                      ))
                    )}
                  </div>
                )}
              </div>

              <div className="relative" ref={menuRef}>
                <button
                  type="button"
                  onClick={() => setShowMenu((value) => !value)}
                  aria-label="Account menu"
                  aria-haspopup="menu"
                  aria-expanded={showMenu}
                  className="flex items-center justify-center w-9 h-9 rounded-full"
                >
                  <Avatar profile={{
                    handle: profile?.handle || user.user_metadata?.user_name || user.email?.split('@')[0],
                    avatar_url: profile ? profile.avatar_url : user.user_metadata?.avatar_url,
                  }} size="sm" />
                </button>
                {showMenu && (
                  <div className="account-menu" role="menu">
                    <Link to={`/u/${accountHandle}`} onClick={() => setShowMenu(false)} className="account-menu-item" role="menuitem">Your profile</Link>
                    <Link to="/saved" onClick={() => setShowMenu(false)} className="account-menu-item" role="menuitem">Saved</Link>
                    <a href="https://github.com/e-isdl/annotated-extension/releases/latest" target="_blank" rel="noopener noreferrer" onClick={() => setShowMenu(false)} className="account-menu-item" role="menuitem">Install the extension</a>
                    <button type="button" onClick={() => { setShowMenu(false); signOut(); }} className="account-menu-item" role="menuitem">Sign out</button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <button onClick={signIn} className="btn-primary h-9 text-xs">
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
