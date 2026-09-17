import { useState } from 'react';
import { Link } from 'react-router-dom';
import Avatar from '../components/Avatar';
import VoteButtons from '../components/VoteButtons';
import YouTubeEmbed from '../components/YouTubeEmbed';
import AudioPlayer from '../components/AudioPlayer';
import AnnotationLead from '../components/AnnotationLead';

const DEMO_COMMENTS = [
  { handle: 'theorycraft', body: 'This is the difference between a feed that gives you information and a feed that gives you something to think about.', score: 148, age: '18m' },
  { handle: 'softlaunch', body: 'The source should probably be visible even when the discussion gets long. Context collapse is where most platforms lose me.', score: 82, age: '11m' },
  { handle: 'mayachen', body: 'Yes. The quote is the anchor, not the entire post.', score: 41, age: '4m' },
];

export default function DemoClipPage({ clip }) {
  const [score, setScore] = useState(clip.score || 0);
  const [saved, setSaved] = useState(false);
  const [shared, setShared] = useState(false);

  async function share() {
    try { await navigator.clipboard.writeText(window.location.href); } catch {}
    setShared(true);
    window.setTimeout(() => setShared(false), 1600);
  }

  return (
    <article className="detail-page annotated-post-page">
      <Link to="/" className="back-link">← Back to Home</Link>

      <div className="detail-meta-row">
        <Link to={`/c/${clip.community_slug}`} className="community-pill no-underline"><span className="community-dot">{clip.community_name[0]}</span> c/{clip.community_name}</Link>
        <span>•</span>
        <span>{timeAgo(clip.created_at)}</span>
      </div>

      <AnnotationLead text={clip.annotation} profile={clip.profiles} annotationType={clip.annotation_type} />

      <h1 className="detail-title">{clip.title}</h1>

      <section className="source-post" aria-label="Original source post">
        <div className="source-post-header">
          <div>
            <p className="source-post-kicker">SOURCE POST</p>
            <p className="source-post-domain">{clip.source_domain}</p>
          </div>
          <span className={`badge badge-${clip.source_type}`}>{clip.source_type}</span>
        </div>
        <SourceMedia clip={clip} />
      </section>

      <details className="transcript-drawer">
        <summary>
          <span>Show transcript &amp; context</span>
          <span className="transcript-drawer-hint">Read the exact moment</span>
        </summary>
        <div className="transcript-drawer-body">
          <div className="detail-quote-wrap">
            <span className="quote-mark">“</span>
            <p>{clip.article_text || clip.transcript || clip.source_preview_text || 'No transcript was captured for this source.'}</p>
          </div>
          <div className="source-post-footer">
            <p>{clip.source_title}</p>
            <a href={clip.source_url} target="_blank" rel="noopener noreferrer" className="source-link">Open original ↗</a>
          </div>
          {clip.start_sec !== undefined && <span className="timestamp">{formatTime(clip.start_sec)} → {formatTime(clip.end_sec)}</span>}
        </div>
      </details>

      <div className="detail-actions">
        <VoteButtons clipId={clip.id} score={score} setScore={setScore} />
        <a href="#comments" className="post-action no-underline">▱ {clip.comments_count} comments</a>
        <button type="button" className="post-action" onClick={share}>↗ {shared ? 'Copied' : 'Share'}</button>
        <button type="button" className={`post-action ${saved ? 'post-action-saved' : ''}`} onClick={() => setSaved(!saved)}>{saved ? '★ Saved' : '☆ Save'}</button>
      </div>

      <section className="comments-panel" id="comments">
        <div className="comments-heading"><div><p className="eyebrow mb-1">THE DISCUSSION</p><h2>{clip.comments_count} comments</h2></div><select className="sort-chip" defaultValue="best"><option value="best">Best</option><option value="new">New</option></select></div>
        <div className="comment-signin"><span>✎</span><p>Have something to add?</p><button type="button" className="btn-ghost text-xs py-2 px-3">Sign in to comment</button></div>
        <div className="comment-list">
          {DEMO_COMMENTS.map((comment) => (
            <div key={`${comment.handle}-${comment.age}`} className="demo-comment">
              <div className="flex items-center gap-2"><Avatar profile={{ handle: comment.handle }} size="sm" /><span className="text-xs font-semibold text-text-primary">@{comment.handle}</span><span className="text-[11px] text-text-muted">{comment.age}</span></div>
              <p>{comment.body}</p>
              <div className="comment-tools"><span>▲ {comment.score}</span><span>Reply</span><span>Share</span></div>
            </div>
          ))}
        </div>
      </section>
    </article>
  );
}

function SourceMedia({ clip }) {
  if (clip.source_type === 'youtube' && clip.youtube_id && !String(clip.id).startsWith('demo-')) {
    return <div className="source-media"><YouTubeEmbed videoId={clip.youtube_id} startSec={clip.start_sec} endSec={clip.end_sec} muted={false} autoplay={false} /></div>;
  }
  if (clip.source_type === 'youtube') {
    return (
      <a className="video-poster" href={clip.source_url} target="_blank" rel="noopener noreferrer" style={{ backgroundImage: `url(${clip.thumbnail || clip.source_image_url || ''})` }}>
        <span className="video-poster-shade" />
        <span className="video-play">▶</span>
        <span className="video-poster-label">Open video on YouTube ↗</span>
      </a>
    );
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

function formatTime(s) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}
