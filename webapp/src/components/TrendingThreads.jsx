import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { postHref } from '../lib/links';

// Most upvoted threads of the last 24 hours. Parent provides the card/page shell.
export default function TrendingThreads({ limit = 3 }) {
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
        .limit(Math.max(limit, 1));
      if (active) setRows(data || []);
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
  if (!rows.length) {
    if (plain) return <p className="sidebar-empty">Nothing trending yet.</p>;
    return <p className="text-sm text-text-muted">Nothing trending yet.</p>;
  }

  const thumbFor = (row) => {
    if (row.youtube_id) return `https://img.youtube.com/vi/${row.youtube_id}/hqdefault.jpg`;
    return row.source_image_url || row.thumbnail || null;
  };

  return (
    <div className={plain ? undefined : 'take-list'}>
      {rows.map((row, i) => {
        const thumb = thumbFor(row);
        if (plain) {
          return (
            <Link key={row.id} to={postHref(row)} className="sidebar-link">
              <span className="sidebar-icon">{i + 1}</span>
              <span className="truncate">{row.title || 'Untitled take'}</span>
            </Link>
          );
        }
        return (
          <Link key={row.id} to={postHref(row)} className="take-item no-underline">
            <span className="take-rank">{i + 1}</span>
            <span className="take-body">
              <span className="take-title">{row.title || 'Untitled take'}</span>
              <span className="take-meta">
                <span>{row.communities ? `c/${row.communities.name}` : (row.source_type || 'post')} · {row.score || 0} upvotes</span>
              </span>
            </span>
            {thumb && <img src={thumb} alt="" loading="lazy" className="take-thumb" />}
          </Link>
        );
      })}
    </div>
  );
}
