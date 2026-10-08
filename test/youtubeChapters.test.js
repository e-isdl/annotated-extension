import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readChaptersMainWorld } from '../src/lib/youtubeChapters.js';

function run(args, page) {
  const sandbox = {
    window: {
      location: undefined,
      ytInitialData: page.ytInitialData,
      ytInitialPlayerResponse: page.ytInitialPlayerResponse,
      ytplayer: page.ytplayer,
    },
    document: {
      querySelector: (sel) => (sel === '#movie_player' && page.live !== undefined ? page.player : null),
    },
    URL,
    JSON,
  };
  sandbox.window.location = { href: page.href };
  // The function reads window.location.href directly.
  const factory = vm.runInNewContext(`(${readChaptersMainWorld.toString()})`, sandbox);
  // JSON round-trip: values built inside vm carry the vm realm's prototypes.
  return JSON.parse(JSON.stringify(factory(args)));
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
  return {
    contents: {
      secondary: [
        { chapterRenderer: { title: { simpleText: chapters[0][1] }, timeRangeStartMillis: chapters[0][0] } },
        { chapterRenderer: { title: { simpleText: chapters[1][1] }, timeRangeStartMillis: chapters[1][0] } },
        { chapterRenderer: { title: { simpleText: chapters[2][1] }, timeRangeStartMillis: chapters[2][0] } },
      ],
    },
  };
}

test('live player wins over stale globals for the wanted video', () => {
  const out = run({ videoId: 'BBB', duration: 400 }, {
    href: 'https://www.youtube.com/watch?v=BBB',
    live: true,
    player: { getPlayerResponse: () => RomansLive('BBB', VID_B) },
    ytInitialData: globalsFor('AAA', VID_A),
  });
  assert.equal(out.videoId, 'BBB');
  assert.deepEqual(out.chapters.map((c) => c.title), ['Intro', 'Middle', 'End']);
});

test('stale live player falls back to globals', () => {
  const out = run({ videoId: 'BBB', duration: 400 }, {
    href: 'https://www.youtube.com/watch?v=BBB',
    live: true,
    player: { getPlayerResponse: () => RomansLive('AAA', VID_A) },
    ytInitialData: globalsFor('BBB', VID_B),
  });
  assert.deepEqual(out.chapters.map((c) => c.title), ['Intro', 'Middle', 'End']);
});

test('globals alone still work without any player', () => {
  const out = run({ videoId: 'BBB', duration: 400 }, {
    href: 'https://www.youtube.com/watch?v=BBB',
    live: undefined,
    player: null,
    ytInitialData: globalsFor('BBB', VID_B),
  });
  assert.deepEqual(out.chapters.map((c) => [c.t, c.title]), [[0, 'Intro'], [120, 'Middle'], [300, 'End']]);
});

test('macro markers support startTimeSeconds and timeDescription fallback', () => {
  const out = run({ videoId: 'v', duration: 400 }, {
    href: 'https://www.youtube.com/watch?v=v',
    live: undefined,
    player: null,
    ytInitialData: { items: [
      { macroMarkersListItemRenderer: { title: { simpleText: 'First' }, startTimeSeconds: 0 } },
      { macroMarkersListItemRenderer: { title: { simpleText: 'Second' }, timeDescription: { simpleText: '2:00' } } },
      { macroMarkersListItemRenderer: { title: { simpleText: 'Third' }, startTimeSeconds: 200 } },
    ] },
  });
  assert.deepEqual(out.chapters.map((c) => [c.t, c.title]), [[0, 'First'], [120, 'Second'], [200, 'Third']]);
});

test('fewer than three chapters means no chapters', () => {
  const out = run({ videoId: 'v', duration: 400 }, {
    href: 'https://www.youtube.com/watch?v=v',
    live: undefined,
    player: null,
    ytInitialData: { items: [
      { macroMarkersListItemRenderer: { title: { simpleText: 'Only' }, startTimeSeconds: 0 } },
      { macroMarkersListItemRenderer: { title: { simpleText: 'Two' }, startTimeSeconds: 60 } },
    ] },
  });
  assert.deepEqual(out.chapters, []);
});

