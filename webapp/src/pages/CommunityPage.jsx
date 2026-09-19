import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { DEMO_CLIPS, getDemoCommunity } from '../lib/demoData';
import ClipCard from '../components/ClipCard';
import { useToast } from '../components/ToastProvider';

const SORTS = [
  { label: 'Best', value: 'best' },
  { label: 'New', value: 'new' },
  { label: 'Top', value: 'top' },
];

export default function CommunityPage() {
  const { slug } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { push } = useToast();
  const requestedSort = searchParams.get('sort');
  const sort = SORTS.some((option) => option.value === requestedSort) ? requestedSort : 'best';
  const demoCommunity = getDemoCommunity(slug);
  const [community, setCommunity] = useState(demoCommunity || { slug, name: slug.replace(/-/g, ' '), members: 'New', description: 'A new place for thoughtful source-based conversations.' });
  const [clips, setClips] = useState(demoCommunity ? DEMO_CLIPS.filter((clip) => clip.community_slug === slug) : []);
  const [loading, setLoading] = useState(true);
  const [communityId, setCommunityId] = useState(null);
  const [joined, setJoined] = useState(false);
  const [joinLoading, setJoinLoading] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      const { data: communityRow, error: communityError } = await supabase.from('communities').select('*').eq('slug', slug).maybeSingle();
      if (!active) return;

      if (communityRow && !communityError) {
        setCommunity(communityRow);
        setCommunityId(communityRow.id);
        const [{ count }, { data: { user } }, clipsResponse] = await Promise.all([
          supabase.from('community_members').select('user_id', { count: 'exact', head: true }).eq('community_id', communityRow.id),
          supabase.auth.getUser(),
          supabase.from('clips_with_scores').select('*, profiles(*), annotations(id, text_content, audio_url)').eq('community_id', communityRow.id).limit(50),
        ]);
        if (user) {
          const { data: membership } = await supabase.from('community_members').select('user_id').eq('community_id', communityRow.id).eq('user_id', user.id).maybeSingle();
          if (active) setJoined(Boolean(membership));
        }
        if (!active) return;
        setCommunity((current) => ({ ...current, members: count ?? current.members ?? 'New' }));
        setClips(sortClips((clipsResponse.data || []).map((clip) => ({ ...clip, community_name: communityRow.name, community_slug: communityRow.slug })), sort));
      } else if (demoCommunity) {
        setCommunity(demoCommunity);
        setClips(sortClips(DEMO_CLIPS.filter((clip) => clip.community_slug === slug), sort));
      } else {
        setClips([]);
      }
      setLoading(false);
    }
    load();
    return () => { active = false; };
  }, [slug, sort, demoCommunity]);

  async function toggleJoin() {
    if (!communityId || joinLoading) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { push('Sign in to join this community.', 'info'); return; }
    setJoinLoading(true);
    const result = joined
      ? await supabase.from('community_members').delete().eq('community_id', communityId).eq('user_id', user.id)
      : await supabase.from('community_members').insert({ community_id: communityId, user_id: user.id });
    if (result.error) push(result.error.message || 'Community membership could not be updated.', 'error');
    else setJoined(!joined);
    setJoinLoading(false);
  }

  return (
    <div className="section-page community-page">
      <div className="community-hero">
        <div className="community-hero-mark">{community.name[0]}</div>
        <div className="flex-1 min-w-0">
          <p className="eyebrow">COMMUNITY</p>
          <h1>c/{community.name}</h1>
          <p>{community.description}</p>
        </div>
        {communityId && <button type="button" className={joined ? 'btn-ghost joined-button' : 'btn-primary'} onClick={toggleJoin} disabled={joinLoading}>{joinLoading ? '…' : joined ? 'Joined' : 'Join'}</button>}
      </div>

      <div className="community-stats">
        <span><strong>{community.members || 'New'}</strong> members</span>
        <span><strong>{clips.length || '—'}</strong> threads</span>
        <span>Public community</span>
      </div>

      <div className="community-toolbar">
        <div className="feed-tabs" role="tablist" aria-label="Community sort">
          {SORTS.map((option) => <button key={option.value} type="button" role="tab" aria-selected={sort === option.value} onClick={() => setSearchParams(option.value === 'best' ? {} : { sort: option.value })} className={sort === option.value ? 'feed-tab feed-tab-active' : 'feed-tab'}>{option.label}</button>)}
        </div>
        <Link to="/create" className="btn-primary text-xs py-2 px-3">Create thread</Link>
      </div>

      <div className="feed-list">
        {loading ? <div className="post-card post-skeleton" /> : clips.length ? clips.map((clip) => <ClipCard key={clip.id} clip={clip} />) : (
          <div className="empty-state compact-empty">
            <span className="text-3xl">✎</span>
            <h2 className="text-lg font-semibold text-text-primary">Be the first to start this conversation.</h2>
            <Link to="/create" className="btn-primary">Create a thread</Link>
          </div>
        )}
      </div>
    </div>
  );
}

function sortClips(items, sort) {
  if (sort === 'new') return [...items].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  if (sort === 'top') return [...items].sort((a, b) => (b.score || 0) - (a.score || 0));
  return [...items].sort((a, b) => ((b.score || 0) + (b.comments_count || 0) * 3) - ((a.score || 0) + (a.comments_count || 0) * 3));
}
