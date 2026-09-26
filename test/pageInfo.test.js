import test from 'node:test';
import assert from 'node:assert/strict';
import { mergePageInfo, pageIdentity } from '../src/lib/pageInfo.js';

function youtube(url, duration, extra = {}) {
  return { url, type: 'youtube', data: { videoId: 'abc123', title: 'A video', duration, ...extra } };
}

test('adopts the first page the panel receives', () => {
  const next = youtube('https://www.youtube.com/watch?v=abc123', 120);
  assert.equal(mergePageInfo(null, next), next);
});

test('replaces the page when the followed tab moves somewhere else', () => {
  const prev = youtube('https://www.youtube.com/watch?v=abc123', 120);
  const next = youtube('https://www.youtube.com/watch?v=other99', 0);
  assert.equal(mergePageInfo(prev, next), next);
});

test('keeps a known duration when the same page reports none', () => {
  const prev = youtube('https://www.youtube.com/watch?v=abc123', 300);
  const next = youtube('https://www.youtube.com/watch?v=abc123', 0, { adPlaying: true });

  const merged = mergePageInfo(prev, next);

  assert.equal(merged.data.duration, 300);
  assert.equal(merged.data.adPlaying, true);
});

test('takes the fresher duration for the same page', () => {
  const prev = youtube('https://www.youtube.com/watch?v=abc123', 300);
  const next = youtube('https://www.youtube.com/watch?v=abc123', 420);

  assert.equal(mergePageInfo(prev, next).data.duration, 420);
});

test('page identity only changes when the page itself changes', () => {
  const first = youtube('https://www.youtube.com/watch?v=abc123', 300);
  const refreshed = youtube('https://www.youtube.com/watch?v=abc123', 300, { adPlaying: true });
  const other = youtube('https://www.youtube.com/watch?v=other99', 300);

  assert.equal(pageIdentity(first), pageIdentity(refreshed));
  assert.notEqual(pageIdentity(first), pageIdentity(other));
  assert.equal(pageIdentity(null), '');
});
