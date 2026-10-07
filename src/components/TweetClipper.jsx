import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

const CAPTURE_TIMEOUT_MS = 20000;
const RECORD_MS = 5000;
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
// nothing in the tab (no content script needed at all). Video is searched
// ONLY inside this post's own article: the old page-wide "largest video"
// hunt grabbed stray players (ads, other posts) and sent photo-only posts
// down the recording path, where they hung forever at "Fitting".
async function tweetPrepFunc(a) {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const bigEnough = (v) => {
    try {
      const r = v.getBoundingClientRect();
      return r.width > 120 && r.height > 120 && r.bottom > 0 && r.top < window.innerHeight;
    } catch (e) { return false; }
  };
  // A video counts only if it behaves like media, not a placeholder:
  // real frames, playback progress, or actually playing.
  const looksAlive = (v) => {
    try {
      return (v.readyState >= 2 && v.videoWidth > 0) || v.currentTime > 0 || !v.paused;
    } catch (e) { return false; }
  };
  // This post's own article: the one linking its status timestamp. The
  // first article on the page can be a reply or promoted post, which is
  // how photo posts inherited somebody else's video.
  const statusId = String((a && a.statusId) || '');
  let post = null;
  try {
    const articles = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));
    if (statusId) {
      post = articles.find((el) => {
        try { return !!el.querySelector(`a[href$="/status/${statusId}"]`); } catch (e) { return false; }
      }) || null;
    }
    if (!post) post = articles[0] || null;
    if (post) post.scrollIntoView({ block: 'center', behavior: 'instant' });
  } catch (e) {}
  await sleep(400);
  const inPostVideos = () => (post ? Array.from(post.querySelectorAll('video')).filter(bigEnough) : []);
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
    const best = largest(inPostVideos());
    if (best && looksAlive(best)) { video = best; break; }
    await sleep(200);
  }
  if (!video) {
    const articles = document.querySelectorAll('article[data-testid="tweet"]').length;
    return { ok: false, code: 'no-media', articles, videos: 0 };
  }
  // Mark it so the capture step grabs THIS element, never a page-wide stray.
  try {
    document.querySelectorAll('video[data-annotated-target]').forEach((v) => { try { delete v.dataset.annotatedTarget; } catch (e2) {} });
    video.dataset.annotatedTarget = '1';
  } catch (e) {}
  const card = post;
  let box = null;
  let vrect = null;
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
  if (box) {
    vrect = {
      x: Math.max(0, vr.left - box.x),
      y: Math.max(0, vr.top - box.y),
      w: Math.min(box.w, vr.width),
      h: Math.min(box.h, vr.height),
    };
  }
  const bounds = box || { x: vr.left, y: vr.top, w: vr.width, h: vr.height };
  let durationMs = 0;
  const d = Number(video.duration);
  if (Number.isFinite(d) && d > 0) durationMs = Math.floor(d * 1000);
  return { ok: true, durationMs, bounds, vrect, vw: window.innerWidth, vh: window.innerHeight };

  function tweetCardBounds(root) {
    // Full card: author header through body, video, and actions. Tall
    // cards are a presentation concern and handled in the webapp.
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

async function tweetHybridFunc(a) {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const stopStream = (stream) => {
    try { stream.getTracks().forEach((t) => { try { t.stop(); } catch (e) {} }); } catch (e) {}
  };
  const removeEl = (el) => {
    try { el.pause(); } catch (e) {}
    try { el.srcObject = null; } catch (e) {}
    try { el.removeAttribute('src'); } catch (e) {}
    try { el.parentNode && el.parentNode.removeChild(el); } catch (e) {}
  };
  let video = null;
  let relay = null;
  let live = null;
  const restoreVideo = (wasPaused, wasMuted) => {
    if (!video) return;
    try { if (wasPaused) video.pause(); } catch (e) {}
    try { video.muted = wasMuted; } catch (e) {}
  };
  try {
    if (!a || !a.bg || !(a.cw > 0) || !(a.ch > 0)) return { ok: false, reason: 'args' };
    // Capture the marked video from prep (same tweet). Falls back to a video
    // inside this post's own article. Never page-wide: stray players must
    // not hijack another post's recording.
    const bigEnough = (v) => {
      try {
        const r = v.getBoundingClientRect();
        return r.width > 120 && r.height > 120 && r.bottom > 0 && r.top < window.innerHeight;
      } catch (e) { return false; }
    };
    const findVideo = () => {
      try {
        const marked = document.querySelector('video[data-annotated-target="1"]');
        if (marked && bigEnough(marked)) return marked;
      } catch (e) {}
      try {
        const post = document.querySelector('article[data-testid="tweet"]');
        if (!post) return null;
        const cands = Array.from(post.querySelectorAll('video')).filter(bigEnough);
        if (!cands.length) return null;
        cands.sort((x, y) => {
          const rx = x.getBoundingClientRect();
          const ry = y.getBoundingClientRect();
          return (ry.width * ry.height) - (rx.width * rx.height);
        });
        return cands[0];
      } catch (e) { return null; }
    };
    for (let i = 0; i < 10; i += 1) {
      video = findVideo();
      if (video) break;
      await sleep(200);
    }
    if (!video) return { ok: false, reason: 'no-video' };
    if (typeof video.captureStream !== 'function') return { ok: false, reason: 'no-capture' };
    let ready = 0;
    try { ready = video.readyState || 0; } catch (e) {}
    if (ready < 2) return { ok: false, reason: 'not-ready' };
    let wasPaused = true;
    let wasMuted = true;
    try { wasPaused = !!video.paused; } catch (e) {}
    try { wasMuted = !!video.muted; } catch (e) {}
    try { video.muted = true; await video.play(); } catch (e) {}
    try {
      live = video.captureStream();
      if (!live || !live.getVideoTracks().length) { restoreVideo(wasPaused, wasMuted); return { ok: false, reason: 'no-track' }; }
      relay = document.createElement('video');
      relay.muted = true;
      relay.playsInline = true;
      relay.preload = 'auto';
      relay.style.cssText = 'position:fixed;width:4px;height:4px;opacity:0;pointer-events:none;left:0;top:0;';
      document.documentElement.appendChild(relay);
      relay.srcObject = new MediaStream(live.getVideoTracks());
      try { await relay.play(); } catch (e) {}
      const bg = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('bg'));
        img.src = a.bg;
      });
      const canvas = document.createElement('canvas');
      canvas.width = a.cw;
      canvas.height = a.ch;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('canvas');
      const stream = canvas.captureStream(30);
      const mimeTypes = ['video/mp4;codecs=avc1.42E01E', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8'];
      let mimeType = null;
      for (const t of mimeTypes) {
        try { if (MediaRecorder.isTypeSupported(t)) { mimeType = t; break; } } catch (e) {}
      }
      const rec = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), videoBitsPerSecond: 3000000 });
      const chunks = [];
      rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      const stopped = new Promise((resolve) => { rec.onstop = () => resolve(); });
      try { ctx.drawImage(bg, 0, 0, a.cw, a.ch); ctx.drawImage(relay, a.vx, a.vy, a.vw, a.vh); } catch (e) {}
      rec.start(250);
      const t0 = Date.now();
      let poster = null;
      await new Promise((resolve) => {
        const frame = () => {
          try {
            ctx.drawImage(bg, 0, 0, a.cw, a.ch);
            ctx.drawImage(relay, a.vx, a.vy, a.vw, a.vh);
          } catch (e) {}
          if (!poster && Date.now() - t0 > 600) {
            try { poster = canvas.toDataURL('image/jpeg', 0.85); } catch (e) {}
          }
          if (Date.now() - t0 < a.ms) requestAnimationFrame(frame);
          else resolve();
        };
        requestAnimationFrame(frame);
      });
      try { if (rec.state !== 'inactive') rec.stop(); } catch (e) {}
      await stopped;
      restoreVideo(wasPaused, wasMuted);
      removeEl(relay);
      relay = null;
      stopStream(live);
      live = null;
      stopStream(stream);
      const out = new Blob(chunks, { type: rec.mimeType || mimeType || 'video/webm' });
      if (!out.size) return { ok: false, reason: 'empty' };
      const buf = await out.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let bin = '';
      for (let i = 0; i < bytes.length; i += 32768) {
        bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 32768));
      }
      return { ok: true, b64: btoa(bin), mime: out.type || 'video/webm', poster, w: a.cw, h: a.ch };
    } catch (e) {
      restoreVideo(wasPaused, wasMuted);
      if (relay) { removeEl(relay); relay = null; }
      if (live) { stopStream(live); live = null; }
      return { ok: false, reason: 'record' };
    }
  } catch (e) {
    return { ok: false, reason: 'fatal' };
  }
}

