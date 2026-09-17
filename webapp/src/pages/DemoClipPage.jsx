import { useState } from 'react';
import { Link } from 'react-router-dom';
import Avatar from '../components/Avatar';
import VoteButtons from '../components/VoteButtons';

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
    <article className="detail-page">
      <Link to="/" className="back-link">← Back to Home</Link>

      <div className="detail-meta-row">
        <Link to={`/c/${clip.community_slug}`} className="community-pill no-underline"><span className="community-dot">{clip.community_name[0]}</span> c/{clip.community_name}</Link>
        <span>•</span>
        <Link to={`/u/${clip.profiles.handle}`} className="post-author no-underline">@{clip.profiles.handle}</Link>
        <span>•</span>
        <span>{timeAgo(clip.created_at)}</span>
        <span className={`badge badge-${clip.source_type}`}>{clip.annotation_type}</span>
      </div>

      <h1 className="detail-title">{clip.title}</h1>

      <div className="detail-commentary">{clip.annotation}</div>

      <div className="detail-context">
        <div className="detail-context-heading"><span className="eyebrow mb-0">SOURCE CONTEXT</span><span className="source-label">{clip.source_domain}</span></div>
        {clip.source_image_url || clip.thumbnail ? <img src={clip.source_image_url || clip.thumbnail} alt="" className="detail-source-image" /> : null}
        <div className="detail-quote-wrap">
          <span className="quote-mark">“</span>
          <p>{clip.article_text || clip.transcript || clip.source_preview_text}</p>
        </div>
        <div className="flex items-center justify-between gap-3 mt-4">
          <p className="text-xs text-text-secondary truncate">{clip.source_title}</p>
          <a href={clip.source_url} target="_blank" rel="noopener noreferrer" className="source-link shrink-0">Open original ↗</a>
        </div>
        {clip.start_sec !== undefined && <div className="mt-3"><span className="timestamp">{formatTime(clip.start_sec)} → {formatTime(clip.end_sec)}</span></div>}
      </div>

      <div className="detail-actions">
        <VoteButtons clipId={clip.id} score={score} setScore={setScore} />
        <button type="button" className="post-action" onClick={share}>↗ {shared ? 'Copied' : 'Share'}</button>
        <button type="button" className={`post-action ${saved ? 'post-action-saved' : ''}`} onClick={() => setSaved(!saved)}>{saved ? '★ Saved' : '☆ Save'}</button>
        <span className="detail-comment-count">{clip.comments_count} comments</span>
      </div>

      <section className="comments-panel" id="comments">
        <div className="comments-heading"><div><p className="eyebrow mb-1">THE DISCUSSION</p><h2>{clip.comments_count} comments</h2></div><button className="sort-chip">Best⌄</button></div>
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
