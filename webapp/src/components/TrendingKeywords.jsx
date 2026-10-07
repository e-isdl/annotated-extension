import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';

// Trending keywords extracted from recent thread titles. Clicking one
// searches for it.
const STOP = new Set([
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'have', 'has', 'are',
  'was', 'were', 'will', 'would', 'about', 'into', 'over', 'after', 'before',
  'between', 'while', 'when', 'what', 'which', 'their', 'there', 'been',
  'also', 'just', 'like', 'more', 'most', 'other', 'some', 'such', 'than',
  'then', 'them', 'these', 'those', 'your', 'yours', 'http', 'https', 'www',
  'com', 'org', 'net', 'you', 'your', 'they', 'them', 'she', 'him', 'her',
  'his', 'its', 'our', 'ours', 'but', 'not', 'all', 'any', 'can', 'had',
  'her', 'how', 'one', 'out', 'did', 'get', 'got', 'say', 'says', 'said',
  'says', 'new', 'now', 'how', 'why', 'who', 'whom', 'dont', 'does', 'doing',
  'very', 'here', 'where', 'while', 'will', 'would', 'should', 'could',
]);

function extractTopics(titles, limit) {
  const counts = new Map();
  const firstSeen = new Map();
  let order = 0;
  titles.forEach((title) => {
    String(title || '')
      .toLowerCase()
      .split(/[^a-z0-9']+/)
      .forEach((raw) => {
        const w = raw.replace(/^'+|'+$/g, '');
        if (w.length < 3 || STOP.has(w) || /^\d+$/.test(w)) return;
        counts.set(w, (counts.get(w) || 0) + 1);
        if (!firstSeen.has(w)) firstSeen.set(w, order++);
      });
  });
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || (firstSeen.get(a[0]) - firstSeen.get(b[0])))
    .slice(0, Math.max(limit, 1))
    .map(([term, count]) => ({ term, count }));
}

export default function TrendingKeywords({ limit = 6 }) {
  const [rows, setRows] = useState(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase
        .from('clips_with_scores')
        .select('title')
        .order('created_at', { ascending: false })
        .limit(40);
      if (!active) return;
      setRows(extractTopics((data || []).map((r) => r.title), limit));
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
  if (!rows.length) return <p className="sidebar-empty">Nothing trending yet.</p>;

  return (
    <>
      {rows.map(({ term, count }) => (
        <Link key={term} to={`/search?q=${encodeURIComponent(term)}`} className="sidebar-link">
          <span className="truncate">{term}</span>
          <span className="sidebar-count">{count}</span>
        </Link>
      ))}
    </>
  );
}
