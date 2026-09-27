import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { excerptYouTubeTranscript, fetchYouTubeTranscript, formatYouTubeTranscript, parseYouTubeJson3, readYouTubeCaptionTrack } from '../src/lib/youtubeTranscript.js';

const pageCaptionBody = JSON.stringify({ events: [
  { tStartMs: 0, dDurationMs: 1200, segs: [{ utf8: 'Hello from captions.' }] },
] });

function pageSandbox({ tracks, playerResponse, fetchImpl }) {
  const ytcfg = { HL: 'en-US', GL: 'US', INNERTUBE_API_KEY: 'test-key' };
  return {
    window: {
      ytcfg: { get: (key) => ytcfg[key] },
      ytInitialPlayerResponse: playerResponse || (tracks ? {
        videoDetails: { videoId: 'abc123' },
        captions: { playerCaptionsTracklistRenderer: { captionTracks: tracks } },
      } : undefined),
    },
    document: { querySelector: () => null },
    location: { origin: 'https://www.youtube.com' },
    navigator: { language: 'en-US' },
    URL,
    AbortController,
    setTimeout,
    clearTimeout,
    fetch: fetchImpl,
  };
}

async function runCaptionReader(sandbox, videoId = 'abc123') {
  const factory = vm.runInNewContext(`(${readYouTubeCaptionTrack.toString()})`, sandbox);
  return factory(videoId);
}

const segments = [
  { start: 0, end: 2, text: 'First line.' },
  { start: 2, end: 4, text: 'Second line.' },
  { start: 4, end: 6, text: 'Third line.' },
];

test('formats a complete caption track into readable text', () => {
  assert.equal(formatYouTubeTranscript(segments), 'First line. Second line. Third line.');
});

test('parses YouTube JSON3 caption events and infers missing event durations', () => {
  assert.deepEqual(parseYouTubeJson3({ events: [
    { tStartMs: 1000, segs: [{ utf8: 'First ' }, { utf8: 'caption.' }] },
    { tStartMs: 3000, dDurationMs: 1500, segs: [{ utf8: 'Next.' }] },
    { segs: [{ utf8: 'Formatting metadata, not a caption.' }] },
  ] }), [
    { start: 1, end: 3, text: 'First caption.' },
    { start: 3, end: 4.5, text: 'Next.' },
  ]);
});

test('returns only caption segments overlapping the selected clip range', () => {
  assert.equal(excerptYouTubeTranscript(segments, 1.5, 4.5), 'First line. Second line. Third line.');
  assert.equal(excerptYouTubeTranscript(segments, 2, 4), 'Second line.');
});

test('returns empty text for invalid ranges or ranges without captions', () => {
  assert.equal(excerptYouTubeTranscript(segments, 4, 4), '');
  assert.equal(excerptYouTubeTranscript(segments, 10, 12), '');
  assert.equal(excerptYouTubeTranscript(segments, Number.NaN, 12), '');
});

test('keeps whole sentences by trimming the fragments the timer cut off', () => {
  const captionLines = [
    { start: 0, end: 1, text: 'It was a dark' },
    { start: 1, end: 3, text: 'and stormy night. Then the' },
    { start: 3, end: 5, text: 'storm finally cleared. After that' },
  ];
  assert.equal(excerptYouTubeTranscript(captionLines, 1.5, 4), 'Then the storm finally cleared.');
});

test('drops a trailing fragment cut off by the timer', () => {
  const captionLines = [
    { start: 0, end: 2, text: 'Hello there.' },
    { start: 2, end: 4, text: 'This sentence gets cut off' },
  ];
  assert.equal(excerptYouTubeTranscript(captionLines, 0, 3), 'Hello there.');
});

test('keeps text that has no sentence punctuation to trim against', () => {
  const captionLines = [
    { start: 0, end: 1, text: 'It was a dark' },
    { start: 1, end: 3, text: 'and stormy night' },
  ];
  assert.equal(excerptYouTubeTranscript(captionLines, 1.5, 3), 'and stormy night');
});

