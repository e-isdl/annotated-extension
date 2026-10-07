{
function detectPageInfo() {
  const url = window.location.href;
  const info = { url, type: 'unknown', data: {} };

  if (url.includes('youtube.com/watch')) {
    const params = new URLSearchParams(window.location.search);
    const videoId = params.get('v');
    const title = document.title.replace(' - YouTube', '').replace(/^\(\d+\)\s*/, '');
    info.type = 'youtube';
    info.data = { videoId, title, duration: getDurationFromPage(), adPlaying: isAdPlaying() };
    return info;
  }

  if (url.includes('youtube.com/shorts')) {
    const parts = url.split('/');
    const videoId = parts[parts.length - 1];
    info.type = 'youtube';
    info.data = { videoId, title: document.title, duration: getDurationFromPage(), adPlaying: isAdPlaying() };
    return info;
  }

  const statusMatch = matchStatusUrl(url);
  if (statusMatch) {
    info.type = 'x';
    const poster = tweetPosterFromPage();
    info.data = {
      handle: (poster && poster.handle) || statusMatch.handle,
      statusId: statusMatch.statusId,
      title: tweetTextFromPage() || cleanXTitle(document.title),
      author: (poster && poster.handle) || statusMatch.handle,
      authorName: (poster && poster.name) || '',
    };
    return info;
  }

  // Spotify serves audio through encrypted MSE with no plain <audio src>,
  // so ANY Spotify page opens the recorder (episode, show, album, track,
  // playlist). Articles never apply here.
  const spotifyMatch = String(url || '').match(/open\.spotify\.com\/([A-Za-z0-9_-]+)(?:\/([A-Za-z0-9]+))?/);
  const spotifyKind = spotifyMatch[1] || '';
  const spotifyId = spotifyMatch[2] || null;
  if (spotifyKind === 'intl') {
    // Localized marketing path (/intl/...), not playable content: fall through.
  } else {
    let title = '';
    try { title = document.querySelector('meta[property="og:title"]')?.content || ''; } catch (e) {}
    if (!title) {
      try { title = document.querySelector('meta[name="twitter:title"]')?.content || ''; } catch (e) {}
    }
    if (!title) title = String(document.title || '').replace(/\s*-\s*Spotify\s*$/, '').trim();
    info.type = 'podcast';
    info.data = {
      episodeId: spotifyKind === 'episode' ? spotifyId : null,
      showId: spotifyKind === 'show' ? spotifyId : null,
      kind: spotifyKind || 'page',
      title: title || 'Spotify',
      duration: 0,
      provider: 'spotify',
    };
    return info;
  }

  const audioEl = document.querySelector('audio[src], audio source[src]');
  if (audioEl) {
    const audioSrc = audioEl.src || audioEl.querySelector('source')?.src;
    info.type = 'podcast';
    info.data = {
      audioSrc,
      title: document.title,
      duration: audioEl.duration || 0,
    };
    return info;
  }

  // Players that stream without a plain src attribute (Spotify-style MSE).
  // Gated to podcast hosts so music/video pages never misroute here.
  try {
    const audioAny = document.querySelector('audio');
    if (audioAny && /open\.spotify\.com|overcast\.fm|podcasts\.apple\.com|pocketcasts\.com|podcasts\.google\.com|music\.amazon\.com|deezer\.com|tunein\.com|stitcher\.com|podbean\.com|buzzsprout\.com|libsyn\.com|soundcloud\.com|player\.fm|castro\.fm|radiopublic\.com/.test(url)) {
      let hostTitle = '';
      try { hostTitle = document.querySelector('meta[property="og:title"]')?.content || ''; } catch (e) {}
      info.type = 'podcast';
      info.data = {
        title: hostTitle || document.title,
        duration: Number(audioAny.duration) || 0,
      };
      return info;
    }
  } catch (e) {}

  const bodyText = document.body.innerText.length;
  if (bodyText > 500) {
    info.type = 'article';
    info.data = {
      title: document.title,
      selectedText: window.getSelection()?.toString() || '',
      metaDescription: document.querySelector('meta[name="description"]')?.content || '',
      author: document.querySelector('meta[name="author"]')?.content ||
              document.querySelector('[rel="author"]')?.innerText || '',
      ogImage: metaImageUrl(),
    };
    return info;
  }

  return info;
}

function matchStatusUrl(url) {
  const match = String(url || '').match(/(?:twitter\.com|x\.com)\/([^/?#]+)\/status\/(\d+)/);
  return match ? { handle: match[1], statusId: match[2] } : null;
}

// The poster of the tweet: username and display name scraped from the
// tweet's User-Name cell, falling back to the status URL handle.
function tweetPosterFromPage() {
  const cell = document.querySelector('article[data-testid="tweet"] [data-testid="User-Name"]');
  if (!cell) return null;
  const lines = cell.innerText.split('\n').map((line) => line.trim()).filter(Boolean);
  const handleLine = lines.find((line) => /^@[A-Za-z0-9_]{1,15}$/.test(line));
  const hrefHandle = [...cell.querySelectorAll('a[href]')]
    .map((a) => a.getAttribute('href') || '')
    .map((href) => (href.match(/^\/([A-Za-z0-9_]{1,15})\/?$/) || [])[1])
    .find(Boolean);
  const handle = (handleLine || '').replace(/^@/, '') || hrefHandle || null;
  if (!handle) return null;
  const name = lines.find((line) => line !== handleLine && !/^https?:\/\//.test(line) && line !== handle) || '';
  return { handle, name };
}

function metaImageUrl() {
  const raw = document.querySelector('meta[property="og:image"]')?.content ||
              document.querySelector('meta[name="twitter:image"]')?.content ||
              document.querySelector('link[rel="image_src"]')?.href || '';
  if (!raw || raw.startsWith('data:')) return '';
  try {
    const abs = new URL(raw, window.location.href).href;
    return /^https?:\/\//.test(abs) ? abs : '';
  } catch (e) {
    return '';
  }
}

function findTweetArticle() {
  const statusId = matchStatusUrl(window.location.href)?.statusId;
  const articles = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));
  if (!articles.length) return null;
  if (statusId) {
    const exact = articles.find((article) => article.querySelector(`a[href*="/status/${statusId}"]`));
    if (exact) return exact;
  }
  return articles[0];
}

function tweetHeaderHeight() {
  const banner = document.querySelector('header[role="banner"]');
  if (banner) {
    const height = banner.getBoundingClientRect().height;
    if (Number.isFinite(height) && height > 0 && height < 180) return height;
  }
  return 53;
}

// Measure the visible tweet card (author, text, media, actions) instead of the
// full <article>, which on X can include a lot of empty vertical space.
function tweetCaptureBounds(article) {
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
    article.querySelectorAll(selector).forEach((el) => {
      const box = el.getBoundingClientRect();
      if (box.width < 2 || box.height < 2) return;
      found = true;
      minX = Math.min(minX, box.left);
      minY = Math.min(minY, box.top);
      maxX = Math.max(maxX, box.right);
      maxY = Math.max(maxY, box.bottom);
    });
  });
  if (!found) {
    const box = article.getBoundingClientRect();
    return {
      x: box.left,
      y: box.top,
      w: box.width,
      h: box.height,
      absTop: box.top + window.scrollY,
    };
  }
  return {
    x: minX,
    y: minY,
    w: Math.max(1, maxX - minX),
    h: Math.max(1, maxY - minY),
    absTop: minY + window.scrollY,
  };
}

function expandTruncatedTweet(article) {
  article.querySelectorAll('[role="button"], button').forEach((el) => {
    const label = (el.innerText || '').trim().toLowerCase();
    if (label === 'show more' || label === 'read more') el.click();
  });
}

function pauseTweetMedia(article) {
  article.querySelectorAll('video').forEach((video) => {
    try { video.pause(); } catch (e) { /* ignore */ }
  });
}

function waitForTweetMedia(article, timeoutMs) {
  const images = Array.from(article.querySelectorAll('img'))
    .filter((img) => img.src && !(img.complete && img.naturalWidth > 0))
    .map((img) => new Promise((resolve) => {
      img.addEventListener('load', resolve, { once: true });
      img.addEventListener('error', resolve, { once: true });
    }));
  const videos = Array.from(article.querySelectorAll('video'))
    .filter((video) => video.readyState < 2)
    .map((video) => new Promise((resolve) => {
      video.addEventListener('loadeddata', resolve, { once: true });
      video.addEventListener('error', resolve, { once: true });
    }));
  const pending = [...images, ...videos];
  if (!pending.length) return Promise.resolve();
  return Promise.race([
    Promise.all(pending),
    new Promise((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image load failed'));
    img.src = src;
  });
}

function tweetTextFromPage() {
  try {
    const el = document.querySelector('[data-testid="tweetText"]');
    if (!el) return '';
    const clone = el.cloneNode(true);
    clone.querySelectorAll('br').forEach((br) => { br.replaceWith('\n'); });
    return String(clone.textContent || '')
      .replace(/ /g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  } catch (e) {
    return '';
  }
}

function cleanXTitle(title) {
  let cleaned = String(title || '').trim().replace(/^\(\d+\)\s*/, '');
  cleaned = cleaned.replace(/\s*\/\s*X$/, '');
  cleaned = cleaned.replace(/^[^:]{1,80}on X:\s*/i, '');
  cleaned = cleaned.replace(/^["“']+/, '').replace(/["”']+$/, '');
  return cleaned.trim() || String(title || '').trim();
}

function isAdPlaying() {
  const player = document.querySelector('.html5-video-player');
  if (!player) return false;
  return player.classList.contains('ad-showing') || player.classList.contains('ad-interrupting');
}

function getVideoDetails() {
  try {
    const live = document.querySelector('#movie_player')?.getPlayerResponse?.();
    if (live?.videoDetails?.videoId) return live.videoDetails;
  } catch (e) {}
  return window.ytInitialPlayerResponse?.videoDetails || null;
}

function getDurationFromPage() {
  const fromDetails = Math.floor(Number(getVideoDetails()?.lengthSeconds || 0));
  if (fromDetails > 0) return fromDetails;

  if (!isAdPlaying()) {
    const durationEl = document.querySelector('.ytp-time-duration');
    if (durationEl) {
      const parts = durationEl.textContent.split(':').map(Number);
      if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
      if (parts.length === 2) return parts[0] * 60 + parts[1];
      if (parts[0]) return parts[0];
    }
    const video = document.querySelector('video');
    if (video && video.duration && isFinite(video.duration)) {
      return Math.floor(video.duration);
    }
  }
  return 0;
}

const MAX_CLIP_SECONDS = 90;
let activeRecording = null;

function findRecordVideo() {
  return document.querySelector('video.html5-main-video')
    || document.querySelector('#movie_player video')
    || null;
}

function encodeBlobBase64(blob) {
  return blob.arrayBuffer().then((buf) => {
    const bytes = new Uint8Array(buf);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 32768) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 32768));
    }
    return btoa(bin);
  });
}

function waitForEvent(target, event, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      target.removeEventListener(event, finish);
      resolve();
    };
    target.addEventListener(event, finish);
    setTimeout(finish, timeoutMs || 8000);
  });
}

