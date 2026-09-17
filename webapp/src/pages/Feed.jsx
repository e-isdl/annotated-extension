import { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import ClipCard from '../components/ClipCard';

const SORT_OPTIONS = [
  { label: 'Hot', value: 'hot' },
  { label: 'New', value: 'new' },
  { label: 'Top', value: 'top' },
];
const PAGE_SIZE = 5;
const BUFFER = 3;

export default function Feed() {
  const [clips, setClips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState('hot');
  const [visibleEnd, setVisibleEnd] = useState(PAGE_SIZE);
  const sentinelRef = useRef(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setVisibleEnd(PAGE_SIZE);
      let query = supabase
        .from('clips_with_scores')
        .select('*, profiles(*), annotations(id, text_content, audio_url)');

      if (sort === 'new') {
        query = query.order('created_at', { ascending: false });
      } else if (sort === 'top') {
        query = query.order('score', { ascending: false, nullsFirst: false });
      } else {
        query = query.order('created_at', { ascending: false });
      }

      const { data } = await query.limit(30);

      if (data) {
        let sorted = data;
        if (sort === 'hot') {
          sorted = [...data].sort((a, b) => {
            const scoreA = (a.score ?? 0);
            const scoreB = (b.score ?? 0);
            const ageA = (Date.now() - new Date(a.created_at).getTime()) / 3600000;
            const ageB = (Date.now() - new Date(b.created_at).getTime()) / 3600000;
            const hotA = scoreA / Math.pow(ageA + 2, 1.5);
            const hotB = scoreB / Math.pow(ageB + 2, 1.5);
            return hotB - hotA;
          });
        }

        const clipsWithCounts = await Promise.all(sorted.map(async (clip) => {
          const { count } = await supabase
            .from('comments')
            .select('id', { count: 'exact', head: true })
            .eq('clip_id', clip.id);
          return { ...clip, comments_count: count ?? 0 };
        }));
        setClips(clipsWithCounts);
      }
      setLoading(false);
    }
    load();
  }, [sort]);

  useEffect(() => {
    if (loading || visibleEnd >= clips.length) return;
    const el = sentinelRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisibleEnd((prev) => Math.min(prev + PAGE_SIZE, clips.length));
        }
      },
      { rootMargin: '400px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loading, visibleEnd, clips.length]);

  const visibleStart = Math.max(0, visibleEnd - PAGE_SIZE - BUFFER);
  const visibleClips = clips.slice(visibleStart, visibleEnd);
  const hasMore = visibleEnd < clips.length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-xl font-bold text-text-primary tracking-tight">Feed</h1>
        <a
          href="https://github.com/e-isdl/annotated-extension"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-accent-text hover:text-accent font-medium"
        >
          Get the Extension
        </a>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex gap-1 bg-bg-surface border border-border rounded-lg p-1">
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setSort(opt.value)}
              className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors ${
                sort === opt.value
                  ? 'bg-accent text-white'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <span className="text-xs text-text-muted font-mono">{clips.length} clips</span>
      </div>

      {loading ? (
        <LoadingSkeleton />
      ) : clips.length === 0 ? (
        <EmptyFeed />
      ) : (
        <>
          <div style={{ height: visibleStart * 200 }} />
          {visibleClips.map((clip) => <ClipCard key={clip.id} clip={clip} />)}
          {hasMore && <div ref={sentinelRef} className="h-4" />}
          {!hasMore && clips.length > 0 && (
            <p className="text-xs text-text-muted text-center py-4">You've reached the end</p>
          )}
        </>
      )}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="clip-card animate-pulse">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-full bg-bg-raised" />
            <div className="w-20 h-3 bg-bg-raised rounded" />
          </div>
          <div className="w-full h-32 bg-bg-raised rounded-lg mb-3" />
          <div className="w-3/4 h-3 bg-bg-raised rounded mb-2" />
          <div className="w-1/2 h-3 bg-bg-raised rounded" />
        </div>
      ))}
    </div>
  );
}

function EmptyFeed() {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
      <span className="text-4xl">📎</span>
      <h2 className="text-xl font-bold text-text-primary">No clips yet</h2>
      <p className="text-sm text-text-secondary">
        Install the Annotated Chrome extension to start clipping content from the web.
      </p>
      <a
        href="https://chrome.google.com/webstore"
        target="_blank"
        rel="noopener noreferrer"
        className="btn-primary"
      >
        Get the Extension
      </a>
    </div>
  );
}
