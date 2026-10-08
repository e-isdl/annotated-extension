import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readChaptersMainWorld } from '../src/lib/youtubeChapters.js';

const markerEl = (t, title) => ({ innerText: `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}\n${title}` });
const markerList = (pairs) => pairs.map(([t, title]) => markerEl(t, title));

async function run(args, page) {
  let domCalls = 0;
  const reads = page.markerReads || [[]];
  const domMarkers = () => reads[Math.min(domCalls++, reads.length - 1)];
  const metadataScope = { querySelectorAll: () => domMarkers() };
  const resolveLive = () => {
    if (typeof page.liveFn === 'function') return page.liveFn();
    if (page.liveResponse !== undefined) return page.liveResponse;
    if (page.player && page.player.getPlayerResponse) return page.player.getPlayerResponse();
    // Default: a live player already on the wanted video carrying nothing,
    // so tests focus on the source under test instead of the wait loop.
    return { videoDetails: { videoId: args.videoId } };
  };
  const playerScope = {
    querySelectorAll: () => [],
    getPlayerResponse: page.noPlayerResponse ? undefined : () => resolveLive(),
    getVideoData: () => ({ video_id: resolveLive()?.videoDetails?.videoId }),
  };
  const sandbox = {
    window: {
      location: undefined,
      ytInitialData: page.ytInitialData,
      ytInitialPlayerResponse: page.ytInitialPlayerResponse,
      ytplayer: page.ytplayer,
    },
    document: {
      querySelector: (sel) => {
        if (sel === '#movie_player') return page.noPlayer ? null : playerScope;
        if (sel === 'ytd-watch-metadata') {
          return page.markerReads !== undefined && !page.noScopes ? metadataScope : null;
        }
        if (sel === '#description-inline-expander' || sel === '#description') return null;
        return null;
      },
    },
    URL,
    JSON,
    setTimeout,
    clearTimeout,
  };
  sandbox.window.location = { href: page.href };
  // The function reads window.location.href directly.
  const factory = vm.runInNewContext(`(${readChaptersMainWorld.toString()})`, sandbox);
  // JSON round-trip: values built inside vm carry the vm realm's prototypes.
  return JSON.parse(JSON.stringify(await factory(args)));
}

function RomansLive(id, chapters) {
  return {
    videoDetails: { videoId: id },
    playerOverlays: {
      playerOverlayRenderer: {
        'decoratedPlayerBarRenderer-decoratedPlayerBarRenderer': {
          decoratedPlayerBarRenderer: {
            playerBar: {
              multiMarkersPlayerBarRenderer: {
                markersMap: [{
                  key: 'CHAPTER',
                  value: {
                    chaptersArray: {
                      chapters: chapters.map(([ms, title]) => ({
                        chapterRenderer: { title: { simpleText: title }, timeRangeStartMillis: ms },
                      })),
                    },
                  },
                }],
              },
            },
          },
        },
      },
    },
  };
}

const VID_B = [[0, 'Intro'], [120000, 'Middle'], [300000, 'End']];
const VID_A = [[0, 'Old one'], [60000, 'Old two'], [180000, 'Old three']];

function globalsFor(id, chapters) {
  // Real page globals name their video; the reader only trusts matching roots.
  const items = [0, 1, 2].map((i) => (
    { chapterRenderer: { title: { simpleText: chapters[i][1] }, timeRangeStartMillis: chapters[i][0] } }
  ));
  return {
    currentVideoEndpoint: { watchEndpoint: { videoId: id } },
    videoDetails: { videoId: id },
    contents: { secondary: items },
  };
}

// Real watch-page globals always name their video; unnamed roots are
// rejected, so fixtures must carry the id like production does.
const asVideo = (id, obj) => ({
  ...obj,
  currentVideoEndpoint: { watchEndpoint: { videoId: id } },
  videoDetails: { videoId: id },
});

test('live player wins over stale globals for the wanted video', async () => {
  const out = await run({ videoId: 'BBB', duration: 400 }, {
    href: 'https://www.youtube.com/watch?v=BBB',
    live: true,
    player: { getPlayerResponse: () => RomansLive('BBB', VID_B) },
    ytInitialData: globalsFor('AAA', VID_A),
  });
  assert.equal(out.videoId, 'BBB');
  assert.equal(out.playerVideoId, 'BBB');
  assert.deepEqual(out.chapters.map((c) => c.title), ['Intro', 'Middle', 'End']);
});

test('stale live player refuses instead of serving globals', async () => {
  const out = await run({ videoId: 'BBB', duration: 400 }, {
    href: 'https://www.youtube.com/watch?v=BBB',
    live: true,
    player: { getPlayerResponse: () => RomansLive('AAA', VID_A) },
    ytInitialData: globalsFor('BBB', VID_B),
  });
  assert.deepEqual(out.chapters, []);
  assert.equal(out.playerVideoId, 'AAA');
});

