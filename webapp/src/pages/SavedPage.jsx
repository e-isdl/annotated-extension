import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import ClipCard from '../components/ClipCard';

export default function SavedPage() {
  const [user, setUser] = useState(null);
  const [clips, setClips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [available, setAvailable] = useState(true);

  useEffect(() => {
    let active = true;
    async function load() {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!active) return;
      setUser(currentUser);
      if (!currentUser) { setLoading(false); return; }

      const { data, error } = await supabase
        .from('post_saves')
        .select('created_at, clips(*, profiles(*), annotations(id, text_content, audio_url))')
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false });
      if (!active) return;
      if (error) setAvailable(false);
      else setClips((data || []).map((item) => ({ ...item.clips, comments_count: 0 })).filter(Boolean));
      setLoading(false);
    }
    load();
    return () => { active = false; };
  }, []);

  const signIn = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  };

  return (
    <div className="section-page saved-page">
      <p className="eyebrow">YOUR READING LIST</p>
      <h1 className="section-title">Saved for later.</h1>
      <p className="section-subtitle">Keep the arguments, sources, and moments that deserve a second look.</p>

      {loading ? <div className="feed-list mt-8"><div className="post-card post-skeleton" /></div> : !user ? (
        <div className="empty-state compact-empty">
          <span className="text-3xl text-accent">☆</span>
          <h2 className="text-lg font-semibold text-text-primary">Sign in to build your reading list.</h2>
          <p className="text-sm text-text-secondary max-w-sm">Save an argument from the feed and it will follow you here.</p>
          <button type="button" className="btn-primary" onClick={signIn}>Sign in with Google</button>
        </div>
      ) : !available ? (
        <div className="empty-state compact-empty">
          <span className="text-3xl">◌</span>
          <h2 className="text-lg font-semibold text-text-primary">Saved posts are being wired up.</h2>
          <p className="text-sm text-text-secondary max-w-sm">The community migration is ready in the repository and will unlock persistent saves when applied.</p>
          <Link to="/" className="btn-primary">Browse Home</Link>
        </div>
      ) : clips.length === 0 ? (
        <div className="empty-state compact-empty">
          <span className="text-3xl text-accent">☆</span>
          <h2 className="text-lg font-semibold text-text-primary">Nothing saved yet.</h2>
          <p className="text-sm text-text-secondary max-w-sm">When a post makes you stop scrolling, save it here.</p>
          <Link to="/" className="btn-primary">Browse Home</Link>
        </div>
      ) : (
        <div className="feed-list mt-8">{clips.map((clip) => <ClipCard key={clip.id} clip={clip} />)}</div>
      )}
    </div>
  );
}
