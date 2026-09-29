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

function tweetHasPhotos(article) {
  return !!article.querySelector('[data-testid="tweetPhoto"], a[href*="/photo/"]');
}

function waitForTweetImages(article, timeoutMs) {
  const pending = Array.from(article.querySelectorAll('img'))
    .filter((img) => img.src && !(img.complete && img.naturalWidth > 0))
    .map((img) => new Promise((resolve) => {
      img.addEventListener('load', resolve, { once: true });
      img.addEventListener('error', resolve, { once: true });
    }));
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
    if (message.type === 'CAPTURE_TWEET') {
      (async () => {
        try {
          const article = findTweetArticle();
          if (!article) { sendResponse({ ok: false }); return; }
          if (!tweetHasPhotos(article)) { sendResponse({ ok: true, hasPhotos: false }); return; }
          const before = article.getBoundingClientRect();
          const fits = before.height <= window.innerHeight && before.width <= window.innerWidth;
          article.scrollIntoView({ block: fits ? 'center' : 'start' });
          await new Promise((resolve) => setTimeout(resolve, 350));
          await waitForTweetImages(article, 3000);
          const box = article.getBoundingClientRect();
          const onScreen = box.width > 20 && box.height > 20 &&
            box.bottom > 0 && box.top < window.innerHeight &&
            box.right > 0 && box.left < window.innerWidth;
          if (!onScreen) { sendResponse({ ok: false, hasPhotos: true, reason: 'offscreen' }); return; }
          sendResponse({
            ok: true,
            hasPhotos: true,
            rect: { x: box.left, y: box.top, w: box.width, h: box.height },
          });
        } catch (e) {
          sendResponse({ ok: false });
        }
      })();
      return true;
    }
    if (message.type === 'CROP_TWEET') {
      (async () => {
        try {
          const { dataUrl, rect } = message;
          const image = await loadImage(dataUrl);
          if (!image.naturalWidth || !image.naturalHeight || !rect || rect.w <= 0 || rect.h <= 0) {
            sendResponse({ ok: false });
            return;
          }
          const scale = image.naturalWidth / window.innerWidth;
          const sx = Math.min(Math.max(rect.x * scale, 0), image.naturalWidth - 1);
          const sy = Math.min(Math.max(rect.y * scale, 0), image.naturalHeight - 1);
          const sw = Math.min(Math.max(rect.w * scale, 1), image.naturalWidth - sx);
          const sh = Math.min(Math.max(rect.h * scale, 1), image.naturalHeight - sy);
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(sw);
          canvas.height = Math.round(sh);
          canvas.getContext('2d').drawImage(image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
          sendResponse({ ok: true, dataUrl: canvas.toDataURL('image/png') });
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
