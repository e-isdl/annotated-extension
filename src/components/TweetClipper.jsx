import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

const CAPTURE_TIMEOUT_MS = 20000;
const MAX_RECORD_MS = 60000;
const RECORD_BPS = 2000000;
const MAX_CLIP_BYTES = 15 * 1024 * 1024;

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

function waitForVideoEvent(video, event, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      video.removeEventListener(event, finish);
      resolve();
    };
    video.addEventListener(event, finish);
    setTimeout(finish, timeoutMs || 8000);
  });
}

export default function TweetClipper({ pageInfo, onReady }) {
  const { data, url } = pageInfo;
  const title = String(data.title || '').trim();
  const [phase, setPhase] = useState('probing'); // probing | recording | preview | shot-working | none | failed
  const [recT, setRecT] = useState(0);
  const [recTarget, setRecTarget] = useState(0);
  const [clip, setClip] = useState(null); // { blob, mime, url, w, h, durationMs, poster }
  const [recError, setRecError] = useState(null);
  const [thumbnail, setThumbnail] = useState(null);
  const [shotState, setShotState] = useState('idle'); // idle | working | ready | text | none | failed
  const [useShot, setUseShot] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState(null);
  const tabVideoRef = useRef(null);
  const canvasRef = useRef(null);
  const recCtlRef = useRef(null);
  const startedRef = useRef(false);

  const teardownRecording = () => {
    const ctl = recCtlRef.current;
    recCtlRef.current = null;
    if (!ctl) return;
    try { clearInterval(ctl.progressId); } catch {}
    try { clearInterval(ctl.boundsId); } catch {}
    try { clearTimeout(ctl.stopTimer); } catch {}
    try { if (ctl.drawRaf) cancelAnimationFrame(ctl.drawRaf); } catch {}
    try {
      if (ctl.recorder && ctl.recorder.state !== 'inactive') ctl.recorder.stop();
    } catch {}
    try { ctl.stream?.getTracks().forEach((t) => { try { t.stop(); } catch {} }); } catch {}
    try { if (tabVideoRef.current) tabVideoRef.current.srcObject = null; } catch {}
  };

  useEffect(() => () => {
    teardownRecording();
    setClip((c) => { if (c?.url) URL.revokeObjectURL(c.url); return c; });
  }, []);

  const startRecording = async () => {
    teardownRecording();
    setRecError(null);
    setClip(null);
    setPhase('recording');
    setRecT(0);
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      try {
        if (tab?.id) await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
      } catch {}
      let probe = null;
      try {
        probe = await withTimeout(sendToActiveTab({ type: 'tweet-record-probe' }), CAPTURE_TIMEOUT_MS);
      } catch {
        probe = null;
      }
      if (!probe?.ok) {
        if (probe?.code === 'no-media') { runScreenshotFlow(); return; }
        throw new Error(probe ? 'Could not read this post.' : 'No reply from the X tab — refresh the tab and try again.');
      }
      const targetMs = Math.max(1000, Math.min(probe.durationMs || 15000, MAX_RECORD_MS));
      setRecTarget(targetMs / 1000);

      const idRes = await chrome.runtime.sendMessage({ type: 'GET_TAB_STREAM_ID' }).catch(() => null);
      if (!idRes?.ok || !idRes.streamId) throw new Error('Could not capture this tab.');

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: idRes.streamId } },
      });
      const tabVideo = tabVideoRef.current;
      if (!tabVideo) { stream.getTracks().forEach((t) => { try { t.stop(); } catch {} }); throw new Error('Recording stopped.'); }
      tabVideo.srcObject = stream;
      tabVideo.play().catch(() => {});
      await waitForVideoEvent(tabVideo, 'loadeddata', 8000);
      if (!tabVideo.videoWidth) throw new Error('Could not capture this tab.');

      const canvas = canvasRef.current || document.createElement('canvas');
      const renderScale = Math.max(1, Math.min(probe.dpr || 1, 2));
      let crop = probe.bounds;
      const sizeCanvas = () => {
        canvas.width = Math.max(2, Math.round(crop.w * renderScale));
        canvas.height = Math.max(2, Math.round(crop.h * renderScale));
      };
      sizeCanvas();
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Recording stopped.');

      const streamScale = () => (tabVideo.videoWidth || 0) / (probe.vw || 1);
      const drawFrame = () => {
        const ctl = recCtlRef.current;
        if (!ctl || ctl.stopped) return;
        try {
          const s = streamScale();
          const sx = Math.max(0, crop.x * s);
          const sy = Math.max(0, crop.y * s);
          const sw = Math.min(tabVideo.videoWidth - sx, crop.w * s);
          const sh = Math.min(tabVideo.videoHeight - sy, crop.h * s);
          if (sw > 0 && sh > 0) ctx.drawImage(tabVideo, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
        } catch {}
        ctl.drawRaf = requestAnimationFrame(drawFrame);
      };

      const mimeTypes = ['video/mp4;codecs=avc1.42E01E', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8'];
      const mimeType = mimeTypes.find((t) => {
        try { return MediaRecorder.isTypeSupported(t); } catch { return false; }
      });
      const recorder = new MediaRecorder(canvas.captureStream(30), {
        ...(mimeType ? { mimeType } : {}),
        videoBitsPerSecond: RECORD_BPS,
      });
      const chunks = [];
      const ctl = {
        stopped: false, recorder, stream, chunks, drawRaf: 0,
        progressId: null, boundsId: null, stopTimer: null, targetMs,
      };
      recCtlRef.current = ctl;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };
      recorder.onstop = () => {
        const wasCancel = ctl.stopped;
        try { clearInterval(ctl.progressId); } catch {}
        try { clearInterval(ctl.boundsId); } catch {}
        try { clearTimeout(ctl.stopTimer); } catch {}
        try { if (ctl.drawRaf) cancelAnimationFrame(ctl.drawRaf); } catch {}
        try { ctl.stream.getTracks().forEach((t) => { try { t.stop(); } catch {} }); } catch {}
        try { if (tabVideoRef.current) tabVideoRef.current.srcObject = null; } catch {}
        if (recCtlRef.current === ctl) recCtlRef.current = null;
        if (wasCancel) return;
        const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || 'video/webm' });
        if (blob.size === 0) {
          setRecError('Recording captured no video. Try again.');
          setPhase('failed');
          return;
        }
        let poster = ctl.poster || null;
        if (!poster) {
          try { poster = canvas.toDataURL('image/jpeg', 0.85); } catch {}
        }
        const actualMs = Math.min(targetMs, Date.now() - ctl.t0);
        setClip({
          blob,
          mime: recorder.mimeType || mimeType || 'video/webm',
          url: URL.createObjectURL(blob),
          w: canvas.width,
          h: canvas.height,
          durationMs: actualMs,
          poster,
        });
        setPhase('preview');
      };

      stream.getVideoTracks().forEach((track) => {
        track.addEventListener('ended', () => {
          if (recCtlRef.current === ctl && !ctl.stopped) {
            ctl.stopped = true;
            setRecError('Recording stopped — keep the tab open while recording.');
            setPhase('failed');
            teardownRecording();
          }
        });
      });

      ctl.t0 = Date.now();
      drawFrame();
      recorder.start(500);
      ctl.progressId = setInterval(() => {
        const t = (Date.now() - ctl.t0) / 1000;
        setRecT(Math.min(t, targetMs / 1000));
        if (!ctl.poster && Date.now() - ctl.t0 > 600) {
          try { ctl.poster = canvas.toDataURL('image/jpeg', 0.85); } catch {}
        }
        if (Date.now() - ctl.t0 >= targetMs) finishRecording();
      }, 200);
      ctl.boundsId = setInterval(async () => {
        try {
          const live = await sendToActiveTab({ type: 'tweet-live-bounds' });
          if (live?.ok && live.bounds) {
            crop = live.bounds;
            sizeCanvas();
          }
        } catch {}
      }, 500);
      ctl.stopTimer = setTimeout(() => finishRecording(), targetMs + 5000);
    } catch (err) {
      console.error('tweet recording failed:', err?.message || err);
      teardownRecording();
      setRecError(err?.name === 'NotAllowedError' ? 'Tab capture was blocked.' : (err?.message || 'Could not record this post.'));
      setPhase('failed');
    }
  };

  const finishRecording = () => {
    const ctl = recCtlRef.current;
    if (!ctl || ctl.stopped) return;
    try { clearTimeout(ctl.stopTimer); } catch {}
    try {
      if (ctl.recorder.state !== 'inactive') ctl.recorder.stop();
    } catch {}
  };

  const cancelRecording = () => {
    const ctl = recCtlRef.current;
    if (ctl) ctl.stopped = true;
    teardownRecording();
    setRecError('Recording cancelled.');
    setPhase('failed');
  };

  useEffect(() => {
    if (startedRef.current) return undefined;
    startedRef.current = true;
    startRecording();
    return undefined;
  }, []);

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
        else { setShotState('failed'); setPhase((p) => (clip ? p : 'failed')); if (!clip) setRecError('Screenshot unavailable.'); }
        return;
      }
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setShotState('failed'); setPhase((p) => (clip ? p : 'failed')); return; }
      const filename = `clips/thumbs/${user.id}/${Date.now()}-tweet.jpg`;
      const { error } = await supabase.storage.from('clips').upload(
        filename,
        dataUrlToBlob(result.dataUrl),
        { contentType: 'image/jpeg' },
      );
      if (error) {
        console.error('thumbnail upload failed:', error.message);
        setShotState('failed');
        setPhase((p) => (clip ? p : 'failed'));
        return;
      }
      const { data: { publicUrl } } = supabase.storage.from('clips').getPublicUrl(filename);
      setThumbnail(publicUrl);
      setShotState('ready');
      setPhase((p) => (p === 'shot-working' ? 'none' : p));
    } catch (err) {
      console.error('tweet screenshot failed:', err?.message || err);
      setShotState('failed');
      setPhase((p) => (clip ? p : 'failed'));
    }
  };

  const handleContinue = async () => {
    if (publishing) return;
    setPublishError(null);
    if (useShot || !clip) {
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
    if (clip.blob.size > MAX_CLIP_BYTES) {
      setPublishError('This recording is too big. Retake it and try again.');
      return;
    }
    setPublishing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('not signed in');
      const ext = (clip.mime || '').includes('mp4') ? 'mp4' : 'webm';
      const contentType = clip.mime || (ext === 'mp4' ? 'video/mp4' : 'video/webm');
      const stem = Date.now();
      const filename = `clips/recordings/${user.id}/${stem}-tweet.${ext}`;
      const { error: uploadError } = await supabase.storage.from('clips').upload(filename, clip.blob, { contentType });
      if (uploadError) throw uploadError;
      const mediaUrl = supabase.storage.from('clips').getPublicUrl(filename).data.publicUrl;
      let posterUrl = shotState === 'ready' ? thumbnail : null;
      if (clip.poster && !posterUrl) {
        const posterName = `clips/thumbs/${user.id}/${stem}-tweet-poster.jpg`;
        const { error: posterError } = await supabase.storage.from('clips').upload(
          posterName,
          dataUrlToBlob(clip.poster),
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
        media_w: clip.w || null,
        media_h: clip.h || null,
        media_duration_ms: Math.round(clip.durationMs) || null,
        poster_url: posterUrl,
      });
    } catch (err) {
      console.error('tweet recording upload failed:', err?.message || err);
      setPublishError('Upload failed. Check your connection and try again.');
    } finally {
      setPublishing(false);
    }
  };

  const busy = phase === 'probing' || phase === 'recording' || phase === 'shot-working';
  const canContinue = phase === 'preview' || phase === 'none' || (phase === 'failed' && (useShot || shotState === 'ready' || shotState === 'text' || shotState === 'none' || clip));

  const statusText = phase === 'probing'
    ? 'Checking this post for video…'
    : phase === 'recording'
      ? `Recording the whole tweet… ${recT.toFixed(1)}s of ${Math.ceil(recTarget)}s. Keep the tab open.`
      : phase === 'preview' && !useShot
        ? 'Tweet recorded with its video and text. It will loop silently on Annotated, like a GIF.'
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
      <video ref={tabVideoRef} muted playsInline className="fixed w-[2px] h-[2px] opacity-0 pointer-events-none left-0 top-0" aria-hidden="true" />
      <canvas ref={canvasRef} className="hidden" aria-hidden="true" />

      <div className="bg-bg-surface border border-border rounded-lg p-4 flex flex-col gap-2">
        <p className="text-xs text-text-muted font-medium uppercase tracking-wide">Post</p>
        <p className="text-sm text-text-primary leading-relaxed whitespace-pre-wrap">{title || 'This post will be shared on Annotated.'}</p>
        <p className="text-xs text-text-muted truncate">{url}</p>
      </div>

      {phase === 'preview' && clip && !useShot && (
        <div className="bg-bg-surface border border-border rounded-lg overflow-hidden">
          <video
            src={clip.url}
            loop
            muted
            playsInline
            autoPlay
            className="w-full max-h-64 object-contain bg-black"
          />
          <div className="p-3 flex items-center justify-between gap-2">
            <p className="text-xs text-text-muted">
              {clip.w > 0 ? `${clip.w}×${clip.h}` : 'Recording'} · {(clip.durationMs / 1000).toFixed(1)}s
            </p>
            <button
              type="button"
              onClick={() => { setClip((c) => { if (c?.url) URL.revokeObjectURL(c.url); return null; }); startRecording(); }}
              className="text-xs font-semibold text-accent hover:underline"
            >
              Retake
            </button>
          </div>
        </div>
      )}

      {phase === 'preview' && clip && shotState !== 'working' && shotState !== 'idle' && (
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
              <button
                type="button"
                onClick={() => { startRecording(); }}
                className="text-xs font-semibold text-accent hover:underline text-left"
              >
                Try recording again
              </button>
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
        {publishing ? 'Uploading recording…' : busy ? 'Working…' : 'Continue to Annotate →'}
      </button>
    </div>
  );
}
