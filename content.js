function detectPageInfo() {
  const url = window.location.href;
  const info = { url, type: 'unknown', data: {} };

  if (url.includes('youtube.com/watch')) {
    const params = new URLSearchParams(window.location.search);
    const videoId = params.get('v');
    const title = document.title.replace(' - YouTube', '').replace(/^\(\d+\)\s*/, '');
    const duration = getDurationFromPage();
    info.type = 'youtube';
    info.data = { videoId, title, duration };
    return info;
  }

  if (url.includes('youtube.com/shorts')) {
    const parts = url.split('/');
    const videoId = parts[parts.length - 1];
    info.type = 'youtube';
    info.data = { videoId, title: document.title, duration: 0 };
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

function getDurationFromPage() {
  const durationEl = document.querySelector('.ytp-time-duration');
  if (durationEl) {
    const parts = durationEl.textContent.split(':').map(Number);
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return parts[0] || 0;
  }
  const video = document.querySelector('video');
  if (video && video.duration && isFinite(video.duration)) {
    return Math.floor(video.duration);
  }
  return 0;
}

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
    const info = detectPageInfo();
    sendResponse(info);
    return true;
  }
});

chrome.runtime.sendMessage({ type: 'PAGE_INFO', data: detectPageInfo() }).catch(() => {});
