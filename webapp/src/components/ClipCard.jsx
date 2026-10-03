import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { getCurrentUser } from '../lib/authUser';
import VoteButtons from './VoteButtons';
import AudioPlayer from './AudioPlayer';
import SourceIcon from './SourceIcon';
import { useToast } from './ToastProvider';
import CommunityAvatar from './CommunityAvatar';
import Avatar from './Avatar';
import { postHref } from '../lib/links';
import { hasMoment } from '../lib/moment';
import { isXPostUrl, matchStatusUrl } from '../lib/social';

export default function ClipCard({ clip }) {
  const navigate = useNavigate();
  const { push } = useToast();
  const annotation = clip.annotations?.[0];
  const commentary = clip.annotation || annotation?.text_content;
  const [commentaryExpanded, setCommentaryExpanded] = useState(false);
  const [quoteExpanded, setQuoteExpanded] = useState(false);
  const [commentaryRef, commentaryOverflowing] = useOverflow(!commentaryExpanded);
  const [quoteRef, quoteOverflowing] = useOverflow(!quoteExpanded);
  const quoteClassName = `source-quote ${quoteExpanded ? 'source-quote-expanded' : 'source-quote-clampable'}`;
  const expandCommentary = (event) => { event.preventDefault(); event.stopPropagation(); setCommentaryExpanded(true); };
  const expandQuote = (event) => { event.preventDefault(); event.stopPropagation(); setQuoteExpanded(true); };
  const audioUrl = annotation?.audio_url;
  const isYouTube = clip.source_type === 'youtube';
  const youtubeTitle = clip.source_title || clip.title;
  const sourceTitle = isYouTube || isXPostUrl(clip.source_url) ? null : clip.source_title || clip.title;
  const sourceLabel = clip.source_type === 'social' ? 'x' : clip.source_type;
  const [score, setScore] = useState(clip.score ?? 0);
  const [saved, setSaved] = useState(false);
  const [shared, setShared] = useState(false);
  const isXPost = isXPostUrl(clip.source_url);
  const posterHandle = isXPost ? (matchStatusUrl(clip.source_url)?.handle || String(clip.author || '').replace(/^@/, '')) : '';
  const href = postHref(clip);
  const sourceImage = clip.source_image_url || clip.thumbnail || (clip.youtube_id ? `https://img.youtube.com/vi/${clip.youtube_id}/hqdefault.jpg` : null);

  useEffect(() => {
    if (String(clip.id).startsWith('demo-')) return;
    let active = true;
    getCurrentUser().then(async (user) => {
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
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${href}`);
      push('Post link copied.', 'info');
    } catch { push('Could not copy the post link.', 'error'); }
    setShared(true);
    window.setTimeout(() => setShared(false), 1600);
  };

  const handleSave = async (event) => {
    event.preventDefault();
    event.stopPropagation();
    const next = !saved;
    const user = await getCurrentUser();
    if (!user) { push('Sign in to save posts.', 'info'); return; }
    setSaved(next);
    if (String(clip.id).startsWith('demo-')) return;
    const result = next
      ? await supabase.from('post_saves').insert({ clip_id: clip.id, user_id: user.id })
      : await supabase.from('post_saves').delete().eq('clip_id', clip.id).eq('user_id', user.id);
    if (result.error && result.error.code !== '42P01') setSaved(!next);
  };

  return (
    <article className="post-card">
      <div className="post-meta">
        {clip.community_slug && clip.community_name ? (
          <>
            <Link to={`/c/${clip.community_slug}`} className="community-pill no-underline">
              <CommunityAvatar slug={clip.community_slug} name={clip.community_name} />
              <span>c/{clip.community_name}</span>
            </Link>
            <span className="post-meta-separator">•</span>
            <Link to={clip.profiles?.handle ? `/u/${clip.profiles.handle}` : '#'} className="post-author no-underline">
              {clip.profiles?.handle || 'anonymous'}
            </Link>
            <span className="post-meta-separator">•</span>
          </>
        ) : (
          <>
            <Link to={clip.profiles?.handle ? `/u/${clip.profiles.handle}` : '#'} className="community-pill no-underline">
              <Avatar profile={clip.profiles} size="dot" />
              <span>{clip.profiles?.handle || 'anonymous'}</span>
            </Link>
            <span className="post-meta-separator">•</span>
          </>
        )}
        <span>{timeAgo(clip.created_at)}</span>
        <span className={`badge badge-${clip.source_type}`}><SourceIcon type={clip.source_type} />{sourceLabel}</span>
      </div>

      <Link to={href} className="block no-underline group">
        {commentary && (
          <>
            <h2 ref={commentaryRef} className={`post-annotation-preview${commentaryExpanded ? '' : ' post-annotation-preview-clamped'}`}>{commentary}</h2>
            {!commentaryExpanded && commentaryOverflowing && (
              <div className="read-more-wrap">
                <button type="button" className="read-more-toggle" aria-expanded="false" onClick={expandCommentary}>Show more</button>
              </div>
            )}
            <span className="annotation-rule" aria-hidden="true" />
          </>
        )}

        {audioUrl && (
          <div className="post-audio" onClick={(event) => { event.preventDefault(); event.stopPropagation(); }}>
            <AudioPlayer src={audioUrl} compact />
          </div>
        )}
        {isYouTube && youtubeTitle && youtubeTitle !== commentary && <p className="post-source-title">{youtubeTitle}</p>}

        {clip.source_type === 'text' ? (
          clip.article_text && <p className="post-text-body">{clip.article_text}</p>
        ) : (
        <div className="source-preview">
          <div className="source-preview-copy">
            {clip.source_type !== 'youtube' && <div className="source-label"><span className="source-icon">↗</span> <button type="button" onClick={(event) => { event.preventDefault(); event.stopPropagation(); navigate(`/source/${encodeURIComponent(clip.source_domain || sourceDomain(clip.source_url))}`); }} className="source-domain-link">{clip.source_domain || sourceDomain(clip.source_url)}</button></div>}
            {posterHandle && <p className="source-quote-poster">@{posterHandle}</p>}
            {clip.source_preview_text ? (
              <p ref={quoteRef} className={quoteClassName}>{clip.source_preview_text}</p>
            ) : clip.article_text || clip.source_excerpt || clip.transcript ? (
              <p ref={quoteRef} className={quoteClassName}>“{clip.article_text || clip.source_excerpt || clip.transcript}”</p>
            ) : (
              <p className="source-quote source-quote-muted">Open the source and see what the conversation is about.</p>
            )}
            {!quoteExpanded && quoteOverflowing && (
              <div className="read-more-wrap">
                <button type="button" className="read-more-toggle" aria-expanded="false" onClick={expandQuote}>Show more</button>
              </div>
            )}
            {sourceTitle && sourceTitle !== commentary && <p className="source-title">{sourceTitle}</p>}
          </div>
          {sourceImage && <img src={sourceImage} alt="" className={`source-preview-image${clip.source_type === 'youtube' ? ' source-preview-image-youtube' : ''}`} loading="lazy" />}
        </div>
        )}
        {hasMoment(clip.start_sec, clip.end_sec) && (
          <div className="post-timestamp-row" aria-label={`Source moment from ${formatTime(clip.start_sec)} to ${formatTime(clip.end_sec)}`}>
            <span className="timestamp">{formatTime(clip.start_sec)}</span>
            <span className="text-text-muted text-xs">→</span>
            <span className="timestamp">{formatTime(clip.end_sec)}</span>
          </div>
        )}
      </Link>

      <div className="post-actions">
        <VoteButtons clipId={clip.id} score={score} setScore={setScore} />
        <Link to={`${href}#comments`} className="post-action no-underline">
          <span>▱</span> {clip.comments_count ?? 0} comments
        </Link>
        <button type="button" onClick={handleShare} className="post-action">
          <span>↗</span> <span aria-live="polite">{shared ? 'Copied' : 'Share'}</span>
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

// True when the element's content is taller than its visible box, i.e. a
// line clamp is hiding text. Measured after layout, on resize, and once web
// fonts finish loading so a late font swap cannot leave a stale result.
function useOverflow(measure) {
  const ref = useRef(null);
  const [overflowing, setOverflowing] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !measure) { setOverflowing(false); return undefined; }
    const check = () => setOverflowing(el.scrollHeight > el.clientHeight + 1);
    check();
    const frame = requestAnimationFrame(check);
    window.addEventListener('resize', check);
    if (document.fonts) document.fonts.ready.then(check).catch(() => {});
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', check);
    };
  }, [measure]);
  return [ref, overflowing];
}
