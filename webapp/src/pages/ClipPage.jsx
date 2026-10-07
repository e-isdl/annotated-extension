import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useParams, Link, useNavigate, Navigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { deleteClip } from '../lib/api';
import Avatar from '../components/Avatar';
import CommunityAvatar from '../components/CommunityAvatar';
import YouTubeClipPlayer from '../components/YouTubeClipPlayer';
import ClipPlayer from '../components/ClipPlayer';
import LoopPlayer from '../components/LoopPlayer';
import AudioPlayer from '../components/AudioPlayer';
import PodcastEpisode from '../components/PodcastEpisode';
import FileClaimButton from '../components/FileClaimButton';
import ReportButton from '../components/ReportButton';
import CommentSection from '../components/CommentSection';
import VoteButtons from '../components/VoteButtons';
import AnnotationLead from '../components/AnnotationLead';
import AnnotationEditForm, { EditAnnotationMenuItem } from '../components/EditAnnotationButton';
import { getDemoClip } from '../lib/demoData';
import DemoClipPage from './DemoClipPage';
import { useToast } from '../components/ToastProvider';
import { postHref } from '../lib/links';
import { isXPostUrl, matchStatusUrl } from '../lib/social';
import { cleanTranscript } from '../lib/text';
import { setActivePost } from '../lib/activePost';

const MEDIA_FRAME = /youtube\.com\/embed|youtube-nocookie\.com\/embed|platform\.twitter\.com|twimg\.com/;

