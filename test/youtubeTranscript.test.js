import test from 'node:test';
import assert from 'node:assert/strict';
import { excerptYouTubeTranscript, formatYouTubeTranscript, parseYouTubeJson3 } from '../src/lib/youtubeTranscript.js';

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
