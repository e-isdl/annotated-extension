import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { communityStyle } from '../lib/community';

export default function ExplorePage() {
  const [communities, setCommunities] = useState([]);

  useEffect(() => {
    async function load() {
      const [{ data, error }, { data: memberships }, { data: posts }] = await Promise.all([
        supabase.from('communities').select('*').order('name'),
        supabase.from('community_members').select('community_id'),
        supabase.from('clips').select('community_id'),
      ]);
      if (error || !data?.length) return;
      const memberCounts = countBy(memberships || [], 'community_id');
      const postCounts = countBy(posts || [], 'community_id');
      const hydrated = data.map((community) => ({ ...community, members: memberCounts[community.id] || 0, postCount: postCounts[community.id] || 0 }));
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
          const postCount = community.postCount ?? 0;
          return (
            <Link key={community.slug} to={`/c/${community.slug}`} className="explore-community no-underline">
              <div className="flex items-center justify-between">
                <span className="community-dot community-dot-lg" style={communityStyle(community.slug)}>{community.name[0]}</span>
                <span className="text-text-muted text-lg">↗</span>
              </div>
              <h2>{community.name}</h2>
              <p>{community.description}</p>
              <div className="flex items-center gap-3 mt-5 text-[11px] text-text-muted font-mono">
                <span>{community.members} {community.members === 1 ? 'member' : 'members'}</span>
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

function countBy(rows, key) {
  return rows.reduce((counts, row) => {
    if (row[key]) counts[row[key]] = (counts[row[key]] || 0) + 1;
    return counts;
  }, {});
}
