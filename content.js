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
    info.data = {
      handle: statusMatch.handle,
      statusId: statusMatch.statusId,
      title: tweetTextFromPage() || cleanXTitle(document.title),
      author: statusMatch.handle,
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

function tweetHasMedia(article) {
  return !!article.querySelector(
    '[data-testid="tweetPhoto"], a[href*="/photo/"], a[href*="/video/"], video, [data-testid="videoPlayer"], [data-testid="videoComponent"]',
  );
}

function tweetHeaderHeight() {
  const header = document.querySelector('header[role="banner"]') || document.querySelector('header');
  if (!header) return 0;
  const height = header.getBoundingClientRect().height;
  return Number.isFinite(height) ? height : 0;
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
    return el ? String(el.innerText || '').trim() : '';
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

if (!window.__annotatedContentLoaded) {
  window.__annotatedContentLoaded = true;

  document.addEventListener('mouseup', () => {
    const selected = window.getSelection()?.toString().trim();
    if (selected) {
      chrome.runtime.sendMessage({
        type: 'SELECTION_CHANGED',
        data: { selectedText: selected }
      }).catch(() => {});
    }
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'GET_PAGE_INFO') {
      sendResponse(detectPageInfo());
      return true;
    }
    if (message.type === 'CAPTURE_PREP') {
      (async () => {
        try {
          const article = findTweetArticle();
          if (!article) { sendResponse({ ok: false }); return; }
          if (!tweetHasMedia(article)) { sendResponse({ ok: true, hasPhotos: false }); return; }
          expandTruncatedTweet(article);
          pauseTweetMedia(article);
          await new Promise((resolve) => setTimeout(resolve, 300));
          await waitForTweetMedia(article, 2500);
          pauseTweetMedia(article);
          const box = article.getBoundingClientRect();
          if (box.width < 40 || box.height < 40) { sendResponse({ ok: false }); return; }
          sendResponse({
            ok: true,
            hasPhotos: true,
            w: box.width,
            h: box.height,
            absTop: box.top + window.scrollY,
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
          const box = article.getBoundingClientRect();
          sendResponse({
            ok: true,
            scrollY: window.scrollY,
            rect: { x: box.left, y: box.top, w: box.width, h: box.height },
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
            const localTop = Math.max(0, -rect.y);
            if (localTop >= h) continue;
            const visTop = Math.max(0, rect.y);
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
    if (message.type === 'PAUSE_MEDIA') {
      document.querySelectorAll('audio, video').forEach((el) => {
        try { el.pause(); } catch (e) { /* ignore */ }
      });
      sendResponse({ ok: true });
      return true;
    }
  });

  const pushPageInfo = () => {
    chrome.runtime.sendMessage({ type: 'PAGE_INFO', data: detectPageInfo() }).catch(() => {});
  };

  document.addEventListener('yt-navigate-finish', pushPageInfo);
  document.addEventListener('yt-page-data-updated', pushPageInfo);
  window.addEventListener('popstate', pushPageInfo);

  pushPageInfo();
}
