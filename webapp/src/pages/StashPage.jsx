import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { getCurrentUser } from '../lib/authUser';

function formatRange(clip) {
  if (clip.start_sec == null || clip.end_sec == null) return null;
  const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  return `${fmt(clip.start_sec)} → ${fmt(clip.end_sec)}`;
}

function sourceLabel(clip) {
  try { return new URL(clip.source_url).hostname.replace(/^www\./, ''); } catch { return 'source'; }
}

export default function StashPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [drafts, setDrafts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirmId, setConfirmId] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      const currentUser = await getCurrentUser();
      if (!active) return;
      setUser(currentUser);
      if (!currentUser) { setLoading(false); return; }
      const { data } = await supabase
        .from('clip_drafts')
        .select('*')
        .order('created_at', { ascending: false });
      if (!active) return;
      setDrafts(data || []);
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

  const removeDraft = async (id) => {
    if (confirmId !== id) { setConfirmId(id); return; }
    setDeleting(true);
    const { error } = await supabase.from('clip_drafts').delete().eq('id', id);
    setDeleting(false);
    if (!error) {
      setDrafts((current) => current.filter((draft) => draft.id !== id));
      setConfirmId(null);
    }
  };

  return (
    <div className="section-page saved-page">
      <p className="eyebrow">Clip now, post later</p>
      <h1 className="section-title">Your stash.</h1>
      <p className="section-subtitle">Clips you stashed from the extension, waiting for your take. Finish them here or let them sit privately.</p>

      {loading ? <div className="feed-list mt-8"><div className="post-card post-skeleton" /></div> : !user ? (
        <div className="empty-state compact-empty">
          <p className="text-sm text-text-secondary">Sign in to see your stashed clips.</p>
          <button type="button" onClick={signIn} className="btn-primary mt-4">Sign in with Google</button>
        </div>
      ) : drafts.length === 0 ? (
        <div className="empty-state compact-empty">
          <p className="text-sm text-text-secondary">Nothing stashed yet. Clip something in the extension and hit Stash for later.</p>
          <Link to="/create" className="btn-ghost mt-4">Or create a post directly</Link>
        </div>
      ) : (
        <div className="flex flex-col gap-3 mt-8">
          {drafts.map((draft) => {
            const range = formatRange(draft);
            return (
              <div key={draft.id} className="bg-bg-surface border border-border rounded-lg p-4 flex flex-col gap-2">
                <p className="text-sm text-text-primary font-semibold leading-snug">{draft.title}</p>
                <p className="text-xs text-text-muted truncate">{sourceLabel(draft)} · {new Date(draft.created_at).toLocaleDateString()}</p>
                {range && <p className="text-xs text-text-secondary font-mono">{range}{draft.video_url ? ' · has recording' : ''}</p>}
                {!range && draft.video_url && <p className="text-xs text-text-secondary font-mono">has recording</p>}
                <div className="flex items-center gap-2 mt-1">
                  <button
                    type="button"
                    onClick={() => navigate(`/create?draft=${draft.id}`)}
                    className="btn-primary text-xs px-4 py-2"
                  >
                    Finish and post
                  </button>
                  <button
                    type="button"
                    disabled={deleting}
                    onClick={() => removeDraft(draft.id)}
                    className="text-xs text-text-muted hover:text-[var(--red)] transition-colors disabled:opacity-40"
                  >
                    {confirmId === draft.id ? 'Confirm delete?' : 'Delete'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
