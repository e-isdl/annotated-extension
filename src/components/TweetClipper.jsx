import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

const CAPTURE_TIMEOUT_MS = 15000;

function dataUrlToBlob(dataUrl) {
  const [head, base64] = String(dataUrl).split(',');
  const mime = (head.match(/data:([^;]+)/) || [])[1] || 'image/png';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Screenshot timed out.')), ms)),
  ]);
}

export default function TweetClipper({ pageInfo, onReady }) {
  const { data, url } = pageInfo;
  const title = String(data.title || '').trim();
  const [capture, setCapture] = useState('working');
  const [thumbnail, setThumbnail] = useState(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return undefined;
    startedRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        const result = await withTimeout(
          chrome.runtime.sendMessage({ type: 'CAPTURE_TWEET' }).catch(() => null),
          CAPTURE_TIMEOUT_MS,
        );
        if (cancelled) return;
        if (!result?.ok || !result.dataUrl) {
          setCapture(result?.hasPhotos === false ? 'none' : 'failed');
          return;
        }
        const { data: { user } } = await supabase.auth.getUser();
        if (cancelled) return;
        if (!user) { setCapture('failed'); return; }
        const filename = `clips/thumbs/${user.id}/${Date.now()}-tweet.png`;
        const { error } = await supabase.storage.from('clips').upload(
          filename,
          dataUrlToBlob(result.dataUrl),
          { contentType: 'image/png' },
        );
        if (cancelled) return;
        if (error) {
          console.error('thumbnail upload failed:', error.message);
          setCapture('failed');
          return;
        }
        const { data: { publicUrl } } = supabase.storage.from('clips').getPublicUrl(filename);
        if (cancelled) return;
        setThumbnail(publicUrl);
        setCapture('ready');
      } catch (err) {
        console.error('tweet screenshot failed:', err?.message || err);
        if (!cancelled) setCapture('failed');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleContinue = () => {
    onReady({
      source_url: url,
      source_type: 'social',
      title: title || 'X post',
      author: data.author || data.handle || null,
      article_text: title || null,
      thumbnail: capture === 'ready' ? thumbnail : null,
    });
  };

  const busy = capture === 'working';

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

      {busy && (
        <div className="annotation-mark bg-bg-surface rounded-r-lg p-3">
          <p className="text-xs text-text-muted">Capturing a screenshot of this post for the thumbnail…</p>
        </div>
      )}
      {!busy && capture === 'ready' && (
        <div className="annotation-mark bg-bg-surface rounded-r-lg p-3">
          <p className="text-xs text-text-muted">Screenshot captured — it will be the thumbnail of your post.</p>
        </div>
      )}
      {!busy && capture !== 'ready' && (
        <div className="annotation-mark bg-bg-surface rounded-r-lg p-3">
          <p className="text-xs text-text-muted">Tip: posts with photos get an automatic screenshot as their thumbnail — no need to highlight anything.</p>
        </div>
      )}

      <button
        onClick={handleContinue}
        disabled={busy}
        className="btn-primary w-full disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {busy ? 'Preparing screenshot…' : 'Continue to Annotate →'}
      </button>
    </div>
  );
}
