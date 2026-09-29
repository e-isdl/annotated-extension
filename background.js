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

function sendToTab(tabId, message) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) resolve(null);
      else resolve(response || null);
    });
  });
}

const CAPTURE_ZOOM_CANDIDATES = [2, 1.5, 1.25, 1];
const CAPTURE_SLICE_OVERLAP = 80;
const CAPTURE_MAX_SLICES = 12;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Fits in one viewport → single capture (optionally zoomed). Taller posts →
// overlapping slices stitched together. Video/image posts are often taller
// than 90% of the screen even when they look fine on screen.
function planCapture(prep) {
  if (!(prep.h > 10) || !(prep.w > 10)) return null;
  const topOffset = Math.min(prep.headerH + 8, Math.round(prep.vh * 0.14));
  const usableVh = Math.max(200, prep.vh - topOffset);

  if (prep.h <= usableVh * 0.98) {
    const maxZoom = Math.min(
      2,
      usableVh / prep.h,
      prep.vw / prep.w,
    );
    const zoom = CAPTURE_ZOOM_CANDIDATES.find((z) => z <= maxZoom + 1e-6) || 1;
    return { mode: 'single', zoom, height: prep.h };
  }

  let step = usableVh - CAPTURE_SLICE_OVERLAP;
  if (step < 120) step = Math.max(120, Math.round(usableVh * 0.72));
  let slices = Math.ceil(prep.h / step);
  if (slices > CAPTURE_MAX_SLICES) {
    step = Math.ceil(prep.h / CAPTURE_MAX_SLICES);
    slices = CAPTURE_MAX_SLICES;
  }
  if (prep.h > 22000) return null;
  return { mode: 'stitched', height: prep.h, step, slices };
}

async function captureTweetScreenshot() {
  const tab = await getActiveTab();
  if (tab?.id == null) return { ok: false };
  let savedZoom = 0;
  try { savedZoom = await chrome.tabs.getZoom(tab.id); } catch (e) { savedZoom = 0; }
  let restoreScroll = null;
  try {
    await getPageInfoFromTab(tab.id);
    try { await chrome.tabs.setZoom(tab.id, 1); } catch (e) { /* ignore */ }
    await sleep(320);
    const prep = await sendToTab(tab.id, { type: 'CAPTURE_PREP' });
    if (!prep) return { ok: false };
    if (restoreScroll == null && typeof prep.scrollY === 'number') restoreScroll = prep.scrollY;
    if (prep.ok && prep.hasPhotos === false) return { ok: true, hasPhotos: false };
    if (!prep.ok) return { ok: false, hasPhotos: true };

    const plan = planCapture(prep);
    if (!plan) return { ok: true, hasPhotos: false, reason: 'too-tall' };
    let vw = prep.vw;
    let vh = prep.vh;
    if (plan.mode === 'single' && plan.zoom !== 1) {
      try { await chrome.tabs.setZoom(tab.id, plan.zoom); } catch (e) { /* ignore */ }
      await sleep(320);
      const zoomed = await sendToTab(tab.id, { type: 'CAPTURE_PREP' });
      if (!zoomed?.ok) return { ok: false, hasPhotos: true };
      vw = zoomed.vw;
      vh = zoomed.vh;
    }

    const topOffset = prep.headerH + 8;
    const sliceCount = plan.mode === 'stitched' ? plan.slices : 1;
    const sliceStep = plan.mode === 'stitched' ? plan.step : 0;
    const shots = [];
    for (let i = 0; i < sliceCount; i += 1) {
      const scrolled = await sendToTab(tab.id, {
        type: 'CAPTURE_SCROLL',
        to: prep.absTop - topOffset + i * sliceStep,
      });
      if (!scrolled?.ok) return { ok: false, hasPhotos: true };
      await sleep(i === 0 ? 700 : 420);
      let dataUrl;
      try {
        dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg', quality: 95 });
      } catch (e) {
        return { ok: false, hasPhotos: true };
      }
      shots.push({ dataUrl, rect: scrolled.rect, cutTop: topOffset });
    }

    const stitched = await sendToTab(tab.id, {
      type: 'CAPTURE_STITCH',
      shots,
      w: prep.w,
      h: plan.height,
      vw,
      vh,
    });
    if (!stitched?.ok || !stitched.dataUrl) return { ok: false, hasPhotos: true };
    return { ok: true, hasPhotos: true, dataUrl: stitched.dataUrl };
  } catch (e) {
    return { ok: false };
  } finally {
    try { await chrome.tabs.setZoom(tab.id, savedZoom); } catch (e) { /* ignore */ }
    if (restoreScroll != null) {
      await sendToTab(tab.id, { type: 'CAPTURE_SCROLL', to: restoreScroll });
    }
  }
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
  if (message.type === 'CAPTURE_TWEET') {
    captureTweetScreenshot().then(sendResponse);
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
