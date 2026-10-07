import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import CommunityAvatar from './CommunityAvatar';

// Communities with the most clips in the last 24 hours.
export default function TrendingTopics() {
  const [rows, setRows] = useState(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const { data } = await supabase
        .from('clips_with_scores')
        .select('community_id, communities(slug, name)')
        .gte('created_at', since)
        .limit(100);
      if (!active) return;
      const byCommunity = new Map();
      (data || []).forEach((row) => {
        const key = row.community_id || row.communities?.slug;
        const info = row.communities;
        if (!key || !info?.slug) return;
        const cur = byCommunity.get(key) || { slug: info.slug, name: info.name, count: 0 };
        cur.count += 1;
        byCommunity.set(key, cur);
      });
      setRows([...byCommunity.values()].sort((a, b) => b.count - a.count).slice(0, 5));
    })();
    return () => { active = false; };
  }, []);

  if (!rows || !rows.length) return null;

  return (
    <section className="rail-card">
      <div className="flex items-center justify-between mb-4">
        <h2 className="rail-heading">Trending topics</h2>
        <Link to="/explore" className="text-[11px] text-accent-2 hover:text-accent-2">See all</Link>
      </div>
      <div className="flex flex-col gap-3">
        {rows.map((row) => (
          <Link key={row.slug} to={`/c/${row.slug}`} className="flex items-center gap-3 no-underline group">
            <CommunityAvatar slug={row.slug} name={row.name} className="community-dot community-dot-lg" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm text-text-primary group-hover:text-accent-text truncate">c/{row.name}</span>
              <span className="block text-[11px] text-text-muted mt-0.5">{row.count} post{row.count === 1 ? '' : 's'} today</span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