test('reads captions from the page player without calling any module scope helper', async () => {
  const requests = [];
  const sandbox = pageSandbox({
    tracks: [{ baseUrl: 'https://www.youtube.com/api/timedtext?v=abc123', languageCode: 'en' }],
    fetchImpl: async (url) => {
      requests.push(String(url));
      return { ok: true, text: async () => pageCaptionBody };
    },
  });

  const result = await runCaptionReader(sandbox);

  assert.equal(result.language, 'en');
  assert.deepEqual(JSON.parse(result.body), JSON.parse(pageCaptionBody));
  assert.equal(requests.length, 1);
  assert.ok(requests[0].includes('/api/timedtext'));
});

test('falls back to the YouTube player API when the page caption URL comes back empty', async () => {
  const fallbackBody = JSON.stringify({ events: [
    { tStartMs: 500, dDurationMs: 900, segs: [{ utf8: 'Fallback line.' }] },
  ] });
  const requests = [];
  let timedtextCalls = 0;
  const sandbox = pageSandbox({
    tracks: [{ baseUrl: 'https://www.youtube.com/api/timedtext?v=abc123', languageCode: 'en' }],
    fetchImpl: async (url, init) => {
      const target = String(url);
      requests.push(target);
      if (target.includes('/youtubei/v1/player')) {
        assert.equal(init?.method, 'POST');
        assert.match(init.body, /"clientName":"IOS"/);
        assert.match(init.body, /"videoId":"abc123"/);
        return {
          ok: true,
          json: async () => ({ captions: { playerCaptionsTracklistRenderer: { captionTracks: [
            { baseUrl: 'https://www.youtube.com/api/timedtext?v=abc123&lang=en', languageCode: 'en' },
            { baseUrl: 'https://www.youtube.com/api/timedtext?v=abc123&lang=ar', languageCode: 'ar' },
          ] } } }),
        };
      }
      timedtextCalls += 1;
      if (timedtextCalls === 1) return { ok: true, text: async () => '' };
      return { ok: true, text: async () => fallbackBody };
    },
  });

  const result = await runCaptionReader(sandbox);

  assert.equal(result.language, 'en');
  assert.equal(JSON.parse(result.body).events[0].segs[0].utf8, 'Fallback line.');
  assert.equal(timedtextCalls, 2);
  assert.equal(requests.filter((target) => target.includes('/youtubei/')).length, 1);
});

test('explains when a video has no captions available at all', async () => {
  const sandbox = pageSandbox({
    tracks: undefined,
    fetchImpl: async (url) => {
      assert.ok(String(url).includes('/youtubei/v1/player'));
      return { ok: true, json: async () => ({}) };
    },
  });

  const result = await runCaptionReader(sandbox);

  assert.equal(result.ok, false);
  assert.match(result.error, /no captions available/);
});

test('falls back to the next innertube client when the first returns no caption tracks', async () => {
  const playerRequests = [];
  const sandbox = pageSandbox({
    tracks: undefined,
    fetchImpl: async (url, init) => {
      const target = String(url);
      if (target.includes('/youtubei/v1/player')) {
        playerRequests.push(init.body);
        if (init.body.includes('"clientName":"IOS"')) {
          return { ok: true, json: async () => ({ playabilityStatus: { status: 'LOGIN_REQUIRED' } }) };
        }
        assert.match(init.body, /"clientName":"TVHTML5"/);
        return {
          ok: true,
          json: async () => ({ captions: { playerCaptionsTracklistRenderer: { captionTracks: [
            { baseUrl: 'https://www.youtube.com/api/timedtext?v=abc123&lang=en', languageCode: 'en' },
          ] } } }),
        };
      }
      return { ok: true, text: async () => pageCaptionBody };
    },
  });

  const result = await runCaptionReader(sandbox);

  assert.equal(result.language, 'en');
  assert.equal(JSON.parse(result.body).events[0].segs[0].utf8, 'Hello from captions.');
  assert.equal(playerRequests.length, 2);
  assert.match(playerRequests[0], /"clientName":"IOS"/);
  assert.match(playerRequests[1], /"clientName":"TVHTML5"/);
});

