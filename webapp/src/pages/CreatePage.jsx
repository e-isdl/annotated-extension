import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { getCurrentUser } from '../lib/authUser';
import { generateSlug } from '../lib/api';
import { postHref } from '../lib/links';
import { hasMoment } from '../lib/moment';
import { createAnnotatedPost } from '../lib/mutations';
import CommunityAvatar from '../components/CommunityAvatar';
import { isXPostUrl } from '../lib/social';
import { ANNOTATION_TYPES, ANNOTATION_LIMITS } from '../lib/annotationLimits';

const POST_MODES = [
  { label: 'Source', value: 'source', helper: 'Share a source and your point of view.' },
  { label: 'Text', value: 'text', helper: 'Start with an idea when there is no external source.' },
  { label: 'Moment', value: 'moment', helper: 'Point to an exact time in a YouTube source.' },
];

export default function CreatePage() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [mode, setMode] = useState('source');
  const [communities, setCommunities] = useState([]);
  const [communitiesReady, setCommunitiesReady] = useState(false);
  const [communityLoadError, setCommunityLoadError] = useState(false);
  const [form, setForm] = useState({ community: '', type: 'Reaction', url: '', title: '', quote: '', commentary: '', startSec: '', endSec: '' });
  const [status, setStatus] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [duplicateClips, setDuplicateClips] = useState([]);

  useEffect(() => {
    let active = true;
    async function load() {
      const [currentUser, { data, error }] = await Promise.all([
        getCurrentUser(),
        supabase.from('communities').select('id, slug, name, description').order('name'),
      ]);
      if (!active) return;
      setUser(currentUser);
      if (!error) {
        setCommunities(data || []);
      } else {
        setCommunities([]);
        setCommunityLoadError(true);
      }
      setCommunitiesReady(true);
    }
    load();
    return () => { active = false; };
  }, []);

  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const selectedCommunity = communities.find((community) => community.slug === form.community);
  const annotationLimit = ANNOTATION_LIMITS[form.type];
  const sourceType = useMemo(() => detectSourceType(form.url, mode), [form.url, mode]);
  const domain = sourceDomain(form.url);
  const needsSource = mode !== 'text';
  const titleLimit = sourceType === 'social' ? 25000 : 180;

  useEffect(() => {
    let active = true;
    async function findDuplicates() {
      if (!needsSource || !isValidUrl(form.url) || !selectedCommunity?.id) { setDuplicateClips([]); return; }
      const { data } = await supabase
        .from('clips')
        .select('id, slug, title')
        .eq('source_url', form.url.trim())
        .eq('community_id', selectedCommunity.id)
        .limit(3);
      if (active) setDuplicateClips(data || []);
    }
    findDuplicates();
    return () => { active = false; };
  }, [form.url, selectedCommunity?.id, needsSource]);

  function chooseMode(nextMode) {
    setMode(nextMode);
    if (nextMode === 'text') update('url', '');
    setStatus('');
  }

  async function publish(event) {
    event.preventDefault();
    const title = form.title.trim();
    const commentary = form.commentary.trim();
    const url = form.url.trim();
    const startSec = form.startSec === '' ? null : Number(form.startSec);
    const endSec = form.endSec === '' ? null : Number(form.endSec);

    if (!title) { setStatus('Add a title first.'); return; }
    if (needsSource && !commentary) { setStatus('Add your point of view first.'); return; }
    if (!needsSource && !form.quote.trim()) { setStatus('Write the post content first.'); return; }
    if (needsSource && commentary.length > annotationLimit) { setStatus(`This ${form.type.toLowerCase()} annotation is limited to ${annotationLimit} characters.`); return; }
    if (needsSource && !url) { setStatus(mode === 'moment' ? 'Add the video or podcast URL for this moment.' : 'Add the source URL, or switch to Text.'); return; }
    if (url && !isValidUrl(url)) { setStatus('Use a complete source URL, including https://.'); return; }
    if (sourceType === 'social' && url && !isXPostUrl(url)) { setStatus('Share an X post link, like https://x.com/user/status/123.'); return; }
    if (mode === 'moment' && sourceType !== 'youtube') { setStatus('Moment posts currently need a YouTube source so the selected times can be played back.'); return; }
    if (mode === 'moment' && (!Number.isFinite(startSec) || !Number.isFinite(endSec) || startSec < 0 || endSec <= startSec)) { setStatus('Add a valid start and end time for the moment.'); return; }
    if (!user) { setStatus('Sign in to publish. Your draft is ready when you are.'); return; }

    setPublishing(true);
    setStatus('');
    try {
      const clip = await createAnnotatedPost(supabase, {
        community_id: selectedCommunity?.id || null,
        source_url: url || null,
        source_type: sourceType,
        source_domain: url ? domain : null,
        title,
        source_title: needsSource ? title : null,
        annotation_type: form.type,
        article_text: form.quote.trim() || null,
        start_sec: mode === 'moment' ? startSec : null,
        end_sec: mode === 'moment' ? endSec : null,
        slug: generateSlug(title),
        annotation: needsSource ? commentary : title,
      });
      navigate(postHref({ ...clip, community_slug: selectedCommunity?.slug }));
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
        <p className="eyebrow">CREATE A POST</p>
        <h1>Start a conversation.</h1>
        <p>Post like a community, but keep the source, exact moment, and your point of view attached.</p>
      </div>

      <form onSubmit={publish} className="create-layout">
        <div className="create-form">
          <div className="create-mode-tabs" role="tablist" aria-label="Post type">
            {POST_MODES.map((postMode) => (
              <button key={postMode.value} type="button" role="tab" aria-selected={mode === postMode.value} onClick={() => chooseMode(postMode.value)} className={`create-mode-tab ${mode === postMode.value ? 'create-mode-tab-active' : ''}`}>
                <span>{postMode.label}</span><small>{postMode.helper}</small>
              </button>
            ))}
          </div>

          <label className="form-label">Community <span className="text-text-muted font-normal">(optional)</span>
            <select className="input" value={form.community} onChange={(event) => update('community', event.target.value)} disabled={!communitiesReady}>
              <option value="">{communitiesReady ? 'No community' : 'Loading communities…'}</option>
              {communities.map((community) => <option key={community.slug} value={community.slug}>c/{community.name}</option>)}
            </select>
            {communityLoadError && <span className="field-hint">Communities could not be loaded, but you can still post without one.</span>}
          </label>

          {!needsSource ? null : (
            <fieldset>
              <legend className="form-label">What kind of note is this?</legend>
              <div className="type-picker">
                {ANNOTATION_TYPES.map((type) => <button key={type} type="button" onClick={() => update('type', type)} className={form.type === type ? 'type-option type-option-active' : 'type-option'}>{type}</button>)}
              </div>
            </fieldset>
          )}

          {needsSource && <label className="form-label">Source URL
            <input className="input" value={form.url} onChange={(event) => update('url', event.target.value)} placeholder="https://..." inputMode="url" required />
            {form.url && <span className="field-hint">Detected as {sourceType} · {domain}</span>}
            {duplicateClips.length > 0 && <span className="duplicate-note">This source already has {duplicateClips.length} discussion{duplicateClips.length === 1 ? '' : 's'} in this community. You can still add a distinct annotation.</span>}
          </label>}

          {mode === 'moment' && <div className="moment-fields">
            <label className="form-label">Start time<input className="input" type="number" min="0" step="1" value={form.startSec} onChange={(event) => update('startSec', event.target.value)} placeholder="42" /></label>
            <label className="form-label">End time<input className="input" type="number" min="1" step="1" value={form.endSec} onChange={(event) => update('endSec', event.target.value)} placeholder="132" /></label>
          </div>}

          <label className="form-label">{needsSource ? 'Source title' : 'Post title'}
            <input className="input" value={form.title} onChange={(event) => update('title', event.target.value)} placeholder={needsSource ? 'The original source title' : 'What is the conversation about?'} maxLength={titleLimit} />
            <span className="field-counter">{form.title.length}/{titleLimit}</span>
          </label>
          <label className="form-label">{needsSource ? <>The context <span className="text-text-muted font-normal">(quote, timestamp, or excerpt)</span></> : 'The content'}
            <textarea className="input resize-none" rows={5} value={form.quote} onChange={(event) => update('quote', event.target.value)} placeholder={needsSource ? 'Point to the exact part people should look at...' : 'Write the post people will respond to...'} maxLength={2000} />
            <span className="field-counter">{form.quote.length}/2000</span>
          </label>
          {needsSource && <label className="form-label">Your annotation
            <textarea className="input resize-none annotation-editor" rows={7} value={form.commentary} onChange={(event) => update('commentary', event.target.value)} placeholder="What do you want people to understand, question, or add?" maxLength={annotationLimit} />
            <span className={`field-counter ${form.commentary.length > annotationLimit * 0.9 ? 'field-counter-warning' : ''}`}>{form.commentary.length}/{annotationLimit}</span>
          </label>}
          {status && <p className="form-status" role="alert">{status}</p>}
          <button type="submit" className="btn-primary w-full" disabled={publishing || !communitiesReady}>{publishing ? 'Publishing…' : user ? selectedCommunity ? `Post to c/${selectedCommunity.name}` : 'Post' : 'Sign in to post ↗'}</button>
        </div>

        <div className="create-preview-wrap">
          <p className="eyebrow">LIVE PREVIEW</p>
          <div className="create-preview">
            <p className="post-meta">{selectedCommunity ? <span className="community-pill"><CommunityAvatar slug={selectedCommunity.slug} name={selectedCommunity.name} /> c/{selectedCommunity.name}</span> : <span>Post</span>}<span>• just now</span></p>
            <h2 className="post-annotation-preview">{needsSource ? (form.commentary || 'Your point of view will be the center of the post.') : (form.title || 'Your title will be the headline of the post.')}</h2>
            {!needsSource && form.quote && <p className="post-text-body">{form.quote}</p>}
            {mode !== 'text' && <div className="source-preview source-preview-preview"><div className="source-preview-copy"><div className="source-label">↗ {form.url ? domain : 'your source'}</div><p className="source-title">{form.title || 'Your source title will appear here'}</p><p className="source-quote">{form.quote ? `“${form.quote}”` : 'Add a quote or source context so people know what you are discussing.'}</p></div></div>}
            {mode === 'moment' && hasMoment(form.startSec, form.endSec) && <div className="post-timestamp-row"><span className="timestamp">{formatTime(form.startSec)}</span><span className="text-text-muted text-xs">→</span><span className="timestamp">{formatTime(form.endSec)}</span></div>}
            <div className="post-actions"><span className="post-action">▲ 0</span><span className="post-action">▱ 0 comments</span><span className="post-action">↗ Share</span></div>
          </div>
        </div>
      </form>
    </div>
  );
}

function detectSourceType(value, mode) {
  if (mode === 'text') return 'text';
  try {
    const host = new URL(value).hostname.replace(/^www\./, '').toLowerCase();
    if (host === 'youtube.com' || host === 'youtu.be') return 'youtube';
    if (['spotify.com', 'open.spotify.com', 'podcasts.apple.com', 'anchor.fm', 'overcast.fm'].some((domain) => host === domain || host.endsWith(`.${domain}`))) return 'podcast';
    if (['x.com', 'twitter.com'].some((domain) => host === domain || host.endsWith(`.${domain}`))) return 'social';
  } catch {}
  return 'article';
}

function isValidUrl(value) {
  try { return ['http:', 'https:'].includes(new URL(value).protocol); } catch { return false; }
}

function sourceDomain(value) {
  try { return new URL(value).hostname.replace(/^www\./, ''); } catch { return 'source'; }
}

function formatTime(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds)) return '0:00';
  return `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
}
