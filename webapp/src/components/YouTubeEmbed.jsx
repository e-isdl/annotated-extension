export default function YouTubeEmbed({ videoId, startSec, endSec, muted = true, autoplay = false }) {
  const start = startSec || 0;
  const end = endSec || 0;
  const params = new URLSearchParams({
    start: String(start),
    autoplay: autoplay ? '1' : '0',
    mute: muted ? '1' : '0',
    rel: '0',
    modestbranding: '1',
    vq: 'hd720',
  });
  if (end > start) {
    params.set('end', String(end));
  }

  return (
    <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
      <iframe
        src={`https://www.youtube.com/embed/${videoId}?${params.toString()}`}
        className="absolute inset-0 w-full h-full"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        title="YouTube clip"
      />
    </div>
  );
}