test('reports where the caption lookup failed when every source comes back blank', async () => {
  const sandbox = pageSandbox({
    tracks: [{ baseUrl: 'https://www.youtube.com/api/timedtext?v=abc123', languageCode: 'en' }],
    fetchImpl: async (url) => {
      if (String(url).includes('/youtubei/v1/player')) return { ok: true, json: async () => ({}) };
      return { ok: true, text: async () => '' };
    },
  });

  const result = await runCaptionReader(sandbox);

  assert.equal(result.ok, false);
  assert.match(result.error, /empty caption track.*page=blank.*IOS:none/);
});

test('explains when YouTube demands a bot check instead of captions', async () => {
  const sandbox = pageSandbox({
    tracks: [{ baseUrl: 'https://www.youtube.com/api/timedtext?v=abc123', languageCode: 'en' }],
    fetchImpl: async (url) => {
      if (String(url).includes('/youtubei/v1/player')) {
        return { ok: true, json: async () => ({ playabilityStatus: { status: 'LOGIN_REQUIRED' } }) };
      }
      return { ok: true, text: async () => '' };
    },
  });

  const result = await runCaptionReader(sandbox);

  assert.equal(result.ok, false);
  assert.match(result.error, /blocking caption requests.*page=blank.*IOS:LOGIN_REQUIRED/);
  assert.match(result.diag, /panel=unavailable/);
});

test('retries the player API once when a bot wall clears', async () => {
  let playerCalls = 0;
  const sandbox = pageSandbox({
    tracks: undefined,
    fetchImpl: async (url) => {
      if (!String(url).includes('/youtubei/v1/player')) return { ok: true, text: async () => pageCaptionBody };
      playerCalls += 1;
      if (playerCalls <= 4) {
        return { ok: true, json: async () => ({ playabilityStatus: { status: 'LOGIN_REQUIRED' } }) };
      }
      return {
        ok: true,
        json: async () => ({ captions: { playerCaptionsTracklistRenderer: { captionTracks: [
          { baseUrl: 'https://www.youtube.com/api/timedtext?v=abc123&lang=en', languageCode: 'en' },
        ] } } }),
      };
    },
  });

  const result = await runCaptionReader(sandbox);

  assert.equal(JSON.parse(result.body).events[0].segs[0].utf8, 'Hello from captions.');
  assert.equal(playerCalls, 5);
  assert.match(result.diag, /retry/);
});

test('reads captions from the live player response after in-page navigation', async () => {
  const tracks = [{ baseUrl: 'https://www.youtube.com/api/timedtext?v=abc123', languageCode: 'en' }];
  const requests = [];
  const sandbox = pageSandbox({
    playerResponse: { videoDetails: { videoId: 'stale99' } },
    fetchImpl: async (url) => {
      requests.push(String(url));
      return { ok: true, text: async () => pageCaptionBody };
    },
  });
  sandbox.document.querySelector = (selector) => (
    selector === '#movie_player'
      ? {
        getPlayerResponse: () => ({
          videoDetails: { videoId: 'abc123' },
          captions: { playerCaptionsTracklistRenderer: { captionTracks: tracks } },
        }),
      }
      : null
  );

  const result = await runCaptionReader(sandbox);

  assert.equal(result.language, 'en');
  assert.equal(requests.length, 1);
});

test('rejects when the YouTube tab has moved to a different video', async () => {
  const sandbox = pageSandbox({
    playerResponse: { videoDetails: { videoId: 'other123' } },
    fetchImpl: async () => { throw new Error('should not fetch captions'); },
  });

  const result = await runCaptionReader(sandbox);

  assert.equal(result.ok, false);
  assert.match(result.error, /changed videos/);
});

function panelChrome(videoId, executeScript) {
  return {
    tabs: { query: async () => [{ id: 7, url: `https://www.youtube.com/watch?v=${videoId}` }] },
    scripting: { executeScript },
  };
}

test('surfaces the caption reader failure envelope from the panel', async () => {
  const originalChrome = globalThis.chrome;
  globalThis.chrome = panelChrome('wall01', async () => [{
    result: {
      ok: false,
      error: 'YouTube is temporarily blocking caption requests from this tab. Reload the video tab and try again in a moment. (page=blank, retry, IOS:LOGIN_REQUIRED)',
      diag: 'page=blank, retry, IOS:LOGIN_REQUIRED',
    },
  }]);
  try {
    await assert.rejects(() => fetchYouTubeTranscript('wall01'), /blocking caption requests/);
  } finally {
    globalThis.chrome = originalChrome;
  }
});

