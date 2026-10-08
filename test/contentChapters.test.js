import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../content.js', import.meta.url), 'utf8');

// content.js wraps itself in a block so re-injection never redeclares.
// Pull the chapter helpers out verbatim (closing brace at column 0 ends
// each top-level function) and run that real code in the sandbox.
function extractFns(src, names) {
  const closer = /\r?\n\}\r?\n/;
  return names.map((name) => {
    let start = src.indexOf(`async function ${name}(`);
    if (start === -1) start = src.indexOf(`function ${name}(`);
    assert.ok(start !== -1, `missing function ${name}`);
    const tail = src.slice(start);
    const m = tail.match(closer);
    assert.ok(m && m.index !== undefined, `unclosed function ${name}`);
    return tail.slice(0, m.index + m[0].length);
  }).join('\n');
}

const chapterCode = extractFns(source, [
  'isAdPlaying',
  'getVideoDetails',
  'getDurationFromPage',
  'ytChapterSeconds',
  'ytCleanChapters',
  'ytDomChapters',
  'getYouTubeChapters',
]);

function fmtTime(total) {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Fake marker element the way ytDomChapters reads it.
const markerEl = (t, title) => ({ innerText: `${fmtTime(t)}\n${title}` });

// Loads content.js with a stub page. markerReads is the list of marker
// arrays returned by successive chapter queries (last one repeats),
// letting tests simulate progressive renders.
function loadPage({ markerReads, sidebarMarkers = [], adPlaying = false, videoDuration = 0 }) {
  let calls = 0;
  const pick = () => markerReads[Math.min(calls++, markerReads.length - 1)];
  const metadataScope = { querySelectorAll: () => pick() };
  const playerScope = {
    querySelectorAll: () => [],
    classList: { contains: (name) => adPlaying && name.indexOf('ad-') === 0 },
    getPlayerResponse: undefined,
  };
  const pageUrl = 'https://www.youtube.com/watch?v=vid1';
  const sandbox = {
    document: {
      title: 'Test video - YouTube',
      addEventListener: () => {},
      querySelector: (sel) => {
        if (sel === 'ytd-watch-metadata') return metadataScope;
        if (sel === '#movie_player') return playerScope;
        if (sel === '.html5-video-player') return playerScope;
        if (sel === 'video') return videoDuration ? { duration: videoDuration } : null;
        if (sel === '.ytp-time-duration') return null;
        return null;
      },
      querySelectorAll: () => sidebarMarkers,
    },
    window: {
      addEventListener: () => {},
      location: { href: pageUrl, search: '?v=vid1' },
    },
    location: { href: pageUrl, search: '?v=vid1' },
    chrome: {
      runtime: {
        onMessage: { removeListener: () => {}, addListener: () => {} },
        sendMessage: () => ({ catch: () => {} }),
      },
    },
    setTimeout,
    clearTimeout,
    URL,
    URLSearchParams,
  };
  vm.createContext(sandbox);
  vm.runInContext(chapterCode, sandbox);
  return {
    // JSON round-trip: values built inside vm carry the vm realm's prototypes.
    chapters: async () => JSON.parse(JSON.stringify(await vm.runInContext('getYouTubeChapters()', sandbox))),
  };
}

const eight = [0, 60, 120, 180, 240, 300, 360, 420].map((t, i) => markerEl(t, `Chapter ${i + 1}`));
const titles = (list) => list.map((c) => c.title);

test('stable markers return immediately and completely', async () => {
  const page = loadPage({ markerReads: [eight] });
  const out = await page.chapters();
  assert.deepEqual(titles(out), eight.map((_, i) => `Chapter ${i + 1}`));
});

test('half-rendered markers resolve to the full list, never the partial one', async () => {
  const seven = eight.slice(0, 7);
  const page = loadPage({ markerReads: [seven, seven, eight, eight] });
  const out = await page.chapters();
  assert.equal(out.length, 8);
  assert.equal(out[7].title, 'Chapter 8');
});

test('shrinking reads keep the longest list seen', async () => {
  const page = loadPage({ markerReads: [eight, eight, eight.slice(0, 7), eight.slice(0, 7)] });
  const out = await page.chapters();
  assert.equal(out.length, 8);
});

test('a late-appearing list still resolves', async () => {
  const page = loadPage({ markerReads: [[], [], eight, eight] });
  const out = await page.chapters();
  assert.equal(out.length, 8);
});

test('other videos markers outside the main surfaces are ignored', async () => {
  const polluters = [markerEl(0, 'Up next junk'), markerEl(30, 'Hover card junk'), markerEl(90, 'End screen junk')];
  const page = loadPage({ markerReads: [eight], sidebarMarkers: polluters });
  const out = await page.chapters();
  assert.equal(out.length, 8);
  assert.ok(!titles(out).some((t) => /junk/i.test(t)));
});

test('no markers anywhere means no chapters, not scraped text', async () => {
  const page = loadPage({ markerReads: [[]] });
  const out = await page.chapters();
  assert.deepEqual(out, []);
});

test('ad-length durations never filter out real chapters', async () => {
  const long = [0, 300, 900, 1800, 2400].map((t, i) => markerEl(t, `Part ${i + 1}`));
  const page = loadPage({ markerReads: [long], adPlaying: true, videoDuration: 15 });
  const out = await page.chapters();
  assert.equal(out.length, 5);
});

test('real durations still cap over-long entries', async () => {
  const items = [markerEl(0, 'A'), markerEl(100, 'B'), markerEl(200, 'C'), markerEl(5000, 'Far')];
  const page = loadPage({ markerReads: [items], adPlaying: false, videoDuration: 500 });
  const out = await page.chapters();
  assert.deepEqual(titles(out), ['A', 'B', 'C']);
});
