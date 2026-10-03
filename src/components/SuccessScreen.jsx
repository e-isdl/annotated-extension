export default function SuccessScreen({ clip, onReset }) {
  const postKey = clip?.slug || clip?.id;
  const postPath = clip?.handle ? `/@${String(clip.handle).toLowerCase()}/post/${postKey}` : `/post/${postKey}`;
  const postUrl = `https://annotated4.pages.dev${postPath}`;

  return (
    <div className="flex flex-col items-center justify-center h-full px-6 gap-4 text-center">
      <div className="w-14 h-14 rounded-full bg-success/10 flex items-center justify-center">
        <span className="text-2xl">✓</span>
      </div>
      <h2 className="text-lg font-bold text-text-primary">Post published!</h2>
      <p className="text-sm text-text-secondary">Your post is now live on Annotated.</p>

      <a
        href={postUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="btn-primary w-full"
      >
        View on Annotated →
      </a>

      <button onClick={onReset} className="btn-ghost w-full">
        Create another clip
      </button>
    </div>
  );
}
