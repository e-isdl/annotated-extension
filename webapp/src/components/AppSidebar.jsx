import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { DEMO_COMMUNITIES } from '../lib/demoData';

const NAV_ITEMS = [
  { label: 'Home', path: '/', icon: '⌂', sort: null },
  { label: 'Popular', path: '/popular', icon: '✦', sort: 'top' },
  { label: 'Latest', path: '/latest', icon: '◷', sort: 'new' },
  { label: 'Explore', path: '/explore', icon: '⌕' },
  { label: 'Saved', path: '/saved', icon: '▱' },
];

export default function AppSidebar() {
  const location = useLocation();
  const [user, setUser] = useState(null);
  const [communities, setCommunities] = useState([]);
  const [failed, setFailed] = useState(false);
  const currentSort = new URLSearchParams(location.search).get('sort');
  const isActive = (item) => item.path === '/' ? location.pathname === '/' && !currentSort : location.pathname === item.path || (item.sort && location.pathname === '/' && currentSort === item.sort);

  useEffect(() => {
    let active = true;
    async function loadCommunities() {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!active) return;
      setUser(currentUser);
      if (!currentUser) return;
      const { data, error } = await supabase
        .from('community_members')
        .select('created_at, communities(slug, name)')
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false });
      if (!active) return;
      if (error) setFailed(true);
      else setCommunities((data || []).map((row) => row.communities).filter(Boolean));
    }
    loadCommunities();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => { loadCommunities(); });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  const displayedCommunities = user ? communities : DEMO_COMMUNITIES;
  const label = user ? (failed ? 'Communities' : 'Your communities') : 'Popular communities';

  return (
    <aside className="community-sidebar">
      <div className="sidebar-section">
        <p className="sidebar-label">Discover</p>
        <nav className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => <Link key={item.label} to={item.path} className={`sidebar-link ${isActive(item) ? 'sidebar-link-active' : ''}`}><span className="sidebar-icon">{item.icon}</span>{item.label}</Link>)}
        </nav>
      </div>

      <div className="sidebar-section border-t border-border-subtle pt-5">
        <div className="flex items-center justify-between mb-2">
          <p className="sidebar-label mb-0">{label}</p>
          <Link to="/explore" className="text-xs text-text-muted hover:text-accent-text">+</Link>
        </div>
        <nav className="flex flex-col gap-1">
          {displayedCommunities.map((community) => <Link key={community.slug} to={`/c/${community.slug}`} className="community-link"><span className="community-dot">{community.name[0]}</span><span className="truncate">{community.name}</span></Link>)}
          {user && !failed && communities.length === 0 && <p className="sidebar-empty">Join a community to pin it here.</p>}
        </nav>
      </div>

      <div className="sidebar-note"><span className="text-lg">✎</span><p>Every post keeps its source, context, and conversation together.</p></div>
    </aside>
  );
}
