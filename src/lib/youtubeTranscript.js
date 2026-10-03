/** Extract timed captions from the YouTube page the user is already viewing. */
export async function readYouTubeCaptionTrack(videoId) {
  try {
    const result = await readCaptionTrack(videoId);
    return { ok: true, language: result.language || '', body: result.body, diag: result.diag || '' };
  } catch (error) {
    const message = String(error?.message || error || '');
    if (typeof console !== 'undefined' && console.warn) console.warn('[annotated] caption lookup failed', message);
    return {
      ok: false,
      error: message || 'YouTube returned an empty caption track for this video.',
      diag: String(error?.diag || ''),
    };
  }

  async function readCaptionTrack(videoId) {
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

  const readTranscriptPanel = async () => {
    try {
      if (typeof document === 'undefined' || !document.querySelectorAll) return { status: 'unavailable' };
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const visible = (element) => {
        const rect = element?.getBoundingClientRect ? element.getBoundingClientRect() : null;
        return Boolean(rect && rect.width > 0 && rect.height > 0);
      };
      const findRows = () => [...document.querySelectorAll(
        'transcript-segment-view-model, ytd-transcript-segment-renderer, yt-transcript-segment-renderer',
      )];
      const readRows = (elements) => elements.map((element) => {
        const kids = element.children ? [...element.children] : [];
        const timestampElement = kids.find((kid) => /timestamp/i.test(String(kid.className)) && !/a11y/i.test(String(kid.className)))
          || kids.find((kid) => /timestamp/i.test(String(kid.className)))
          || kids[0];
        const timestamp = String(timestampElement?.textContent || '').trim();
        if (!/^\d{1,3}(:\d{2}){1,2}$/.test(timestamp)) return null;
        const rest = kids.filter((kid) => kid !== timestampElement);
        const textElement = rest.find((kid) => !/a11y/i.test(String(kid.className))) || rest[rest.length - 1];
        const text = String(textElement?.textContent || '').replace(/\s+/g, ' ').trim();
        if (!text || text === timestamp) return null;
        return {
          start: timestamp.split(':').reduce((total, part) => total * 60 + parseInt(part, 10), 0),
          text,
        };
      }).filter(Boolean);
      const findEntry = () => [...document.querySelectorAll('button, [role="button"]')].find((element) => (
        visible(element)
        && /show transcript/i.test((element.getAttribute?.('aria-label') || '') + (element.textContent || ''))
      ));
      const waitFor = async (fn, ms) => {
        const deadline = Date.now() + ms;
        while (Date.now() < deadline) {
          const value = fn();
          if (value) return value;
          await sleep(250);
        }
        return null;
      };
      let openedHere = false;
      let expandedHere = false;
      const cleanup = () => {
        if (openedHere) {
          try {
            const panel = findRows()[0]?.closest?.('ytd-engagement-panel-section-list-renderer') || null;
            const close = panel && [...panel.querySelectorAll('button, [role="button"]')]
              .find((element) => /close/i.test(element.getAttribute?.('aria-label') || ''));
            if (close) close.click();
            else panel?.setAttribute?.('visibility', 'ENGAGEMENT_PANEL_VISIBILITY_HIDDEN');
          } catch { /* keep whatever state YouTube already chose */ }
        }
        if (expandedHere) {
          try {
            const collapse = [...document.querySelectorAll('tp-yt-paper-button#collapse, button#collapse')].find(visible);
            collapse?.click();
          } catch { /* keep whatever state YouTube already chose */ }
        }
      };

      let rows = readRows(findRows());
      if (!rows.length) {
        let entry = findEntry();
        if (!entry) {
          const more = [...document.querySelectorAll('tp-yt-paper-button, button, span, a')]
            .filter((element) => visible(element)
              && /^(…|\.\.\.)\s*more$/i.test((element.textContent || '').trim())
              && element.id !== 'expand-sizer')
            .sort((a, b) => a.tagName.length - b.tagName.length)[0];
          if (!more) return { status: 'unavailable' };
          more.click();
          expandedHere = true;
          entry = await waitFor(findEntry, 5000);
        }
        if (!entry) {
          cleanup();
          return { status: 'unavailable' };
        }
        entry.click();
        openedHere = true;
        rows = await waitFor(() => {
          const found = readRows(findRows());
          return found.length ? found : null;
        }, 10000) || [];
        if (!rows.length) {
          cleanup();
          return { status: 'empty' };
        }
      }

      // The panel lazy-renders rows; jump to the end to force the rest out.
      const panel = findRows()[0]?.closest?.('ytd-engagement-panel-section-list-renderer') || null;
      const scroller = panel && [...panel.querySelectorAll('*')].find((element) => element.scrollHeight > element.clientHeight + 20);
      for (let round = 0; scroller && round < 12; round += 1) {
        const before = scroller.scrollTop;
        scroller.scrollTop = scroller.scrollHeight;
        await sleep(350);
        const seen = new Set(rows.map((row) => row.start));
        for (const row of readRows(findRows())) {
          if (!seen.has(row.start)) rows.push(row);
        }
        if (scroller.scrollTop === before) break;
      }
      rows.sort((a, b) => a.start - b.start);
      const events = rows.map((row, index) => {
        const next = rows[index + 1];
        return {
          tStartMs: Math.round(row.start * 1000),
          dDurationMs: next && next.start > row.start ? Math.round((next.start - row.start) * 1000) : 4000,
          segs: [{ utf8: row.text }],
        };
      });
      cleanup();
      if (!events.length) return { status: 'empty' };
      return { status: 'ok', body: JSON.stringify({ events }) };
    } catch (error) {
      log('transcript panel lookup failed', error);
      return { status: 'unavailable' };
    }
  };

  let result = await runClients();
  for (const waitMs of [750, 1500]) {
    if (result.ok) break;
    // Walls and blank sweeps usually clear as the burst of player requests settles.
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    notes.push('retry');
    result = await runClients();
  }
  notes.push(...result.statuses);

  if (result.ok) return { language: result.language, body: result.body, diag: detail() };

  // The panel uses the page's own attested request, so it still works when
  // direct caption URLs and fallback clients are walled off.
  const panelOutcome = await readTranscriptPanel();
  notes.push(`panel=${panelOutcome.status}`);
  if (panelOutcome.status === 'ok') {
    return { language: preferredLanguage, body: panelOutcome.body, diag: detail() };
  }

  const CONTENT_STATUSES = new Set(['none', 'blank', 'empty', 'OK']);
  const statuses = [pageOutcome.status, ...result.statuses.map((entry) => entry.split(':').pop())];
  if (statuses.some((status) => status === 'LOGIN_REQUIRED')) {
    throw fail('YouTube is temporarily blocking caption requests from this tab. Reload the video tab and try again in a moment.');
  }
  if (statuses.some((status) => !CONTENT_STATUSES.has(status))) {
    throw fail('Could not read captions from YouTube. Reload the video and try again.');
  }
  if (!result.sawTracks) throw fail('YouTube has no captions available for this video.');
  throw fail('YouTube returned an empty caption track for this video.');
  }
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
    const segs = (event.segs || []).map((segment) => ({
      text: String(segment.utf8 ?? ''),
      offset: Number(segment.tOffsetMs),
    }));
    return [{ start, end, text, segs }];
  });
}

