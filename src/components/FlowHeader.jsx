const PLATFORMS = {
  youtube: 'YouTube',
  article: 'Article',
  x: 'X',
  podcast: 'Podcast',
};

export default function FlowHeader({ step, pageInfo }) {
  if (!pageInfo) return null;

  const isTake = step === 'annotate';
  const firstLabel = pageInfo.type === 'article' || pageInfo.type === 'x' ? 'Quote' : 'Clip';
  const platform = PLATFORMS[pageInfo.type] || 'Source';
  const heading = isTake
    ? 'Say what you think.'
    : firstLabel === 'Quote'
      ? 'Pick your quote.'
      : pageInfo.data?.title || 'Which part matters?';

  return (
    <div className="flow-pad" data-tour="ext-flowhead">
      <p className="flow-eyebrow">{platform}</p>
      <h1 className="flow-heading">{heading}</h1>
    </div>
  );
}
