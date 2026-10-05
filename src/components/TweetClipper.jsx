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

// Self-contained page functions: they run via chrome.scripting and depend on
// nothing in the tab (no content script needed at all). The video is found
// page-wide (largest visible player) so a wrong article guess can never hide
// it; the card around it gives the recording bounds.
async function tweetPrepFunc() {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  try {
    const hint = document.querySelector('article[data-testid="tweet"]');
    if (hint) hint.scrollIntoView({ block: 'center', behavior: 'instant' });
  } catch (e) {}
  await sleep(400);
  const visibleVideos = () => Array.from(document.querySelectorAll('video')).filter((v) => {
    try {
      const r = v.getBoundingClientRect();
      return r.width > 120 && r.height > 120 && r.bottom > 0 && r.top < window.innerHeight;
    } catch (e) { return false; }
  });
  const largest = (list) => {
    const sorted = list.slice().sort((a, b) => {
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      return (rb.width * rb.height) - (ra.width * ra.height);
    });
    return sorted[0] || null;
  };
  let video = null;
  for (let i = 0; i < 25; i += 1) {
    const cands = visibleVideos();
    if (cands.length) {
      const best = largest(cands);
      video = best;
      try {
        if (best.readyState >= 2 || best.currentTime > 0 || !best.paused) break;
      } catch (e) { break; }
    }
    await sleep(200);
  }
  if (!video) {
    const articles = document.querySelectorAll('article[data-testid="tweet"]').length;
    return { ok: false, code: 'no-media', articles, videos: 0 };
  }
  const card = video.closest('article[data-testid="tweet"]') || document.querySelector('article[data-testid="tweet"]');
  try {
    if (video.paused) {
      video.dataset.annotatedPrev = 'paused|' + (video.muted ? 'muted' : 'sound');
      video.muted = true;
      const pr = video.play();
      if (pr && pr.catch) pr.catch(() => {});
    }
  } catch (e) {}
  let box = null;
  if (card) {
    try {
      const top = card.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({ top: Math.max(0, top - 64), behavior: 'instant' });
    } catch (e) {}
    await sleep(400);
    box = tweetCardBounds(card);
  } else {
    try { video.scrollIntoView({ block: 'center', behavior: 'instant' }); } catch (e) {}
    await sleep(400);
  }
  const vr = video.getBoundingClientRect();
  const bounds = box || { x: vr.left, y: vr.top, w: vr.width, h: vr.height };
  let durationMs = 0;
  const d = Number(video.duration);
  if (Number.isFinite(d) && d > 0) durationMs = Math.floor(d * 1000);
  return { ok: true, durationMs, bounds, vw: window.innerWidth, vh: window.innerHeight };

  function tweetCardBounds(root) {
    const parts = [
      '[data-testid="User-Name"]',
      '[data-testid="tweetText"]',
      '[data-testid="tweetPhoto"]',
      '[data-testid="card.wrapper"]',
      '[data-testid="videoPlayer"]',
      '[data-testid="videoComponent"]',
      'video',
      '[role="group"]',
    ];
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let found = false;
    parts.forEach((selector) => {
      root.querySelectorAll(selector).forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) return;
        found = true;
        if (r.left < minX) minX = r.left;
        if (r.top < minY) minY = r.top;
        if (r.right > maxX) maxX = r.right;
        if (r.bottom > maxY) maxY = r.bottom;
      });
    });
    if (!found) return null;
    return { x: minX, y: minY, w: Math.max(1, maxX - minX), h: Math.max(1, maxY - minY) };
  }
}

function tweetRestoreFunc() {
  document.querySelectorAll('video[data-annotated-prev]').forEach((v) => {
    try {
      const parts = String(v.dataset.annotatedPrev || '').split('|');
      if (parts[0] === 'paused') v.pause();
      v.muted = parts[1] === 'muted';
    } catch (e) {}
    try { delete v.dataset.annotatedPrev; } catch (e) {}
  });
  return { ok: true };
}

