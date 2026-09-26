import { youtubeEmbedUrl } from '../lib/youtubeEmbedUrl';

export default function YouTubeEmbed({ videoId, startSec, endSec, muted = true, autoplay = false }) {
  return (
    <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
      <iframe
        src={youtubeEmbedUrl(videoId, { startSec, endSec, muted, autoplay })}
        className="absolute inset-0 w-full h-full"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        title="Source video"
      />
    </div>
  );
}
