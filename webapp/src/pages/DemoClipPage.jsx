import { useState } from 'react';
import { Link } from 'react-router-dom';
import VoteButtons from '../components/VoteButtons';
import YouTubeEmbed from '../components/YouTubeEmbed';
import AudioPlayer from '../components/AudioPlayer';
import AnnotationLead from '../components/AnnotationLead';
import CommunityAvatar from '../components/CommunityAvatar';
import { useToast } from '../components/ToastProvider';

export default function DemoClipPage({ clip }) {
  const [score, setScore] = useState(clip.score || 0);
  const [saved, setSaved] = useState(false);
  const [shared, setShared] = useState(false);
  const { push } = useToast();
  const transcript = clip.transcript || clip.article_text || clip.source_preview_text;

  async function share() {
    try { await navigator.clipboard.writeText(window.location.href); push('Post link copied.', 'info'); }
    catch { push('Could not copy the post link.', 'error'); }
    setShared(true);
    window.setTimeout(() => setShared(false), 1600);
  }

  return (
    <article className="detail-page annotated-post-page">
      <div className="detail-meta-row">
        <Link to="/" className="detail-back-button" aria-label="Back to home">←</Link>
        {clip.community_slug && clip.community_name && (
          <>
            <Link to={`/c/${clip.community_slug}`} className="community-pill no-underline"><CommunityAvatar slug={clip.community_slug} name={clip.community_name} /> c/{clip.community_name}</Link>
            <span>•</span>
          </>
        )}
        <span>{timeAgo(clip.created_at)}</span>
      </div>

      <AnnotationLead text={clip.annotation} profile={clip.profiles} annotationType={clip.annotation_type} asHeading />

      <section className="source-post" aria-label="Original source post">
        {clip.source_type !== 'youtube' && <div className="source-post-header">
          <div>
            <p className="source-post-domain">{clip.source_domain}</p>
            {clip.title && clip.title !== clip.annotation && <p className="source-post-caption">{clip.title}</p>}
          </div>
          <span className={`badge badge-${clip.source_type}`}>{clip.source_type}</span>
        </div>}
        <SourceMedia clip={clip} />
      </section>

      {transcript && <section className="source-transcript" aria-label={clip.transcript ? 'Transcript' : 'Source context'}>
        <span className="source-transcript-label">{clip.transcript ? 'Transcript' : 'Context'}</span>
        <p className="source-transcript-text">{transcript}</p>
      </section>}

      <div className="detail-actions">
        <VoteButtons clipId={clip.id} score={score} setScore={setScore} />
        <a href="#comments" className="post-action no-underline">▱ {clip.comments_count} comments</a>
        <button type="button" className="post-action" onClick={share}>↗ <span aria-live="polite">{shared ? 'Copied' : 'Share'}</span></button>
        <button type="button" className={`post-action ${saved ? 'post-action-saved' : ''}`} onClick={() => setSaved(!saved)}>{saved ? '★ Saved' : '☆ Save'}</button>
      </div>

    </article>
  );
}

function SourceMedia({ clip }) {
  if (clip.source_type === 'youtube' && clip.youtube_id) {
    return <div className="source-media"><YouTubeEmbed videoId={clip.youtube_id} startSec={clip.start_sec} endSec={clip.end_sec} muted autoplay /></div>;
  }
  if (clip.source_type === 'podcast' && clip.audio_url) {
    return <div className="source-media"><AudioPlayer src={clip.audio_url} /></div>;
  }
  if (clip.source_image_url || clip.thumbnail) {
    return <img src={clip.source_image_url || clip.thumbnail} alt="" className="source-post-image" />;
  }
  return <div className="source-text-placeholder">This post is anchored to a source conversation. Open the original or expand the context below.</div>;
}

function timeAgo(dateStr) {
  const mins = Math.floor(Math.max(0, Date.now() - new Date(dateStr).getTime()) / 60000);
  if (mins < 60) return `${Math.max(1, mins)}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