function stopActiveRecording(reason) {
  const rec = activeRecording;
  if (!rec) return;
  rec.cancelled = true;
  clearInterval(rec.pollId);
  clearInterval(rec.progressId);
  try { rec.video.pause(); } catch (e) {}
  try { if (rec.drawRaf) cancelAnimationFrame(rec.drawRaf); } catch (e) {}
  try {
    if (rec.canvasStream) rec.canvasStream.getVideoTracks().forEach((track) => { try { track.stop(); } catch (e2) {} });
  } catch (e) {}
  try {
    if (rec.recorder && rec.recorder.state !== 'inactive') rec.recorder.stop();
  } catch (e) {}
  try {
    rec.port.postMessage({ type: 'error', code: 'stopped', message: reason || 'Recording stopped.' });
  } catch (e) {}
  activeRecording = null;
}

function disableYouTubeCaptions() {
  try {
    const btn = document.querySelector('.ytp-subtitles-button');
    if (!btn) return;
    let on = null;
    const pressed = btn.getAttribute('aria-pressed');
    if (pressed === 'true') on = true;
    else if (pressed === 'false') on = false;
    if (on === null) {
      const win = document.querySelector('.ytp-caption-window-container');
      on = !!(win && win.childElementCount > 0);
    }
    if (on) btn.click();
  } catch (e) {}
}

