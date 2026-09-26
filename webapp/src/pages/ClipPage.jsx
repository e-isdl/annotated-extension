import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { deleteClip } from '../lib/api';
import YouTubeEmbed from '../components/YouTubeEmbed';
import AudioPlayer from '../components/AudioPlayer';
import AnnotationBlock from '../components/AnnotationBlock';
import FileClaimButton from '../components/FileClaimButton';
import ReportButton from '../components/ReportButton';
import CommentSection from '../components/CommentSection';
import VoteButtons from '../components/VoteButtons';
import AnnotationLead from '../components/AnnotationLead';
import { getDemoClip } from '../lib/demoData';
import DemoClipPage from './DemoClipPage';
import { useToast } from '../components/ToastProvider';

export default function ClipPage() {
  const { id, commentId } = useParams();
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
  const [overflowOpen, setOverflowOpen] = useState(false);
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
          .select('*, profiles(*), annotations(id, text_content, audio_url)')
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

  if (demoClip) return <DemoClipPage clip={demoClip} focusCommentId={commentId} />;

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

  return (
    <article className="detail-page real-detail-page">
      <div className="detail-author-row">
        <div className="detail-post-context">
          <Link to="/" className="detail-back-button" aria-label="Back to home">←</Link>
          {clip.community_slug && clip.community_name && <Link to={`/c/${clip.community_slug}`} className="community-pill no-underline"><span className="community-dot">{clip.community_name[0]}</span> c/{clip.community_name}</Link>}
          <span>•</span>
          <span>{formatDate(clip.created_at)}</span>
          {!annotation?.text_content && <Link to={profile?.handle ? `/u/${profile.handle}` : '#'} className="post-author no-underline">by {profile?.handle || 'anonymous'}</Link>}
        </div>
        <div className="flex items-center gap-2">
          <div className="detail-overflow">
            <button type="button" className="post-action overflow-trigger" aria-label="More post actions" aria-expanded={overflowOpen} onClick={() => setOverflowOpen((value) => !value)}>···</button>
            {overflowOpen && <div className="overflow-menu"><FileClaimButton clipId={clip.id} /></div>}
          </div>
          {isOwner && (
          <div className="flex items-center gap-1">
            {confirmDelete ? (
              <>
                <span className="text-[11px] text-red-400 mr-1">Delete?</span>
                <button
                  onClick={handleDeleteClip}
                  disabled={deleting}
                  className="text-[11px] px-2 py-1 rounded-md text-white bg-red-500 hover:bg-red-600 transition-colors disabled:opacity-40"
                >
                  {deleting ? '...' : 'Yes'}
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  disabled={deleting}
                  className="text-[11px] px-2 py-1 rounded-md text-text-muted bg-bg-raised hover:bg-bg-surface transition-colors"
                >
                  No
                </button>
              </>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="text-[11px] px-2 py-1 rounded-md text-red-400 bg-red-400/10 hover:bg-red-400/20 transition-colors"
              >
                Delete
              </button>
            )}
          </div>
        )}
        </div>
      </div>

      <AnnotationLead text={annotation?.text_content || clip.title} profile={profile} annotationType={clip.annotation_type || 'Annotation'} asHeading />

      {clip.source_url && <section className="source-post" aria-label="Original source post">
        {clip.source_type !== 'youtube' && <div className="source-post-header">
          <div>
            <p className="source-post-domain">{clip.source_domain || sourceDomain(clip.source_url)}</p>
          {(clip.source_title || clip.title) && (clip.source_title || clip.title) !== (annotation?.text_content || clip.title) && <p className="source-post-caption">{clip.source_title || clip.title}</p>}
          </div>
          <span className={`badge badge-${clip.source_type}`}>{clip.source_type}</span>
        </div>}
        {clip.source_type === 'youtube' && (
          <div className="source-media"><YouTubeEmbed videoId={clip.youtube_id} startSec={clip.start_sec} endSec={clip.end_sec} muted autoplay /></div>
        )}
        {clip.source_type === 'podcast' && (
          <div className="source-media"><AudioPlayer src={clip.audio_url} /></div>
        )}
        {clip.source_type === 'article' && clip.article_text && (
          <div className="source-article-body"><p>{clip.article_text}</p></div>
        )}
        {clip.source_type !== 'youtube' && clip.source_type !== 'podcast' && !clip.article_text && (clip.source_image_url || clip.thumbnail) && (
          <img src={clip.source_image_url || clip.thumbnail} alt="" className="source-post-image" />
        )}
        {clip.source_type !== 'youtube' && clip.source_type !== 'podcast' && !clip.article_text && !clip.source_image_url && !clip.thumbnail && (
          <div className="source-text-placeholder">This post is anchored to a source conversation. Open the original or expand the context below.</div>
        )}
      </section>}

      {annotation?.audio_url && <AnnotationBlock annotation={{ ...annotation, text_content: null }} />}

      {transcript && (
        <section className="source-transcript" aria-label="Transcript">
          <span className="source-transcript-label">Transcript</span>
          <p className="source-transcript-text">{transcript}</p>
        </section>
      )}

      <div className="detail-actions">
        <VoteButtons clipId={clip.id} score={score} setScore={setScore} />
        <a href="#comments" className="post-action no-underline">▱ {clip.comments_count ?? 0} comments</a>
        <ReportButton clipId={clip.id} />
        <button type="button" className="post-action" onClick={handleShare}>↗ <span aria-live="polite">{shared ? 'Copied' : 'Share'}</span></button>
        <button type="button" className={`post-action ${saved ? 'post-action-saved' : ''}`} onClick={handleSave}>{saved ? '★ Saved' : '☆ Save'}</button>
      </div>

      {clip.source_url && clip.source_type !== 'youtube' && <a href={clip.source_url} target="_blank" rel="noopener noreferrer" className="source-link real-source-link">↗ {sourceDomain(clip.source_url)}</a>}

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
                to={`/post/${threadClip.slug || threadClip.id}`}
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
