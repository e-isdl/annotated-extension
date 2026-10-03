const PLATFORMS = {
  youtube: {
    word: 'YouTube',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M23 12s0-3.9-.5-5.6a2.9 2.9 0 0 0-2-2.1c-1.8-.5-8.5-.5-8.5-.5s-6.7 0-8.5.5a2.9 2.9 0 0 0-2 2.1C1 8.1 1 12 1 12s0 3.9.5 5.6a2.9 2.9 0 0 0 2 2.1c1.8.5 8.5.5 8.5.5s6.7 0 8.5-.5a2.9 2.9 0 0 0 2-2.1C23 15.9 23 12 23 12ZM9.8 15.5v-7l6 3.5-6 3.5Z" />
      </svg>
    ),
  },
  article: {
    word: 'Article',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="4" y="3" width="16" height="18" rx="2" />
        <path d="M8 8h8M8 12h8M8 16h5" />
      </svg>
    ),
  },
  x: {
    word: 'X',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M18.9 2H22l-6.8 7.8L23.3 22h-6.3l-4.9-6.4L6.5 22H3.4l7.3-8.3L1 2h6.5l4.4 5.9L18.9 2Zm-1.1 18.1h1.7L6.3 3.8H4.5l13.3 16.3Z" />
      </svg>
    ),
  },
  podcast: {
    word: 'Podcast',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 3a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3Z" />
        <path d="M6 11a6 6 0 0 0 12 0M12 17v4" />
      </svg>
    ),
  },
};

export default function FlowHeader({ step, pageInfo, onBackToFirst }) {
  if (!pageInfo) return null;

  const isTake = step === 'annotate';
  const firstLabel = pageInfo.type === 'article' || pageInfo.type === 'x' ? 'Quote' : 'Clip';
  const platform = PLATFORMS[pageInfo.type] || PLATFORMS.article;
  const title = pageInfo.data?.title || pageInfo.url || '';
  const heading = isTake ? 'Say what you think.' : firstLabel === 'Quote' ? 'Pick your quote.' : 'Which part matters?';

  return (
    <div className="flow-pad">
      <div className="flow-rail" aria-label="Progress">
        {isTake ? (
          <button type="button" className="flow-stop" onClick={onBackToFirst} aria-label={`Back to ${firstLabel}`}>
            <span className="flow-dot is-filled" />
            <span className="flow-label">{firstLabel}</span>
          </button>
        ) : (
          <span className="flow-stop">
            <span className="flow-dot is-filled" />
            <span className="flow-label is-current">{firstLabel}</span>
          </span>
        )}
        <span className={`flow-line${isTake ? ' is-done' : ''}`} />
        <span className="flow-stop">
          <span className={`flow-dot${isTake ? ' is-filled' : ''}`} />
          <span className={`flow-label${isTake ? ' is-current' : ''}`}>Take</span>
        </span>
      </div>

      <div className="source-strip">
        <div className="source-strip-row">
          <span className="source-strip-icon">{platform.icon}</span>
          <span className="source-strip-platform">{platform.word}</span>
        </div>
        <p className="source-strip-title">{title}</p>
      </div>

      <h1 className="flow-heading">{heading}</h1>
    </div>
  );
}