async function handleRecordClip(message, sendResponse) {
  if (activeRecording) {
    sendResponse({ ok: false, code: 'busy', message: 'Recording stopped.' });
    return;
  }

  const start = Number(message.start);
  const end = Number(message.end);

  const video = findRecordVideo();
  if (!video) return sendResponse({ ok: false, code: 'no-video', message: 'Open a YouTube video to record a clip.' });
  if (isAdPlaying()) return sendResponse({ ok: false, code: 'ad', message: 'Wait for the ad to finish, then try again.' });
  if (video.muted || video.volume === 0) return sendResponse({ ok: false, code: 'muted', message: 'Unmute the video so the clip has sound.' });
  if (document.visibilityState !== 'visible') return sendResponse({ ok: false, code: 'hidden', message: 'Keep this tab in front while recording.' });
  if (!(end > start)) return sendResponse({ ok: false, code: 'range', message: 'End time must be after start time.' });
  if (end - start > MAX_CLIP_SECONDS) return sendResponse({ ok: false, code: 'range', message: 'Clip must be 90 seconds or less.' });
  if (typeof video.captureStream !== 'function' && typeof video.mozCaptureStream !== 'function') {
    return sendResponse({ ok: false, code: 'protected', message: "This video can't be recorded. It may be protected." });
  }

  const port = chrome.runtime.connect({ name: 'annotated-recorder' });
  port.onDisconnect.addListener(() => {
    if (activeRecording && !activeRecording.done) stopActiveRecording('Recording stopped.');
  });

  const rec = { video, port, recorder: null, pollId: null, progressId: null, cancelled: false, done: false, start, end };
  activeRecording = rec;
  sendResponse({ ok: true });
  disableYouTubeCaptions();

  try {
    const player = document.querySelector('#movie_player');
    if (player && typeof player.setPlaybackQualityRange === 'function') {
      player.setPlaybackQualityRange('small', 'small');
    }
  } catch (e) {}
  await new Promise((resolve) => setTimeout(resolve, 1500));

  try {
    video.pause();
    video.currentTime = start;
    await waitForEvent(video, 'seeked', 5000);
    if (rec.cancelled) return;

    let stream;
    try {
      stream = video.captureStream ? video.captureStream() : video.mozCaptureStream();
    } catch (e) {
      stopActiveRecording("This video can't be recorded. It may be protected.");
      return;
    }

    const playingWait = waitForEvent(video, 'playing', 10000);
    try {
      await video.play();
    } catch (e) {
      stopActiveRecording('Press play on the video once, then try again.');
      return;
    }
    await playingWait;
    if (rec.cancelled) return;

    if (!stream.getAudioTracks().length) {
      video.pause();
      stopActiveRecording("No sound was captured. Check that the video isn't muted.");
      return;
    }

    try {
      const canvas = document.createElement('canvas');
      canvas.width = 426;
      canvas.height = 240;
      const canvasCtx = canvas.getContext('2d');
      if (canvasCtx) {
        const drawFrame = () => {
          if (rec.cancelled || rec.done) return;
          try {
            const vw = video.videoWidth;
            const vh = video.videoHeight;
            if (vw && vh) {
              const scale = Math.max(426 / vw, 240 / vh);
              const dw = vw * scale;
              const dh = vh * scale;
              canvasCtx.drawImage(video, (426 - dw) / 2, (240 - dh) / 2, dw, dh);
            }
          } catch (e) {}
          rec.drawRaf = requestAnimationFrame(drawFrame);
        };
        drawFrame();
        const canvasStream = canvas.captureStream(30);
        rec.canvasStream = canvasStream;
        stream = new MediaStream([...canvasStream.getVideoTracks(), ...stream.getAudioTracks()]);
      }
    } catch (e) {}

    const mimeTypes = [
      'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
    ];
    const mimeType = mimeTypes.find((t) => {
      try { return MediaRecorder.isTypeSupported(t); } catch (e) { return false; }
    });

    let recorder;
    try {
      recorder = new MediaRecorder(stream, {
        ...(mimeType ? { mimeType } : {}),
        videoBitsPerSecond: 700000,
        audioBitsPerSecond: 96000,
      });
    } catch (e) {
      stopActiveRecording("This video can't be recorded. It may be protected.");
      return;
    }
    rec.recorder = recorder;

    let chunkIndex = 0;
    let pendingChunks = 0;
    let stopRequested = false;
    const postDone = () => {
      if (rec.cancelled) return;
      rec.done = true;
      try {
        port.postMessage({
          type: 'done',
          mime: recorder.mimeType || mimeType || 'video/webm',
          seconds: Math.max(0, Math.min(end, video.currentTime) - start),
          chunks: chunkIndex,
        });
      } catch (e) {}
      activeRecording = null;
    };
    recorder.ondataavailable = (e) => {
      if (!e.data || e.data.size === 0 || rec.cancelled) return;
      const i = chunkIndex;
      chunkIndex += 1;
      pendingChunks += 1;
      encodeBlobBase64(e.data).then((b64) => {
        pendingChunks -= 1;
        if (!rec.cancelled) {
          try { port.postMessage({ type: 'chunk', i, data: b64 }); } catch (err) {}
        }
        if (stopRequested && pendingChunks === 0) postDone();
      }).catch(() => {
        pendingChunks -= 1;
        if (stopRequested && pendingChunks === 0) postDone();
      });
    };

    recorder.onstop = () => {
      clearInterval(rec.pollId);
      clearInterval(rec.progressId);
      try { video.pause(); } catch (e) {}
      try { if (rec.drawRaf) cancelAnimationFrame(rec.drawRaf); } catch (e) {}
      try {
        if (rec.canvasStream) rec.canvasStream.getVideoTracks().forEach((track) => { try { track.stop(); } catch (e2) {} });
      } catch (e) {}
      if (rec.cancelled) return;
      stopRequested = true;
      if (pendingChunks === 0) postDone();
    };

    rec.progressId = setInterval(() => {
      if (rec.cancelled) return;
      const t = Math.max(0, Math.min(end, video.currentTime) - start);
      try { port.postMessage({ type: 'progress', t }); } catch (e) {}
    }, 250);

    rec.pollId = setInterval(() => {
      if (rec.cancelled) return;
      if (video.currentTime >= end) {
        clearInterval(rec.pollId);
        try { video.pause(); } catch (e) {}
        try { if (recorder.state !== 'inactive') recorder.stop(); } catch (e) {}
      }
    }, 100);

    stream.getVideoTracks().forEach((track) => {
      track.addEventListener('ended', () => {
        if (!rec.cancelled && !rec.done) stopActiveRecording('Recording stopped.');
      });
    });

    recorder.start(1000);
  } catch (e) {
    stopActiveRecording('Recording stopped.');
  }
}