function tweetBoundsFunc() {
  const cands = Array.from(document.querySelectorAll('video')).filter((v) => {
    try {
      const r = v.getBoundingClientRect();
      return r.width > 120 && r.height > 120 && r.bottom > 0 && r.top < window.innerHeight;
    } catch (e) { return false; }
  });
  if (!cands.length) return { ok: false };
  cands.sort((a, b) => {
    const ra = a.getBoundingClientRect();
    const rb = b.getBoundingClientRect();
    return (rb.width * rb.height) - (ra.width * ra.height);
  });
  const video = cands[0];
  const card = video.closest('article[data-testid="tweet"]');
  if (!card) {
    const vr = video.getBoundingClientRect();
    return { ok: true, bounds: { x: vr.left, y: vr.top, w: vr.width, h: vr.height }, vw: window.innerWidth, vh: window.innerHeight };
  }
  const parts = [
    '[data-testid="User-Name"]',
    '[data-testid="tweetText"]',
    '[data-testid="videoPlayer"]',
    '[data-testid="videoComponent"]',
    'video',
    '[role="group"]',
  ];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let found = false;
  parts.forEach((selector) => {
    card.querySelectorAll(selector).forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return;
      found = true;
      if (r.left < minX) minX = r.left;
      if (r.top < minY) minY = r.top;
      if (r.right > maxX) maxX = r.right;
      if (r.bottom > maxY) maxY = r.bottom;
    });
  });
  if (!found) return { ok: false };
  return {
    ok: true,
    bounds: { x: minX, y: minY, w: Math.max(1, maxX - minX), h: Math.max(1, maxY - minY) },
    vw: window.innerWidth,
    vh: window.innerHeight,
  };
}

