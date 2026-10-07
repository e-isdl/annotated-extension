import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { getCurrentUser } from '../lib/authUser';
import CommunityAvatar from './CommunityAvatar';
import { getDemoClip } from '../lib/demoData';
import { useToast } from './ToastProvider';
import { postHref } from '../lib/links';
import { subscribeActivePost } from '../lib/activePost';
import TrendingToday from './TrendingToday';
import TopAnnotators from './TopAnnotators';

export default function RightRail() {
  const location = useLocation();
  const { push } = useToast();
  const [takes, setTakes] = useState([]);
  useEffect(() => subscribeActivePost((active) => setTakes(active?.takes || [])), []);
  const postRef = location.pathname.match(/^\/(?:post|clip)\/([^/]+)/)?.[1] || location.pathname.match(/^\/@[^/]+\/post\/([^/?#]+)/)?.[1] || null;
  const showDiscovery = !postRef && ['/', '/popular', '/latest', '/for-you'].includes(location.pathname);
  const [community, setCommunity] = useState(null);
  const [joined, setJoined] = useState(false);
  const [joinLoading, setJoinLoading] = useState(false);
  const [authStateLoaded, setAuthStateLoaded] = useState(false);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!active) return;
      setSignedIn(Boolean(session?.user));
      setAuthStateLoaded(true);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedIn(Boolean(session?.user));
      setAuthStateLoaded(true);
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let active = true;
    const demoClip = postRef ? getDemoClip(postRef) : null;

    async function loadPostCommunity() {
      setCommunity(demoClip?.community_slug ? {
        id: null,
        slug: demoClip.community_slug,
        name: demoClip.community_name,
        description: '',
        rules: '',
        members: null,
      } : null);
      setJoined(false);
      if (!postRef) return;

      let clip = demoClip ? null : (await supabase.from('clips').select('community_id').eq('slug', postRef).maybeSingle()).data;
      if (!clip && !demoClip) clip = (await supabase.from('clips').select('community_id').eq('id', postRef).maybeSingle()).data;
      const communityId = clip?.community_id;
      const slug = demoClip?.community_slug;
      if (!communityId && !slug) return;

      let query = supabase.from('communities').select('*');
      query = communityId ? query.eq('id', communityId) : query.eq('slug', slug);
      const { data: row } = await query.maybeSingle();
      if (!active) return;
      if (row) {
        const [{ count }, user] = await Promise.all([
          supabase.from('community_members').select('user_id', { count: 'exact', head: true }).eq('community_id', row.id),
          getCurrentUser(),
        ]);
        let membership = null;
        if (user) membership = (await supabase.from('community_members').select('user_id').eq('community_id', row.id).eq('user_id', user.id).maybeSingle()).data;
        if (active) {
          setCommunity({ ...row, members: count ?? 0 });
          setJoined(Boolean(membership));
        }
      }
    }

    loadPostCommunity();
    return () => { active = false; };
  }, [postRef]);

  async function toggleJoin() {
    if (!community?.id || joinLoading) return;
    const user = await getCurrentUser();
    if (!user) { push('Sign in to join this community.', 'info'); return; }
    setJoinLoading(true);
    const result = joined
      ? await supabase.from('community_members').delete().eq('community_id', community.id).eq('user_id', user.id)
      : await supabase.from('community_members').insert({ community_id: community.id, user_id: user.id });
    if (result.error) push(result.error.message || 'Community membership could not be updated.', 'error');
    else {
      setJoined(!joined);
      setCommunity((current) => ({ ...current, members: Math.max(0, (current.members || 0) + (joined ? -1 : 1)) }));
    }
    setJoinLoading(false);
  }

  return (
    <aside className="right-rail">
      {community ? (
        <section className="community-info-card">
          <div className="community-info-heading">
            <CommunityAvatar slug={community.slug} name={community.name} className="community-dot community-dot-lg" />
            <div className="min-w-0 flex-1">
              <p className="community-info-prefix">c/{community.name}</p>
              <h2>{community.name}</h2>
            </div>
            {community.id
              ? <button type="button" className={joined ? 'btn-ghost community-join-button' : 'btn-primary community-join-button'} onClick={toggleJoin} disabled={joinLoading}>{joinLoading ? '…' : joined ? 'Joined' : 'Join'}</button>
              : <Link to={`/c/${community.slug}`} className="btn-primary community-join-button">Open</Link>}
          </div>
          {community.description && <p className="community-info-description">{community.description}</p>}
          <div className="community-stats">
            {community.members > 1 && <span><strong>{community.members}</strong> members</span>}
            <span>Public community</span>
          </div>
          <div className="community-info-actions">
            <Link to={`/c/${community.slug}`} className="community-info-link">Community home</Link>
            <Link to="/create" className="community-info-link">Create a post</Link>
          </div>
          {community.rules && <section className="community-rules"><h3>Community rules</h3><p>{community.rules}</p></section>}
        </section>
      ) : authStateLoaded && !signedIn ? (
        <Link to="/create" className="create-prompt no-underline">
          <p className="text-xs font-semibold text-text-muted">Annotated</p>
          <h2 className="text-base font-semibold text-text-primary mt-2 leading-tight">Add context to a moment</h2>
          <p className="text-xs text-text-secondary leading-relaxed mt-2">Bring a source, add your perspective, and discuss it with the community.</p>
        </Link>
      ) : null}

      {takes.length > 0 && (
        <section className="rail-card takes-card">
          <div className="takes-head">
            <h2 className="rail-heading">Other takes on this source</h2>
            <span className="takes-count">{takes.length}</span>
          </div>
          <div className="takes-list">
            {takes.map((take, i) => (
              <Link key={take.id} to={postHref(take)} className="take-item no-underline">
                <span className="take-rank">{i + 1}</span>
                <span className="take-body">
                  <span className="take-title">{take.title || 'Untitled take'}</span>
                  <span className="take-meta"><span>@{take.profiles?.handle}</span><span className="take-votes">{take.score || 0} votes</span></span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {showDiscovery && (
        <>
          <TrendingToday />
          <TopAnnotators />
        </>
      )}
      <footer className="rail-footer">
        {!postRef && (
          <span className="rail-get-extension">
            <a href="https://github.com/e-isdl/annotated-extension/releases/latest" target="_blank" rel="noopener noreferrer">Get the extension</a>
            <span className="rail-footer-updated">Extension updated October 7, 6:00 PM</span>
          </span>
        )}
        <a href="https://github.com/e-isdl/annotated-extension/releases" data-github-link target="_blank" rel="noopener noreferrer">GitHub ↗</a>
      </footer>
    </aside>
  );
}
