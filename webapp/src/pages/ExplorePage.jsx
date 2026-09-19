import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { DEMO_COMMUNITIES, DEMO_CLIPS } from '../lib/demoData';

export default function ExplorePage() {
  const [communities, setCommunities] = useState(DEMO_COMMUNITIES);

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase.from('communities').select('*').order('name');
      if (error || !data?.length) return;
      const hydrated = await Promise.all(data.map(async (community) => {
        const [{ count: members }, { count: posts }] = await Promise.all([
          supabase.from('community_members').select('user_id', { count: 'exact', head: true }).eq('community_id', community.id),
          supabase.from('clips').select('id', { count: 'exact', head: true }).eq('community_id', community.id),
        ]);
        return { ...community, members: members || 0, postCount: posts || 0 };
      }));
      setCommunities(hydrated);
    }
    load();
  }, []);

  return (
    <div className="section-page">
      <p className="eyebrow">EXPLORE</p>
      <h1 className="section-title">Find your corner of the conversation.</h1>
      <p className="section-subtitle">Communities are where source material turns into a shared point of view.</p>

      <div className="explore-grid">
        {communities.map((community) => {
          const postCount = community.postCount ?? DEMO_CLIPS.filter((clip) => clip.community_slug === community.slug).length;
          return (
            <Link key={community.slug} to={`/c/${community.slug}`} className="explore-community no-underline">
              <div className="flex items-center justify-between">
                <span className="community-dot community-dot-lg">{community.name[0]}</span>
                <span className="text-text-muted text-lg">↗</span>
              </div>
              <h2>{community.name}</h2>
              <p>{community.description}</p>
              <div className="flex items-center gap-3 mt-5 text-[11px] text-text-muted font-mono">
                <span>{community.members} members</span>
                <span>•</span>
                <span>{postCount} featured threads</span>
              </div>
            </Link>
          );
        })}
      </div>

      <div className="explore-callout">
        <div>
          <p className="eyebrow">NO PERFECT CATEGORY?</p>
          <h2>Start a conversation around the source.</h2>
          <p>Good communities emerge from good posts. Give the first one a reason to exist.</p>
        </div>
        <Link to="/create" className="btn-primary">Create a thread ↗</Link>
      </div>
    </div>
  );
}
