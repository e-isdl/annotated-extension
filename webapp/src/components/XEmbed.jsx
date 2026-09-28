import { useEffect, useRef, useState } from 'react';
import { xEmbedSrc } from '../lib/social';

const FALLBACK_HEIGHT = 560;
const MIN_HEIGHT = 180;
const MAX_HEIGHT = 1400;
const HEIGHT_BUFFER = 16;
const EMBED_ORIGIN = 'https://platform.twitter.com';

export default function XEmbed({ url }) {
  const frameRef = useRef(null);
  const [height, setHeight] = useState(FALLBACK_HEIGHT);
  const src = xEmbedSrc(url);

  useEffect(() => {
    if (!src) return undefined;
    function onMessage(event) {
      if (event.origin !== EMBED_ORIGIN) return;
      if (!frameRef.current || event.source !== frameRef.current.contentWindow) return;
      const payload = event.data && event.data['twttr.embed'];
      if (!payload || payload.method !== 'twttr.private.resize') return;
      const next = Number(payload.params?.[0]?.height);
      if (Number.isFinite(next) && next > 0) {
        setHeight(Math.min(Math.max(next, MIN_HEIGHT), MAX_HEIGHT));
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [src]);

  if (!src) return null;

  return (
    <iframe
      ref={frameRef}
      className="x-embed"
      title="Embedded X post"
      src={src}
      loading="lazy"
      style={{ height: height + HEIGHT_BUFFER }}
    />
  );
}