const HIGHLIGHT_WORD_LIMIT = 200; // keep in sync with WORD_LIMIT in src/components/ArticleClipper.jsx
// Yellow word paint is ARMED only while the side panel's article clipper is
// open on this page. Spontaneous selections (double-click a word anywhere)
// must never paint - that is the "extension working in the background" bug.
let highlightArmed = false;
let highlightArmedAt = 0;
let fallbackMarks = [];
let clipMonitor = null;
let clipMonitorOnPause = null;
let clipEnd = 0;
let clipRaf = 0;
let lastSeekSeq = 0;

function stopClipPlaybackMonitor() {
  if (clipMonitor) { clearInterval(clipMonitor); clipMonitor = null; }
  if (clipRaf) { cancelAnimationFrame(clipRaf); clipRaf = 0; }
  if (clipMonitorOnPause) {
    try {
      const v = document.querySelector('video.html5-main-video') || document.querySelector('#movie_player video');
      if (v) v.removeEventListener('pause', clipMonitorOnPause);
    } catch (e) {}
    clipMonitorOnPause = null;
  }
  clipEnd = 0;
}

function capRange(range, maxWords) {
  try {
    const words = range.toString().split(/\s+/).filter(Boolean);
    if (words.length <= maxWords) return range.cloneRange();
    const budget = words.slice(0, maxWords).join(' ').length;
    const out = range.cloneRange();
    const root = range.commonAncestorContainer;
    const walker = document.createTreeWalker(
      root.nodeType === Node.TEXT_NODE ? root.parentNode : root,
      NodeFilter.SHOW_TEXT
    );
    let remaining = budget;
    let started = false;
    let node;
    while ((node = walker.nextNode())) {
      if (!started) {
        if (node === range.startContainer) {
          started = true;
        } else if (range.startContainer.nodeType === Node.ELEMENT_NODE) {
          const child = range.startContainer.childNodes[range.startOffset];
          if (child && ((child.nodeType === Node.TEXT_NODE && child === node) || (child.contains && child.contains(node)))) {
            started = true;
          }
        } else {
          continue;
        }
      }
      if (!started || !range.intersectsNode(node)) continue;
      const from = node === range.startContainer ? range.startOffset : 0;
      const avail = node.length - from;
      if (avail >= remaining) {
        out.setEnd(node, from + remaining);
        return out;
      }
      remaining -= avail;
    }
    return out;
  } catch (e) {
    try { return range.cloneRange(); } catch (e2) { return null; }
  }
}

