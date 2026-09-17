import { useState, useRef, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import Avatar from './Avatar';
import VoteButtons from './VoteButtons';

function ClampedText({ text, clampClass, className, prefix, suffix }) {
  const [expanded, setExpanded] = useState(false);
  const [isClamped, setIsClamped] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (ref.current) {
      setIsClamped(ref.current.scrollHeight > ref.current.clientHeight);
    }
  }, [text]);

  return (
    <div>
      <p ref={ref} className={`${className} ${!expanded ? clampClass : ''}`}>
        {prefix}{text}{suffix}
      </p>
      {isClamped && (
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setExpanded(!expanded); }}
          className="text-[11px] text-accent-text hover:text-accent mt-1 transition-colors"
        >
          {expanded ? 'View less' : 'View more'}
        </button>
      )}
    </div>
  );
}

export default function ClipCard({ clip }) {
  const annotation = clip.annotations?.[0];
  const [score, setScore] = useState(clip.score ?? 0);
  const thumbUrl = clip.thumbnail || (clip.youtube_id ? `https://img.youtube.com/vi/${clip.youtube_id}/hqdefault.jpg` : null);
  const isArticle = clip.source_type === 'article';

  return (
    <div className="clip-card">
      <Link to={`/clip/${clip.slug || clip.id}`} className="block no-underline">
        <div className="flex items-center justify-between mb-3">
          <span className="flex items-center gap-2">
            <Avatar profile={clip.profiles} size="sm" />
            <span className="text-sm font-medium text-text-primary">@{clip.profiles?.handle}</span>
          </span>
          <div className="flex items-center gap-2">
            <span className={`badge badge-${clip.source_type}`}>{clip.source_type}</span>
            <span className="text-xs text-text-muted font-mono">{timeAgo(clip.created_at)}</span>
          </div>
        </div>

        {annotation?.text_content && (
          <ClampedText
            text={annotation.text_content}
            className="text-[15px] font-semibold text-text-primary leading-relaxed mb-3 whitespace-pre-wrap"
            clampClass="line-clamp-5"
            prefix=""
            suffix=""
          />
        )}
        {annotation?.audio_url && !annotation?.text_content && (
          <div className="flex items-center gap-1.5 mb-3">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-podcast">
              <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55C7.79 13 6 14.79 6 17s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
            </svg>
            <span className="text-xs text-podcast font-medium">Audio commentary</span>
          </div>
        )}

        {isArticle && clip.article_text ? (
          <div className="mb-3 p-3 rounded-lg bg-bg-surface/50 border-l-2 border-border">
            <ClampedText
              text={clip.article_text}
              className="text-xs text-text-secondary leading-relaxed whitespace-pre-wrap"
              clampClass="line-clamp-3"
              prefix=""
              suffix=""
            />
          </div>
        ) : clip.transcript ? (
          <div className="mb-3 p-3 rounded-lg bg-bg-surface/50 border-l-2 border-border">
            <ClampedText
              text={clip.transcript}
              className="text-xs text-text-secondary leading-relaxed whitespace-pre-wrap font-medium"
              clampClass="line-clamp-3"
              prefix={"\u201C"}
              suffix={"\u201D"}
            />
          </div>
        ) : null}

        <div className="flex items-center gap-3">
          {thumbUrl && (
            <img
              src={thumbUrl}
              alt=""
              className="w-[104px] h-[72px] object-cover rounded-md shrink-0"
            />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-text-primary line-clamp-2 leading-snug">{clip.title}</p>
            {clip.start_sec !== undefined && clip.end_sec !== undefined && (
              <div className="flex items-center gap-1 mt-1">
                <span className="timestamp">{formatTime(clip.start_sec)}</span>
                <span className="text-text-muted text-xs">&rarr;</span>
                <span className="timestamp">{formatTime(clip.end_sec)}</span>
              </div>
            )}
          </div>
        </div>
      </Link>

      <div className="flex items-center justify-between mt-3 pt-3 border-t border-border-subtle">
        <VoteButtons clipId={clip.id} score={score} setScore={setScore} />
        <Link to={`/clip/${clip.slug || clip.id}`} className="text-xs text-text-muted hover:text-text-secondary">
          {clip.comments_count ?? 0} comments
        </Link>
      </div>
    </div>
  );
}

function formatTime(s) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}