export function formatYouTubeTranscript(segments) {
  return segments.map(({ text }) => text).filter(Boolean).join(' ').replace(/>>\s*/g, '').trim();
}

const SENTENCE_END_GLOBAL = /[.!?][)"'’”]*/g;
const SENTENCE_END_AT_FINISH = /[.!?][)"'’”]*$/;

function selectionStartsMidSentence(segments, firstIndex) {
  for (let i = firstIndex - 1; i >= 0; i -= 1) {
    const previous = String(segments[i]?.text || '').replace(/>>\s*/g, '').trim();
    if (previous) return !SENTENCE_END_AT_FINISH.test(previous);
  }
  return false;
}

function trimToSentenceBoundaries(text, startsMidSentence) {
  let out = String(text || '').trim();
  if (!out) return '';

  if (startsMidSentence) {
    SENTENCE_END_GLOBAL.lastIndex = 0;
    const firstEnd = SENTENCE_END_GLOBAL.exec(out);
    if (firstEnd) out = out.slice(firstEnd.index + firstEnd[0].length).trim();
  }

  let lastEnd = null;
  SENTENCE_END_GLOBAL.lastIndex = 0;
  for (let match = SENTENCE_END_GLOBAL.exec(out); match; match = SENTENCE_END_GLOBAL.exec(out)) {
    lastEnd = match;
  }
  if (lastEnd) out = out.slice(0, lastEnd.index + lastEnd[0].length).trim();

  return out;
}

export function excerptYouTubeTranscript(segments, startSec, endSec) {
  const start = Number(startSec);
  const end = Number(endSec);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return '';
  const selected = segments.filter((segment) => (
    segment.start < end && (segment.end > start || segment.end === segment.start)
  ));
  if (!selected.length) return '';
  const firstIndex = segments.indexOf(selected[0]);
  return trimToSentenceBoundaries(
    formatYouTubeTranscript(selected),
    selectionStartsMidSentence(segments, firstIndex),
  );
}

const sessionTranscripts = new Map();

export async function fetchYouTubeTranscript(videoId) {
  const cached = sessionTranscripts.get(videoId);
  if (cached?.segments?.length) return cached;

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
    throw new Error(message || 'Could not read captions from YouTube. Reload the video tab and try again.');
  }
  const result = injection?.result;
  if (result && result.ok === false) {
    console.warn('[annotated] caption reader reported failure', result.diag || '');
    throw new Error(result.error || `YouTube returned an empty caption track for this video.${result.diag ? ` (${result.diag})` : ''}`);
  }
  const suffix = result?.diag ? ` (${result.diag})` : '';
  if (!result?.body) {
    console.warn('[annotated] no caption body from the tab', suffix || result);
    throw new Error(result
      ? `YouTube returned an empty caption track for this video.${suffix}`
      : 'Could not read captions from YouTube. Reload the video tab and try again.');
  }

  let payload = null;
  try { payload = JSON.parse(result.body); } catch { payload = null; }
  const segments = payload ? parseYouTubeJson3(payload) : [];
  if (!segments.length) {
    console.warn('[annotated] caption body had no readable events', suffix);
    throw new Error(`YouTube returned an empty caption track for this video.${suffix}`);
  }
  const entry = { language: result.language || '', segments };
  if (sessionTranscripts.size >= 8) sessionTranscripts.delete(sessionTranscripts.keys().next().value);
  sessionTranscripts.set(videoId, entry);
  return entry;
}