function unwrapFallbackMarks() {
  fallbackMarks.forEach((mark) => {
    try {
      const parent = mark.parentNode;
      if (!parent) return;
      while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
      parent.removeChild(mark);
      if (parent.normalize) parent.normalize();
    } catch (e) {}
  });
  fallbackMarks = [];
}

function clearArticleHighlight() {
  try {
    if (typeof CSS !== 'undefined' && CSS.highlights) CSS.highlights.delete('annotated-selection');
  } catch (e) {}
  unwrapFallbackMarks();
}

function tryFallbackMark(range) {
  try {
    const mark = document.createElement('mark');
    mark.className = 'annotated-mark';
    mark.appendChild(range.extractContents());
    range.insertNode(mark);
    fallbackMarks.push(mark);
    return;
  } catch (e) {}
  try {
    const root = range.commonAncestorContainer;
    const walker = document.createTreeWalker(
      root.nodeType === Node.TEXT_NODE ? root.parentNode : root,
      NodeFilter.SHOW_TEXT
    );
    let node;
    while ((node = walker.nextNode())) {
      if (!range.intersectsNode(node)) continue;
      const start = node === range.startContainer ? range.startOffset : 0;
      const end = node === range.endContainer ? range.endOffset : node.length;
      if (start >= end) continue;
      const before = start > 0 ? node.splitText(start) : node;
      const mid = end < before.length ? before.splitText(end - start) : before;
      const mark = document.createElement('mark');
      mark.className = 'annotated-mark';
      before.parentNode.insertBefore(mark, before);
      mark.appendChild(before);
      fallbackMarks.push(mark);
    }
  } catch (e) {}
}

function setArticleHighlight(range) {
  if (!range) return;
  clearArticleHighlight();
  const capped = capRange(range, HIGHLIGHT_WORD_LIMIT) || range;
  try {
    if (typeof CSS !== 'undefined' && CSS.highlights && typeof Highlight !== 'undefined') {
      CSS.highlights.set('annotated-selection', new Highlight(capped));
      return;
    }
  } catch (e) {}
  tryFallbackMark(capped);
}

function restoreHighlightByText(text) {
  const needle = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 120);
  if (!needle) return false;
  try {
    if (typeof window.find !== 'function') return false;
    const found = window.find(needle);
    if (!found) return false;
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) setArticleHighlight(sel.getRangeAt(0));
    return true;
  } catch (e) {
    return false;
  }
}

if (!window.__annotatedContentLoaded) {
  window.__annotatedContentLoaded = true;

  const updateSelectionHighlight = () => {
    if (!highlightArmed) return;
    // Stale arms (tab switched, panel closed) expire: never paint cold.
    if (Date.now() - highlightArmedAt > 120000) { highlightArmed = false; return; }
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return;
    setArticleHighlight(sel.getRangeAt(0));
  };

  document.addEventListener('mouseup', () => {
    const selected = window.getSelection()?.toString().trim();
    if (selected) {
      chrome.runtime.sendMessage({
        type: 'SELECTION_CHANGED',
        data: { selectedText: selected }
      }).catch(() => {});
      updateSelectionHighlight();
    }
  });

  let selectionTimer = null;
  document.addEventListener('selectionchange', () => {
    clearTimeout(selectionTimer);
    selectionTimer = setTimeout(updateSelectionHighlight, 200);
  });

  void 0;
}

// Timeline helpers for the extension clip screen (seek, state, chapters).
function ytTimelineVideo() {
  return document.querySelector('video.html5-main-video')
    || document.querySelector('#movie_player video')
    || document.querySelector('video');
}

function ytChapterSeconds(text) {
  const m = String(text || '').trim().match(/^(?:(\d+):)?([0-5]?\d):([0-5]\d)$/);
  if (!m) return null;
  return (Number(m[1] || 0) * 3600) + (Number(m[2]) * 60) + Number(m[3]);
}

// Lossy chapter cleanup: one malformed line (duplicate time, out-of-order
// sponsor timestamp, over-duration entry) must not kill the whole list.
function ytCleanChapters(items, maxT) {
  if (!Array.isArray(items) || !items.length) return null;
  const seen = new Set();
  const good = [];
  items.forEach((item) => {
    const t = Math.round(Number(item && item.t));
    const title = String((item && item.title) || '').trim().slice(0, 140);
    if (!Number.isFinite(t) || t < 0 || !title || seen.has(t)) return;
    if (Number.isFinite(maxT) && maxT > 0 && t >= maxT) return;
    seen.add(t);
    good.push({ t, title });
  });
  good.sort((a, b) => a.t - b.t);
  if (good.length < 3) return null;
  return good;
}

function ytParseChapterLines(text) {
  const parsed = [];
  String(text || '').split('\n').forEach((rawLine) => {
    const line = String(rawLine || '').trim();
    const m = line.match(/^((?:\d+:)?[0-5]?\d:[0-5]\d)\s+(.+?)\s*$/);
    if (!m) return;
    const t = ytChapterSeconds(m[1]);
    const title = String(m[2] || '').trim().replace(/^[-–—•·|>]+/, '').trim().slice(0, 140);
    if (t === null || !title) return;
    parsed.push({ t, title });
  });
  return parsed;
}