test('catching-up player resolves once it matches', async () => {
  let calls = 0;
  const out = await run({ videoId: 'BBB', duration: 400 }, {
    href: 'https://www.youtube.com/watch?v=BBB',
    liveFn: () => (++calls <= 2 ? RomansLive('AAA', VID_A) : RomansLive('BBB', VID_B)),
  });
  assert.equal(out.playerVideoId, 'BBB');
  assert.deepEqual(out.chapters.map((c) => c.title), ['Intro', 'Middle', 'End']);
});

test('missing player refuses instead of guessing', async () => {
  const out = await run({ videoId: 'BBB', duration: 400 }, {
    href: 'https://www.youtube.com/watch?v=BBB',
    noPlayer: true,
    ytInitialData: globalsFor('BBB', VID_B),
  });
  assert.deepEqual(out.chapters, []);
});

test('getVideoData-only players still identify the video', async () => {
  const out = await run({ videoId: 'BBB', duration: 400 }, {
    href: 'https://www.youtube.com/watch?v=BBB',
    noPlayerResponse: true,
    ytInitialData: globalsFor('BBB', VID_B),
  });
  assert.deepEqual(out.chapters.map((c) => c.title), ['Intro', 'Middle', 'End']);
});

test('globals alone still work without any player', async () => {
  const out = await run({ videoId: 'BBB', duration: 400 }, {
    href: 'https://www.youtube.com/watch?v=BBB',
    live: undefined,
    player: null,
    ytInitialData: globalsFor('BBB', VID_B),
  });
  assert.deepEqual(out.chapters.map((c) => [c.t, c.title]), [[0, 'Intro'], [120, 'Middle'], [300, 'End']]);
});

test('macro markers support startTimeSeconds and timeDescription fallback', async () => {
  const out = await run({ videoId: 'v', duration: 400 }, {
    href: 'https://www.youtube.com/watch?v=v',
    live: undefined,
    player: null,
    ytInitialData: asVideo('v', { items: [
      { macroMarkersListItemRenderer: { title: { simpleText: 'First' }, startTimeSeconds: 0 } },
      { macroMarkersListItemRenderer: { title: { simpleText: 'Second' }, timeDescription: { simpleText: '2:00' } } },
      { macroMarkersListItemRenderer: { title: { simpleText: 'Third' }, startTimeSeconds: 200 } },
    ] }),
  });
  assert.deepEqual(out.chapters.map((c) => [c.t, c.title]), [[0, 'First'], [120, 'Second'], [200, 'Third']]);
});

test('fewer than three chapters means no chapters', async () => {
  const out = await run({ videoId: 'v', duration: 400 }, {
    href: 'https://www.youtube.com/watch?v=v',
    live: undefined,
    player: null,
    ytInitialData: asVideo('v', { items: [
      { macroMarkersListItemRenderer: { title: { simpleText: 'Only' }, startTimeSeconds: 0 } },
      { macroMarkersListItemRenderer: { title: { simpleText: 'Two' }, startTimeSeconds: 60 } },
    ] }),
  });
  assert.deepEqual(out.chapters, []);
});

test('feature-length durations cap over-long entries, ad lengths do not', async () => {
  const data = asVideo('v', { items: [
    { macroMarkersListItemRenderer: { title: { simpleText: 'A' }, startTimeSeconds: 0 } },
    { macroMarkersListItemRenderer: { title: { simpleText: 'B' }, startTimeSeconds: 100 } },
    { macroMarkersListItemRenderer: { title: { simpleText: 'C' }, startTimeSeconds: 200 } },
    { macroMarkersListItemRenderer: { title: { simpleText: 'Far' }, startTimeSeconds: 5000 } },
  ] });
  const page = { href: 'https://www.youtube.com/watch?v=v', live: undefined, player: null, ytInitialData: data };
  const capped = await run({ videoId: 'v', duration: 400 }, page);
  assert.deepEqual(capped.chapters.map((c) => c.title), ['A', 'B', 'C']);
  const adLength = await run({ videoId: 'v', duration: 15 }, page);
  assert.deepEqual(adLength.chapters.map((c) => c.title), ['A', 'B', 'C', 'Far']);
});

test('duplicate times collapse, garbage rows are skipped', async () => {
  const out = await run({ videoId: 'v', duration: 400 }, {
    href: 'https://www.youtube.com/watch?v=v',
    live: undefined,
    player: null,
    ytInitialData: asVideo('v', { items: [
      { macroMarkersListItemRenderer: { title: { simpleText: 'A' }, startTimeSeconds: 0 } },
      { macroMarkersListItemRenderer: { title: { simpleText: 'A dup' }, startTimeSeconds: 0 } },
      { macroMarkersListItemRenderer: { title: { simpleText: '' }, startTimeSeconds: 50 } },
      { macroMarkersListItemRenderer: { title: { simpleText: 'No time' } } },
      { chapterRenderer: { title: { simpleText: 'B' }, timeRangeStartMillis: 90000 } },
      { chapterRenderer: { title: { simpleText: 'C' }, timeRangeStartMillis: 200000 } },
    ] }),
  });
  assert.deepEqual(out.chapters.map((c) => [c.t, c.title]), [[0, 'A'], [90, 'B'], [200, 'C']]);
});

