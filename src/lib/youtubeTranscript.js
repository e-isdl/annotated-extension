/** Extract timed captions from the YouTube page the user is already viewing. */
export async function readYouTubeCaptionTrack(videoId) {
  const FETCH_TIMEOUT_MS = 15000;
  const PLAYER_TIMEOUT_MS = 10000;
  const MAX_TRACKS_PER_SOURCE = 4;
  const FALLBACK_CLIENTS = [
    { name: 'IOS', version: '20.10.4', id: '5' },
    { name: 'TVHTML5', version: '7.20250312.16.00', id: '7' },
    { name: 'WEB_EMBEDDED_PLAYER', version: '1.20250310.01.00', id: '56', embedUrl: 'https://www.youtube.com/' },
    { name: 'MWEB', version: '2.20250311.03.00', id: '2' },
  ];
  const notes = [];
  const log = (message, detail) => {
    if (typeof console !== 'undefined' && console.warn) console.warn(`[annotated] ${message}`, detail);
  };

  const livePlayer = (() => {
    try { return document.querySelector('#movie_player')?.getPlayerResponse?.() || null; } catch { return null; }
  })();
  const initialPlayer = window.ytInitialPlayerResponse || null;
  const embeddedPlayer = (() => {
    try { return document.querySelector('ytd-player')?.getPlayerResponse?.() || null; } catch { return null; }
  })();
  const configPlayer = (() => {
    const raw = window.ytplayer?.config?.args?.player_response;
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  })();
  const players = [livePlayer, initialPlayer, embeddedPlayer, configPlayer].filter(Boolean);

  // Prefer the source that describes the video the panel is clipping. The live
  // player response tracks in-page navigation and ads; ytInitialPlayerResponse
  // is frozen at first page load and can describe an older video.
  const pagePlayer = players.find((player) => player?.videoDetails?.videoId === videoId) || null;
  if (!pagePlayer && players.some((player) => player?.videoDetails?.videoId)) {
    throw new Error('The YouTube tab changed videos. Reopen the clip form and try again.');
  }

  const preferredLanguage = String(window.ytcfg?.get?.('HL') || navigator.language || 'en').toLowerCase();
  const preferredRegion = String(window.ytcfg?.get?.('GL') || 'US').toUpperCase();
  const languageBase = preferredLanguage.split('-')[0];
  const visitorData = String(window.ytcfg?.get?.('VISITOR_DATA') || '');
  const apiKey = String(window.ytcfg?.get?.('INNERTUBE_API_KEY') || '');

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

  const requestInnertubeTracks = async (client) => {
    const endpoint = `/youtubei/v1/player?prettyPrint=false${apiKey ? `&key=${encodeURIComponent(apiKey)}` : ''}`;
    const headers = {
      'Content-Type': 'application/json',
      'X-YouTube-Client-Name': client.id,
      'X-YouTube-Client-Version': client.version,
    };
    if (visitorData) headers['X-Goog-Visitor-Id'] = visitorData;
    const clientContext = {
      clientName: client.name,
      clientVersion: client.version,
      hl: preferredLanguage,
      gl: preferredRegion,
    };
    if (visitorData) clientContext.visitorData = visitorData;
    const payload = {
      context: { client: clientContext },
      videoId,
      contentCheckOk: true,
      racyCheckOk: true,
    };
    if (client.embedUrl) payload.context.thirdParty = { embedUrl: client.embedUrl };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PLAYER_TIMEOUT_MS);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        credentials: 'include',
        cache: 'no-store',
        signal: controller.signal,
      });
      if (!response.ok) return { tracks: [], note: `http${response.status}` };
      const data = await response.json();
      const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
      if (!tracks.length) return { tracks: [], note: data?.playabilityStatus?.status || 'none' };
      return { tracks, note: `${tracks.length}` };
    } catch {
      return { tracks: [], note: 'unreachable' };
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
    const candidates = rankTracks((tracks || []).filter((track) => track?.baseUrl)).slice(0, MAX_TRACKS_PER_SOURCE);
    if (!candidates.length) return { status: 'none' };
    let status = 'none';
    for (const track of candidates) {
      const outcome = await requestCaptionBody(track);
      if (outcome.status === 'ok') return { status: 'ok', language: track.languageCode || '', body: outcome.body };
      if (outcome.status === 'empty') status = 'empty';
      else if (outcome.status === 'blank' && status !== 'empty') status = 'blank';
      else if (outcome.status === 'error' && status === 'none') status = 'error';
    }
    return { status };
  };

  const detail = () => notes.join(', ');
  const fail = (message) => {
    log('caption lookup failed', detail());
    const error = new Error(`${message} (${detail()})`);
    error.diag = detail();
    return error;
  };

  const pageTracks = pagePlayer?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  const pageOutcome = await readFromTracks(pageTracks);
  notes.push(`page=${pageOutcome.status}`);
  if (pageOutcome.status === 'ok') return { language: pageOutcome.language, body: pageOutcome.body, diag: detail() };

  const runClients = async () => {
    const statuses = [];
    let sawTracks = Boolean(pageTracks?.length);
    for (const client of FALLBACK_CLIENTS) {
      const { tracks, note } = await requestInnertubeTracks(client);
      if (!tracks.length) {
        statuses.push(`${client.name}:${note || 'none'}`);
        continue;
      }
      sawTracks = true;
      let outcome = await readFromTracks(tracks);
      if (outcome.status !== 'ok') outcome = await readFromTracks(tracks);
      statuses.push(`${client.name}:${outcome.status}`);
      if (outcome.status === 'ok') {
        return { ok: true, language: outcome.language, body: outcome.body, statuses, sawTracks };
      }
    }
    return { ok: false, statuses, sawTracks };
  };

  const isWalled = (result) => (
    !result.ok && result.statuses.length > 0 && result.statuses.every((entry) => entry.endsWith(':LOGIN_REQUIRED'))
  );

  let result = await runClients();
  if (isWalled(result)) {
    // Bot walls usually clear once the burst of player requests settles.
    await new Promise((resolve) => setTimeout(resolve, 750));
    notes.push('retry');
    result = await runClients();
  }
  notes.push(...result.statuses);

  if (result.ok) return { language: result.language, body: result.body, diag: detail() };

  const statuses = [pageOutcome.status, ...result.statuses.map((entry) => entry.split(':').pop())];
  if (isWalled(result)) {
    throw fail('YouTube wants confirmation that you are not a bot. Reload the video tab, make sure you are signed in, and try again.');
  }
  if (!result.sawTracks) throw fail('YouTube has no captions available for this video.');
  if (statuses.includes('error')) throw fail('Could not read captions from YouTube. Reload the video and try again.');
  throw fail('YouTube returned an empty caption track for this video.');
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

  let injection;
  try {
    [injection] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      func: readYouTubeCaptionTrack,
      args: [videoId],
    });
  } catch (error) {
    const message = String(error?.message || error || '');
    console.warn('[annotated] caption injection failed', message);
    throw new Error(message || 'YouTube returned an empty caption track for this video.');
  }
  const result = injection?.result;
  const suffix = result?.diag ? ` (${result.diag})` : '';
  if (!result?.body) {
    console.warn('[annotated] no caption body from the tab', suffix || result);
    throw new Error(`YouTube returned an empty caption track for this video.${suffix}`);
  }

  let payload = null;
  try { payload = JSON.parse(result.body); } catch { payload = null; }
  const segments = payload ? parseYouTubeJson3(payload) : [];
  if (!segments.length) {
    console.warn('[annotated] caption body had no readable events', suffix);
    throw new Error(`YouTube returned an empty caption track for this video.${suffix}`);
  }
  return { language: result.language || '', segments };
}
