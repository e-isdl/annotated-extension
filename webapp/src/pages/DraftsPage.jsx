import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { getCurrentUser } from '../lib/authUser';
import { deleteDraft, listDrafts } from '../lib/drafts';

function timeAgo(dateStr) {
  const diff = Math.max(0, Date.now() - new Date(dateStr).getTime());
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatRange(startSec, endSec) {
  if (startSec == null || endSec == null) return null;
  const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  return `${fmt(startSec)} → ${fmt(endSec)}`;
}

function sourceHost(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

function DraftThumb({ draft }) {
  const payload = draft.payload || {};
  const [failed, setFailed] = useState(false);
  if (payload.youtubeId && !failed) {
    return (
      <img
        src={`https://img.youtube.com/vi/${payload.youtubeId}/hqdefault.jpg`}
        alt=""
        className="draft-thumb"
        loading="lazy"
        onError={() => setFailed(true)}
      />
    );
  }
  if (draft.thumbnail_url && !failed) {
    return (
      <img
        src={draft.thumbnail_url}
        alt=""
        className="draft-thumb"
        loading="lazy"
        onError={() => setFailed(true)}
      />
    );
  }
  const host = sourceHost(draft.source_url);
  return (
    <span className="draft-thumb draft-thumb-fallback">
      {host ? (
        <img
          src={`https://www.google.com/s2/favicons?domain=${host}&sz=64`}
          alt=""
          width={20}
          height={20}
          loading="lazy"
          onError={(e) => { e.currentTarget.style.display = 'none'; }}
        />
      ) : null}
      <span className="draft-thumb-domain">{host || 'link'}</span>
    </span>
  );
}

export default function DraftsPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [drafts, setDrafts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [removed, setRemoved] = useState({});
  const timers = useRef({});

  async function load() {
    const currentUser = await getCurrentUser();
    setUser(currentUser);
    if (!currentUser) { setLoading(false); return; }
    try {
      setDrafts(await listDrafts(supabase));
      setError('');
    } catch {
      setError('Could not load drafts.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    (async () => {
      const currentUser = await getCurrentUser();
      if (!active) return;
      setUser(currentUser);
      if (!currentUser) { setLoading(false); return; }
      try {
        setDrafts(await listDrafts(supabase));
      } catch {
        if (active) setError('Could not load drafts.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    const onFocus = () => { load(); };
    window.addEventListener('focus', onFocus);
    return () => { active = false; window.removeEventListener('focus', onFocus); Object.values(timers.current).forEach((t) => clearTimeout(t)); };
  }, []);

  const signIn = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  };

  const handleDelete = (draft) => {
    timers.current[draft.id] = setTimeout(async () => {
      delete timers.current[draft.id];
      setRemoved((current) => {
        const next = { ...current };
        delete next[draft.id];
        return next;
      });
      try { await deleteDraft(supabase, draft.id); } catch {}
    }, 15000);
    setRemoved((current) => ({ ...current, [draft.id]: draft }));
  };

  const handleUndo = (id) => {
    clearTimeout(timers.current[id]);
    delete timers.current[id];
    setRemoved((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  };

  const visible = drafts.filter((draft) => !removed[draft.id]);
  const undone = Object.values(removed);

  return (
    <div className="section-page drafts-page">
      <p className="eyebrow">Clip now, post later</p>
      <h1 className="section-title">Drafts.</h1>
      <p className="section-subtitle">Unfinished annotations, synced from the extension. Continue them here or let them sit privately.</p>

      {loading ? (
        <div className="feed-list mt-8"><div className="post-card post-skeleton" /><div className="post-card post-skeleton" /></div>
      ) : !user ? (
        <div className="empty-state compact-empty">
          <p className="text-sm text-text-secondary">Sign in to see your drafts.</p>
          <button type="button" onClick={signIn} className="btn-primary mt-4">Sign in with Google</button>
        </div>
      ) : error && visible.length === 0 ? (
        <div className="empty-state compact-empty">
          <p className="text-sm text-text-secondary">{error}</p>
          <button type="button" onClick={() => { setLoading(true); setError(''); load(); }} className="btn-ghost mt-4">Retry</button>
        </div>
      ) : visible.length === 0 && undone.length === 0 ? (
        <div className="empty-state compact-empty">
          <p className="text-sm text-text-secondary">No drafts yet. Annotate something in the extension and stash it here with Save draft.</p>
          <Link to="/create" className="btn-ghost mt-4">Or create a post directly</Link>
        </div>
      ) : (
        <div className="feed-list mt-8">
          {visible.map((draft) => {
            const payload = draft.payload || {};
            const range = payload.sourceType === 'youtube' && payload.startSec != null
              ? formatRange(payload.startSec, payload.endSec)
              : null;
            return (
              <article key={draft.id} className="post-card draft-card">
                <div className="draft-top">
                  <span className="draft-tag">Draft</span>
                  <span className="draft-edited">Edited {timeAgo(draft.updated_at || draft.created_at)}</span>
                </div>
                <div className="draft-main">
                  <DraftThumb draft={draft} />
                  <div className="draft-body">
                    <p className="draft-title">{draft.title || 'Untitled clip'}</p>
                    <div className="draft-meta">
                      {draft.kind && <span className="draft-kind">{draft.kind}</span>}
                      {range && <span className="draft-range">{range}</span>}
                    </div>
                    {payload.commentary && <p className="draft-comment">{payload.commentary}</p>}
                  </div>
                  <button
                    type="button"
                    className="draft-delete"
                    onClick={() => handleDelete(draft)}
                    aria-label="Delete draft"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-9 0 1 13h10l1-13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </div>
                <button type="button" className="btn-primary w-full draft-continue" onClick={() => navigate(`/drafts/${draft.id}`)}>
                  Continue
                </button>
              </article>
            );
          })}
        </div>
      )}

      {undone.map((item) => (
        <div key={item.id} className="draft-undo" role="status">
          <span>Draft deleted.</span>
          <button type="button" onClick={() => handleUndo(item.id)}>Undo</button>
        </div>
      ))}
    </div>
  );
}