export default function TweetClipper({ pageInfo, onReady }) {
  const { data, url } = pageInfo;
  const title = String(data.title || '').trim();
  const [phase, setPhase] = useState('probing'); // probing | recording | preview | shot-working | none | failed
  const [recT, setRecT] = useState(0);
  const [clip, setClip] = useState(null); // { blob, mime, url, w, h, durationMs, poster }
  const [recError, setRecError] = useState(null);
  const [thumbnail, setThumbnail] = useState(null);
  const [shotState, setShotState] = useState('idle'); // idle | working | ready | text | none | failed
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState(null);
  const recCtlRef = useRef(null);
  const startedRef = useRef(false);
  const tabIdRef = useRef(null);
  const savedZoomRef = useRef(null);
  const recordErrRef = useRef(null);
  const stageRef = useRef('');
  const [fitting, setFitting] = useState(false);
  const [shotFallback, setShotFallback] = useState(false);

  const restoreVideo = async (tabId) => {
    const id = tabId || tabIdRef.current;
    if (!id) return;
    try {
      await chrome.scripting.executeScript({ target: { tabId: id }, func: tweetRestoreFunc });
    } catch {}
  };

  const restoreZoom = async (tabId) => {
    const z = savedZoomRef.current;
    const id = tabId || tabIdRef.current;
    savedZoomRef.current = null;
    if (z == null || !id) return;
    try { await chrome.tabs.setZoom(id, z); } catch {}
  };

  const teardownRecording = () => {
    const ctl = recCtlRef.current;
    recCtlRef.current = null;
    if (!ctl) return;
    ctl.stopped = true;
    try {
      if (ctl.recorder && ctl.recorder.state !== 'inactive') ctl.recorder.stop();
    } catch {}
    try { ctl.captureStream?.getTracks().forEach((t) => { try { t.stop(); } catch {} }); } catch {}
  };

  useEffect(() => () => {
    teardownRecording();
    restoreVideo();
    restoreZoom();
    setClip((c) => { if (c?.url) URL.revokeObjectURL(c.url); return c; });
  }, []);

  const startRecording = async () => {
    teardownRecording();
    setRecError(null);
    recordErrRef.current = null;
    stageRef.current = '';
    setFitting(false);
    setShotFallback(false);
    setClip(null);
    setPhase('recording');
    setRecT(0);
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) throw new Error('No active tab.');
      tabIdRef.current = tab.id;
      stageRef.current = 'finding video';      try { savedZoomRef.current = await chrome.tabs.getZoom(tab.id); } catch { savedZoomRef.current = null; }
      const runPrep = async () => {        const r = await withTimeout(
          chrome.scripting.executeScript({ target: { tabId: tab.id }, func: tweetPrepFunc }).catch(() => null),
          CAPTURE_TIMEOUT_MS,
        );
        return r?.[0]?.result || null;
      };
      try { await chrome.tabs.setZoom(tab.id, 1.1); } catch {}
      await new Promise((resolve) => setTimeout(resolve, 350));
      setFitting(true);
      let prep = await runPrep();
      if (!prep?.ok) {
        setFitting(false);
        if (prep?.code === 'no-media') { await restoreZoom(tab.id); runScreenshotFlow(); return; }
        throw new Error('Could not read this post.');
      }
      const ZOOM_STEPS = [1.0, 0.9, 0.8, 0.75, 0.67];
      let zi = 0;
      while (prep.bounds.y + prep.bounds.h > prep.vh - 8 && zi < ZOOM_STEPS.length) {
        try { await chrome.tabs.setZoom(tab.id, ZOOM_STEPS[zi]); } catch {}
        zi += 1;
        await new Promise((resolve) => setTimeout(resolve, 350));
        const next = await runPrep();
        if (!next?.ok) break;
        prep = next;
      }
      setFitting(false);
      const targetMs = Math.max(2000, Math.min(prep.durationMs || 15000, MAX_RECORD_MS));

      const rs = Math.min(2, 1100 / prep.bounds.w);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(2, Math.round(prep.bounds.w * rs));
      canvas.height = Math.max(2, Math.round(prep.bounds.h * rs));
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Recording stopped.');

      const mimeTypes = ['video/mp4;codecs=avc1.42E01E', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8'];
      const mimeType = mimeTypes.find((t) => {
        try { return MediaRecorder.isTypeSupported(t); } catch { return false; }
      });
      const captureStream = canvas.captureStream(12);
      const recorder = new MediaRecorder(captureStream, {
        ...(mimeType ? { mimeType } : {}),
        videoBitsPerSecond: RECORD_BPS,
      });
      const ctl = { stopped: false, tabGone: false, recorder, captureStream, chunks: [], poster: null, t0: Date.now() };
      recCtlRef.current = ctl;

      let frames = 0;
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) ctl.chunks.push(e.data);
      };
      recorder.onstop = () => {
        const cancelled = ctl.stopped;
        if (recCtlRef.current === ctl) recCtlRef.current = null;
        try { captureStream.getTracks().forEach((t) => { try { t.stop(); } catch {} }); } catch {}
        if (cancelled || ctl.tabGone) return;
        const blob = new Blob(ctl.chunks, { type: recorder.mimeType || mimeType || 'video/webm' });
        if (frames === 0 || blob.size === 0) {
          const reason = `Recording failed at capturing: no frames.`;
          recordErrRef.current = reason;
          setRecError(reason);
          setShotFallback(true);
          runScreenshotFlow();
          return;
        }
        let poster = ctl.poster;
        if (!poster) {
          try { poster = canvas.toDataURL('image/jpeg', 0.85); } catch { poster = null; }
        }
        setClip({
          blob,
          mime: recorder.mimeType || mimeType || 'video/webm',
          url: URL.createObjectURL(blob),
          w: canvas.width,
          h: canvas.height,
          durationMs: Date.now() - ctl.t0,
          poster,
        });
        setPhase('preview');
      };

      recorder.start(500);
      const img = new Image();
      const drawShot = (dataUrl) => new Promise((resolve) => {
        img.onload = () => {
          try {
            const s = img.naturalWidth / cropVw;
            const sx = Math.max(0, crop.x * s);
            const sy = Math.max(0, crop.y * s);
            const sw = Math.min(img.naturalWidth - sx, crop.w * s);
            const sh = Math.min(img.naturalHeight - sy, crop.h * s);
            if (sw > 0 && sh > 0) ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
          } catch {}
          resolve();
        };
        img.onerror = () => resolve();
        img.src = dataUrl;
      });

      let crop = prep.bounds;
      let cropVw = prep.vw;
      stageRef.current = 'capturing';
      while (Date.now() - ctl.t0 < targetMs) {
        if (ctl.stopped) break;
        let dataUrl = null;
        try {
          dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg', quality: 80 });
        } catch { dataUrl = null; }
        if (!dataUrl) break;
        await drawShot(dataUrl);
        frames += 1;
        if (!ctl.poster && Date.now() - ctl.t0 > 600) {
          try { ctl.poster = canvas.toDataURL('image/jpeg', 0.85); } catch {}
        }
        if (frames % 6 === 0) {
          try {
            const bRes = await chrome.scripting.executeScript({
              target: { tabId: tab.id },
              func: tweetBoundsFunc,
            }).catch(() => null);
            const b = bRes?.[0]?.result;
            if (b?.ok) { crop = b.bounds; cropVw = b.vw; }
          } catch {}
          try {
            const live = await chrome.tabs.get(tab.id);
            if (!live?.active) { ctl.tabGone = true; break; }
          } catch { ctl.tabGone = true; break; }
        }
        setRecT((Date.now() - ctl.t0) / 1000);
      }
      if (ctl.tabGone) {
        if (recCtlRef.current === ctl) recCtlRef.current = null;
        try { captureStream.getTracks().forEach((t) => { try { t.stop(); } catch {} }); } catch {}
        try { if (recorder.state !== 'inactive') recorder.stop(); } catch {}
        restoreVideo(tab.id);
        restoreZoom(tab.id);
        setRecError('Recording stopped — keep the X tab open while recording.');
        setPhase('failed');
        return;
      }
      restoreVideo(tab.id);
      restoreZoom(tab.id);
      stageRef.current = 'finishing';
      try { if (recorder.state !== 'inactive') recorder.stop(); } catch {}
    } catch (err) {
      console.error('[tweet-record] failed:', err?.name || '', err?.message || err);
      teardownRecording();
      restoreVideo();
      restoreZoom();
      const raw = err?.name && err.name !== 'Error' ? ` (${err.name})` : '';
      const reason = `Recording failed at ${stageRef.current || 'starting'}: ${err?.message || 'could not record'}${raw}`;
      recordErrRef.current = reason;
      setRecError(reason);
      setShotFallback(true);
      runScreenshotFlow();
    }
  };

  const cancelRecording = () => {
    const ctl = recCtlRef.current;
    if (ctl) ctl.stopped = true;
    teardownRecording();
    restoreVideo();
    restoreZoom();
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
        else { setShotState('failed'); setPhase('failed'); setRecError(recordErrRef.current || 'Screenshot unavailable.'); }
        return;
      }
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setShotState('failed'); setPhase('failed'); return; }
      const filename = `clips/thumbs/${user.id}/${Date.now()}-tweet.jpg`;
      const { error } = await supabase.storage.from('clips').upload(
        filename,
        dataUrlToBlob(result.dataUrl),
        { contentType: 'image/jpeg' },
      );
      if (error) {
        console.error('thumbnail upload failed:', error.message);
        setShotState('failed');
        setPhase('failed');
        return;
      }
      const { data: { publicUrl } } = supabase.storage.from('clips').getPublicUrl(filename);
      setThumbnail(publicUrl);
      setShotState('ready');
      setPhase('none');
    } catch (err) {
      console.error('tweet screenshot failed:', err?.message || err);
      setShotState('failed');
      setPhase('failed');
      setRecError(recordErrRef.current || 'Screenshot unavailable.');
    }
  };

  const handleContinue = async () => {
    if (publishing) return;
    setPublishError(null);
    if (!clip) {
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
  const canContinue = phase === 'preview' || phase === 'none';

  const statusText = phase === 'probing'
    ? 'Checking this post for video…'
      : phase === 'recording'
        ? (fitting ? 'Fitting the tweet…' : `Recording… ${Math.floor(recT)}s`)
      : phase === 'preview'
        ? 'Tweet recorded with its video and text. It will loop silently on Annotated, like a GIF.'
          : phase === 'shot-working'
            ? 'No video in this post — preparing a high-quality screenshot…'
              : phase === 'none'
                ? (shotFallback
                  ? `${recError || 'Recording failed.'} A screenshot will be used instead.`
                  : 'No video in this post, so its text will be shown instead.')
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

      {phase === 'preview' && clip && (
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
              {clip.w > 0 ? `${clip.w}×${clip.h}` : 'Recording'} · {(clip.durationMs / 1000).toFixed(1)}s · silent
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
          {phase === 'failed' && (
            <div className="mt-2 flex flex-col gap-1">
              <button
                type="button"
                onClick={() => { startRecording(); }}
                className="text-xs font-semibold text-accent hover:underline text-left"
              >
                Try recording again
              </button>
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
