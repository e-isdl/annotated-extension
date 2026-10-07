import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { getCurrentUser } from '../lib/authUser';
import Avatar from './Avatar';

// Annotators ranked by summed clip score (30 days, all-time fallback).
// Parent provides the card/page shell.
export default function TrendingPeople({ limit = 3 }) {
  const [rows, setRows] = useState(null);
  const [total, setTotal] = useState(0);
  const [mine, setMine] = useState(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const user = await getCurrentUser().catch(() => null);
      if (active) setMine(user?.id || null);
      const base = () => supabase
        .from('clips_with_scores')
        .select('score, profiles(id, handle, avatar_url, display_name)')
        .order('score', { ascending: false });
      const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
      let { data } = await base().gte('created_at', since).limit(40);
      if (!data?.length) ({ data } = await base().limit(40));
      if (!active) return;
      const byUser = new Map();
      (data || []).forEach((row) => {
        const p = row.profiles;
        if (!p?.id || !p?.handle) return;
        const cur = byUser.get(p.id) || { profile: p, score: 0 };
        cur.score += row.score || 0;
        byUser.set(p.id, cur);
      });
      const ranked = [...byUser.values()].filter((r) => r.score > 0).sort((a, b) => b.score - a.score);
      setTotal(ranked.length);
      setRows(ranked.slice(0, Math.max(limit, 1)));
    })();
    return () => { active = false; };
  }, [limit]);

  if (!rows) {
    return (
      <div className="flex flex-col gap-3" aria-hidden="true">
        {[0, 1, 2].map((i) => <div key={i} className="skeleton-line w-full h-9" />)}
      </div>
    );
  }

  return (
    <div className="take-list">
      {rows.map(({ profile, score }, i) => (
        <Link
          key={profile.id}
          to={`/u/${profile.handle}`}
          className={`take-item no-underline${mine && profile.id === mine ? ' is-mine' : ''}`}
        >
          <span className="take-rank">{i + 1}</span>
          <Avatar profile={profile} size="sm" />
          <span className="take-body">
            <span className="take-title">{profile.handle}</span>
          </span>
          <span className="take-points">{score}</span>
        </Link>
      ))}
      {total < 3 && (
        <p className="text-sm text-text-secondary">
          Be the first to climb the board. <Link to="/create" className="text-accent-2 hover:text-accent-2 no-underline">Create a post</Link>
        </p>
      )}
    </div>
  );
}
