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
    func: (videoId, startSec, endSec) => {
      return new Promise((resolve) => {
        try {
          const listUrl = `https://www.youtube.com/api/timedtext?v=${videoId}&type=list`;
          fetch(listUrl)
            .then(r => r.text())
            .then(listText => {
              const parser = new DOMParser();
              const listDoc = parser.parseFromString(listText, 'text/xml');
              const tracks = listDoc.querySelectorAll('track');
              let trackLang = 'en';
              let trackKind = '';
              for (const track of tracks) {
                if (track.getAttribute('lang_code') === 'en') {
                  trackKind = track.getAttribute('kind') || '';
                  break;
                }
              }
              const captionsUrl = `https://www.youtube.com/api/timedtext?v=${videoId}&lang=${trackLang}&kind=${trackKind}`;
              return fetch(captionsUrl);
            })
            .then(r => r.text())
            .then(captionsText => {
              const parser = new DOMParser();
              const captionsDoc = parser.parseFromString(captionsText, 'text/xml');
              const textNodes = captionsDoc.querySelectorAll('text');
              const lines = [];
              for (const node of textNodes) {
                const start = parseFloat(node.getAttribute('start'));
                const dur = parseFloat(node.getAttribute('dur') || '0');
                const end = start + dur;
                if (end >= startSec && start <= endSec) {
                  lines.push(node.textContent.trim());
                }
              }
              resolve(lines.join(' '));
            })
            .catch(() => resolve(null));
        } catch (e) {
          resolve(null);
        }
      });
    },
    args: [videoId, startSec, endSec]
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
