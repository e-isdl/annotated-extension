import test from 'node:test';
import assert from 'node:assert/strict';
import { youtubeEmbedUrl } from '../src/lib/youtubeEmbedUrl.js';

test('marked YouTube moments autoplay inline, muted, from the selected start through end', () => {
  const url = new URL(youtubeEmbedUrl('video-id', { startSec: 42, endSec: 132, muted: true, autoplay: true }));
  assert.equal(url.pathname, '/embed/video-id');
  assert.equal(url.searchParams.get('start'), '42');
  assert.equal(url.searchParams.get('end'), '132');
  assert.equal(url.searchParams.get('autoplay'), '1');
  assert.equal(url.searchParams.get('mute'), '1');
  assert.equal(url.searchParams.get('playsinline'), '1');
});

test('invalid or backwards end points do not truncate the source video', () => {
  const url = new URL(youtubeEmbedUrl('video-id', { startSec: 42, endSec: 12, autoplay: false }));
  assert.equal(url.searchParams.get('end'), null);
  assert.equal(url.searchParams.get('autoplay'), '0');
});