test('feature-length durations cap over-long entries, ad lengths do not', () => {
  const data = { items: [
    { macroMarkersListItemRenderer: { title: { simpleText: 'A' }, startTimeSeconds: 0 } },
    { macroMarkersListItemRenderer: { title: { simpleText: 'B' }, startTimeSeconds: 100 } },
    { macroMarkersListItemRenderer: { title: { simpleText: 'C' }, startTimeSeconds: 200 } },
    { macroMarkersListItemRenderer: { title: { simpleText: 'Far' }, startTimeSeconds: 5000 } },
  ] };
  const page = { href: 'https://www.youtube.com/watch?v=v', live: undefined, player: null, ytInitialData: data };
  const capped = run({ videoId: 'v', duration: 400 }, page);
  assert.deepEqual(capped.chapters.map((c) => c.title), ['A', 'B', 'C']);
  const adLength = run({ videoId: 'v', duration: 15 }, page);
  assert.deepEqual(adLength.chapters.map((c) => c.title), ['A', 'B', 'C', 'Far']);
});

test('duplicate times collapse, garbage rows are skipped', () => {
  const out = run({ videoId: 'v', duration: 400 }, {
    href: 'https://www.youtube.com/watch?v=v',
    live: undefined,
    player: null,
    ytInitialData: { items: [
      { macroMarkersListItemRenderer: { title: { simpleText: 'A' }, startTimeSeconds: 0 } },
      { macroMarkersListItemRenderer: { title: { simpleText: 'A dup' }, startTimeSeconds: 0 } },
      { macroMarkersListItemRenderer: { title: { simpleText: '' }, startTimeSeconds: 50 } },
      { macroMarkersListItemRenderer: { title: { simpleText: 'No time' } } },
      { chapterRenderer: { title: { simpleText: 'B' }, timeRangeStartMillis: 90000 } },
      { chapterRenderer: { title: { simpleText: 'C' }, timeRangeStartMillis: 200000 } },
    ] },
  });
  assert.deepEqual(out.chapters.map((c) => [c.t, c.title]), [[0, 'A'], [90, 'B'], [200, 'C']]);
});

test('live response without an id is still trusted first', () => {
  const live = RomansLive('', VID_B);
  delete live.videoDetails;
  const out = run({ videoId: 'BBB', duration: 400 }, {
    href: 'https://www.youtube.com/watch?v=BBB',
    live: true,
    player: { getPlayerResponse: () => live },
    ytInitialData: globalsFor('AAA', VID_A),
  });
  assert.deepEqual(out.chapters.map((c) => c.title), ['Intro', 'Middle', 'End']);
});

test('shorts URLs report the shorts id', () => {
  const out = run({ videoId: 'sh0rt', duration: 60 }, {
    href: 'https://www.youtube.com/shorts/sh0rt',
    live: undefined,
    player: null,
    ytInitialData: {},
  });
  assert.equal(out.videoId, 'sh0rt');
  assert.deepEqual(out.chapters, []);
});

test('cyclic page objects cannot hang the scan', () => {
  const cyclic = { items: [] };
  cyclic.self = cyclic;
  cyclic.items.push({ macroMarkersListItemRenderer: { title: { simpleText: 'A' }, startTimeSeconds: 0 } });
  cyclic.items.push({ macroMarkersListItemRenderer: { title: { simpleText: 'B' }, startTimeSeconds: 60 } });
  cyclic.items.push({ macroMarkersListItemRenderer: { title: { simpleText: 'C' }, startTimeSeconds: 120 } });
  const out = run({ videoId: 'v', duration: 400 }, {
    href: 'https://www.youtube.com/watch?v=v',
    live: undefined,
    player: null,
    ytInitialData: cyclic,
  });
  assert.deepEqual(out.chapters.map((c) => c.title), ['A', 'B', 'C']);
});

test('serialized reader stays self-contained for executeScript', () => {
  const src = readChaptersMainWorld.toString();
  for (const banned of ['require(', 'process.', 'module.', '__dirname']) {
    assert.ok(!src.includes(banned), `leaked reference: ${banned}`);
  }
});
