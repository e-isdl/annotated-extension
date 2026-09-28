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

  const statusMatch = String(url || '').match(/(?:twitter\.com|x\.com)\/([^/?#]+)\/status\/(\d+)/);
  if (statusMatch) {
    info.type = 'x';
    info.data = { handle: statusMatch[1], statusId: statusMatch[2], title: cleanXTitle(cleanTitle), author: statusMatch[1] };
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

function cleanXTitle(title) {
  let cleaned = String(title || '').trim().replace(/^\(\d+\)\s*/, '');
  cleaned = cleaned.replace(/\s*\/\s*X$/, '');
  cleaned = cleaned.replace(/^[^:]{1,80}on X:\s*/i, '');
  cleaned = cleaned.replace(/^["“']+/, '').replace(/["”']+$/, '');
  return cleaned.trim() || String(title || '').trim();
}

async function getPageInfoFromTab(tabId) {
  const requestPageInfo = () => new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { type: 'GET_PAGE_INFO' }, (response) => {
      const error = chrome.runtime.lastError;
      resolve(error || !response ? null : response);
    });
  });

  let response = await requestPageInfo();
  if (!response) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['content.js']
      });
      response = await requestPageInfo();
    } catch (e) {}
  }
  if (response) return response;

  return new Promise((resolve) => {
    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError || !tab) resolve(null);
      else resolve(detectPageInfoFromUrl(tab.url, tab.title));
    });
  });
}

function notifySidePanel(message) {
  chrome.runtime.sendMessage(message).catch(() => {});
}

// The side panel follows one tab at a time: the tab the user last switched to.
// Anything else updating in the background must not overwrite the panel's page.
let currentTabId = null;

async function pushTabInfo(tabId) {
  try {
    const info = await getPageInfoFromTab(tabId);
    if (info) notifySidePanel({ type: 'PAGE_INFO', data: info });
  } catch (e) {}
}

async function getActiveTab() {
  if (currentTabId != null) {
    try {
      const tab = await chrome.tabs.get(currentTabId);
      if (tab) return tab;
    } catch (e) {}
    currentTabId = null;
  }
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const tab = tabs[0] || (await chrome.tabs.query({ active: true }))[0] || null;
  if (tab?.id != null) currentTabId = tab.id;
  return tab;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'PAGE_INFO' && sender.tab) {
    if (currentTabId == null || sender.tab.id === currentTabId) {
      notifySidePanel({ type: 'PAGE_INFO', data: message.data });
    }
  }
  if (message.type === 'SELECTION_CHANGED') {
    notifySidePanel({ type: 'SELECTION_CHANGED', data: message.data });
  }
  if (message.type === 'GET_PAGE_INFO') {
    getActiveTab().then(async (tab) => {
      if (tab?.id) {
        const info = await getPageInfoFromTab(tab.id);
        sendResponse(info);
      } else {
        sendResponse(null);
      }
    });
    return true;
  }
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  currentTabId = tabId;
  await pushTabInfo(tabId);
});

chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) return;
  try {
    const [tab] = await chrome.tabs.query({ active: true, windowId });
    if (!tab) return;
    currentTabId = tab.id;
    await pushTabInfo(tab.id);
  } catch (e) {}
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (tabId !== currentTabId || !tab.active) return;
  if (changeInfo.status === 'complete' || changeInfo.title || changeInfo.url) {
    await pushTabInfo(tabId);
  }
});

chrome.tabs.query({ active: true, lastFocusedWindow: true }).then((tabs) => {
  if (tabs[0]?.id != null) currentTabId = tabs[0].id;
}).catch(() => {});
