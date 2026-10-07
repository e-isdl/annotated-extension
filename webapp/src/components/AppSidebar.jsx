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
  const [popularCommunities, setPopularCommunities] = useState([]);
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
      const [{ data: allCommunities }, membershipResult, allMembershipsResult] = await Promise.all([
        supabase.from('communities').select('id, slug, name').order('name'),
        currentUser
          ? supabase.from('community_members').select('created_at, community_id, communities(slug, name)').eq('user_id', currentUser.id).order('created_at', { ascending: false })
          : Promise.resolve({ data: [], error: null }),
        supabase.from('community_members').select('community_id'),
      ]);
      const memberRows = membershipResult.data || [];
      const memberCounts = {};
      (allMembershipsResult.data || []).forEach((row) => { memberCounts[row.community_id] = (memberCounts[row.community_id] || 0) + 1; });
      if (!active) return;
      if (membershipResult.error || allMembershipsResult.error) setFailed(true);
      const joined = memberRows.map((row) => row.communities).filter(Boolean);
      setCommunities(joined);
      const popular = [...(allCommunities || [])].sort((a, b) => (memberCounts[b.id] || 0) - (memberCounts[a.id] || 0)).slice(0, 6);
      setPopularCommunities(popular);
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

  const displayedCommunities = user && communities.length ? communities : popularCommunities;
  const label = user && communities.length ? (failed ? 'Communities' : 'Your communities') : 'Popular communities';

  return (
    <aside className="community-sidebar">
      <div className="sidebar-section">
        <nav className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => <Link key={item.label} to={item.path} className={`sidebar-link ${isActive(item) ? 'sidebar-link-active' : ''}`}><span className="sidebar-icon">{item.icon}</span>{item.label}{item.label === 'Drafts' && draftCount > 0 && <span className="sidebar-count">{draftCount > 99 ? '99+' : draftCount}</span>}</Link>)}
        </nav>
      </div>

      <div className="sidebar-section border-t border-border-subtle pt-5">
        <div className="flex items-center justify-between mb-2">
          <p className="sidebar-label mb-0">{label}</p>
          <Link to="/explore" className="text-xs text-text-muted hover:text-accent-text">+</Link>
        </div>
        <nav className="flex flex-col gap-1">
          {displayedCommunities.map((community) => <Link key={community.slug} to={`/c/${community.slug}`} className="community-link"><CommunityAvatar slug={community.slug} name={community.name} /><span className="truncate">{community.name}</span></Link>)}
          {user && !failed && communities.length === 0 && displayedCommunities.length === 0 && <p className="sidebar-empty">Explore communities and join one to pin it here.</p>}
        </nav>
      </div>

    </aside>
  );
}
