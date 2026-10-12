import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { getCurrentUser } from '../lib/authUser';
import { listDrafts } from '../lib/drafts';
import CommunityAvatar from './CommunityAvatar';

const NAV_ITEMS = [
  { label: 'For You', path: '/for-you', icon: '✧', sort: null },
  { label: 'Feed', path: '/', icon: '⌂', sort: null },
  { label: 'Explore', path: '/explore', icon: '⌕' },
  { label: 'Saved', path: '/saved', icon: '▱' },
  { label: 'Drafts', path: '/drafts', icon: '✎' },
];

export default function AppSidebar() {
  const location = useLocation();
  const [user, setUser] = useState(null);
  const [communities, setCommunities] = useState([]);
  const [failed, setFailed] = useState(false);
  const [draftCount, setDraftCount] = useState(0);
  const currentSort = new URLSearchParams(location.search).get('sort');
  const isActive = (item) => item.path === '/' ? location.pathname === '/' && !currentSort : location.pathname === item.path || (item.sort && location.pathname === '/' && currentSort === item.sort);

  useEffect(() => {
    let active = true;
    async function loadCommunities() {
      const currentUser = await getCurrentUser();
      if (!active) return;
      setUser(currentUser);
      if (currentUser) {
        const { data: membershipResult } = await supabase.from('community_members').select('created_at, community_id, communities(slug, name)').eq('user_id', currentUser.id).order('created_at', { ascending: false });
        if (!active) return;
        if (!membershipResult) setFailed(true);
        const joined = (membershipResult || []).map((row) => row.communities).filter(Boolean);
        setCommunities(joined);
        return;
      }
      // Signed out: show popular communities so the rail never sits empty.
      try {
        const [{ data: allCommunities }, { data: posts }] = await Promise.all([
          supabase.from('communities').select('id, slug, name').order('name'),
          supabase.from('clips').select('community_id'),
        ]);
        if (!active) return;
        if (!allCommunities) {
          setFailed(true);
          return;
        }
        const counts = {};
        for (const post of posts || []) {
          if (post.community_id) counts[post.community_id] = (counts[post.community_id] || 0) + 1;
        }
        const ranked = [...allCommunities].sort(
          (a, b) => (counts[b.id] || 0) - (counts[a.id] || 0) || String(a.name).localeCompare(String(b.name)),
        );
        setCommunities(ranked.slice(0, 5).map(({ slug, name }) => ({ slug, name })));
      } catch {
        if (active) setFailed(true);
      }
    }
    loadCommunities();
    const loadDraftCount = async () => {
      try {
        const rows = await listDrafts(supabase);
        if (active) setDraftCount(rows.length);
      } catch {
        if (active) setDraftCount(0);
      }
    };
    loadDraftCount();
    const onFocus = () => { loadDraftCount(); };
    window.addEventListener('focus', onFocus);
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => { loadCommunities(); loadDraftCount(); });
    return () => { active = false; subscription.unsubscribe(); window.removeEventListener('focus', onFocus); };
  }, []);

  const displayedCommunities = communities;

  return (
    <div className="sidebar-cell">
    <aside className="community-sidebar">
      <div className="sidebar-section">
        <nav className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => <Link key={item.label} to={item.path} className={`sidebar-link ${isActive(item) ? 'sidebar-link-active' : ''}`}><span className="sidebar-icon">{item.icon}</span>{item.label}{item.label === 'Drafts' && draftCount > 0 && <span className="sidebar-count">{draftCount > 99 ? '99+' : draftCount}</span>}</Link>)}
        </nav>
      </div>

      <div className="sidebar-section border-t border-border-subtle pt-5">
        <div className="flex items-center justify-between mb-2">
          <p className="sidebar-label mb-0">{user ? 'Your communities' : 'Popular communities'}</p>
          <Link to="/explore" className="text-xs text-text-muted hover:text-accent-text">+</Link>
        </div>
        <nav className="flex flex-col gap-1">
          {displayedCommunities.map((community) => <Link key={community.slug} to={`/c/${community.slug}`} className="community-link"><CommunityAvatar slug={community.slug} name={community.name} /><span className="truncate">{community.name}</span></Link>)}
          {user && !failed && communities.length === 0 && <p className="sidebar-empty">Explore communities and join one to pin it here.</p>}
          {!user && !failed && communities.length === 0 && <p className="sidebar-empty">Explore the most active communities.</p>}
        </nav>
      </div>

    </aside>
    </div>
  );
}
