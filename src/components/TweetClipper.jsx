export default function TweetClipper({ pageInfo, onReady }) {
  const { data, url } = pageInfo;
  const title = String(data.title || '').trim();

  const handleContinue = () => {
    onReady({
      source_url: url,
      source_type: 'social',
      title: title || 'X post',
      author: data.author || data.handle || null,
      article_text: title || null,
    });
  };

  return (
    <div className="p-4 flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span className="badge badge-social">X post</span>
        <span className="text-xs text-text-secondary truncate">{data.handle ? `@${data.handle}` : 'x.com'}</span>
      </div>

      <div className="bg-bg-surface border border-border rounded-lg p-4 flex flex-col gap-2">
        <p className="text-xs text-text-muted font-medium uppercase tracking-wide">Post</p>
        <p className="text-sm text-text-primary leading-relaxed whitespace-pre-wrap">{title || 'This post will be embedded on Annotated.'}</p>
        <p className="text-xs text-text-muted truncate">{url}</p>
      </div>

      <div className="annotation-mark bg-bg-surface rounded-r-lg p-3">
        <p className="text-xs text-text-muted">Tip: X posts embed automatically on Annotated — no need to highlight anything.</p>
      </div>

      <button onClick={handleContinue} className="btn-primary w-full">
        Continue to Annotate →
      </button>
    </div>
  );
}
