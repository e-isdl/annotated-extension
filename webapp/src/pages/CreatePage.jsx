import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { generateSlug } from '../lib/api';
import { DEMO_COMMUNITIES } from '../lib/demoData';

const TYPES = ['Reaction', 'Fact check', 'Explainer', 'Steelman', 'Found receipts'];

export default function CreatePage() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [form, setForm] = useState({ community: 'media-literacy', type: 'Reaction', url: '', title: '', quote: '', commentary: '' });
  const [status, setStatus] = useState('');
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user: currentUser } }) => setUser(currentUser));
  }, []);

  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const sourceType = form.url.includes('youtube.com') || form.url.includes('youtu.be') ? 'youtube' : 'article';

  async function publish(event) {
    event.preventDefault();
    if (!form.title.trim() || !form.commentary.trim()) {
      setStatus('Add a title and your point of view first.');
      return;
    }
    if (!user) {
      setStatus('Sign in to publish. Your draft is ready when you are.');
      return;
    }

    setPublishing(true);
    setStatus('');
    try {
      const { data: clip, error: clipError } = await supabase
        .from('clips')
        .insert({
          user_id: user.id,
          source_url: form.url.trim() || null,
          source_type: sourceType,
          title: form.title.trim(),
          article_text: form.quote.trim() || null,
          slug: generateSlug(form.title),
        })
        .select()
        .single();
      if (clipError) throw clipError;

      const { error: annotationError } = await supabase.from('annotations').insert({
        clip_id: clip.id,
        user_id: user.id,
        text_content: form.commentary.trim(),
      });
      if (annotationError) throw annotationError;
      navigate(`/clip/${clip.slug || clip.id}`);
    } catch (error) {
      setStatus(error.message || 'We could not publish this thread yet.');
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="create-page">
      <Link to="/" className="back-link">← Back home</Link>
      <div className="create-header">
        <p className="eyebrow">NEW ANNOTATION</p>
        <h1>Put a point on the internet.</h1>
        <p>Bring a source. Add your angle. Give people something specific to respond to.</p>
      </div>

      <form onSubmit={publish} className="create-layout">
        <div className="create-form">
          <label className="form-label">Community
            <select className="input" value={form.community} onChange={(e) => update('community', e.target.value)}>
              {DEMO_COMMUNITIES.map((community) => <option key={community.slug} value={community.slug}>c/{community.name}</option>)}
            </select>
          </label>

          <fieldset>
            <legend className="form-label">What kind of note is this?</legend>
            <div className="type-picker">
              {TYPES.map((type) => (
                <button key={type} type="button" onClick={() => update('type', type)} className={form.type === type ? 'type-option type-option-active' : 'type-option'}>{type}</button>
              ))}
            </div>
          </fieldset>

          <label className="form-label">Source URL <span className="text-text-muted font-normal">(optional)</span>
            <input className="input" value={form.url} onChange={(e) => update('url', e.target.value)} placeholder="https://..." />
          </label>
          <label className="form-label">Title
            <input className="input" value={form.title} onChange={(e) => update('title', e.target.value)} placeholder="What is the conversation about?" maxLength={180} />
          </label>
          <label className="form-label">The context <span className="text-text-muted font-normal">(quote, timestamp, or excerpt)</span>
            <textarea className="input resize-none" rows={5} value={form.quote} onChange={(e) => update('quote', e.target.value)} placeholder="Point to the exact part people should look at..." />
          </label>
          <label className="form-label">Your commentary
            <textarea className="input resize-none" rows={7} value={form.commentary} onChange={(e) => update('commentary', e.target.value)} placeholder="What do you want people to understand, question, or add?" />
          </label>
          {status && <p className="form-status">{status}</p>}
          <button type="submit" className="btn-primary w-full" disabled={publishing}>{publishing ? 'Publishing…' : user ? 'Publish thread ↗' : 'Sign in to publish ↗'}</button>
        </div>

        <div className="create-preview-wrap">
          <p className="eyebrow">LIVE PREVIEW</p>
          <div className="create-preview">
            <p className="post-meta"><span className="community-pill"><span className="community-dot">{DEMO_COMMUNITIES.find((item) => item.slug === form.community)?.name[0]}</span> c/{DEMO_COMMUNITIES.find((item) => item.slug === form.community)?.name}</span><span>• just now</span></p>
            <h2>{form.title || 'Your thread title will appear here'}</h2>
            <p className="post-commentary">{form.commentary || 'Your point of view will be the center of the post.'}</p>
            <div className="source-preview source-preview-preview">
              <div className="source-preview-copy">
                <div className="source-label">↗ {form.url ? sourceDomain(form.url) : 'your source'}</div>
                <p className="source-quote">{form.quote ? `“${form.quote}”` : 'Add a quote or source context so people know what you are discussing.'}</p>
              </div>
            </div>
            <div className="post-actions"><span className="post-action">▲ 0</span><span className="post-action">▱ 0 comments</span><span className="post-action">↗ Share</span></div>
          </div>
        </div>
      </form>
    </div>
  );
}

function sourceDomain(value) {
  try { return new URL(value).hostname.replace(/^www\./, ''); } catch { return 'source'; }
}
