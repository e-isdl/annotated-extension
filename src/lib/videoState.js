export async function getCurrentTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    return tab || null;
  } catch (error) {
    return null;
  }
}

export async function readVideoState(tabId) {
  if (!tabId) return null;
  try {
    const state = await chrome.tabs.sendMessage(tabId, { type: 'GET_VIDEO_STATE' });
    if (state && typeof state.currentTime === 'number') return state;
  } catch (error) {}

  try {
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const video = document.querySelector('video');
        const player = document.querySelector('.html5-video-player');
        const adPlaying = Boolean(
          player && (player.classList.contains('ad-showing') || player.classList.contains('ad-interrupting')),
        );
        let duration = 0;
        try {
          const details = document.querySelector('#movie_player')?.getPlayerResponse?.()?.videoDetails;
          duration = Math.floor(Number(details?.lengthSeconds || 0));
        } catch (error) {}
        if (!duration && video && isFinite(video.duration)) duration = Math.floor(video.duration);
        return {
          currentTime: video ? Math.floor(video.currentTime) : 0,
          duration: duration || 0,
          paused: video ? Boolean(video.paused) : true,
          adPlaying,
        };
      },
    });
    return injection?.result || null;
  } catch (error) {
    return null;
  }
}

export async function getCurrentVideoState() {
  const tab = await getCurrentTab();
  if (!tab?.id) return null;
  return readVideoState(tab.id);
}
