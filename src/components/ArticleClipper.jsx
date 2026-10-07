import { useState, useEffect } from 'react';

export default function ArticleClipper({ pageInfo, onReady }) {
  const { data, url } = pageInfo;
  const [selectedText, setSelectedText] = useState(data.selectedText || '');
  const [editing, setEditing] = useState(false);

  const WORD_LIMIT = 200;

  useEffect(() => {
    if (data.selectedText && data.selectedText !== selectedText) {
      setSelectedText(data.selectedText);
    }
  }, [data.selectedText]);

  const wordCount = selectedText.trim().split(/\s+/).filter(Boolean).length;
  const isOverLimit = wordCount > WORD_LIMIT;
  const hasText = selectedText.trim().length > 0;
  const warnAt = Math.ceil(WORD_LIMIT * 0.9);

  const handleContinue = () => {
    if (!hasText || isOverLimit) return;
    onReady({
      source_url: url,
      source_type: 'article',
      title: data.title,
      author: data.author,
      article_text: selectedText,
      thumbnail: data.ogImage || null,
    });
  };

  let host = '';
  try { host = new URL(url).hostname.replace(/^www\./, ''); } catch (e) {}

  return (
    <div className="clip-body">
      <div className="article-source">
        <span className="article-source-title">{data.title}</span>
        {host && <span className="article-source-host">{host}</span>}
      </div>

      {!hasText ? (
        <div className="article-card is-empty">
          <svg className="article-marker-icon" width="32" height="32" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 19l1.2-4.2L16.5 4.5a2 2 0 012.8 0l.2.2a2 2 0 010 2.8L9.2 17.8 5 19z" fill="var(--yellow)" stroke="var(--text)" strokeWidth="1.4" strokeLinejoin="round" />
            <path d="M4 21h16" stroke="var(--text)" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <p className="article-line1"><span className="hl-full">Select text</span> on the page to quote it.</p>
          <p className="article-line2">Quote up to {WORD_LIMIT} words, you can edit it before posting</p>
        </div>
      ) : (
        <div className="article-card has-quote">
          <div className="article-top">
            <span className={`article-count ${isOverLimit ? 'over' : wordCount >= warnAt ? 'warn' : ''}`}>
              {wordCount} / {WORD_LIMIT} words
            </span>
            <button type="button" className="btn-ghost article-edit" onClick={() => setEditing((v) => !v)}>
              {editing ? 'Done' : 'Edit text'}
            </button>
          </div>
          {editing ? (
            <textarea
              value={selectedText}
              onChange={(e) => setSelectedText(e.target.value)}
              className="article-editor"
              rows={8}
              autoFocus
            />
          ) : (
            <p className="article-quote"><span className="hl-full">{selectedText}</span></p>
          )}
          <div className="article-progress">
            <div
              className={`article-progress-fill ${isOverLimit ? 'over' : ''}`}
              style={{ width: `${Math.min((wordCount / WORD_LIMIT) * 100, 100)}%` }}
            />
          </div>
        </div>
      )}

      {!hasText && <p className="article-helper">Select some text to continue.</p>}
      {isOverLimit && <p className="article-helper over">Over {WORD_LIMIT} words — trim to continue.</p>}

      <button
        onClick={handleContinue}
        disabled={!hasText || isOverLimit}
       
        className="btn-primary w-full disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Continue to Annotate
      </button>
    </div>
  );
}
