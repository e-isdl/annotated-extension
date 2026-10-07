import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import Avatar from './Avatar';

// Top annotators of the last 30 days by summed clip score.
export default function TopAnnotators() {
  const [rows, setRows] = useState(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const base = supabase
        .from('clips_with_scores')
        .select('score, profiles(id, handle, avatar_url, display_name)')
        .order('score', { ascending: false });
      const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
      let { data } = await base.gte('created_at', since).limit(40);
      if (!data?.length) ({ data } = await supabase
        .from('clips_with_scores')
        .select('score, profiles(id, handle, avatar_url, display_name)')
        .order('score', { ascending: false })
        .limit(40));
      if (!active) return;
      const byUser = new Map();
      (data || []).forEach((row) => {
        const p = row.profiles;
        if (!p?.id || !p?.handle) return;
        const cur = byUser.get(p.id) || { profile: p, score: 0 };
        cur.score += row.score || 0;
        byUser.set(p.id, cur);
      });
      setRows([...byUser.values()].sort((a, b) => b.score - a.score).slice(0, 4));
    })();
    return () => { active = false; };
  }, []);

  if (!rows || !rows.length) return null;

  return (
    <section className="rail-card">
      <div className="flex items-center justify-between mb-4">
        <h2 className="rail-heading">Trending annotators</h2>
        <Link to="/leaderboard" className="text-[11px] text-accent-2 hover:text-accent-2">See all</Link>
      </div>
      <div className="flex flex-col gap-3">
        {rows.map(({ profile, score }) => (
          <Link key={profile.id} to={`/u/${profile.handle}`} className="flex items-center gap-3 no-underline group">
            <Avatar profile={profile} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm text-text-primary group-hover:text-accent-text truncate">{profile.handle}</span>
              <span className="block text-[11px] text-text-muted mt-0.5">{score} points</span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
