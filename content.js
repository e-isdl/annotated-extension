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
  if (message.type === 'FETCH_TRANSCRIPT') {
    handleFetchTranscript(message.startSec, message.endSec)
      .then(transcript => sendResponse({ transcript }))
      .catch(() => sendResponse({ transcript: null }));
    return true;
  }
});

async function handleFetchTranscript(startSec, endSec) {
  // Step 1: Click Show Transcript button
  const descSection = document.querySelector('ytd-video-description-transcript-section-renderer');
  const btn = descSection?.querySelector('button')
    || document.querySelector('button[aria-label="Show transcript"]')
    || document.querySelector('button[aria-label="Mostrar transcripción"]');
  if (btn) btn.click();

  // Step 2: Wait for segments to appear
  for (let attempt = 0; attempt < 10; attempt++) {
    await new Promise(r => setTimeout(r, 500));

    let segments = document.querySelectorAll('transcript-segment-view-model');
    if (!segments.length) segments = document.querySelectorAll('ytd-transcript-segment-renderer');

    if (segments.length > 0) {
      // Step 3: Read and filter segments
      const lines = [];
      segments.forEach(seg => {
        const timeEl = seg.querySelector('.ytwTranscriptSegmentViewModelTimestamp')
          || seg.querySelector('.segment-timestamp')
          || seg.querySelector('[class*="timestamp"]');
        const textEl = seg.querySelector('.yt-core-attributed-string')
          || seg.querySelector('.segment-text')
          || seg.querySelector('[class*="text"]');

        if (!timeEl || !textEl) return;

        const timeText = timeEl.textContent.trim();
        const parts = timeText.split(':').map(Number);
        if (parts.some(isNaN)) return;

        let segStart = 0;
        if (parts.length === 3) segStart = parts[0] * 3600 + parts[1] * 60 + parts[2];
        else if (parts.length === 2) segStart = parts[0] * 60 + parts[1];
        else return;

        const text = textEl.textContent.trim();
        if (segStart >= startSec && segStart <= endSec && text) {
          lines.push(text);
        }
      });

      // Close transcript panel
      const closeBtn = document.querySelector('button[aria-label="Close transcript"]')
        || document.querySelector('button[aria-label="Cerrar transcripción"]');
      if (closeBtn) closeBtn.click();

      return lines.length ? lines.join(' ') : null;
    }
  }

  return null;
}

chrome.runtime.sendMessage({ type: 'PAGE_INFO', data: detectPageInfo() }).catch(() => {});
