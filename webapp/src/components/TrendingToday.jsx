import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { postHref } from '../lib/links';

// Most upvoted threads from the last 24 hours.
export default function TrendingToday() {
  const [rows, setRows] = useState(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const { data } = await supabase
        .from('clips_with_scores')
        .select('*, profiles(handle), communities(slug, name)')
        .gte('created_at', since)
        .order('score', { ascending: false, nullsFirst: false })
        .limit(5);
      if (active) setRows(data || []);
    })();
    return () => { active = false; };
  }, []);

  if (!rows || !rows.length) return null;

  return (
    <section className="rail-card">
      <h2 className="rail-heading">Trending today</h2>
      <div className="flex flex-col gap-3">
        {rows.map((row, i) => (
          <Link key={row.id} to={postHref(row)} className="take-item no-underline">
            <span className="take-rank">{i + 1}</span>
            <span className="take-body">
              <span className="take-title">{row.title || 'Untitled take'}</span>
              <span className="take-meta">
                <span>{row.communities ? `c/${row.communities.name}` : (row.source_type || 'post')}</span>
                <span className="take-votes">{row.score || 0} votes</span>
              </span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
