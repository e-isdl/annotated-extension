import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { getCurrentUser } from '../lib/authUser';
import CommunityAvatar from './CommunityAvatar';
import { getDemoClip } from '../lib/demoData';
import { useToast } from './ToastProvider';
import { postHref } from '../lib/links';
import { subscribeActivePost } from '../lib/activePost';
import TrendingTopics from './TrendingTopics';
import TopAnnotators from './TopAnnotators';
import TrendingPeople from './TrendingPeople';
import PeopleToFollow from './PeopleToFollow';
import Avatar from './Avatar';
import { findSamplePerson, formatCount } from '../lib/samplePeople';

export default function RightRail() {
  const location = useLocation();
  const { push } = useToast();
  const [takes, setTakes] = useState([]);
  useEffect(() => subscribeActivePost((active) => setTakes(active?.takes || [])), []);
  const postRef = location.pathname.match(/^\/(?:post|clip)\/([^/]+)/)?.[1] || location.pathname.match(/^\/@[^/]+\/post\/([^/?#]+)/)?.[1] || null;
  const communitySlug = location.pathname.match(/^\/c\/([^/?#]+)/)?.[1] || null;
  const profileHandle = location.pathname.match(/^\/u\/([^/?#]+)/)?.[1] || null;
  const isExplore = location.pathname === '/explore';
  const isSaved = location.pathname === '/saved';
  const isProfile = Boolean(profileHandle);
  const showDiscovery = !postRef && !communitySlug && !isExplore && !isProfile && ['/', '/popular', '/latest', '/for-you', '/saved'].includes(location.pathname);
  const [railCommunity, setRailCommunity] = useState(null);
  const [relatedCommunities, setRelatedCommunities] = useState([]);
  const [communityAnnotators, setCommunityAnnotators] = useState([]);
  const [railProfile, setRailProfile] = useState(null);
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

  useEffect(() => {
    let active = true;
    setRailCommunity(null);
    setRelatedCommunities([]);
    setCommunityAnnotators([]);
    if (!communitySlug) return () => { active = false; };
    (async () => {
      const { data: row } = await supabase.from('communities').select('*').eq('slug', communitySlug).maybeSingle();
      if (!active || !row) return;
      const [{ count: memberCount }, { data: allCommunities }, { data: clips }] = await Promise.all([
        supabase.from('community_members').select('user_id', { count: 'exact', head: true }).eq('community_id', row.id),
        supabase.from('communities').select('id, slug, name').order('name').limit(12),
        supabase.from('clips_with_scores').select('user_id, profiles(id, handle, display_name, avatar_url)').eq('community_id', row.id).limit(30),
      ]);
      if (!active) return;
      let threadCount = null;
      const threads = await supabase.from('clips').select('id', { count: 'exact', head: true }).eq('community_id', row.id);
      if (threads.count != null) threadCount = threads.count;
      setRailCommunity({ ...row, members: memberCount ?? 0, threads: threadCount });
      setRelatedCommunities((allCommunities || []).filter((c) => c.slug !== row.slug).slice(0, 3));
      const seen = new Map();
      (clips || []).forEach((clip) => {
        const p = clip.profiles;
        if (p && !seen.has(p.id)) seen.set(p.id, p);
      });
      setCommunityAnnotators([...seen.values()].slice(0, 5));
    })();
    return () => { active = false; };
  }, [communitySlug]);

  useEffect(() => {
    let active = true;
    setRailProfile(null);
    if (!profileHandle) return () => { active = false; };
    (async () => {
      const demo = findSamplePerson(profileHandle);
      if (demo) {
        if (active) setRailProfile({ handle: demo.handle, display_name: demo.name, avatar_url: demo.pfp, bio: '', followers: demo.followers, following: demo.following, posts: 0, demo: true });
        return;
      }
      const { data: row } = await supabase.from('profiles').select('*').eq('handle', profileHandle).maybeSingle();
      if (!active || !row) return;
      const [{ count: followerCount }, { count: followingCount }, { count: postCount }] = await Promise.all([
        supabase.from('follows').select('follower_id', { count: 'exact', head: true }).eq('following_id', row.id),
        supabase.from('follows').select('following_id', { count: 'exact', head: true }).eq('follower_id', row.id),
        supabase.from('clips').select('id', { count: 'exact', head: true }).eq('user_id', row.id),
      ]);
      if (!active) return;
      setRailProfile({ ...row, followers: followerCount || 0, following: followingCount || 0, posts: postCount || 0 });
    })();
    return () => { active = false; };
  }, [profileHandle]);

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
          <TrendingTopics />
          <TopAnnotators />
        </>
      )}

      {isExplore && <PeopleToFollow limit={10} />}

      {communitySlug && railCommunity && (
        <>
          <section className="community-info-card">
            <div className="community-info-heading">
              <CommunityAvatar slug={railCommunity.slug} name={railCommunity.name} className="community-dot community-dot-lg" />
              <div className="min-w-0 flex-1">
                <p className="community-info-prefix">c/{railCommunity.name}</p>
                <h2>{railCommunity.name}</h2>
              </div>
            </div>
            {railCommunity.description && <p className="community-info-description">{railCommunity.description}</p>}
            <div className="community-stats">
              {railCommunity.created_at && <span>Created {new Date(railCommunity.created_at).toLocaleDateString()}</span>}
              {(railCommunity.members ?? 0) > 1 && <span><strong>{railCommunity.members}</strong> members</span>}
              {railCommunity.threads != null && <span><strong>{railCommunity.threads}</strong> threads</span>}
            </div>
            <div className="community-info-actions">
              <Link to={`/c/${railCommunity.slug}`} className="community-info-link">Community home</Link>
              <Link to="/create" className="community-info-link">Create a post</Link>
            </div>
          </section>
          {railCommunity.rules && (
            <section className="rail-card">
              <h2 className="rail-heading">Community rules</h2>
              <div className="community-rules" style={{ marginTop: 8, paddingTop: 0, borderTop: 0 }}>
                <p>{railCommunity.rules}</p>
              </div>
            </section>
          )}
          {communityAnnotators.length > 0 && (
            <section className="rail-card">
              <h2 className="rail-heading">Top annotators in this community</h2>
              <nav className="flex flex-col gap-1 mt-2">
                {communityAnnotators.map((p) => (
                  <Link key={p.id} to={`/u/${p.handle}`} className="sidebar-link">
                    <Avatar profile={p} size="dot" />
                    <span className="min-w-0 flex-1 truncate">{p.display_name || p.handle}</span>
                    <span className="text-[11px] text-text-muted shrink-0">@{p.handle}</span>
                  </Link>
                ))}
              </nav>
            </section>
          )}
          {relatedCommunities.length > 0 && (
            <section className="rail-card">
              <h2 className="rail-heading">Related communities</h2>
              <nav className="flex flex-col gap-1 mt-2">
                {relatedCommunities.map((c) => (
                  <Link key={c.slug} to={`/c/${c.slug}`} className="related-row">
                    <CommunityAvatar slug={c.slug} name={c.name} />
                    <span className="min-w-0 flex-1">
                      <span className="related-name block truncate">{c.name}</span>
                    </span>
                    <span className="topic-go">↗</span>
                  </Link>
                ))}
              </nav>
            </section>
          )}
        </>
      )}

      {isProfile && railProfile && (
        <>
          <section className="rail-card profile-rail-card">
            <div className="community-info-heading">
              <Avatar profile={railProfile} size="md" />
              <div className="min-w-0 flex-1">
                <p className="community-info-prefix">@{railProfile.handle}</p>
                <h2>{railProfile.display_name || railProfile.handle}</h2>
              </div>
            </div>
            {railProfile.bio && <p className="profile-rail-bio">{railProfile.bio}</p>}
            <div className="profile-rail-stats">
              <span><strong>{railProfile.posts ?? 0}</strong> posts</span>
              <span><strong>{formatCount(railProfile.followers)}</strong> followers</span>
              <span><strong>{formatCount(railProfile.following)}</strong> following</span>
            </div>
            <div className="community-info-actions">
              <Link to={`/u/${railProfile.handle}`} className="community-info-link">View profile</Link>
            </div>
          </section>
          <section className="rail-card">
            <h2 className="rail-heading">More annotators</h2>
            <nav className="flex flex-col gap-1 mt-2">
              <TrendingPeople limit={5} />
            </nav>
          </section>
          <TrendingTopics />
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
