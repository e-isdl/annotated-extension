import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import Avatar from './Avatar';
import VoteButtons from './VoteButtons';

export default function ClipCard({ clip }) {
  const annotation = clip.annotations?.[0];
  const commentary = clip.annotation || annotation?.text_content;
  const commentaryPreview = annotationPreview(commentary);
  const [score, setScore] = useState(clip.score ?? 0);
  const [saved, setSaved] = useState(false);
  const [shared, setShared] = useState(false);
  const href = `/clip/${clip.slug || clip.id}`;
  const sourceImage = clip.source_image_url || clip.thumbnail || (clip.youtube_id ? `https://img.youtube.com/vi/${clip.youtube_id}/hqdefault.jpg` : null);

  useEffect(() => {
    if (String(clip.id).startsWith('demo-')) return;
    let active = true;
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data } = await supabase
        .from('post_saves')
        .select('clip_id')
        .eq('clip_id', clip.id)
        .eq('user_id', user.id)
        .maybeSingle();
      if (active && data) setSaved(true);
    });
    return () => { active = false; };
  }, [clip.id]);

  const handleShare = async (event) => {
    event.preventDefault();
    event.stopPropagation();
    try { await navigator.clipboard.writeText(`${window.location.origin}${href}`); } catch {}
    setShared(true);
    window.setTimeout(() => setShared(false), 1600);
  };

  const handleSave = async (event) => {
    event.preventDefault();
    event.stopPropagation();
    const next = !saved;
    setSaved(next);
    if (String(clip.id).startsWith('demo-')) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const result = next
      ? await supabase.from('post_saves').insert({ clip_id: clip.id, user_id: user.id })
      : await supabase.from('post_saves').delete().eq('clip_id', clip.id).eq('user_id', user.id);
    if (result.error && result.error.code !== '42P01') setSaved(!next);
  };

  return (
    <article className="post-card">
      <div className="post-meta">
        <Link to={`/c/${clip.community_slug || 'annotated'}`} className="community-pill no-underline">
          <span className="community-dot">{(clip.community_name || 'A')[0]}</span>
          <span>c/{clip.community_name || 'Annotated'}</span>
        </Link>
        <span className="post-meta-separator">•</span>
        <Link to={clip.profiles?.handle ? `/u/${clip.profiles.handle}` : '#'} className="post-author no-underline">
          @{clip.profiles?.handle || 'anonymous'}
        </Link>
        <span className="post-meta-separator">•</span>
        <span>{timeAgo(clip.created_at)}</span>
        <span className={`badge badge-${clip.source_type}`}>{clip.annotation_type || clip.source_type}</span>
      </div>

      <Link to={href} className="block no-underline group">
        <h2 className="post-title">{clip.title}</h2>
        {commentary && <p className="post-commentary">{commentaryPreview.text}{commentaryPreview.truncated && <span className="post-commentary-more">…</span>}</p>}

        <div className="source-preview">
          <div className="source-preview-copy">
            <div className="source-label"><span className="source-icon">↗</span> {clip.source_domain || sourceDomain(clip.source_url)}</div>
            {clip.source_preview_text ? (
              <p className="source-quote">{clip.source_preview_text}</p>
            ) : clip.article_text || clip.transcript ? (
              <p className="source-quote">“{clip.article_text || clip.transcript}”</p>
            ) : (
              <p className="source-quote source-quote-muted">Open the source and see what the conversation is about.</p>
            )}
            <p className="source-title">{clip.source_title || clip.title}</p>
            {clip.start_sec !== undefined && clip.end_sec !== undefined && (
              <div className="flex items-center gap-1.5 mt-2">
                <span className="timestamp">{formatTime(clip.start_sec)}</span>
                <span className="text-text-muted text-xs">→</span>
                <span className="timestamp">{formatTime(clip.end_sec)}</span>
              </div>
            )}
          </div>
          {sourceImage && <img src={sourceImage} alt="" className="source-preview-image" loading="lazy" />}
        </div>
      </Link>

      <div className="post-actions">
        <VoteButtons clipId={clip.id} score={score} setScore={setScore} />
        <Link to={`${href}#comments`} className="post-action no-underline">
          <span>▱</span> {clip.comments_count ?? 0} comments
        </Link>
        <button type="button" onClick={handleShare} className="post-action">
          <span>↗</span> {shared ? 'Copied' : 'Share'}
        </button>
        <button type="button" onClick={handleSave} className={`post-action post-action-last ${saved ? 'post-action-saved' : ''}`}>
          <span>{saved ? '★' : '☆'}</span> {saved ? 'Saved' : 'Save'}
        </button>
      </div>
    </article>
  );
}

function sourceDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return 'source'; }
}

function timeAgo(dateStr) {
  const diff = Math.max(0, Date.now() - new Date(dateStr).getTime());
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${Math.max(1, mins)}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

function formatTime(s) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

function annotationPreview(value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return { text: '', truncated: false };
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [];
  if (sentences.length > 2) {
    return { text: sentences.slice(0, 2).join('').trim(), truncated: true };
  }
  if (text.length > 220) {
    const cut = text.slice(0, 220).replace(/\s+\S*$/, '').trim();
    return { text: cut, truncated: true };
  }
  return { text, truncated: false };
}
