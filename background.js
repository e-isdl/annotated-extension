chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch(console.error);

function detectPageInfoFromUrl(url, title) {
  const info = { url, type: 'unknown', data: {} };
  const cleanTitle = (title || '').replace(/\s*-\s*YouTube$/, '').replace(/^\(\d+\)\s*/, '');

  if (url.includes('youtube.com/watch')) {
    const params = new URLSearchParams(new URL(url).search);
    const videoId = params.get('v');
    info.type = 'youtube';
    info.data = { videoId, title: cleanTitle, duration: 0 };
    return info;
  }

  if (url.includes('youtube.com/shorts')) {
    const parts = url.split('/');
    const videoId = parts[parts.length - 1];
    info.type = 'youtube';
    info.data = { videoId, title: cleanTitle, duration: 0 };
    return info;
  }

  if (url.includes('podcast') || url.includes('spotify.com/episode') || url.includes('overcast.fm')) {
    info.type = 'podcast';
    info.data = { audioSrc: '', title: cleanTitle, duration: 0 };
    return info;
  }

  if (cleanTitle && !url.startsWith('chrome://') && !url.startsWith('chrome-extension://')) {
    info.type = 'article';
    info.data = { title: cleanTitle, selectedText: '', metaDescription: '', author: '' };
    return info;
  }

  return info;
}

async function getPageInfoFromTab(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js']
    });
  } catch (e) {}

  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { type: 'GET_PAGE_INFO' }, (response) => {
      if (chrome.runtime.lastError || !response) {
        chrome.tabs.get(tabId, (tab) => {
          if (tab) resolve(detectPageInfoFromUrl(tab.url, tab.title));
          else resolve(null);
        });
      } else {
        resolve(response);
      }
    });
  });
}

async function fetchTranscriptFromTab(tabId, videoId, startSec, endSec) {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: (startSec, endSec) => {
      return new Promise((resolve) => {
        try {
          // Step 1: Try to find and click Show Transcript button
          const descSection = document.querySelector('ytd-video-description-transcript-section-renderer');
          const btn = descSection?.querySelector('button')
            || document.querySelector('button[aria-label="Show transcript"]')
            || document.querySelector('button[aria-label="Mostrar transcripción"]');

          if (btn) {
            btn.click();
          }

          // Step 2: Wait for transcript segments to appear, try multiple selectors
          const maxAttempts = 10;
          let attempt = 0;

          function tryRead() {
            attempt++;

            // New YouTube DOM (2026+)
            let segments = document.querySelectorAll('transcript-segment-view-model');

            // Old YouTube DOM
            if (!segments.length) {
              segments = document.querySelectorAll('ytd-transcript-segment-renderer');
            }

            if (!segments.length && attempt < maxAttempts) {
              setTimeout(tryRead, 500);
              return;
            }

            if (!segments.length) {
              resolve(null);
              return;
            }

            const lines = [];
            segments.forEach(seg => {
              // Try new selectors first, then old
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

            // Close the transcript panel
            const closeBtn = document.querySelector('button[aria-label="Close transcript"]')
              || document.querySelector('button[aria-label="Cerrar transcripción"]');
            if (closeBtn) closeBtn.click();

            resolve(lines.length ? lines.join(' ') : null);
          }

          setTimeout(tryRead, 1500);
        } catch (e) {
          resolve(null);
        }
      });
    },
    args: [startSec, endSec]
  });

  return results?.[0]?.result || null;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'PAGE_INFO' && sender.tab) {
    chrome.runtime.sendMessage({ type: 'PAGE_INFO', data: message.data });
  }
  if (message.type === 'SELECTION_CHANGED') {
    chrome.runtime.sendMessage({ type: 'SELECTION_CHANGED', data: message.data });
  }
  if (message.type === 'GET_PAGE_INFO') {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      if (tabs[0]?.id) {
        const info = await getPageInfoFromTab(tabs[0].id);
        sendResponse(info);
      } else {
        sendResponse(null);
      }
    });
    return true;
  }
  if (message.type === 'FETCH_TRANSCRIPT') {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      if (tabs[0]?.id) {
        const transcript = await fetchTranscriptFromTab(
          tabs[0].id,
          message.videoId,
          message.startSec,
          message.endSec
        );
        sendResponse({ transcript });
      } else {
        sendResponse({ transcript: null });
      }
    });
    return true;
  }
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab || !tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) return;
    const info = await getPageInfoFromTab(tabId);
    chrome.runtime.sendMessage({ type: 'PAGE_INFO', data: info }).catch(() => {});
  } catch (e) {}
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' || changeInfo.title) {
    if (tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('chrome-extension://')) {
      const info = await getPageInfoFromTab(tabId);
      chrome.runtime.sendMessage({ type: 'PAGE_INFO', data: info }).catch(() => {});
    }
  }
});