test('asks for a reload when the tab returns no caption result at all', async () => {
  const originalChrome = globalThis.chrome;
  globalThis.chrome = panelChrome('gone01', async () => [{}]);
  try {
    await assert.rejects(() => fetchYouTubeTranscript('gone01'), /Reload the video tab/);
  } finally {
    globalThis.chrome = originalChrome;
  }
});

test('serves the same video from the session cache without querying the tab again', async () => {
  const originalChrome = globalThis.chrome;
  let injections = 0;
  globalThis.chrome = panelChrome('cached01', async () => {
    injections += 1;
    return [{ result: { ok: true, language: 'en', body: pageCaptionBody, diag: 'page=ok' } }];
  });
  try {
    const first = await fetchYouTubeTranscript('cached01');
    assert.equal(first.segments[0].text, 'Hello from captions.');
    const second = await fetchYouTubeTranscript('cached01');
    assert.equal(second, first);
    assert.equal(injections, 1);
  } finally {
    globalThis.chrome = originalChrome;
  }
});

test('reports the bot wall even when one client fails with a playability error', async () => {
  const sandbox = pageSandbox({
    tracks: [{ baseUrl: 'https://www.youtube.com/api/timedtext?v=abc123', languageCode: 'en' }],
    fetchImpl: async (url, init) => {
      if (String(url).includes('/youtubei/v1/player')) {
        if (init.body.includes('"clientName":"WEB_EMBEDDED_PLAYER"')) {
          return { ok: true, json: async () => ({ playabilityStatus: { status: 'ERROR' } }) };
        }
        return { ok: true, json: async () => ({ playabilityStatus: { status: 'LOGIN_REQUIRED' } }) };
      }
      return { ok: true, text: async () => '' };
    },
  });

  const result = await runCaptionReader(sandbox);

  assert.equal(result.ok, false);
  assert.match(result.error, /blocking caption requests/);
  assert.match(result.diag, /WEB_EMBEDDED_PLAYER:ERROR/);
});

test('reports network failures before claiming a video has no captions', async () => {
  const sandbox = pageSandbox({
    tracks: undefined,
    fetchImpl: async () => { throw new Error('offline'); },
  });

  const result = await runCaptionReader(sandbox);

  assert.equal(result.ok, false);
  assert.match(result.error, /Could not read captions/);
});

test('reads the transcript panel when direct caption requests come back blank', async () => {
  const makeRow = (timestamp, text) => ({
    children: [
      { className: 'ytwTranscriptSegmentViewModelTimestamp', textContent: timestamp },
      { className: 'ytwTranscriptSegmentViewModelTimestampA11yLabel', textContent: `${timestamp} a11y` },
      { className: 'ytwTranscriptSegmentViewModelText', textContent: text },
    ],
  });
  const sandbox = pageSandbox({
    tracks: [{ baseUrl: 'https://www.youtube.com/api/timedtext?v=abc123', languageCode: 'en' }],
    fetchImpl: async (url) => {
      if (String(url).includes('/youtubei/v1/player')) return { ok: true, json: async () => ({}) };
      return { ok: true, text: async () => '' };
    },
  });
  sandbox.document.querySelectorAll = (selector) => {
    if (/transcript-segment/.test(selector)) {
      return [makeRow('0:01', 'Hello from the panel.'), makeRow('0:05', 'Second panel line.')];
    }
    return [];
  };

  const result = await runCaptionReader(sandbox);

  assert.equal(result.language, 'en-us');
  const parsed = parseYouTubeJson3(JSON.parse(result.body));
  assert.deepEqual(parsed.map(({ start, text }) => ({ start, text })), [
    { start: 1, text: 'Hello from the panel.' },
    { start: 5, text: 'Second panel line.' },
  ]);
  assert.match(result.diag, /page=blank.*panel=ok/);
});