function ytDomChapters() {
  const items = [];
  document.querySelectorAll('ytd-macro-markers-list-item-renderer').forEach((el) => {
    const lines = String(el.innerText || '').split('\n').map((s) => s.trim()).filter(Boolean);
    if (!lines.length) return;
    let t = null;
    let ti = -1;
    for (let i = 0; i < lines.length; i += 1) {
      const s = ytChapterSeconds(lines[i]);
      if (s !== null) { t = s; ti = i; break; }
    }
    if (t === null) return;
    const title = lines.slice(ti + 1).filter((line) => ytChapterSeconds(line) === null).join(' ').trim().slice(0, 140)
      || lines.slice(0, ti).join(' ').trim().slice(0, 140);
    if (!title) return;
    items.push({ t, title });
  });
  return items;
}

function ytPageTextChapters() {
  // NOTE: window.ytInitialPlayerResponse / player getPlayerResponse() are page
  // JS and invisible from this isolated world, so read rendered DOM text only.
  const texts = [];
  try { texts.push(document.querySelector('meta[name="description"]')?.content || ''); } catch (e) {}
  try {
    document.querySelectorAll('#description-inline-expander, #description yt-formatted-string, #description').forEach((el) => {
      try { if (el.innerText) texts.push(el.innerText); } catch (e) {}
    });
  } catch (e) {}
  return ytParseChapterLines(texts.join('\n'));
}

function getYouTubeChapters() {
  let maxT = 0;
  try {
    const d = Number(document.querySelector('video.html5-main-video, #movie_player video, video')?.duration);
    if (Number.isFinite(d) && d > 0) maxT = d;
  } catch (e) {}
  try {
    const cleaned = ytCleanChapters(ytDomChapters(), maxT);
    if (cleaned) return cleaned.slice(0, 200);
  } catch (e) {}
  try {
    const cleaned = ytCleanChapters(ytPageTextChapters(), maxT);
    if (cleaned) return cleaned.slice(0, 200);
  } catch (e) {}
  return [];
}

// Marker rows only render once the description is expanded. Expand it,
// re-read, then collapse it again so the page is left as found.
async function getYouTubeChaptersExpanded() {
  let expandedHere = false;
  try {
    if (ytDomChapters().length >= 3) return null;
    const more = [...document.querySelectorAll('tp-yt-paper-button#expand, #description-inline-expander tp-yt-paper-button, button#expand')]
      .find((el) => {
        try {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        } catch (e) { return false; }
      });
    if (!more) return null;
    try { more.click(); } catch (e) { return null; }
    expandedHere = true;
    await new Promise((resolve) => setTimeout(resolve, 900));
    let maxT = 0;
    try {
      const d = Number(document.querySelector('video.html5-main-video, #movie_player video, video')?.duration);
      if (Number.isFinite(d) && d > 0) maxT = d;
    } catch (e) {}
    const cleaned = ytCleanChapters(ytDomChapters().concat(ytPageTextChapters()), maxT);
    return cleaned ? cleaned.slice(0, 200) : null;
  } catch (e) {
    return null;
  } finally {
    if (expandedHere) {
      try {
        const collapse = [...document.querySelectorAll('tp-yt-paper-button#collapse, button#collapse')]
          .find((el) => {
            try {
              const r = el.getBoundingClientRect();
              return r.width > 0 && r.height > 0;
            } catch (e2) { return false; }
          });
        if (collapse) collapse.click();
      } catch (e) {}
    }
  }
}

