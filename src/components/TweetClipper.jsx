import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

const CAPTURE_TIMEOUT_MS = 20000;
const MAX_LOOP_BYTES = 15 * 1024 * 1024;

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
    new Promise((_, reject) => setTimeout(() => reject(new Error('Timed out.')), ms)),
  ]);
}

async function sendToActiveTab(message) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return null;
  try {
    return await chrome.tabs.sendMessage(tab.id, message);
  } catch {
    return null;
  }
}

export default function TweetClipper({ pageInfo, onReady }) {
  const { data, url } = pageInfo;
  const title = String(data.title || '').trim();
  const [phase, setPhase] = useState('probing'); // probing | recording | preview | shot-working | shot-ready | shot-failed | none | failed
  const [recT, setRecT] = useState(0);
  const [loop, setLoop] = useState(null); // { blob, mime, url, w, h, durationMs, poster }
  const [recError, setRecError] = useState(null);
  const [thumbnail, setThumbnail] = useState(null);
  const [shotState, setShotState] = useState('idle'); // idle | working | ready | text | none | failed
  const [useShot, setUseShot] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState(null);
  const partsRef = useRef([]);
  const finishedRef = useRef(false);
  const startedRef = useRef(false);

  useEffect(() => {
    const handleConnect = (port) => {
      if (port.name !== 'annotated-tweet-recorder') return;
      const parts = [];
      partsRef.current = parts;
      finishedRef.current = false;
      port.onMessage.addListener((msg) => {
        if (msg.type === 'progress') {
          setRecT(msg.t || 0);
        } else if (msg.type === 'chunk') {
          try {
            const bin = atob(msg.data);
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
            parts[msg.i] = bytes;
          } catch {}
        } else if (msg.type === 'done') {
          finishedRef.current = true;
          const expected = typeof msg.chunks === 'number' ? msg.chunks : null;
          const ordered = [];
          let complete = true;
          if (expected !== null) {
            for (let k = 0; k < expected; k += 1) {
              if (!parts[k]) { complete = false; break; }
              ordered.push(parts[k]);
            }
          } else {
            parts.forEach((p) => { if (p) ordered.push(p); });
          }
          const totalBytes = ordered.reduce((n, p) => n + p.length, 0);
          parts.length = 0;
          if (!complete || totalBytes === 0) {
            setRecError('Recording captured no video. Try again.');
            setPhase('failed');
            return;
          }
          const mime = msg.mime || 'video/webm';
          const blob = new Blob(ordered, { type: mime });
          setLoop({
            blob,
            mime,
            url: URL.createObjectURL(blob),
            w: msg.w || 0,
            h: msg.h || 0,
            durationMs: msg.durationMs || Math.round((msg.seconds || 0) * 1000),
            poster: msg.poster || null,
          });
          setPhase('preview');
        } else if (msg.type === 'error') {
          finishedRef.current = true;
          parts.length = 0;
          setRecError(msg.message || 'Recording stopped.');
          setPhase('failed');
        }
      });
      port.onDisconnect.addListener(() => {
        if (!finishedRef.current) {
          parts.length = 0;
          setRecError('Recording stopped.');
          setPhase((p) => (p === 'recording' ? 'failed' : p));
        }
      });
    };
    chrome.runtime.onConnect.addListener(handleConnect);
    return () => {
      chrome.runtime.onConnect.removeListener(handleConnect);
    };
  }, []);

  useEffect(() => {
    if (loop?.url) return () => URL.revokeObjectURL(loop.url);
    return undefined;
  }, [loop?.url]);

  const startRecording = async () => {
    setRecError(null);
    setPhase('recording');
    setRecT(0);
    let res = null;
    try {
      res = await withTimeout(sendToActiveTab({ type: 'record-tweet-media' }), CAPTURE_TIMEOUT_MS);
    } catch {
      res = null;
    }
    if (!res?.ok) {
      if (res?.code === 'no-media') {
        runScreenshotFlow();
        return;
      }
      setRecError((res && res.message) || 'Could not record this post.');
      setPhase('failed');
    }
  };

  useEffect(() => {
    if (startedRef.current) return undefined;
    startedRef.current = true;
    startRecording();
    return undefined;
  }, []);

  const cancelRecording = async () => {
    try { await sendToActiveTab({ type: 'cancel-tweet-recording' }); } catch {}
  };

  const runScreenshotFlow = async () => {
    setPhase('shot-working');
    setShotState('working');
    try {
      const result = await withTimeout(
        chrome.runtime.sendMessage({ type: 'CAPTURE_TWEET' }).catch(() => null),
        CAPTURE_TIMEOUT_MS,
      );
      if (!result?.ok || !result.dataUrl) {
        if (result?.reason === 'too-tall') { setShotState('text'); setPhase('none'); }
        else if (result?.hasPhotos === false) { setShotState('none'); setPhase('none'); }
        else { setShotState('failed'); setPhase('failed'); if (!loop) setRecError('Screenshot unavailable.'); }
        return;
      }
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setShotState('failed'); setPhase((p) => (loop ? p : 'failed')); return; }
      const filename = `clips/thumbs/${user.id}/${Date.now()}-tweet.jpg`;
      const { error } = await supabase.storage.from('clips').upload(
        filename,
        dataUrlToBlob(result.dataUrl),
        { contentType: 'image/jpeg' },
      );
      if (error) {
        console.error('thumbnail upload failed:', error.message);
        setShotState('failed');
        setPhase((p) => (loop ? p : 'failed'));
        return;
      }
      const { data: { publicUrl } } = supabase.storage.from('clips').getPublicUrl(filename);
      setThumbnail(publicUrl);
      setShotState('ready');
      setPhase((p) => (p === 'shot-working' ? 'none' : p));
    } catch (err) {
      console.error('tweet screenshot failed:', err?.message || err);
      setShotState('failed');
      setPhase((p) => (loop ? p : 'failed'));
    }
  };

  const handleContinue = async () => {
    if (publishing) return;
    setPublishError(null);
    if (useShot || !loop) {
      onReady({
        source_url: url,
        source_type: 'social',
        title: title || 'X post',
        author: data.author || data.handle || null,
        article_text: title || null,
        thumbnail: shotState === 'ready' ? thumbnail : null,
      });
      return;
    }
    if (loop.blob.size > MAX_LOOP_BYTES) {
      setPublishError('This recording is too big. Retake it and try again.');
      return;
    }
    setPublishing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('not signed in');
      const ext = (loop.mime || '').includes('mp4') ? 'mp4' : 'webm';
      const contentType = loop.mime || (ext === 'mp4' ? 'video/mp4' : 'video/webm');
      const stem = Date.now();
      const filename = `clips/recordings/${user.id}/${stem}-tweet.${ext}`;
      const { error: uploadError } = await supabase.storage.from('clips').upload(filename, loop.blob, { contentType });
      if (uploadError) throw uploadError;
      const mediaUrl = supabase.storage.from('clips').getPublicUrl(filename).data.publicUrl;
      let posterUrl = shotState === 'ready' ? thumbnail : null;
      if (loop.poster && !posterUrl) {
        const posterName = `clips/thumbs/${user.id}/${stem}-tweet-poster.jpg`;
        const { error: posterError } = await supabase.storage.from('clips').upload(
          posterName,
          dataUrlToBlob(loop.poster),
          { contentType: 'image/jpeg' },
        );
        if (!posterError) {
          posterUrl = supabase.storage.from('clips').getPublicUrl(posterName).data.publicUrl;
        }
      }
      onReady({
        source_url: url,
        source_type: 'social',
        title: title || 'X post',
        author: data.author || data.handle || null,
        article_text: title || null,
        thumbnail: posterUrl,
        media_url: mediaUrl,
        media_kind: 'loop',
        media_w: loop.w || null,
        media_h: loop.h || null,
        media_duration_ms: loop.durationMs || null,
        poster_url: posterUrl,
      });
    } catch (err) {
      console.error('tweet loop upload failed:', err?.message || err);
      setPublishError('Upload failed. Check your connection and try again.');
    } finally {
      setPublishing(false);
    }
  };

  const busy = phase === 'probing' || phase === 'recording' || phase === 'shot-working';
  const canContinue = phase === 'preview' || phase === 'none' || (phase === 'failed' && (useShot || shotState === 'ready' || shotState === 'text' || shotState === 'none'));

  const statusText = phase === 'probing'
    ? 'Checking this post for video…'
    : phase === 'recording'
      ? `Recording a silent loop… ${recT.toFixed(1)}s of max 5s. Keep this tab in front.`
      : phase === 'preview' && !useShot
        ? 'Loop captured. It will play silently on Annotated, repeating like a GIF.'
        : phase === 'preview' && useShot
          ? 'Using the screenshot instead of the recording.'
          : phase === 'shot-working'
            ? 'No video in this post — preparing a high-quality screenshot…'
            : phase === 'none'
              ? 'No video in this post, so its text will be shown instead.'
              : phase === 'failed'
                ? (recError || 'Recording unavailable.')
                : null;

  return (
    <div className="p-4 flex flex-col gap-4">
      <div className="bg-bg-surface border border-border rounded-lg p-4 flex flex-col gap-2">
        <p className="text-xs text-text-muted font-medium uppercase tracking-wide">Post</p>
        <p className="text-sm text-text-primary leading-relaxed whitespace-pre-wrap">{title || 'This post will be shared on Annotated.'}</p>
        <p className="text-xs text-text-muted truncate">{url}</p>
      </div>

      {phase === 'preview' && loop && !useShot && (
        <div className="bg-bg-surface border border-border rounded-lg overflow-hidden">
          <video
            src={loop.url}
            loop
            muted
            playsInline
            autoPlay
            className="w-full max-h-64 object-contain bg-black"
          />
          <div className="p-3 flex items-center justify-between gap-2">
            <p className="text-xs text-text-muted">
              {loop.w > 0 ? `${loop.w}×${loop.h}` : 'Loop'} · {(loop.durationMs / 1000).toFixed(1)}s · silent
            </p>
            <button
              type="button"
              onClick={() => { setLoop((l) => { if (l?.url) URL.revokeObjectURL(l.url); return null; }); startRecording(); }}
              className="text-xs font-semibold text-accent hover:underline"
            >
              Retake
            </button>
          </div>
        </div>
      )}

      {phase === 'preview' && loop && shotState !== 'working' && shotState !== 'idle' && (
        <button
          type="button"
          onClick={() => {
            if (!useShot && shotState !== 'ready') runScreenshotFlow();
            setUseShot((v) => !v);
          }}
          className="text-xs font-semibold text-text-muted hover:text-text-primary text-left"
        >
          {useShot ? '← Use the recording instead' : 'Use a screenshot instead'}
        </button>
      )}

      {statusText && (
        <div className="annotation-mark bg-bg-surface rounded-r-lg p-3">
          <p className="text-xs text-text-muted">{statusText}</p>
          {phase === 'recording' && (
            <button
              type="button"
              onClick={cancelRecording}
              className="mt-2 text-xs font-semibold text-accent hover:underline"
            >
              Cancel recording
            </button>
          )}
          {phase === 'failed' && !useShot && (
            <div className="mt-2 flex flex-col gap-1">
              {shotState !== 'ready' && shotState !== 'working' && (
                <button
                  type="button"
                  onClick={() => { startRecording(); }}
                  className="text-xs font-semibold text-accent hover:underline text-left"
                >
                  Try recording again
                </button>
              )}
              {(shotState === 'ready' || shotState === 'idle' || shotState === 'failed') && (
                <button
                  type="button"
                  onClick={() => {
                    if (shotState !== 'ready' && shotState !== 'working') runScreenshotFlow();
                    setUseShot(true);
                  }}
                  className="text-xs font-semibold text-accent hover:underline text-left"
                >
                  Continue with a screenshot instead
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {publishError && (
        <div className="annotation-mark bg-bg-surface rounded-r-lg p-3">
          <p className="text-xs text-red-500">{publishError}</p>
        </div>
      )}

      <button
        onClick={handleContinue}
        disabled={busy || publishing || !canContinue}
        className="btn-primary w-full disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {publishing ? 'Uploading loop…' : busy ? 'Working…' : 'Continue to Annotate →'}
      </button>
    </div>
  );
}
