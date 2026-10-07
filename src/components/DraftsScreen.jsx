import { useEffect, useRef, useState } from 'react';

function timeAgo(dateStr) {
  const diff = Math.max(0, Date.now() - new Date(dateStr).getTime());
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatRange(startSec, endSec) {
  if (startSec == null || endSec == null) return null;
  const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  return `${fmt(startSec)} → ${fmt(endSec)}`;
}

function sourceHost(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

function DraftThumb({ draft }) {
  const payload = draft.payload || {};
  const [failed, setFailed] = useState(false);
  const youtubeId = payload.youtubeId;
  if (youtubeId && !failed) {
    return (
      <img
        src={`https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`}
        alt=""
        className="draft-thumb"
        loading="lazy"
        onError={() => setFailed(true)}
      />
    );
  }
  if (draft.thumbnail_url && !failed) {
    return (
      <img
        src={draft.thumbnail_url}
        alt=""
        className="draft-thumb"
        loading="lazy"
        onError={() => setFailed(true)}
      />
    );
  }
  const host = sourceHost(draft.source_url);
  return (
    <span className="draft-thumb draft-thumb-fallback">
      {host ? (
        <img
          src={`https://www.google.com/s2/favicons?domain=${host}&sz=64`}
          alt=""
          width={20}
          height={20}
          loading="lazy"
          onError={(e) => { e.currentTarget.style.display = 'none'; }}
        />
      ) : null}
      <span className="draft-thumb-domain">{host || 'link'}</span>
    </span>
  );
}

export default function DraftsScreen({ drafts, loading, signedIn, onBack, onContinue, onDeleteConfirmed }) {
  const [removed, setRemoved] = useState({});
  const timers = useRef({});

  useEffect(() => () => {
    Object.values(timers.current).forEach((timer) => clearTimeout(timer));
  }, []);

  const visible = (drafts || []).filter((draft) => !removed[draft.id]);

  const handleDelete = (draft) => {
    timers.current[draft.id] = setTimeout(() => {
      delete timers.current[draft.id];
      setRemoved((current) => {
        const next = { ...current };
        delete next[draft.id];
        return next;
      });
      onDeleteConfirmed(draft.id);
    }, 15000);
    setRemoved((current) => ({ ...current, [draft.id]: draft }));
  };

  const handleUndo = (id) => {
    clearTimeout(timers.current[id]);
    delete timers.current[id];
    setRemoved((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  };

  const undone = Object.values(removed);

  return (
    <div className="clip-body">
      <div className="drafts-head">
        <button type="button" className="btn-ghost drafts-back" onClick={onBack} aria-label="Back">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back
        </button>
        <span className="word-clipper-title">Drafts</span>
        {visible.length > 0 && <span className="word-clipper-count">{visible.length}</span>}
      </div>

      {!signedIn ? (
        <div className="draft-empty">
          <p>Sign in to use drafts.</p>
          <p className="draft-hint">Your unfinished annotations wait here, on every device.</p>
        </div>
      ) : loading ? (
        <div className="flex flex-col gap-3">
          <div className="draft-card draft-skeleton" />
          <div className="draft-card draft-skeleton" />
        </div>
      ) : visible.length === 0 && undone.length === 0 ? (
        <div className="draft-empty">
          <p>No drafts yet.</p>
          <button type="button" className="btn-ghost" onClick={onBack}>Start annotating</button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {visible.map((draft) => {
            const payload = draft.payload || {};
            const range = payload.sourceType === 'youtube' && payload.startSec != null ? formatRange(payload.startSec, payload.endSec) : null;
            return (
              <div key={draft.id} className="draft-card">
                <div className="draft-main">
                  <DraftThumb draft={draft} />
                  <div className="draft-body">
                    <p className="draft-title">{draft.title || 'Untitled clip'}</p>
                    <div className="draft-meta">
                      {draft.kind && <span className="draft-kind">{draft.kind}</span>}
                      {range && <span className="draft-range">{range}</span>}
                    </div>
                    {payload.commentary && <p className="draft-comment">{payload.commentary}</p>}
                    <p className="draft-edited">Edited {timeAgo(draft.updated_at || draft.created_at)}</p>
                  </div>
                  <button
                    type="button"
                    className="draft-delete"
                    onClick={() => handleDelete(draft)}
                    aria-label="Delete draft"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-9 0 1 13h10l1-13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </div>
                <button type="button" className="btn-primary w-full draft-continue" onClick={() => onContinue(draft)}>
                  Continue
                </button>
              </div>
            );
          })}
        </div>
      )}

      {undone.map((item) => (
        <div key={item.id} className="draft-undo" role="status">
          <span>Draft deleted.</span>
          <button type="button" onClick={() => handleUndo(item.id)}>Undo</button>
        </div>
      ))}
    </div>
  );
}
