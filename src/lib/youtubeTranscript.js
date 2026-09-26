/** Extract timed captions from the YouTube page the user is already viewing. */
export async function readYouTubeCaptionTrack(videoId) {
  const player = window.ytInitialPlayerResponse
    || document.querySelector('ytd-player')?.getPlayerResponse?.()
    || (() => {
      const raw = window.ytplayer?.config?.args?.player_response;
      if (!raw) return null;
      try { return JSON.parse(raw); } catch { return null; }
    })();
  if (player?.videoDetails?.videoId && player.videoDetails.videoId !== videoId) {
    throw new Error('The YouTube tab changed videos. Reopen the clip form and try again.');
  }
  const tracks = player?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  if (!tracks?.length) {
    throw new Error('YouTube has no captions available for this video.');
  }

  const track = tracks.find((candidate) => candidate.isDefault)
    || tracks.find((candidate) => candidate.kind !== 'asr')
    || tracks[0];
  if (!track?.baseUrl) throw new Error('YouTube did not provide a usable caption track.');

  const url = new URL(track.baseUrl, location.origin);
  url.searchParams.set('fmt', 'json3');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  let response;
  try {
    response = await fetch(url, { credentials: 'include', cache: 'no-store', signal: controller.signal });
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('YouTube took too long to return captions. Try again.');
    throw new Error('Could not read captions from YouTube. Reload the video and try again.');
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) throw new Error(`YouTube caption request failed (${response.status}).`);

  const payload = await response.json();
  return { language: track.languageCode || '', segments: parseYouTubeJson3(payload) };
}

export function parseYouTubeJson3(payload) {
  const events = (payload?.events || []).filter((event) => (
    event.tStartMs != null && (event.segs || []).length > 0
  ));
  return events.flatMap((event, index) => {
    const text = (event.segs || []).map((segment) => segment.utf8 || '').join('').replace(/\s+/g, ' ').trim();
    if (!text) return [];
    const start = Number(event.tStartMs) / 1000;
    const explicitEnd = start + Number(event.dDurationMs || 0) / 1000;
    const nextStart = Number(events[index + 1]?.tStartMs) / 1000;
    const end = explicitEnd > start ? explicitEnd : (nextStart > start ? nextStart : start + 4);
    return [{ start, end, text }];
  });
}

export function formatYouTubeTranscript(segments) {
  return segments.map(({ text }) => text).filter(Boolean).join(' ').replace(/>>\s*/g, '').trim();
}

export function excerptYouTubeTranscript(segments, startSec, endSec) {
  const start = Number(startSec);
  const end = Number(endSec);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return '';
  return formatYouTubeTranscript(segments.filter((segment) => (
    segment.start < end && (segment.end > start || segment.end === segment.start)
  )));
}

export async function fetchYouTubeTranscript(videoId) {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.id || !tab.url) {
    throw new Error('Open the YouTube video in the active tab, then try again.');
  }

  let current;
  try { current = new URL(tab.url); } catch {
    throw new Error('Open the YouTube video in the active tab, then try again.');
  }
  const currentVideoId = current.searchParams.get('v')
    || current.pathname.match(/^\/shorts\/([^/?]+)/)?.[1];
  if (!/(^|\.)youtube\.com$/.test(current.hostname) || currentVideoId !== videoId) {
    throw new Error('Return to the selected YouTube video tab to load its captions.');
  }

  const [injection] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    world: 'MAIN',
    func: readYouTubeCaptionTrack,
    args: [videoId],
  });
  const result = injection?.result;
  if (!result?.segments?.length) {
    throw new Error('YouTube returned an empty caption track for this video.');
  }
  return result;
}
