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
    };
    return info;
  }

  return info;
}

function matchStatusUrl(url) {
  const match = String(url || '').match(/(?:twitter\.com|x\.com)\/([^/?#]+)\/status\/(\d+)/);
  return match ? { handle: match[1], statusId: match[2] } : null;
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
