import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { getCurrentUser } from '../lib/authUser';
import { deleteDraft, getDraft, publishDraft, upsertDraft } from '../lib/drafts';
import { ANNOTATION_TYPES } from '../lib/annotationLimits';
import { generateSlug } from '../lib/api';

function sourceHost(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return 'source'; }
}

export default function DraftEditPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [draft, setDraft] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [communities, setCommunities] = useState([]);
  const [commentary, setCommentary] = useState('');
  const [communityId, setCommunityId] = useState('');
  const [kind, setKind] = useState('Reaction');
  const [startSec, setStartSec] = useState('');
  const [endSec, setEndSec] = useState('');
  const [passage, setPassage] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const deleteTimer = useRef(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const currentUser = await getCurrentUser();
      if (!active) return;
      setUser(currentUser);
      if (!currentUser) { setLoading(false); return; }
      try {
        const [row, { data: communityRows }] = await Promise.all([
          getDraft(supabase, id),
          supabase.from('communities').select('id, slug, name').order('name'),
        ]);
        if (!active) return;
        if (!row) { setLoading(false); return; }
        setDraft(row);
        setCommunities(communityRows || []);
        const payload = row.payload || {};
        setCommentary(payload.commentary || '');
        setCommunityId(row.community_id || '');
        setKind(row.kind || 'Reaction');
        setStartSec(payload.startSec ?? '');
        setEndSec(payload.endSec ?? '');
        setPassage(payload.articlePassage || '');
      } catch {
        if (active) setLoadError('Could not load this draft.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; clearTimeout(deleteTimer.current); };
  }, [id]);

  const signIn = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  };

  const collectPayload = () => ({
    ...(draft?.payload || {}),
    commentary: commentary.trim(),
    kind,
    startSec: startSec === '' ? null : Number(startSec),
    endSec: endSec === '' ? null : Number(endSec),
    articlePassage: passage.trim() || null,
  });

  const handleSave = async () => {
    if (!draft) return;
    setBusy(true);
    setStatus('Saving…');
    try {
      await upsertDraft(supabase, {
        id: draft.id,
        kind,
        source_url: draft.source_url,
        title: draft.title,
        thumbnail_url: draft.thumbnail_url,
        community_id: communityId || null,
        payload: collectPayload(),
      });
      setDraft((current) => (current ? { ...current, kind, community_id: communityId || null, payload: collectPayload() } : current));
      setStatus('Draft saved');
    } catch (e) {
      setStatus(e.message || 'Could not save draft.');
    } finally {
      setBusy(false);
    }
  };

  const saveTimer = useRef(null);

  useEffect(() => {
    if (!draft || deleted) return undefined;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await upsertDraft(supabase, {
          id: draft.id,
          kind,
          source_url: draft.source_url,
          title: draft.title,
          thumbnail_url: draft.thumbnail_url,
          community_id: communityId || null,
          payload: collectPayload(),
        });
      } catch {}
    }, 800);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [draft?.id, deleted, commentary, communityId, kind, startSec, endSec, passage]);

  const handlePublish = async () => {
    if (!draft || busy) return;
    if (!commentary.trim()) { setStatus('Write your take before posting.'); return; }
    setBusy(true);
    setStatus('Publishing…');
    try {
      const payload = collectPayload();
      const post = await publishDraft(supabase, {
        draftId: draft.id,
        kind,
        communityId: communityId || null,
        title: draft.title || 'Untitled clip',
        sourceUrl: draft.source_url,
        sourceType: payload.sourceType || 'article',
        sourceDomain: sourceHost(draft.source_url),
        sourceTitle: draft.title,
        author: payload.author ?? null,
        thumbnail: draft.thumbnail_url,
        youtubeId: payload.youtubeId ?? null,
        transcript: null,
        articleText: payload.articlePassage,
        startSec: payload.startSec,
        endSec: payload.endSec,
        duration: payload.duration ?? null,
        slug: generateSlug(draft.title || 'untitled'),
        annotation: commentary.trim(),
        annotationAudioUrl: payload.audioUrl ?? null,
      });
      navigate(`/post/${post.id}`);
    } catch (e) {
      setStatus(e.message || 'We could not publish this yet.');
      setBusy(false);
    }
  };

  const handleDelete = () => {
    if (!draft || deleted) return;
    setDeleted(true);
    deleteTimer.current = setTimeout(async () => {
      try { await deleteDraft(supabase, draft.id); } catch {}
      navigate('/drafts');
    }, 5000);
  };

  const handleUndoDelete = () => {
    clearTimeout(deleteTimer.current);
    setDeleted(false);
  };

  const isYouTube = (draft?.payload || {}).sourceType === 'youtube';
  const isArticle = (draft?.payload || {}).sourceType === 'article';

  return (
    <div className="section-page drafts-page">
      <Link to="/drafts" className="back-link">← All drafts</Link>
      <p className="eyebrow">Finish your take</p>
      <h1 className="section-title">{draft?.title || 'Draft.'}</h1>

      {loading ? (
        <div className="feed-list mt-8"><div className="post-card post-skeleton" /></div>
      ) : !user ? (
        <div className="empty-state compact-empty">
          <p className="text-sm text-text-secondary">Sign in to edit your drafts.</p>
          <button type="button" onClick={signIn} className="btn-primary mt-4">Sign in with Google</button>
        </div>
      ) : loadError ? (
        <div className="empty-state compact-empty">
          <p className="text-sm text-text-secondary">{loadError}</p>
          <button type="button" onClick={() => window.location.reload()} className="btn-ghost mt-4">Retry</button>
        </div>
      ) : !draft ? (
        <div className="empty-state compact-empty">
          <p className="text-sm text-text-secondary">Draft not found. It may have been published or deleted.</p>
          <Link to="/drafts" className="btn-ghost mt-4">Back to drafts</Link>
        </div>
      ) : deleted ? (
        <div className="draft-undo" role="status">
          <span>Draft deleted.</span>
          <button type="button" onClick={handleUndoDelete}>Undo</button>
        </div>
      ) : (
        <div className="create-form draft-edit-form">
          <label className="form-label">Your annotation
            <textarea
              className="input resize-none annotation-editor"
              rows={6}
              value={commentary}
              onChange={(e) => setCommentary(e.target.value)}
              placeholder="What do you want people to understand, question, or add?"
            />
          </label>

          <label className="form-label">Community <span className="text-text-muted font-normal">(optional)</span>
            <select className="input" value={communityId} onChange={(e) => setCommunityId(e.target.value)}>
              <option value="">No community</option>
              {communities.map((community) => <option key={community.id} value={community.id}>c/{community.name}</option>)}
            </select>
          </label>

          <label className="form-label">Post type
            <select className="input" value={kind} onChange={(e) => setKind(e.target.value)}>
              {ANNOTATION_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
          </label>

          {isYouTube && (
            <div className="moment-fields">
              <label className="form-label">Start time<input className="input" type="number" min="0" step="1" value={startSec} onChange={(e) => setStartSec(e.target.value)} /></label>
              <label className="form-label">End time<input className="input" type="number" min="1" step="1" value={endSec} onChange={(e) => setEndSec(e.target.value)} /></label>
            </div>
          )}

          {isArticle && (
            <label className="form-label">Quoted passage
              <textarea
                className="input resize-none"
                rows={4}
                value={passage}
                onChange={(e) => setPassage(e.target.value)}
                placeholder="The passage this take is about…"
              />
            </label>
          )}

          {status && <p className="form-status" role="status">{status}</p>}

          <div className="draft-edit-actions">
            <button type="button" onClick={handleSave} disabled={busy} className="btn-ghost flex-1 disabled:opacity-40">
              Save
            </button>
            <button type="button" onClick={handlePublish} disabled={busy} className="btn-primary flex-1 disabled:opacity-40">
              {busy ? 'Publishing…' : 'Publish'}
            </button>
            <button type="button" onClick={handleDelete} disabled={busy} className="btn-ghost draft-delete-btn disabled:opacity-40">
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
