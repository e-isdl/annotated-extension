import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { DEMO_CLIPS, getDemoCommunity } from '../lib/demoData';
import ClipCard from '../components/ClipCard';

export default function CommunityPage() {
  const { slug } = useParams();
  const [community, setCommunity] = useState(getDemoCommunity(slug) || { slug, name: slug.replace(/-/g, ' '), members: 'New', description: 'A new place for thoughtful source-based conversations.' });
  const [clips, setClips] = useState(DEMO_CLIPS.filter((clip) => clip.community_slug === slug));
  const [loading, setLoading] = useState(true);
  const [communityId, setCommunityId] = useState(null);
  const [joined, setJoined] = useState(false);
  const [joinLoading, setJoinLoading] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      const { data: communityRow } = await supabase.from('communities').select('*').eq('slug', slug).maybeSingle();
      if (communityRow && active) {
        setCommunity({ ...communityRow, members: communityRow.member_count || 'New' });
        setCommunityId(communityRow.id);
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: membership } = await supabase.from('community_members').select('user_id').eq('community_id', communityRow.id).eq('user_id', user.id).maybeSingle();
          if (active) setJoined(Boolean(membership));
        }
      }

      const { data } = await supabase
        .from('clips')
        .select('*, profiles(*), annotations(id, text_content, audio_url)')
        .order('created_at', { ascending: false })
        .limit(50);
      if (!active) return;
      if (data?.length) {
        const normalized = data.map((clip) => normalizeClip(clip));
        const matching = normalized.filter((clip) => clip.community_slug === slug);
        if (matching.length) setClips(matching);
      }
      setLoading(false);
    }
    load();
    return () => { active = false; };
  }, [slug]);

  async function toggleJoin() {
    if (!communityId || joinLoading) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { window.alert('Sign in to join this community.'); return; }
    setJoinLoading(true);
    const result = joined
      ? await supabase.from('community_members').delete().eq('community_id', communityId).eq('user_id', user.id)
      : await supabase.from('community_members').insert({ community_id: communityId, user_id: user.id });
    if (!result.error) setJoined(!joined);
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
        <button type="button" className={joined ? 'btn-ghost joined-button' : 'btn-primary'} onClick={toggleJoin} disabled={joinLoading}>{joinLoading ? '…' : joined ? 'Joined' : 'Join'}</button>
      </div>

      <div className="community-stats">
        <span><strong>{community.members}</strong> members</span>
        <span><strong>{clips.length || '—'}</strong> featured threads</span>
        <span>Public community</span>
      </div>

      <div className="community-toolbar">
        <div className="feed-tabs">
          <button className="feed-tab feed-tab-active">Best</button>
          <button className="feed-tab">New</button>
          <button className="feed-tab">Top</button>
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

function normalizeClip(clip) {
  const name = clip.community_name || (clip.source_type === 'youtube' ? 'Internet Culture' : clip.source_type === 'podcast' ? 'Media Literacy' : 'Annotated');
  return { ...clip, community_name: name, community_slug: clip.community_slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') };
}
