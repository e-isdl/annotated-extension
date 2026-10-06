import { useEffect, useState } from 'react';
import AudioPlayer from './AudioPlayer';

const SPOTIFY_GREEN = 'var(--play)';

// Spotify oEmbed responses, cached per source URL so a feed of episodes
// fetches each show page once. Falls back silently to no artwork.
const oembedCache = new Map();

function cleanTitle(raw) {
  return String(raw || '')
    .replace(/\s*[|｜]\s*Podcast on Spotify\s*$/i, '')
    .replace(/\s*-\s*Spotify\s*$/i, '')
    .trim();
}

function useSpotifyArt(sourceUrl) {
  const [art, setArt] = useState(() => oembedCache.get(sourceUrl)?.art || null);
  const [name, setName] = useState(() => oembedCache.get(sourceUrl)?.name || null);
  useEffect(() => {
    let live = true;
    if (!sourceUrl || !/open\.spotify\.com/.test(sourceUrl)) return undefined;
    if (oembedCache.has(sourceUrl)) {
      const hit = oembedCache.get(sourceUrl);
      setArt(hit.art);
      setName(hit.name);
      return undefined;
    }
    (async () => {
      try {
        const res = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(sourceUrl)}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!live) return;
        const entry = { art: data?.thumbnail_url || null, name: data?.title || null };
        oembedCache.set(sourceUrl, entry);
        setArt(entry.art);
        setName(entry.name);
      } catch {}
    })();
    return () => { live = false; };
  }, [sourceUrl]);
  return { art, name };
}

export default function PodcastEpisode({ clip, layout = 'feed' }) {
  const src = clip.audio_url;
  const { art, name } = useSpotifyArt(clip.source_url);
  const title = cleanTitle(name || clip.title) || 'Spotify episode';
  const duration = Number(clip.duration) || 0;
  if (!src) return null;
  const detail = layout === 'detail';
  return (
    <div className={`podcast-episode${detail ? ' podcast-episode-detail' : ''}`}>
      <div className="podcast-row">
        {art ? (
          <img src={art} alt="" loading="lazy" className="podcast-art" />
        ) : (
          <div className="podcast-art podcast-art-fallback" aria-hidden="true">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <circle cx="12" cy="12" r="9" />
              <path d="M8.5 10.2c2.4-1.5 5.6-1.2 7.6.7M8.9 13c1.9-1.1 4.2-.9 5.7.5" />
            </svg>
          </div>
        )}
        <div className="podcast-main">
          <p className="podcast-title" title={title}>{title}</p>
          <p className="podcast-show">Spotify</p>
          <AudioPlayer src={src} compact={!detail} bars={detail ? 96 : 48} durationHint={duration} accent={SPOTIFY_GREEN} />
        </div>
      </div>
      <div className="podcast-foot">
        <span className="podcast-badge">
          <span className="podcast-dot" aria-hidden="true" />
          Spotify Clip
        </span>
      </div>
    </div>
  );
}