export default function ClipPage() {
  const routeParams = useParams();
  const id = routeParams.id || routeParams.post || routeParams.slug;
  const commentId = routeParams.commentId;
  const navigate = useNavigate();
  const [clip, setClip] = useState(null);
  const [annotation, setAnnotation] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [canonicalPath, setCanonicalPath] = useState(null);
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
  const [editingAnnotation, setEditingAnnotation] = useState(false);
  const tweetTextRef = useRef(null);
  const [tweetExpanded, setTweetExpanded] = useState(false);
  const [tweetExpandable, setTweetExpandable] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const [showEmbed, setShowEmbed] = useState(false);
  const { push } = useToast();

  useEffect(() => {
    setShowEmbed(false);
    setVideoFailed(false);
  }, [id]);

  const clipIdForPoll = clip && clip.id;
  const clipStatusForPoll = clip && clip.video_status;
  const clipCreatedAtForPoll = clip && clip.created_at;
  useEffect(() => {
    if (clipStatusForPoll !== 'uploading' || !clipIdForPoll) return undefined;
    if (clipCreatedAtForPoll && (Date.now() - new Date(clipCreatedAtForPoll).getTime() > 20 * 60 * 1000)) return undefined;
    const timer = window.setInterval(async () => {
      try {
        const { data } = await supabase.from('clips').select('video_url, video_status').eq('id', clipIdForPoll).single();
        if (data && data.video_status !== 'uploading') {
          setClip((current) => (current ? { ...current, video_url: data.video_url ?? null, video_status: data.video_status } : current));
        }
      } catch {}
    }, 4000);
    return () => window.clearInterval(timer);
  }, [clipIdForPoll, clipStatusForPoll, clipCreatedAtForPoll]);

  useEffect(() => () => setActivePost(null), []);

  useLayoutEffect(() => {
    const el = tweetTextRef.current;
    if (!el || tweetExpanded) return;
    const wasClamped = el.classList.contains('x-text-card-text-clamped');
    if (wasClamped) el.classList.remove('x-text-card-text-clamped');
    const fullHeight = el.scrollHeight;
    if (wasClamped) el.classList.add('x-text-card-text-clamped');
    const clippedHeight = el.clientHeight;
    const needsExpand = fullHeight - clippedHeight > 4;
    setTweetExpandable((previous) => (previous === needsExpand ? previous : needsExpand));
  });

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
        if (clipData.video_url === undefined || clipData.video_status === undefined) {
          try {
            const { data: vrow } = await supabase.from('clips').select('video_url, video_status').eq('id', clipData.id).single();
            if (vrow) {
              clipData = { ...clipData, video_url: vrow.video_url ?? null, video_status: vrow.video_status ?? 'ready' };
              setClip(clipData);
            }
          } catch {}
        }
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
        const handleName = clipData.profiles?.handle;
        if (clipData.slug && handleName) {
          const base = `/@${String(handleName).toLowerCase()}/post/${clipData.slug}`;
          const target = commentId ? `${base}/comment/${commentId}` : base;
          if (window.location.pathname !== target) setCanonicalPath(target);
        }

        if (clipData.source_url) {
          const { data: others } = await supabase
            .from('clips_with_scores')
            .select('id, slug, title, score, profiles(handle)')
            .eq('source_url', clipData.source_url)
            .neq('id', clipData.id)
            .order('score', { ascending: false })
            .limit(5);
          setActivePost({ id: clipData.id, takes: others || [] });
        }
      }
      setLoading(false);
    }
    load();
  }, [id, demoClip]);

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

  if (canonicalPath) return <Navigate to={canonicalPath} replace />;

  if (loading) return <LoadingState />;
  if (!clip) return <NotFound />;

  const isX = isXPostUrl(clip.source_url);
  const hasMedia = (clip.media_kind === 'loop' || clip.media_kind === 'clip') && Boolean(clip.media_url);
  const posterHandle = isX ? (matchStatusUrl(clip.source_url)?.handle || String(clip.author || '').replace(/^@/, '')) : '';
  const hasSourceImage = !isX && clip.source_type !== 'youtube' && clip.source_type !== 'podcast' && !clip.article_text && Boolean(clip.source_image_url || clip.thumbnail);
  const uploadStale = Boolean(clip.video_status === 'uploading' && clip.created_at && (Date.now() - new Date(clip.created_at).getTime() > 20 * 60 * 1000));
  const stillUploading = clip.video_status === 'uploading' && !uploadStale;

  return (
    <article className="detail-page real-detail-page">
      <DetailHeader clip={clip} profile={profile}>
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
              {isOwner && annotation && (
                <EditAnnotationMenuItem
                  onEdit={() => { setPostMenuOpen(false); setEditingAnnotation(true); }}
                />
              )}
              {isOwner && (confirmDelete ? (
                  <div className="flex items-center gap-2 p-1.5">
                    <span className="text-[11px] text-[var(--danger)]">Delete post?</span>
                    <button
                      type="button"
                      onClick={handleDeleteClip}
                      disabled={deleting}
                      className="text-[11px] px-2 py-1 rounded-md text-[var(--on-red)] bg-[var(--danger-btn)] hover:bg-[var(--red-btn-hover)] transition-colors disabled:opacity-40"
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
                    className="w-full text-left text-[11px] px-2 py-1.5 rounded-md text-[var(--danger)] hover:bg-[var(--red-soft)] transition-colors"
                  >
                    Delete
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </DetailHeader>

      <AnnotationLead text={annotation?.text_content} profile={profile} annotationType={clip.annotation_type || 'Annotation'} asHeading showType={false} showAuthor={false} />

      {isOwner && annotation && (
        <AnnotationEditForm
          clipId={clip.id}
          annotationType={clip.annotation_type || 'Annotation'}
          text={annotation.text_content}
          active={editingAnnotation}
          onDone={() => setEditingAnnotation(false)}
          onSaved={(next) => setAnnotation((current) => ({ ...(current || {}), text_content: next }))}
        />
      )}

      {annotation?.audio_url && <div className="post-audio"><AudioPlayer src={annotation.audio_url} /></div>}

      {clip.source_type === 'text' && clip.article_text && (
        <section className="post-text-body post-text-body-detail" aria-label="Post content"><p>{clip.article_text}</p></section>
      )}

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
        {isX && (hasMedia ? (
          <div className="source-media source-media-x">
            <LoopPlayer
              src={clip.media_url}
              poster={clip.poster_url || clip.thumbnail}
              label={clip.media_kind === 'loop' ? 'Recorded loop, silent' : 'Recorded video, silent'}
              loop={clip.media_kind === 'loop'}
              controls={clip.media_kind === 'clip'}
            />
            <a href={clip.source_url} target="_blank" rel="noopener noreferrer" className="x-original-link">
              ↗ view original on x
            </a>
          </div>
        ) : clip.thumbnail && !imageFailed ? (
          <div className="source-media source-media-x">
            <img src={clip.thumbnail} alt={clip.title || 'X post'} className="source-post-image source-post-image-x" loading="lazy" onError={() => setImageFailed(true)} />
            <a href={clip.source_url} target="_blank" rel="noopener noreferrer" className="x-original-link">
              ↗ view original on x
            </a>
          </div>
        ) : (
  <div className="source-media x-text-card">
    <div className="x-card-box">
      {posterHandle && <p className="x-card-poster">@{posterHandle}</p>}
      <p
        ref={tweetTextRef}
        className={`x-text-card-text${tweetExpanded ? '' : ' x-text-card-text-clamped'}`}
      >
        {clip.article_text || clip.source_excerpt || clip.title}
      </p>
      {tweetExpandable && (
        <button
          type="button"
          className="x-read-more"
          onClick={() => setTweetExpanded((value) => !value)}
        >
          {tweetExpanded ? 'Show less' : 'Read more'}
        </button>
      )}
    </div>
    <a href={clip.source_url} target="_blank" rel="noopener noreferrer" className="x-original-link">
      ↗ view original on x
    </a>
  </div>
        ))}
        {stillUploading && (
          <div className="source-media">
            <div className="post-uploading">
              <span className="post-uploading-spinner" />
              Uploading…
            </div>
          </div>
        )}
        {clip.video_url && !stillUploading && !videoFailed && !showEmbed && (
          <div className="source-media">
            <ClipPlayer src={clip.video_url} onError={() => setVideoFailed(true)} fallbackDuration={clip.end_sec - clip.start_sec} />
          </div>
        )}
        {(!clip.video_url || videoFailed || showEmbed) && !stillUploading && clip.source_type === 'youtube' && (
          <div className="source-media">
            <YouTubeClipPlayer videoId={clip.youtube_id} startSec={clip.start_sec} endSec={clip.end_sec} autoplay />
          </div>
        )}
        {clip.video_url && !stillUploading && !videoFailed && clip.source_type === 'youtube' && (
          <button type="button" className="view-embed-toggle" onClick={() => setShowEmbed((value) => !value)}>
            {showEmbed ? 'View recording' : 'View embed'}
          </button>
        )}
        {clip.source_type === 'podcast' && clip.audio_url && (
          <div className="source-media source-media-podcast">
            <PodcastEpisode clip={clip} layout="detail" />
          </div>
        )}
        {!isX && clip.source_type === 'article' && clip.article_text && (
          <div className="source-article-body"><p>{clip.article_text}</p></div>
        )}
        {hasSourceImage && !imageFailed && (
          <img src={clip.source_image_url || clip.thumbnail} alt="" className="source-post-image" loading="lazy" onError={() => setImageFailed(true)} />
        )}
        {hasSourceImage && imageFailed && (
          <div className="source-text-placeholder">The image for this source could not be loaded.</div>
        )}
        {!isX && clip.source_type !== 'youtube' && clip.source_type !== 'podcast' && !clip.article_text && !clip.source_image_url && !clip.thumbnail && (
          <div className="source-text-placeholder">This post is anchored to a source conversation. Open the original or expand the context below.</div>
        )}
      </section>}

      {transcript && (
        <section className="source-transcript" aria-label="Transcript">
          <div className="source-transcript-head">
            <button type="button" className="source-transcript-toggle" aria-expanded={showTranscript} onClick={() => setShowTranscript((value) => !value)}>
              <span className="source-transcript-caret" aria-hidden="true">{showTranscript ? '▾' : '▸'}</span>
              {showTranscript ? 'Hide transcript' : 'Show transcript'}
            </button>
          </div>
          {showTranscript && (
            <div className="source-transcript-box">
              <p className="source-transcript-text">{cleanTranscript(transcript)}</p>
            </div>
          )}
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
          <span>↗ {clip.source_type === 'youtube' ? sourceDomain(clip.source_url) : 'Open source'}</span>
        </a>
      )}

      {isOwner && claims.length > 0 && (
        <div className="flex flex-col gap-3">
              <p className="text-xs text-text-muted font-medium">Claims ({claims.length})</p>
          {claims.map((claim) => (
            <div key={claim.id} className="bg-bg-surface border border-border rounded-lg p-4 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-text-secondary font-mono">{new Date(claim.created_at).toLocaleDateString()}</span>
                {claim.claimant_email && (
                  <a
                    href={`mailto:${claim.claimant_email}?subject=Re: Claim on your clip&body=Hi, I'm reaching out regarding your claim on my annotation.`}
                    className="text-xs text-accent-2 hover:text-accent-2 transition-colors"
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
          <p className="text-xs text-text-muted font-medium">Thread</p>
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

      <CommentSection clipId={clip.id} postBase={postHref(clip)} postOwnerId={clip.user_id} communityId={clip.community_id} focusCommentId={commentId} />
    </article>
  );
}

function DetailHeader({ clip, profile, children }) {
  const hasCommunity = Boolean(clip.community_slug && clip.community_name);
  return (
    <div className="detail-author-row">
      <div className="detail-post-context">
        <Link to="/" className="detail-back-button" aria-label="Back to home">
          <PostActionIcon name="back" />
        </Link>
        {hasCommunity
          ? <CommunityHeaderVariant clip={clip} profile={profile} />
          : <PersonalHeaderVariant clip={clip} profile={profile} />}
      </div>
      {children}
    </div>
  );
}

function CommunityHeaderVariant({ clip, profile }) {
  const date = formatDate(clip.created_at);
  return (
    <>
      <span className="detail-header-avatar" aria-hidden="true">
        <CommunityAvatar slug={clip.community_slug} name={clip.community_name} />
      </span>
      <div className="detail-header-text">
        <p className="detail-header-line1">
          <Link to={`/c/${clip.community_slug}`} className="detail-header-community">c/{clip.community_name}</Link>
          <span className="detail-header-dot" aria-hidden="true">•</span>
          <span className="detail-header-date detail-header-date-inline">{date}</span>
        </p>
        {profile?.handle && (
          <p className="detail-header-line2">
            <Link to={`/u/${profile.handle}`} className="detail-header-author">{profile.handle}</Link>
            <span className="detail-header-date detail-header-date-stack">• {date}</span>
          </p>
        )}
      </div>
    </>
  );
}

function PersonalHeaderVariant({ clip, profile }) {
  const date = formatDate(clip.created_at);
  const handle = profile?.handle || null;
  return (
    <>
      <span className="detail-header-avatar" aria-hidden="true">
        <Avatar profile={profile} size="md" />
      </span>
      <div className="detail-header-text">
        <p className="detail-header-line1">
          {handle ? (
            <Link to={`/u/${handle}`} className="detail-header-author-name">{handle}</Link>
          ) : (
            <span className="detail-header-author-name">anonymous</span>
          )}
        </p>
        <p className="detail-header-line2">
          <span className="detail-header-date">{date}</span>
        </p>
      </div>
    </>
  );
}

function PostActionIcon({ name }) {
  const paths = {
    comments: <><path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H5l-2 2v-10.5A8.5 8.5 0 0 1 11.5 3H12a9 9 0 0 1 9 8.5Z" /><path d="M8 11h8m-8 4h5" /></>,
    share: <><path d="M12 16V4m-5 5 5-5 5 5" /><path d="M5 13v7h14v-7" /></>,
    save: <path d="M6 4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5V21l-6-4-6 4V4.5Z" />,
    more: <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>,
    back: <><path d="M19 12H5" /><path d="m12 19-7-7 7-7" /></>,
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
