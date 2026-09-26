/** Extract timed captions from the YouTube page the user is already viewing. */
export async function readYouTubeCaptionTrack(videoId) {
  const FETCH_TIMEOUT_MS = 15000;
  const MAX_TRACKS_PER_SOURCE = 3;
  const FALLBACK_CLIENT = { name: 'IOS', version: '20.10.4' };

  const pagePlayer = window.ytInitialPlayerResponse
    || document.querySelector('ytd-player')?.getPlayerResponse?.()
    || (() => {
      const raw = window.ytplayer?.config?.args?.player_response;
      if (!raw) return null;
      try { return JSON.parse(raw); } catch { return null; }
    })();

  if (pagePlayer?.videoDetails?.videoId && pagePlayer.videoDetails.videoId !== videoId) {
    throw new Error('The YouTube tab changed videos. Reopen the clip form and try again.');
  }

  const preferredLanguage = String(window.ytcfg?.get?.('HL') || navigator.language || 'en').toLowerCase();
  const preferredRegion = String(window.ytcfg?.get?.('GL') || 'US').toUpperCase();
  const languageBase = preferredLanguage.split('-')[0];

  const rankTracks = (tracks) => {
    const scoreFor = (track) => {
      const code = String(track?.languageCode || '').toLowerCase();
      let score = 3;
      if (code === preferredLanguage) score = 0;
      else if (code && code.split('-')[0] === languageBase) score = 1;
      else if (code === 'en' || code.startsWith('en-')) score = 2;
      if (track?.kind === 'asr') score += 0.5;
      return score;
    };
    return [...tracks].sort((a, b) => scoreFor(a) - scoreFor(b));
  };

  const requestInnertubeTracks = async () => {
    const apiKey = window.ytcfg?.get?.('INNERTUBE_API_KEY');
    const endpoint = `/youtubei/v1/player?prettyPrint=false${apiKey ? `&key=${encodeURIComponent(apiKey)}` : ''}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context: {
            client: {
              clientName: FALLBACK_CLIENT.name,
              clientVersion: FALLBACK_CLIENT.version,
              hl: preferredLanguage,
              gl: preferredRegion,
            },
          },
          videoId,
          contentCheckOk: true,
          racyCheckOk: true,
        }),
        credentials: 'include',
        cache: 'no-store',
        signal: controller.signal,
      });
      if (!response.ok) return [];
      const data = await response.json();
      return data?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
    } catch {
      return [];
    } finally {
      clearTimeout(timer);
    }
  };

  const requestCaptionBody = async (track) => {
    const url = new URL(track.baseUrl, location.origin);
    url.searchParams.set('fmt', 'json3');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(url, { credentials: 'include', cache: 'no-store', signal: controller.signal });
      if (!response.ok) return { status: 'error' };
      const body = await response.text();
      if (!body.trim()) return { status: 'blank' };
      let payload = null;
      try { payload = JSON.parse(body); } catch { return { status: 'blank' }; }
      if (!payload?.events?.length) return { status: 'empty' };
      return { status: 'ok', body };
    } catch {
      return { status: 'error' };
    } finally {
      clearTimeout(timer);
    }
  };

  const readFromTracks = async (tracks) => {
    if (!tracks?.length) return { status: 'none' };
    for (const track of rankTracks(tracks).slice(0, MAX_TRACKS_PER_SOURCE)) {
      if (!track?.baseUrl) continue;
      const outcome = await requestCaptionBody(track);
      if (outcome.status === 'ok') return { status: 'ok', language: track.languageCode || '', body: outcome.body };
      if (outcome.status === 'error') return { status: 'error' };
      if (outcome.status === 'blank') return { status: 'blank' };
    }
    return { status: 'empty' };
  };

  const pageTracks = pagePlayer?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  const attempts = [];
  const pageOutcome = await readFromTracks(pageTracks);
  if (pageOutcome.status === 'ok') return { language: pageOutcome.language, body: pageOutcome.body };
  attempts.push(pageOutcome.status);

  const apiOutcome = await readFromTracks(await requestInnertubeTracks());
  if (apiOutcome.status === 'ok') return { language: apiOutcome.language, body: apiOutcome.body };
  attempts.push(apiOutcome.status);

  if (attempts.every((status) => status === 'none')) {
    throw new Error('YouTube has no captions available for this video.');
  }
  if (attempts.includes('empty') || !attempts.includes('error')) {
    throw new Error('YouTube returned an empty caption track for this video.');
  }
  throw new Error('Could not read captions from YouTube. Reload the video and try again.');
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
  if (!result?.body) {
    throw new Error('YouTube returned an empty caption track for this video.');
  }

  let payload = null;
  try { payload = JSON.parse(result.body); } catch { payload = null; }
  const segments = payload ? parseYouTubeJson3(payload) : [];
  if (!segments.length) {
    throw new Error('YouTube returned an empty caption track for this video.');
  }
  return { language: result.language || '', segments };
}
