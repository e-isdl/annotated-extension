import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import ClipCard from '../components/ClipCard';
import { DEMO_CLIPS } from '../lib/demoData';

const SORT_OPTIONS = [
  { label: 'Best', value: 'best', helper: 'The strongest conversations right now' },
  { label: 'Hot', value: 'hot', helper: 'What is picking up momentum' },
  { label: 'New', value: 'new', helper: 'Fresh from the community' },
  { label: 'Top', value: 'top', helper: 'Highest-signal posts' },
];

export default function Feed() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedSort = searchParams.get('sort');
  const [clips, setClips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [usingDemo, setUsingDemo] = useState(false);
  const sort = SORT_OPTIONS.some((option) => option.value === requestedSort) ? requestedSort : 'best';
  const activeSort = SORT_OPTIONS.find((option) => option.value === sort) || SORT_OPTIONS[0];

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        let query = supabase
          .from('clips_with_scores')
          .select('*, profiles(*), annotations(id, text_content, audio_url)')
          .limit(40);

        if (sort === 'new') query = query.order('created_at', { ascending: false });
        else if (sort === 'top') query = query.order('score', { ascending: false, nullsFirst: false });
        else query = query.order('created_at', { ascending: false });

        const { data, error } = await query;
        if (cancelled) return;

        if (error || !data?.length) {
          setClips(rankClips(DEMO_CLIPS, sort));
          setUsingDemo(true);
          return;
        }

        const clipsWithCounts = await Promise.all(data.map(async (clip) => {
          const { count } = await supabase
            .from('comments')
            .select('id', { count: 'exact', head: true })
            .eq('clip_id', clip.id);
          return normalizeClip({ ...clip, comments_count: count ?? 0 });
        }));
        if (!cancelled) {
          setClips(rankClips(clipsWithCounts, sort));
          setUsingDemo(false);
        }
      } catch {
        if (!cancelled) {
          setClips(rankClips(DEMO_CLIPS, sort));
          setUsingDemo(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [sort]);

  return (
    <div className="feed-page">
      <section className="feed-heading modern-feed-heading">
        <div>
          <div className="flex items-center gap-2">
            <h1>{sort === 'best' ? 'Home' : activeSort.label}</h1>
            {usingDemo && <span className="demo-badge">DEMO FEED</span>}
          </div>
          <p>{activeSort.helper}. Every post keeps the source in view.</p>
        </div>
        <Link to="/create" className="btn-primary text-xs py-2 px-3">Create post</Link>
      </section>

      <Link to="/create" className="create-post-bar no-underline">
        <span className="create-post-avatar">A</span>
        <span className="create-post-placeholder">Create a post</span>
        <span className="create-post-action">Link or source</span>
      </Link>

      <div className="feed-tabs" role="tablist" aria-label="Feed sort">
        {SORT_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={sort === option.value}
            onClick={() => setSearchParams(option.value === 'best' ? {} : { sort: option.value })}
            className={sort === option.value ? 'feed-tab feed-tab-active' : 'feed-tab'}
          >
            {option.label}
          </button>
        ))}
      </div>

      {loading ? <LoadingSkeleton /> : (
        <div className="feed-list">
          {clips.map((clip) => <ClipCard key={clip.id} clip={clip} />)}
        </div>
      )}

      {!loading && usingDemo && (
        <div className="demo-note">
          <span className="demo-note-mark">✦</span>
          <p><strong>You are seeing the editorial demo.</strong> Real community posts will appear here as soon as people start annotating.</p>
          <Link to="/create">Create the first one →</Link>
        </div>
      )}
    </div>
  );
}

function normalizeClip(clip) {
  const sourceDomain = clip.source_domain || getDomain(clip.source_url);
  const communityName = clip.community_name || getCommunityName(clip.source_type);
  return { ...clip, source_domain: sourceDomain, community_name: communityName, community_slug: clip.community_slug || slugify(communityName) };
}

function rankClips(items, sort) {
  const clips = items.map(normalizeClip);
  if (sort === 'new') return [...clips].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  if (sort === 'top') return [...clips].sort((a, b) => (b.score || 0) - (a.score || 0));
  if (sort === 'hot') return [...clips].sort((a, b) => hotScore(b) - hotScore(a));
  return [...clips].sort((a, b) => bestScore(b) - bestScore(a));
}

function bestScore(clip) {
  return (clip.score || 0) + (clip.comments_count || 0) * 3;
}

function hotScore(clip) {
  const ageHours = Math.max(0.5, (Date.now() - new Date(clip.created_at).getTime()) / 3600000);
  return ((clip.score || 0) + (clip.comments_count || 0) * 2) / Math.pow(ageHours + 2, 1.4);
}

function getDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return 'source'; }
}

function getCommunityName(sourceType) {
  if (sourceType === 'youtube') return 'Internet Culture';
  if (sourceType === 'podcast') return 'Media Literacy';
  return 'Annotated';
}

function slugify(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function LoadingSkeleton() {
  return (
    <div className="feed-list">
      {[1, 2, 3].map((item) => (
        <div key={item} className="post-card post-skeleton">
          <div className="skeleton-line w-32" />
          <div className="skeleton-line w-4/5 h-5 mt-4" />
          <div className="skeleton-line w-full h-16 mt-3" />
          <div className="skeleton-line w-1/2 mt-4" />
        </div>
      ))}
    </div>
  );
}