function tweetBoundsFunc() {
  // Tracks the marked video from prep (same tweet). Falls back to a video
  // inside this post's own article. Never page-wide.
  const bigEnough = (v) => {
    try {
      const r = v.getBoundingClientRect();
      return r.width > 120 && r.height > 120 && r.bottom > 0 && r.top < window.innerHeight;
    } catch (e) { return false; }
  };
  let video = null;
  try {
    const marked = document.querySelector('video[data-annotated-target="1"]');
    if (marked && bigEnough(marked)) video = marked;
  } catch (e) {}
  if (!video) {
    try {
      const post = document.querySelector('article[data-testid="tweet"]');
      const cands = post ? Array.from(post.querySelectorAll('video')).filter(bigEnough) : [];
      if (!cands.length) return { ok: false };
      cands.sort((a, b) => {
        const ra = a.getBoundingClientRect();
        const rb = b.getBoundingClientRect();
        return (rb.width * rb.height) - (ra.width * ra.height);
      });
      video = cands[0];
    } catch (e) { return { ok: false }; }
  }
  if (!video) return { ok: false };
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
    setRecT(0);
    // NOTE: phase stays 'probing' through search and framing. Recording UI
    // (Cancel button, Recording… states) appears only once a video is
    // confirmed and capture actually starts.
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) throw new Error('No active tab.');
      tabIdRef.current = tab.id;
      const statusId = String(url || '').match(/\/status\/(\d+)/)?.[1] || '';
      stageRef.current = 'finding video';      try { savedZoomRef.current = await chrome.tabs.getZoom(tab.id); } catch { savedZoomRef.current = null; }
      const runPrep = async () => {        const r = await withTimeout(
          chrome.scripting.executeScript({ target: { tabId: tab.id }, func: tweetPrepFunc, args: [{ statusId }] }).catch(() => null),
          CAPTURE_TIMEOUT_MS,
        );
        return r?.[0]?.result || null;
      };
      try { await chrome.tabs.setZoom(tab.id, 1.1); } catch {}
      await new Promise((resolve) => setTimeout(resolve, 350));
      let prep = await runPrep();
      if (!prep?.ok) {
        if (prep?.code === 'no-media') { await restoreZoom(tab.id); runScreenshotFlow(); return; }
        throw new Error('Could not read this post.');
      }
      // Video confirmed: framing text may show from here on.
      setFitting(true);
      const ZOOM_STEPS = [1.0, 0.9, 0.8, 0.75, 0.67];
      let zi = 0;
      const fitDeadline = Date.now() + 25000;
      while (prep.bounds.y + prep.bounds.h > prep.vh - 8 && zi < ZOOM_STEPS.length && Date.now() < fitDeadline) {
        try { await chrome.tabs.setZoom(tab.id, ZOOM_STEPS[zi]); } catch {}
        zi += 1;
        await new Promise((resolve) => setTimeout(resolve, 350));
        const next = await runPrep();
        if (!next?.ok) break;
        prep = next;
      }
      if (Date.now() >= fitDeadline) throw new Error('Could not frame this post.');
      setFitting(false);
      // Video confirmed by prep: only now does the recording UI appear.
      setPhase('recording');
      const targetMs = RECORD_MS;

      const rs = Math.min(2, 1100 / prep.bounds.w);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(2, Math.round(prep.bounds.w * rs));
      canvas.height = Math.max(2, Math.round(prep.bounds.h * rs));
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Recording stopped.');

      const loadImg = (src) => new Promise((resolve, reject) => {
        const im = new Image();
        im.onload = () => resolve(im);
        im.onerror = () => reject(new Error('bg'));
        im.src = src;
      });

      // Hybrid take: one crisp card shot as the backdrop, the live video
      // frames composited over it at full frame rate in the page. Falls
      // through to the shot loop below when live capture is unavailable.
      if (prep.vrect) {
        const hybridCtl = { stopped: false };
        recCtlRef.current = hybridCtl;
        const hybridTick = setInterval(() => {
          setRecT((t) => Math.min(t + 0.2, (RECORD_MS - 100) / 1000));
        }, 200);
        try {
          stageRef.current = 'recording video';
          const bgShot = await chrome.runtime.sendMessage({ type: 'TWEET_RECORD_SHOT' }).catch(() => null);
          if (!bgShot?.ok || !bgShot.dataUrl) throw new Error('bg-shot');
          const bgImg = await loadImg(bgShot.dataUrl);
          const bs = bgImg.naturalWidth / prep.vw;
          const bgCanvas = document.createElement('canvas');
          bgCanvas.width = canvas.width;
          bgCanvas.height = canvas.height;
          const bctx = bgCanvas.getContext('2d');
          if (!bctx) throw new Error('bg-canvas');
          bctx.drawImage(
            bgImg,
            Math.max(0, prep.bounds.x * bs), Math.max(0, prep.bounds.y * bs),
            Math.min(bgImg.naturalWidth, prep.bounds.w * bs), Math.min(bgImg.naturalHeight, prep.bounds.h * bs),
            0, 0, canvas.width, canvas.height,
          );
          const bgDataUrl = bgCanvas.toDataURL('image/jpeg', 0.9);
          const hRes = await withTimeout(
            chrome.scripting.executeScript({
              target: { tabId: tab.id },
              func: tweetHybridFunc,
              args: [{
                bg: bgDataUrl,
                vx: Math.round(prep.vrect.x * rs),
                vy: Math.round(prep.vrect.y * rs),
                vw: Math.round(prep.vrect.w * rs),
                vh: Math.round(prep.vrect.h * rs),
                cw: canvas.width,
                ch: canvas.height,
                ms: RECORD_MS,
              }],
            }).catch(() => null),
            60000,
          );
          const hybrid = hRes?.[0]?.result || null;
          clearInterval(hybridTick);
          if (hybridCtl.stopped || recCtlRef.current !== hybridCtl) return;
          if (hybrid?.ok && hybrid.b64) {
            const bin = atob(hybrid.b64);
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
            const blob = new Blob([bytes], { type: hybrid.mime || 'video/webm' });
            if (blob.size > 0) {
              setClip({
                blob,
                mime: hybrid.mime || 'video/webm',
                url: URL.createObjectURL(blob),
                w: hybrid.w || canvas.width,
                h: hybrid.h || canvas.height,
                durationMs: RECORD_MS,
                poster: hybrid.poster || null,
              });
              restoreZoom(tab.id);
              setPhase('preview');
              return;
            }
          }
        } catch {}
        clearInterval(hybridTick);
        if (recCtlRef.current === hybridCtl) recCtlRef.current = null;
        setRecT(0);
      }

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
          const reason = `Recording failed at capturing: ${lastShotError || 'no frames'}.`;
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
      let misses = 0;
      let lastShotError = null;
      stageRef.current = 'capturing';
      while (Date.now() - ctl.t0 < targetMs) {
        if (ctl.stopped) break;
        let dataUrl = null;
        try {
          const shot = await chrome.runtime.sendMessage({ type: 'TWEET_RECORD_SHOT' }).catch(() => null);
          if (shot?.ok && shot.dataUrl) dataUrl = shot.dataUrl;
          else if (shot && !shot.ok && shot.error) lastShotError = shot.error;
        } catch { dataUrl = null; }
        if (!dataUrl) {
          misses += 1;
          if ((frames === 0 && misses >= 3) || misses >= 10) break;
          await new Promise((resolve) => setTimeout(resolve, 150));
          continue;
        }
        misses = 0;
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
      restoreZoom(tab.id);
      setRecError('Recording stopped. Keep the X tab open while recording.');
        setPhase('failed');
        return;
      }
      restoreZoom(tab.id);
      stageRef.current = 'finishing';
      try { if (recorder.state !== 'inactive') recorder.stop(); } catch {}
    } catch (err) {
      console.error('[tweet-record] failed:', err?.name || '', err?.message || err);
      teardownRecording();
      restoreZoom();
      const raw = err?.name && err.name !== 'Error' ? ` (${err.name})` : '';
      const stage = stageRef.current || 'starting';
      const reason = stage === 'finding video'
        ? `No video found in this post.${raw}`
        : `Could not finish recording the video.${raw}`;
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
    ? 'Looking for video in this post…'
      : phase === 'recording'
        ? (fitting ? 'Found video. Framing the post for capture…' : `Recording the post video… ${Math.floor(recT)}s`)
      : phase === 'preview'
        ? 'Video captured. It will loop silently, like a GIF.'
          : phase === 'shot-working'
            ? 'No video here. Taking a screenshot instead…'
              : phase === 'none'
                ? (shotFallback
                  ? `${recError || 'Recording failed.'} Using a screenshot instead.`
                  : shotState === 'ready'
                    ? 'Screenshot ready.'
                    : 'Text-only post. Nothing to capture.')
              : phase === 'failed'
                ? (recError || 'Recording unavailable. Try again below.')
                : null;

  return (
    <div className="p-4 flex flex-col gap-4">
      <div data-tour="tw-post" className="bg-bg-surface border border-border rounded-lg p-4 flex flex-col gap-2">
        <p className="text-xs text-text-muted font-medium uppercase tracking-wide">Post</p>
        <p className="text-sm text-text-primary leading-relaxed whitespace-pre-wrap">{title || 'This post will be shared on Annotated.'}</p>
        <p className="text-xs text-text-muted truncate">{url}</p>
      </div>

      {phase === 'preview' && clip && (
        <div data-tour="tw-preview" className="bg-bg-surface border border-border rounded-lg overflow-hidden">
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
        data-tour="tw-continue"
        className="btn-primary w-full disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {publishing ? 'Uploading recording…' : phase === 'recording' ? 'Recording…' : phase === 'shot-working' ? 'Capturing screenshot…' : busy ? 'Working…' : 'Continue to Annotate →'}
      </button>
    </div>
  );
}
