import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { getCurrentUser } from '../lib/authUser';
import VoteButtons from './VoteButtons';
import AudioPlayer from './AudioPlayer';
import ClipPlayer from './ClipPlayer';
import YouTubeClipPlayer, { isCardNavSuppressed } from './YouTubeClipPlayer';
import SourceIcon from './SourceIcon';
import { useToast } from './ToastProvider';
import CommunityAvatar from './CommunityAvatar';
import Avatar from './Avatar';
import { postHref } from '../lib/links';
import { hasMoment } from '../lib/moment';
import { isXPostUrl, matchStatusUrl } from '../lib/social';
import { cleanTranscript, stripWrappingQuotes } from '../lib/text';

const SOURCE_LABELS = { youtube: 'YouTube', social: 'X post', article: 'Article', text: 'Text', podcast: 'Podcast' };

export default function ClipCard({ clip, hideTranscript = false, autoPlayVideo = false }) {
  const navigate = useNavigate();
  const { push } = useToast();
  const annotation = clip.annotations?.[0];
  const commentary = clip.annotation || annotation?.text_content;
  const [commentaryExpanded, setCommentaryExpanded] = useState(false);
  const [quoteExpanded, setQuoteExpanded] = useState(false);
  const [mediaExpanded, setMediaExpanded] = useState(false);
  const [commentaryRef, commentaryOverflowing] = useOverflow(!commentaryExpanded);
  const [quoteRef, quoteOverflowing] = useOverflow(!quoteExpanded && !mediaExpanded);
  const quoteClassName = `source-quote ${quoteExpanded ? 'source-quote-expanded' : 'source-quote-clampable'}`;
  const expandCommentary = (event) => { event.preventDefault(); event.stopPropagation(); setCommentaryExpanded(true); };
  const expandQuote = (event) => { event.preventDefault(); event.stopPropagation(); setQuoteExpanded(true); };
  const audioUrl = annotation?.audio_url;
  const isYouTube = clip.source_type === 'youtube';
  const youtubeTitle = clip.source_title || clip.title;
  const sourceTitle = isYouTube || isXPostUrl(clip.source_url) ? null : clip.source_title || clip.title;
  const sourceLabel = SOURCE_LABELS[clip.source_type] || clip.source_type;
  const [score, setScore] = useState(clip.score ?? 0);
  const [saved, setSaved] = useState(false);
  const [shared, setShared] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const cardRef = useRef(null);
  const [cardVisible, setCardVisible] = useState(false);
  const uploadStale = clip.video_status === 'uploading' && clip.created_at && (Date.now() - new Date(clip.created_at).getTime() > 20 * 60 * 1000);
  const isUploadingVideo = clip.video_status === 'uploading' && !uploadStale;
  const playableRecording = Boolean(clip.video_url) && !isUploadingVideo && !videoFailed;
  const playableEmbed = isYouTube && Boolean(clip.youtube_id) && !playableRecording && !isUploadingVideo;
  const isVideoPost = playableRecording || playableEmbed;
  const playInline = (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!isVideoPost) return;
    setPlaying(true);
  };
  const hideQuote = hideTranscript && (clip.source_type === 'youtube' || clip.source_type === 'social');

  useEffect(() => {
    if (autoPlayVideo && isVideoPost && cardVisible) setPlaying(true);
    else if (!autoPlayVideo) setPlaying(false);
  }, [autoPlayVideo, cardVisible]);

  useEffect(() => {
    const el = cardRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setCardVisible(true);
      return undefined;
    }
    const observer = new IntersectionObserver(
      ([entry]) => setCardVisible(entry.isIntersecting),
      { threshold: 0.15 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const cardAriaLabel = `Open post: ${String(commentary || clip.title || 'post').slice(0, 140)}`;
  const onCardLinkClick = (event) => {
    const target = event.target;
    if (target && target.closest && target.closest('[data-no-nav]')) {
      event.preventDefault();
      return;
    }
    if (isCardNavSuppressed()) {
      event.preventDefault();
    }
  };
  const isXPost = isXPostUrl(clip.source_url);
  const posterHandle = isXPost ? (matchStatusUrl(clip.source_url)?.handle || String(clip.author || '').replace(/^@/, '')) : '';
  const href = postHref(clip);
  const sourceImage = clip.source_image_url || clip.thumbnail || (clip.youtube_id ? `https://img.youtube.com/vi/${clip.youtube_id}/hqdefault.jpg` : null);
  const canExpand = Boolean(sourceImage) && !imageFailed;
  const toggleMedia = (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (canExpand) setMediaExpanded((open) => !open);
  };

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

  useEffect(() => {
    if (!mediaExpanded && !playing) return undefined;
    const onKey = (event) => { if (event.key === 'Escape') { setMediaExpanded(false); setPlaying(false); } };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [mediaExpanded, playing]);

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
    <article ref={cardRef} className="post-card post-card-linked">
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

      <div className="post-card-main">
        {commentary && (
          <>
            <h2 ref={commentaryRef} className={`post-annotation-preview${commentaryExpanded ? '' : ' post-annotation-preview-clamped'}`}>{commentary}</h2>
            {!commentaryExpanded && commentaryOverflowing && (
              <div className="read-more-wrap">
                <button type="button" className="read-more-toggle" aria-expanded="false" onClick={expandCommentary}>Show more</button>
              </div>
            )}
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
        ) : playing && isVideoPost ? (
        <div className="source-preview source-preview-playing">
          <div className="source-preview-player" onClick={(event) => { event.preventDefault(); event.stopPropagation(); }}>
            {playableRecording ? (
              <ClipPlayer src={clip.video_url} onError={() => setVideoFailed(true)} fallbackDuration={clip.end_sec - clip.start_sec} mutedAutoplay={autoPlayVideo} />
            ) : (
              <YouTubeClipPlayer videoId={clip.youtube_id} startSec={clip.start_sec} endSec={clip.end_sec} autoplay onClose={() => setPlaying(false)} posterSrc={sourceImage} startMuted={autoPlayVideo} />
            )}
          </div>
        </div>
        ) : mediaExpanded && canExpand && !isVideoPost ? (
        <div className="source-preview source-preview-expanded">
          <div className="source-preview-media" role="button" tabIndex={0} aria-label="Collapse preview" onClick={toggleMedia} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') toggleMedia(event); }}>
            <img src={sourceImage} alt={clip.title || 'Source preview'} className={`source-preview-image-expanded${clip.source_type === 'youtube' ? ' source-preview-image-youtube' : ''}`} loading="lazy" />
          </div>
        </div>
        ) : (
        <div className="source-preview">
          <div className="source-preview-copy">
            {clip.source_type !== 'youtube' && <div className="source-label"><span className="source-icon">↗</span> <button type="button" onClick={(event) => { event.preventDefault(); event.stopPropagation(); navigate(`/source/${encodeURIComponent(clip.source_domain || sourceDomain(clip.source_url))}`); }} className="source-domain-link">{clip.source_domain || sourceDomain(clip.source_url)}</button></div>}
            {posterHandle && <p className="source-quote-poster">@{posterHandle}</p>}
            {!hideQuote && clip.source_preview_text ? (
              <p ref={quoteRef} className={quoteClassName}>{clip.source_preview_text}</p>
            ) : !hideQuote && (clip.article_text || clip.source_excerpt || clip.transcript) ? (
              <p ref={quoteRef} className={quoteClassName}>“{stripWrappingQuotes(clip.source_type === 'youtube' ? cleanTranscript(clip.article_text || clip.source_excerpt || clip.transcript) : (clip.article_text || clip.source_excerpt || clip.transcript))}”</p>
            ) : !hideQuote && (
              <p className="source-quote source-quote-muted">Open the source and see what the conversation is about.</p>
            )}
            {!hideQuote && !quoteExpanded && quoteOverflowing && (
              <div className="read-more-wrap">
                <button type="button" className="read-more-toggle" aria-expanded="false" onClick={expandQuote}>Show more</button>
              </div>
            )}
            {sourceTitle && sourceTitle !== commentary && <p className="source-title">{sourceTitle}</p>}
          </div>
          {sourceImage && !imageFailed && (
            isUploadingVideo ? (
              <span className="source-preview-thumbwrap">
                <img src={sourceImage} alt="" className="source-preview-thumbimg source-preview-image-youtube" loading="lazy" onError={() => setImageFailed(true)} />
                <span className="source-preview-uploading">Uploading…</span>
              </span>
            ) : isVideoPost ? (
              <button type="button" className="source-preview-thumbbtn" onClick={playInline} aria-label={`Play clip from ${formatTime(clip.start_sec)}`}>
                <img src={sourceImage} alt="" className="source-preview-thumbimg source-preview-image-youtube" loading="lazy" onError={() => setImageFailed(true)} />
                <span className="source-preview-play" aria-hidden="true">
                  <svg width="22" height="22" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="currentColor" /></svg>
                </span>
              </button>
            ) : (
              <img
                src={sourceImage}
                alt=""
                className={`source-preview-image${clip.source_type === 'youtube' ? ' source-preview-image-youtube' : ''}`}
                loading="lazy"
                role="button"
                tabIndex={0}
                aria-label="Expand preview"
                aria-expanded={mediaExpanded}
                onClick={toggleMedia}
                onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') toggleMedia(event); }}
                onError={() => setImageFailed(true)}
              />
            )
          )}
          {sourceImage && imageFailed && (
            <div className="source-preview-image source-thumb-fallback">
              <SourceIcon type={clip.source_type} />
              <span>{clip.source_domain || sourceDomain(clip.source_url)}</span>
            </div>
          )}
        </div>
        )}
        {hasMoment(clip.start_sec, clip.end_sec) && (
          <div className="post-timestamp-row" aria-label={`Source moment from ${formatTime(clip.start_sec)} to ${formatTime(clip.end_sec)}`}>
            <span className="timestamp">{formatTime(clip.start_sec)}</span>
            <span className="text-text-muted text-xs">→</span>
            <span className="timestamp">{formatTime(clip.end_sec)}</span>
          </div>
        )}
      </div>

      <div className="post-actions">
        <VoteButtons clipId={clip.id} score={score} setScore={setScore} />
        <Link to={`${href}#comments`} className="post-action no-underline">
          <span>▱</span> {clip.comments_count ?? 0} comments
        </Link>
        <button type="button" onClick={handleShare} className="post-action">
          <span>↗</span> <span aria-live="polite">{shared ? 'Copied' : 'Share'}</span>
        </button>
        <button type="button" onClick={handleSave} className={`post-action ${isXPost && canExpand ? '' : 'post-action-last '}${saved ? 'post-action-saved' : ''}`}>
          <span>{saved ? '★' : '☆'}</span> {saved ? 'Saved' : 'Save'}
        </button>
        {isXPost && canExpand && (
          <button type="button" onClick={toggleMedia} className="post-action post-action-last" aria-expanded={mediaExpanded}>
            <SourceIcon type="social" /> {mediaExpanded ? 'Hide tweet' : 'See tweet'}
          </button>
        )}
      </div>
      <Link to={href} className="post-card-link" aria-label={cardAriaLabel} draggable={false} onClick={onCardLinkClick} />
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
