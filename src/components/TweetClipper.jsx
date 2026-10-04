import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

const CAPTURE_TIMEOUT_MS = 20000;

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

export default function TweetClipper({ pageInfo, onReady, onSave }) {
  const { data, url } = pageInfo;
  const title = String(data.title || '').trim();
  const [capture, setCapture] = useState('working');
  const [thumbnail, setThumbnail] = useState(null);
  const [saving, setSaving] = useState(false);
  const [stashError, setStashError] = useState('');
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
          if (result?.reason === 'too-tall') setCapture('text');
          else if (result?.hasPhotos === false) setCapture('none');
          else setCapture('failed');
          return;
        }
        const { data: { user } } = await supabase.auth.getUser();
        if (cancelled) return;
        if (!user) { setCapture('failed'); return; }
        const filename = `clips/thumbs/${user.id}/${Date.now()}-tweet.jpg`;
        const { error } = await supabase.storage.from('clips').upload(
          filename,
          dataUrlToBlob(result.dataUrl),
          { contentType: 'image/jpeg' },
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

  const handleStash = async () => {
    if (busy || saving) return;
    setSaving(true);
    setStashError('');
    try {
      await onSave({
        source_url: url,
        source_type: 'social',
        title: title || 'X post',
        author: data.author || data.handle || null,
        article_text: title || null,
        thumbnail: capture === 'ready' ? thumbnail : null,
      });
    } catch (e) {
      setStashError(e.message || 'Could not stash this clip.');
    } finally {
      setSaving(false);
    }
  };

  const busy = capture === 'working';

  return (
    <div className="p-4 flex flex-col gap-4">
      <div className="bg-bg-surface border border-border rounded-lg p-4 flex flex-col gap-2">
        <p className="text-xs text-text-muted font-medium uppercase tracking-wide">Post</p>
        <p className="text-sm text-text-primary leading-relaxed whitespace-pre-wrap">{title || 'This post will be embedded on Annotated.'}</p>
        <p className="text-xs text-text-muted truncate">{url}</p>
      </div>

      {(() => {
        const statusText = busy
          ? 'Preparing a high-quality screenshot of this post…'
          : capture === 'ready'
            ? 'Screenshot captured. It will be the thumbnail of your post.'
            : capture === 'text'
              ? 'This post is taller than the screen, so its text will be shown instead of a picture.'
              : capture === 'none'
                ? 'No photo or video in this post, so its text will be shown instead.'
                : capture === 'failed'
                  ? 'Screenshot unavailable, so the text will be shown instead.'
                  : null;
        if (!statusText) return null;
        return (
          <div className="annotation-mark bg-bg-surface rounded-r-lg p-3">
            <p className="text-xs text-text-muted">{statusText}</p>
          </div>
        );
      })()}

      <button
        onClick={handleContinue}
        disabled={busy}
        className="btn-primary w-full disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {busy ? 'Preparing screenshot…' : 'Continue to Annotate →'}
      </button>
      <button
        onClick={handleStash}
        disabled={busy || saving}
        className="btn-ghost w-full disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {saving ? 'Stashing…' : 'Stash for later'}
      </button>
      {stashError && <p className="text-sm text-[var(--red)] text-center">{stashError}</p>}
    </div>
  );
}