// The message handler registers on every injection (old one removed first)
// so a re-injected script always answers with fresh handlers. DOM listeners
// above stay load-once guarded.
{
  if (window.__annotatedMessageHandler) {
    try { chrome.runtime.onMessage.removeListener(window.__annotatedMessageHandler); } catch (e) {}
  }
  window.__annotatedMessageHandler = (message, sender, sendResponse) => {
    if (message.type === 'GET_PAGE_INFO') {
      sendResponse(detectPageInfo());
      return true;
    }
    if (message.type === 'RESTORE_HIGHLIGHT') {
      // Explicit panel request: always paints, even when disarmed.
      sendResponse({ ok: restoreHighlightByText(message.text) });
      return true;
    }
    if (message.type === 'ANNOTATED_HIGHLIGHT_ARM') {
      highlightArmed = !!message.armed;
      if (message.armed) highlightArmedAt = Date.now();
      if (!highlightArmed) clearArticleHighlight();
      sendResponse({ ok: true });
      return true;
    }
    if (message.type === 'CAPTURE_PREP') {
      (async () => {
        try {
          const article = findTweetArticle();
          if (!article) { sendResponse({ ok: false }); return; }
          expandTruncatedTweet(article);
          pauseTweetMedia(article);
          article.scrollIntoView({ block: 'center', behavior: 'instant' });
          await new Promise((resolve) => setTimeout(resolve, 300));
          await waitForTweetMedia(article, 2500);
          pauseTweetMedia(article);
          const bounds = tweetCaptureBounds(article);
          if (bounds.w < 40 || bounds.h < 40) { sendResponse({ ok: false }); return; }
          sendResponse({
            ok: true,
            hasPhotos: true,
            w: bounds.w,
            h: bounds.h,
            absTop: bounds.absTop,
            headerH: tweetHeaderHeight(),
            vw: window.innerWidth,
            vh: window.innerHeight,
            scrollY: window.scrollY,
          });
        } catch (e) {
          sendResponse({ ok: false });
        }
      })();
      return true;
    }
    if (message.type === 'CAPTURE_SCROLL') {
      (async () => {
        try {
          const article = findTweetArticle();
          if (!article) { sendResponse({ ok: false }); return; }
          window.scrollTo({ top: message.to, behavior: 'instant' });
          await new Promise((resolve) => setTimeout(resolve, 260));
          await waitForTweetMedia(article, 1200);
          pauseTweetMedia(article);
          const bounds = tweetCaptureBounds(article);
          sendResponse({
            ok: true,
            scrollY: window.scrollY,
            rect: { x: bounds.x, y: bounds.y, w: bounds.w, h: bounds.h },
          });
        } catch (e) {
          sendResponse({ ok: false });
        }
      })();
      return true;
    }
    if (message.type === 'CAPTURE_STITCH') {
      (async () => {
        try {
          const { shots, w, h, vw, vh } = message;
          if (!Array.isArray(shots) || !shots.length || !(w > 10) || !(h > 10) || !(vw > 0) || !(vh > 0)) {
            sendResponse({ ok: false });
            return;
          }
          const first = await loadImage(shots[0].dataUrl);
          if (!first.naturalWidth) { sendResponse({ ok: false }); return; }
          const scale = first.naturalWidth / vw;
          const outW = Math.round(w * scale);
          const outH = Math.round(h * scale);
          if (outW < 10 || outH < 10 || outW > 8000 || outH > 24000) { sendResponse({ ok: false }); return; }
          const canvas = document.createElement('canvas');
          canvas.width = outW;
          canvas.height = outH;
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = getComputedStyle(document.body).backgroundColor || '#ffffff';
          ctx.fillRect(0, 0, outW, outH);
          for (let i = 0; i < shots.length; i += 1) {
            const shot = shots[i];
            const img = i === 0 ? first : await loadImage(shot.dataUrl);
            if (!img.naturalWidth) continue;
            const rect = shot.rect;
            const cutTop = Math.max(0, Number(shot.cutTop) || 0);
            const visTop = Math.max(rect.y, cutTop);
            const localTop = visTop - rect.y;
            if (localTop >= h) continue;
            const visH = Math.min(h - localTop, vh - visTop);
            if (visH <= 0 || rect.w <= 0) continue;
            const sx = Math.min(Math.max(rect.x * scale, 0), img.naturalWidth - 1);
            const sy = Math.min(Math.max(visTop * scale, 0), img.naturalHeight - 1);
            const sw = Math.min(Math.max(rect.w * scale, 1), img.naturalWidth - sx);
            const sh = Math.min(Math.max(visH * scale, 1), img.naturalHeight - sy);
            const dy = Math.round(localTop * scale);
            const dw = Math.min(outW, Math.round(rect.w * scale));
            const dh = Math.min(outH - dy, Math.round(visH * scale));
            if (dw <= 0 || dh <= 0) continue;
            ctx.drawImage(img, sx, sy, sw, sh, 0, dy, dw, dh);
          }
          sendResponse({ ok: true, dataUrl: canvas.toDataURL('image/jpeg', 0.92), width: outW, height: outH });
        } catch (e) {
          sendResponse({ ok: false });
        }
      })();
      return true;
    }
    if (message.type === 'record-clip') {
      handleRecordClip(message, sendResponse);
      return true;
    }
    if (message.type === 'cancel-recording') {
      stopActiveRecording('Recording stopped.');
      sendResponse({ ok: true });
      return true;
    }
    if (message.type === 'PLAY_FROM') {
      const video = document.querySelector('video.html5-main-video')
        || document.querySelector('#movie_player video')
        || document.querySelector('video');
      if (video) {
        const end = Number(message.end) || 0;
        const start = Number(message.start) || 0;
        const isReplay = message.action === 'replay';
        const shouldPlay = isReplay || video.paused;
        stopClipPlaybackMonitor();
        if (shouldPlay) {
          const t = video.currentTime || 0;
          if (isReplay || t < start || t >= end) {
            try { video.currentTime = start; } catch (e) {}
          }
          video.play().catch(() => {});
          clipEnd = end;
          if (end > 0) {
            const check = () => {
              clipRaf = 0;
              let done = false;
              try {
                if (!video.paused && video.currentTime >= clipEnd - 0.05) {
                  try { video.pause(); } catch (e2) {}
                  try { video.currentTime = clipEnd; } catch (e2) {}
                  done = true;
                }
              } catch (e) {}
              if (done) {
                stopClipPlaybackMonitor();
                return;
              }
              clipRaf = requestAnimationFrame(check);
            };
            clipRaf = requestAnimationFrame(check);
            clipMonitorOnPause = () => stopClipPlaybackMonitor();
            video.addEventListener('pause', clipMonitorOnPause, { once: true });
          }
        } else {
          video.pause();
        }
        sendResponse({ ok: true, playing: shouldPlay, time: video.currentTime || 0 });
      } else {
        sendResponse({ ok: false });
      }
      return true;
    }
    if (message.type === 'VIDEO_TIME') {
      const video = document.querySelector('video.html5-main-video')
        || document.querySelector('#movie_player video')
        || document.querySelector('video');
      if (video) {
        if (clipMonitor && Number(message.end) > 0) clipEnd = Number(message.end);
        sendResponse({ ok: true, time: video.currentTime || 0, paused: video.paused });
      } else {
        sendResponse({ ok: false });
      }
      return true;
    }
    if (message.type === 'YT_STATE') {
      const video = document.querySelector('video.html5-main-video')
        || document.querySelector('#movie_player video')
        || document.querySelector('video');
      if (video) {
        if (clipMonitor && Number(message.end) > 0) clipEnd = Number(message.end);
        const dur = Number(video.duration);
        let vid = '';
        try {
          const u = new URL(location.href);
          vid = u.searchParams.get('v') || (u.pathname.match(/^\/shorts\/([^/?]+)/) || [])[1] || '';
        } catch (e) {}
        let rate = 1;
        try { rate = Number(video.playbackRate) || 1; } catch (e) {}
        sendResponse({ ok: true, time: video.currentTime || 0,
          duration: Number.isFinite(dur) && dur > 0 ? dur : 0,
          live: !Number.isFinite(dur),
          paused: !!video.paused, rate, ad: isAdPlaying(), videoId: vid, seq: lastSeekSeq });
      } else {
        sendResponse({ ok: false });
      }
      return true;
    }
    if (message.type === 'YT_PREVIEW_CANCEL') {
      stopClipPlaybackMonitor();
      sendResponse({ ok: true });
      return true;
    }
    if (message.type === 'YT_SEEK') {
      const video = document.querySelector('video.html5-main-video')
        || document.querySelector('#movie_player video')
        || document.querySelector('video');
      if (!video) {
        sendResponse({ ok: false });
        return true;
      }
      if (isAdPlaying()) {
        sendResponse({ ok: false, code: 'ad' });
        return true;
      }
      try { video.currentTime = Math.max(0, Number(message.time) || 0); } catch (e) {}
      if (Number.isFinite(Number(message.seq))) lastSeekSeq = Number(message.seq);
      sendResponse({ ok: true, time: video.currentTime || 0, paused: !!video.paused, seq: lastSeekSeq });
      return true;
    }
    if (message.type === 'YT_PAUSE') {
      try { ytTimelineVideo()?.pause(); } catch (e) {}
      sendResponse({ ok: true });
      return true;
    }
    if (message.type === 'YT_RESUME') {
      try {
        const p = ytTimelineVideo()?.play();
        if (p && p.catch) p.catch(() => {});
      } catch (e) {}
      sendResponse({ ok: true });
      return true;
    }
    if (message.type === 'YT_CHAPTERS') {
      (async () => {
        try {
          let chapters = getYouTubeChapters();
          if (!chapters.length) {
            chapters = (await getYouTubeChaptersExpanded()) || [];
          }
          sendResponse({ ok: true, chapters });
        } catch (e) {
          try { sendResponse({ ok: true, chapters: [] }); } catch (e2) {}
        }
      })();
      return true;
    }
    if (message.type === 'CLEAR_HIGHLIGHT') {
      highlightArmed = false;
      clearArticleHighlight();
      sendResponse({ ok: true });
      return true;
    }
    if (message.type === 'PAUSE_MEDIA') {
      document.querySelectorAll('audio, video').forEach((el) => {
        try { el.pause(); } catch (e) { /* ignore */ }
      });
      sendResponse({ ok: true });
      return true;
    }
    if (message.type === 'PODCAST_STATE') {
      // Episode transport state for the panel (Spotify and other audio
      // pages). Prefers a playing element, else the longest usable one.
      const pick = () => {
        const els = Array.from(document.querySelectorAll('audio'));
        if (!els.length) return null;
        const playing = els.find((a) => { try { return !a.paused && !a.ended; } catch (e) { return false; } });
        if (playing) return playing;
        const withDur = els.filter((a) => { try { return Number.isFinite(a.duration) && a.duration > 0; } catch (e) { return false; } });
        if (withDur.length) {
          withDur.sort((a, b) => b.duration - a.duration);
          return withDur[0];
        }
        return els[0];
      };
      const audio = pick();
      if (!audio) {
        sendResponse({ ok: false });
        return true;
      }
      let time = 0;
      let duration = 0;
      let paused = true;
      try { time = Number(audio.currentTime) || 0; } catch (e) {}
      try { duration = Number(audio.duration) || 0; } catch (e) {}
      try { paused = !!audio.paused; } catch (e) {}
      sendResponse({ ok: true, paused, time, duration });
      return true;
    }
    if (message.type === 'PODCAST_TOGGLE') {
      // Spotify's own play/pause control first (routes through its player),
      // else drive the audio element directly.
      let toggled = false;
      try {
        const btn = document.querySelector('[data-testid="control-button-playpause"]');
        if (btn) { btn.click(); toggled = true; }
      } catch (e) {}
      if (!toggled) {
        try {
          const audio = document.querySelector('audio');
          if (audio) {
            if (audio.paused) { const p = audio.play(); if (p && p.catch) p.catch(() => {}); }
            else audio.pause();
            toggled = true;
          }
        } catch (e) {}
      }
      sendResponse({ ok: toggled });
      return true;
    }
  };
  chrome.runtime.onMessage.addListener(window.__annotatedMessageHandler);
}

if (!window.__annotatedDomReady) {
  window.__annotatedDomReady = true;
  const pushPageInfo = () => {
    chrome.runtime.sendMessage({ type: 'PAGE_INFO', data: detectPageInfo() }).catch(() => {});
  };

  document.addEventListener('yt-navigate-finish', pushPageInfo);
  document.addEventListener('yt-page-data-updated', pushPageInfo);
  window.addEventListener('popstate', pushPageInfo);

  pushPageInfo();
}
}
