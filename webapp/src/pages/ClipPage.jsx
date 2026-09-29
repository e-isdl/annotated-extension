import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { deleteClip } from '../lib/api';
import YouTubeEmbed from '../components/YouTubeEmbed';
import XEmbed from '../components/XEmbed';
import AudioPlayer from '../components/AudioPlayer';
import FileClaimButton from '../components/FileClaimButton';
import ReportButton from '../components/ReportButton';
import CommentSection from '../components/CommentSection';
import VoteButtons from '../components/VoteButtons';
import AnnotationLead from '../components/AnnotationLead';
import { getDemoClip } from '../lib/demoData';
import DemoClipPage from './DemoClipPage';
import { useToast } from '../components/ToastProvider';
import { postHref } from '../lib/links';
import { hasMoment } from '../lib/moment';
import { isXPostUrl } from '../lib/social';

const MEDIA_FRAME = /youtube\.com\/embed|youtube-nocookie\.com\/embed|platform\.twitter\.com|twimg\.com/;

export default function ClipPage() {
  const routeParams = useParams();
  const id = routeParams.id || routeParams.post;
  const commentId = routeParams.commentId;
  const navigate = useNavigate();
  const [clip, setClip] = useState(null);
  const [annotation, setAnnotation] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [thread, setThread] = useState([]);
  const [transcript, setTranscript] = useState(null);
  const [score, setScore] = useState(0);
  const [currentUser, setCurrentUser] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [claims, setClaims] = useState([]);
  const [saved, setSaved] = useState(false);
  const [shared, setShared] = useState(false);
  const [postMenuOpen, setPostMenuOpen] = useState(false);
  const { push } = useToast();

  const demoClip = getDemoClip(id);

  useEffect(() => {
    if (demoClip) return;
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      setCurrentUser(session?.user || null);

      let clipData = null;

      const bySlug = await loadClip('slug', id);
      if (bySlug) {
        clipData = bySlug;
      } else {
        clipData = await loadClip('id', id);
      }

      if (clipData) {
        clipData = {
          ...clipData,
          community_name: clipData.community_name || clipData.communities?.name,
          community_slug: clipData.community_slug || clipData.communities?.slug,
        };
        setClip(clipData);
        setProfile(clipData.profiles);

        setScore(clipData.score || 0);

        const { data: ann } = await supabase
          .from('annotations')
          .select('*')
          .eq('clip_id', clipData.id)
          .single();
        if (ann) setAnnotation(ann);

        const { data: claimsData } = await supabase
          .from('claims')
          .select('*')
          .eq('clip_id', clipData.id)
          .order('created_at', { ascending: false });
        if (claimsData) setClaims(claimsData);

        const { data: threadClips } = await supabase
          .from('clips')
          .select('*, profiles(*), annotations(id, text_content, audio_url), communities(slug)')
          .eq('parent_clip_id', clipData.id)
          .order('thread_position', { ascending: true });
        if (threadClips?.length) setThread(threadClips);

        if (clipData.source_type === 'youtube' && clipData.youtube_id) {
          setTranscript(clipData.transcript || null);
        }
      }
      setLoading(false);
    }
    load();
  }, [id, demoClip]);

  useEffect(() => {
    if (!clip || clip.source_type !== 'social' || !isXPostUrl(clip.source_url)) return undefined;
    if (clip.source_excerpt) return undefined;
    let cancelled = false;
    let attempt = 0;
    let timer = null;
    const refresh = async () => {
      try {
        const { data, error } = await supabase.rpc('refresh_x_metadata', { p_clip_id: clip.id });
        if (cancelled) return;
        if (!error && data && data.text) {
          setClip((previous) => (previous ? {
            ...previous,
            author: data.author ?? previous.author,
            author_url: data.author_url ?? previous.author_url,
            source_excerpt: data.text ?? previous.source_excerpt,
          } : previous));
          return;
        }
      } catch {}
      if (cancelled) return;
      attempt += 1;
      if (attempt < 6) timer = setTimeout(refresh, 600 + attempt * 400);
    };
    refresh();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [clip?.id, clip?.source_type, clip?.source_url, clip?.source_excerpt]);

  useEffect(() => {
    if (!annotation?.audio_url) return undefined;
    let activeFrame = null;
    const check = () => {
      const active = document.activeElement;
      if (!active || active.tagName !== 'IFRAME') {
        activeFrame = null;
        return;
      }
      if (active === activeFrame) return;
      const frameSrc = active.getAttribute('src') || active.src || '';
      if (!MEDIA_FRAME.test(frameSrc)) return;
      activeFrame = active;
      window.dispatchEvent(new CustomEvent('annotated:play', { detail: null }));
    };
    const timer = window.setInterval(check, 250);
    return () => window.clearInterval(timer);
  }, [annotation?.audio_url]);

  if (demoClip) return <DemoClipPage clip={demoClip} />;

  const handleDeleteClip = async () => {
    setDeleting(true);
    try {
      await deleteClip(clip.id, currentUser.id);
      navigate('/');
    } catch (err) {
      console.error('Delete failed:', err);
      push('Failed to delete this post.', 'error');
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  const isOwner = currentUser && clip && currentUser.id === clip.user_id;

  async function handleShare() {
    try { await navigator.clipboard.writeText(window.location.href); } catch {}
    setShared(true);
    window.setTimeout(() => setShared(false), 1600);
  }

  async function handleSave() {
    const next = !saved;
    setSaved(next);
    if (!clip || !currentUser) return;
    const result = next
      ? await supabase.from('post_saves').insert({ clip_id: clip.id, user_id: currentUser.id })
      : await supabase.from('post_saves').delete().eq('clip_id', clip.id).eq('user_id', currentUser.id);
    if (result.error && result.error.code !== '42P01') setSaved(!next);
  }

  if (loading) return <LoadingState />;
  if (!clip) return <NotFound />;

  const isX = isXPostUrl(clip.source_url);

  const range = hasMoment(clip.start_sec, clip.end_sec) && clip.duration > clip.end_sec
    ? (() => {
        const left = (clip.start_sec / clip.duration) * 100;
        const right = (clip.end_sec / clip.duration) * 100;
        const center = (left + right) / 2;
        return { left, right, align: center < 34 ? 'left' : center > 66 ? 'right' : 'center' };
      })()
    : null;

  return (
    <article className="detail-page real-detail-page">
      <div className="detail-author-row">
        <div className="detail-post-context">
          <Link to="/" className="detail-back-button" aria-label="Back to home">←</Link>
          {clip.community_slug && clip.community_name && (
            <>
              <Link to={`/c/${clip.community_slug}`} className="community-pill no-underline"><span className="community-dot">{clip.community_name[0]}</span> c/{clip.community_name}</Link>
              <span>•</span>
            </>
          )}
          <span>{formatDate(clip.created_at)}</span>
          {!annotation?.text_content && <Link to={profile?.handle ? `/u/${profile.handle}` : '#'} className="post-author no-underline">by {profile?.handle || 'anonymous'}</Link>}
        </div>
        <div className="detail-header-actions">
          <span className="badge badge-article">{clip.annotation_type || 'Annotation'}</span>
          <div className="detail-overflow detail-overflow-end relative">
            <button
              type="button"
              className="post-action overflow-trigger"
              aria-label="Post options"
              aria-expanded={postMenuOpen}
              onClick={() => setPostMenuOpen((value) => !value)}
            >
              <PostActionIcon name="more" />
            </button>
            {postMenuOpen && (
              <div className="overflow-menu">
                <FileClaimButton clipId={clip.id} />
                {isOwner && (confirmDelete ? (
                  <div className="flex items-center gap-2 p-1.5">
                    <span className="text-[11px] text-red-400">Delete post?</span>
                    <button
                      type="button"
                      onClick={handleDeleteClip}
                      disabled={deleting}
                      className="text-[11px] px-2 py-1 rounded-md text-white bg-red-500 hover:bg-red-600 transition-colors disabled:opacity-40"
                    >
                      {deleting ? '...' : 'Yes'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(false)}
                      disabled={deleting}
                      className="text-[11px] px-2 py-1 rounded-md text-text-muted bg-bg-raised hover:bg-bg-surface transition-colors"
                    >
                      No
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    className="w-full text-left text-[11px] px-2 py-1.5 rounded-md text-red-400 hover:bg-red-400/10 transition-colors"
                  >
                    Delete
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <AnnotationLead text={annotation?.text_content} profile={profile} annotationType={clip.annotation_type || 'Annotation'} asHeading showType={false} />

      {annotation?.audio_url && <div className="post-audio"><AudioPlayer src={annotation.audio_url} /></div>}

      {clip.source_url && <section className="source-post" aria-label="Original source post">
        {clip.source_type === 'youtube' && (clip.source_title || clip.title) && (
          <p className="source-post-title">{clip.source_title || clip.title}</p>
        )}
        {!isX && clip.source_type !== 'youtube' && <div className="source-post-header">
          <div>
            <p className="source-post-domain">{clip.source_domain || sourceDomain(clip.source_url)}</p>
          {(clip.source_title || clip.title) && (clip.source_title || clip.title) !== (annotation?.text_content || clip.title) && <p className="source-post-caption">{clip.source_title || clip.title}</p>}
          </div>
          <span className={`badge badge-${clip.source_type}`}>{clip.source_type}</span>
        </div>}
        {isX && (clip.thumbnail ? (
          <div className="source-media source-media-x">
            <img src={clip.thumbnail} alt={clip.title || 'X post'} className="source-post-image source-post-image-x" loading="lazy" />
            <a href={clip.source_url} target="_blank" rel="noopener noreferrer" className="x-original-link">
              ↗ view original on x
            </a>
          </div>
        ) : (
          <XEmbed
            url={clip.source_url}
            title={clip.title}
            authorName={clip.author}
            authorUrl={clip.author_url}
            text={clip.source_excerpt}
          />
        ))}
        {clip.source_type === 'youtube' && (
          <div className="source-media">
            <YouTubeEmbed videoId={clip.youtube_id} startSec={clip.start_sec} endSec={clip.end_sec} muted autoplay />
            {range && (
              <div
                className="yt-range"
                aria-label={`Clip from ${formatSpan(clip.start_sec)} to ${formatSpan(clip.end_sec)} of a ${formatSpan(clip.duration)} video`}
              >
                <div className="yt-range__track">
                  <span className="yt-range__clip" style={{ left: `${range.left}%`, width: `${range.right - range.left}%` }} />
                  <span className="yt-range__tick" style={{ left: `${range.left}%` }} />
                  <span className="yt-range__tick" style={{ left: `${range.right}%` }} />
                </div>
                <div className="yt-range__labels">
                  <span className="yt-range__bound">{formatSpan(0)}</span>
                  <span className="yt-range__range" style={{ textAlign: range.align }}>
                    {formatSpan(clip.start_sec)} → {formatSpan(clip.end_sec)}
                  </span>
                  <span className="yt-range__bound">{formatSpan(clip.duration)}</span>
                </div>
              </div>
            )}
          </div>
        )}
        {clip.source_type === 'podcast' && (
          <div className="source-media"><AudioPlayer src={clip.audio_url} /></div>
        )}
        {!isX && clip.source_type === 'article' && clip.article_text && (
          <div className="source-article-body"><p>{clip.article_text}</p></div>
        )}
        {!isX && clip.source_type !== 'youtube' && clip.source_type !== 'podcast' && !clip.article_text && (clip.source_image_url || clip.thumbnail) && (
          <img src={clip.source_image_url || clip.thumbnail} alt="" className="source-post-image" />
        )}
        {!isX && clip.source_type !== 'youtube' && clip.source_type !== 'podcast' && !clip.article_text && !clip.source_image_url && !clip.thumbnail && (
          <div className="source-text-placeholder">This post is anchored to a source conversation. Open the original or expand the context below.</div>
        )}
      </section>}

      {transcript && (
        <section className="source-transcript" aria-label="Transcript">
          {!annotation?.audio_url && <span className="source-transcript-label">Transcript</span>}
          <p className="source-transcript-text">{transcript}</p>
        </section>
      )}

      <div className="detail-actions">
        <VoteButtons clipId={clip.id} score={score} setScore={setScore} />
        <a href="#comments" className="post-action no-underline"><PostActionIcon name="comments" /><span>{clip.comments_count ?? 0} comments</span></a>
        <ReportButton clipId={clip.id} />
        <button type="button" className="post-action" onClick={handleShare}><PostActionIcon name="share" /><span aria-live="polite">{shared ? 'Copied' : 'Share'}</span></button>
        <button type="button" className={`post-action ${saved ? 'post-action-saved' : ''}`} onClick={handleSave}><PostActionIcon name="save" /><span>{saved ? 'Saved' : 'Save'}</span></button>
      </div>

      {clip.source_url && !isX && (
        <a
          href={clip.source_type === 'youtube' ? youtubeSourceHref(clip) : clip.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="source-link real-source-link"
        >
          <span>↗ {sourceDomain(clip.source_url)}</span>
        </a>
      )}

      {isOwner && claims.length > 0 && (
        <div className="flex flex-col gap-3">
              <p className="text-xs text-text-muted font-medium uppercase tracking-wide">Claims ({claims.length})</p>
          {claims.map((claim) => (
            <div key={claim.id} className="bg-bg-surface border border-border rounded-lg p-4 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-text-secondary font-mono">{new Date(claim.created_at).toLocaleDateString()}</span>
                {claim.claimant_email && (
                  <a
                    href={`mailto:${claim.claimant_email}?subject=Re: Claim on your clip&body=Hi, I'm reaching out regarding your claim on my annotation.`}
                    className="text-xs text-accent-text hover:text-accent transition-colors"
                  >
                    Reply to {claim.claimant_email}
                  </a>
                )}
              </div>
              <Link to={`/claims/${claim.id}`} className="text-sm text-text-primary no-underline hover:text-accent-text">{claim.reason}</Link>
              {claim.claimant_email && (
                <p className="text-[11px] text-text-muted">From: {claim.claimant_email}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {thread.length > 0 && (
        <div className="flex flex-col gap-3 mt-2">
          <p className="text-xs text-text-muted font-medium uppercase tracking-wide">Thread</p>
          {thread.map((threadClip, i) => (
            <div key={threadClip.id} className="flex gap-3">
              <div className="flex flex-col items-center">
                <div className="w-px flex-1 bg-border" />
              </div>
              <Link
                to={postHref(threadClip)}
                className="flex-1 annotation-mark bg-bg-surface rounded-r-lg p-3 hover:bg-bg-raised transition-colors block"
              >
                <p className="text-sm text-text-secondary leading-relaxed line-clamp-3">
                  {threadClip.article_text}
                </p>
                <p className="text-xs text-text-muted mt-1 font-mono">Part {i + 2}</p>
              </Link>
            </div>
          ))}
        </div>
      )}

      <CommentSection clipId={clip.id} postOwnerId={clip.user_id} communityId={clip.community_id} focusCommentId={commentId} />
    </article>
  );
}

function PostActionIcon({ name }) {
  const paths = {
    comments: <><path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H5l-2 2v-10.5A8.5 8.5 0 0 1 11.5 3H12a9 9 0 0 1 9 8.5Z" /><path d="M8 11h8m-8 4h5" /></>,
    share: <><path d="M12 16V4m-5 5 5-5 5 5" /><path d="M5 13v7h14v-7" /></>,
    save: <path d="M6 4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5V21l-6-4-6 4V4.5Z" />,
    more: <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>,
  };
  return <svg className="post-action-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

async function loadClip(column, value) {
  const withCommunity = await supabase
    .from('clips_with_scores')
    .select('*, profiles(*), communities(slug, name)')
    .eq(column, value)
    .single();
  if (!withCommunity.error) return withCommunity.data;

  const fallback = await supabase
    .from('clips')
    .select('*, profiles(*)')
    .eq(column, value)
    .single();
  return fallback.data;
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function sourceDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return 'source'; }
}

function formatSpan(s) {
  const total = Math.max(0, Math.floor(Number(s) || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  const pad = n => n.toString().padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

function youtubeSourceHref(clip) {
  if (!clip.youtube_id) return clip.source_url;
  const base = `https://www.youtube.com/watch?v=${clip.youtube_id}`;
  const start = Number(clip.start_sec);
  return Number.isFinite(start) && start > 0 ? `${base}&t=${Math.floor(start)}s` : base;
}

function LoadingState() {
  return (
    <div className="flex flex-col gap-6 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-bg-raised" />
        <div className="flex flex-col gap-1">
          <div className="w-24 h-3 bg-bg-raised rounded" />
          <div className="w-16 h-2 bg-bg-raised rounded" />
        </div>
      </div>
      <div className="w-3/4 h-8 bg-bg-raised rounded" />
      <div className="w-full aspect-video bg-bg-raised rounded-xl" />
    </div>
  );
}

function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
      <span className="text-4xl">📎</span>
      <h2 className="text-xl font-bold text-text-primary">Clip not found</h2>
      <p className="text-sm text-text-secondary">This clip may have been removed or doesn't exist.</p>
    </div>
  );
}
