import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { excerptYouTubeTranscript, formatYouTubeTranscript, parseYouTubeJson3, readYouTubeCaptionTrack } from '../src/lib/youtubeTranscript.js';

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

  await assert.rejects(() => runCaptionReader(sandbox), /no captions available/);
});

test('rejects when the YouTube tab has moved to a different video', async () => {
  const sandbox = pageSandbox({
    playerResponse: { videoDetails: { videoId: 'other123' } },
    fetchImpl: async () => { throw new Error('should not fetch captions'); },
  });

  await assert.rejects(() => runCaptionReader(sandbox), /changed videos/);
});
