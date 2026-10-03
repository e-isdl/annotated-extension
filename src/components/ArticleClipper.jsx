import { useState, useEffect } from 'react';

export default function ArticleClipper({ pageInfo, onReady }) {
  const { data, url } = pageInfo;
  const [selectedText, setSelectedText] = useState(data.selectedText || '');

  const WORD_LIMIT = 200;

  useEffect(() => {
    if (data.selectedText && data.selectedText !== selectedText) {
      setSelectedText(data.selectedText);
    }
  }, [data.selectedText]);

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
      thumbnail: data.ogImage || null,
    });
  };

  return (
    <div className="p-6 flex flex-col gap-5">
      <div className="bg-bg-surface border border-border rounded-xl p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-text-muted font-medium uppercase tracking-wide">Selected text</p>
          <span className={`font-mono text-sm font-medium ${isOverLimit ? 'text-claim' : 'text-text-muted'}`}>
            {wordCount} / {WORD_LIMIT} words
          </span>
        </div>

        <textarea
          value={selectedText}
          onChange={(e) => setSelectedText(e.target.value)}
          placeholder="Highlight text on the page, or paste it here..."
          rows={8}
          className={`input resize-none text-base leading-relaxed ${isOverLimit ? 'border-claim' : ''}`}
        />

        <div className="w-full h-2 bg-bg-raised rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-200 ${isOverLimit ? 'bg-claim' : 'bg-accent'}`}
            style={{ width: `${Math.min((wordCount / WORD_LIMIT) * 100, 100)}%` }}
          />
        </div>

        {isOverLimit && (
          <div className="bg-claim/10 border border-claim/20 rounded-lg p-4">
            <p className="text-sm font-medium text-claim">Over 200 words</p>
            <p className="text-sm text-text-secondary mt-1">
              Trim to {WORD_LIMIT} words, or split into multiple clips and thread them together.
            </p>
          </div>
        )}
      </div>

      <div className="annotation-mark bg-bg-surface rounded-r-xl p-4">
        <p className="text-sm text-text-secondary">Tip: Highlight text on the page first, then open the panel.</p>
      </div>

      <button
        onClick={handleContinue}
        disabled={!selectedText.trim() || isOverLimit}
        className="btn-primary w-full disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Continue to Annotate
      </button>
    </div>
  );
}
