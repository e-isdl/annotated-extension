import { useState } from 'react';

export default function ArticleClipper({ pageInfo, onReady }) {
  const { data, url } = pageInfo;
  const [selectedText, setSelectedText] = useState(data.selectedText || '');
  const WORD_LIMIT = 100;
  const wordCount = selectedText.trim().split(/\s+/).filter(Boolean).length;
  const isOverLimit = wordCount > WORD_LIMIT;

  const handleContinue = () => {
    if (!selectedText.trim() || isOverLimit) return;
    onReady({
      source_url: url,
      source_type: 'article',
      title: data.title,
      author: data.author,
      article_text: selectedText,
    });
  };

  return (
    <div className="p-4 flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span className="badge badge-article">Article</span>
        <span className="text-xs text-text-secondary truncate">{data.title}</span>
      </div>

      <div className="bg-bg-surface border border-border rounded-lg p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <p className="text-xs text-text-muted font-medium uppercase tracking-wide">Selected text</p>
          <span className={`font-mono text-xs font-medium ${isOverLimit ? 'text-claim' : 'text-text-muted'}`}>
            {wordCount} / {WORD_LIMIT} words
          </span>
        </div>

        <textarea
          value={selectedText}
          onChange={(e) => setSelectedText(e.target.value)}
          placeholder="Highlight text on the page, or paste it here..."
          rows={6}
          className={`input resize-none text-sm leading-relaxed ${isOverLimit ? 'border-claim' : ''}`}
        />

        <div className="w-full h-1 bg-bg-raised rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${isOverLimit ? 'bg-claim' : 'bg-accent'}`}
            style={{ width: `${Math.min((wordCount / WORD_LIMIT) * 100, 100)}%` }}
          />
        </div>

        {isOverLimit && (
          <div className="bg-claim/10 border border-claim/20 rounded-md p-3">
            <p className="text-xs text-claim font-medium">Over 100 words</p>
            <p className="text-xs text-text-muted mt-0.5">
              Trim to {WORD_LIMIT} words, or split into multiple clips and thread them together.
            </p>
          </div>
        )}
      </div>

      <div className="annotation-mark bg-bg-surface rounded-r-lg p-3">
        <p className="text-xs text-text-muted">Tip: Highlight text on the page first, then open the panel.</p>
      </div>

      <button
        onClick={handleContinue}
        disabled={!selectedText.trim() || isOverLimit}
        className="btn-primary w-full disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Continue to Annotate →
      </button>
    </div>
  );
}