test('unidentifiable live player refuses instead of guessing', async () => {
  const live = RomansLive('', VID_B);
  delete live.videoDetails;
  const out = await run({ videoId: 'BBB', duration: 400 }, {
    href: 'https://www.youtube.com/watch?v=BBB',
    liveResponse: live,
    ytInitialData: globalsFor('BBB', VID_B),
  });
  assert.deepEqual(out.chapters, []);
});

test('shorts URLs report the shorts id', async () => {
  const out = await run({ videoId: 'sh0rt', duration: 60 }, {
    href: 'https://www.youtube.com/shorts/sh0rt',
    live: undefined,
    player: null,
    ytInitialData: {},
  });
  assert.equal(out.videoId, 'sh0rt');
  assert.deepEqual(out.chapters, []);
});

test('cyclic page objects cannot hang the scan', async () => {
  const cyclic = { items: [] };
  cyclic.self = cyclic;
  cyclic.items.push({ macroMarkersListItemRenderer: { title: { simpleText: 'A' }, startTimeSeconds: 0 } });
  cyclic.items.push({ macroMarkersListItemRenderer: { title: { simpleText: 'B' }, startTimeSeconds: 60 } });
  cyclic.items.push({ macroMarkersListItemRenderer: { title: { simpleText: 'C' }, startTimeSeconds: 120 } });
  const out = await run({ videoId: 'v', duration: 400 }, {
    href: 'https://www.youtube.com/watch?v=v',
    live: undefined,
    player: null,
    ytInitialData: asVideo('v', cyclic),
  });
  assert.deepEqual(out.chapters.map((c) => c.title), ['A', 'B', 'C']);
});

const domPairs = (names) => names.map((title, i) => [i * 60, title]);
const domEight = markerList(domPairs(['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight']));

test('stable DOM markers win without any globals', async () => {
  const out = await run({ videoId: 'd', duration: 900 }, {
    href: 'https://www.youtube.com/watch?v=d',
    markerReads: [domEight, domEight],
  });
  assert.deepEqual(out.chapters.map((c) => c.title),
    ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight']);
});

test('growing DOM across confirmation resolves to the full list', async () => {
  const seven = domEight.slice(0, 7);
  const out = await run({ videoId: 'd', duration: 900 }, {
    href: 'https://www.youtube.com/watch?v=d',
    markerReads: [seven, domEight, domEight],
  });
  assert.equal(out.chapters.length, 8);
  assert.equal(out.chapters[7].title, 'Eight');
});

test('sub-threshold DOM never joins the union', async () => {
  // Two rendered markers cannot corroborate anything: they read as often
  // from a half render as from a stray node, so only complete sources count.
  const two = domEight.slice(0, 2);
  const out = await run({ videoId: 'd', duration: 900 }, {
    href: 'https://www.youtube.com/watch?v=d',
    markerReads: [two],
    ytInitialData: globalsFor('d', VID_B),
  });
  assert.deepEqual(out.chapters.map((c) => c.title), ['Intro', 'Middle', 'End']);
});

test('ad-length durations do not filter DOM markers', async () => {
  const out = await run({ videoId: 'd', duration: 15 }, {
    href: 'https://www.youtube.com/watch?v=d',
    markerReads: [domEight, domEight],
  });
  assert.equal(out.chapters.length, 8);
});

const fullEight = [
  [0, 'One'], [60000, 'Two'], [120000, 'Three'], [180000, 'Four'],
  [240000, 'Five'], [300000, 'Six'], [360000, 'Seven'], [420000, 'Eight'],
];

test('partial DOM plus complete player map union to the full list', async () => {
  const partial = fullEight.slice(0, 5).map(([ms, title]) => ({
    innerText: `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}\n${title}`,
  }));
  const out = await run({ videoId: 'd', duration: 900 }, {
    href: 'https://www.youtube.com/watch?v=d',
    liveResponse: RomansLive('d', fullEight),
    markerReads: [partial, partial],
  });
  assert.equal(out.chapters.length, 8);
  assert.equal(out.chapters[7].title, 'Eight');
});

test('serialized reader stays self-contained for executeScript', async () => {
  const src = readChaptersMainWorld.toString();
  for (const banned of ['require(', 'process.', 'module.', '__dirname']) {
    assert.ok(!src.includes(banned), `leaked reference: ${banned}`);
  }
});
