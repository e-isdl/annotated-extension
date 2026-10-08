import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { getCurrentUser } from '../lib/authUser';
import { createQuote, hrefForNewPost } from '../lib/repost';
import { useToast } from './ToastProvider';
import Avatar from './Avatar';

// Quote composer: your commentary plus the quoted post, filed under the
// original's community. Layout only; posting goes through create_quote_post.
export default function QuoteDialog({ clip, onClose }) {
  const navigate = useNavigate();
  const { push } = useToast();
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const quotedTitle = clip?.source_title || clip?.title || 'Quoted post';
  const quotedHandle = clip?.profiles?.handle;

  async function submit(event) {
    event.preventDefault();
    const text = body.trim();
    if (!text || saving) return;
    const user = await getCurrentUser();
    if (!user) { push('Sign in to quote posts.', 'info'); return; }
    if (String(clip?.id || '').startsWith('demo-')) { push('Demo posts live outside the database.', 'info'); return; }
    setSaving(true);
    setError('');
    try {
      const result = await createQuote(supabase, { clipId: clip.id, annotation: text });
      onClose();
      push('Quoted to your feed.', 'info');
      navigate(hrefForNewPost(result, null));
    } catch (err) {
      setError(err?.message || 'Quote could not be posted. Try again.');
    } finally {
      setSaving(false);
    }
  }

  // Portaled to the body: nested inside a card, a fixed backdrop can get
  // trapped by ancestor stacking contexts and paint as a black hole.
  return createPortal(
    <div className="quote-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="profile-edit-dialog" role="dialog" aria-modal="true" aria-labelledby="quote-title">
        <div className="profile-edit-heading">
          <div>
            <h2 id="quote-title">Quote this post</h2>
            <p>Add your take. The original stays attached.</p>
          </div>
          <button type="button" className="profile-edit-close" aria-label="Close quote composer" onClick={onClose}>×</button>
        </div>
        <div className="quote-embed">
          <Avatar profile={clip?.profiles} size="dot" />
          <div className="min-w-0">
            <p className="quote-embed-title">{quotedTitle}</p>
            {quotedHandle && <p className="quote-embed-meta">@{quotedHandle}</p>}
          </div>
        </div>
        <form onSubmit={submit} className="profile-edit-form">
          <label className="profile-edit-label">Your take
            <textarea className="input profile-bio-input" value={body} onChange={(event) => setBody(event.target.value)} maxLength={1000} rows={4} placeholder="Why is this worth a second look?" />
          </label>
          {error && <p className="profile-edit-error" role="alert">{error}</p>}
          <div className="profile-edit-actions">
            <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving || !body.trim()}>{saving ? 'Posting…' : 'Quote'}</button>
          </div>
        </form>
      </section>
    </div>,
    document.body,
  );
}
