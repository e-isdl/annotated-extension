import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { getCurrentUser } from '../lib/authUser';
import ClipCard from './ClipCard';

const getDomain = (url) => {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return 'source'; }
};

const normalize = (clip) => ({
  ...clip,
  source_domain: clip.source_domain || getDomain(clip.source_url),
  community_name: clip.community_name || clip.communities?.name || null,
  community_slug: clip.community_slug || clip.communities?.slug || null,
});

// Posts from people the current user follows, newest first.
export default function FollowingList() {
  const [state, setState] = useState({ loading: true, signedIn: false, clips: [] });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const user = await getCurrentUser();
      if (cancelled) return;
      if (!user) {
        setState({ loading: false, signedIn: false, clips: [] });
        return;
      }
      const { data: follows } = await supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', user.id);
      const ids = (follows || []).map((f) => f.following_id).filter(Boolean);
      if (!ids.length) {
        setState({ loading: false, signedIn: true, clips: [] });
        return;
      }
      const { data } = await supabase
        .from('clips_with_scores')
        .select('*, profiles(*), annotations(id, text_content, audio_url), communities(slug, name)')
        .in('user_id', ids)
        .order('created_at', { ascending: false })
        .limit(30);
      if (!cancelled) setState({ loading: false, signedIn: true, clips: (data || []).map(normalize) });
    }
    load();
    return () => { cancelled = true; };
  }, []);

  if (state.loading) {
    return (
      <div className="feed-list">
        <div className="post-card post-skeleton">
          <div className="skeleton-line w-4/5 h-5 mt-4" />
          <div className="skeleton-line w-full h-16 mt-3" />
        </div>
      </div>
    );
  }

  if (!state.signedIn) {
    return (
      <div className="empty-state">
        <p className="text-sm text-text-secondary">Sign in to see posts from people you follow.</p>
      </div>
    );
  }

  if (!state.clips.length) {
    return (
      <div className="empty-state">
        <p className="text-sm text-text-secondary">You are not following anyone yet.</p>
        <Link to="/explore" className="text-sm text-accent-2 hover:text-accent-2 no-underline">Find people to follow</Link>
      </div>
    );
  }

  return (
    <div className="feed-list">
      {state.clips.map((clip) => <ClipCard key={clip.id} clip={clip} />)}
    </div>
  );
}
