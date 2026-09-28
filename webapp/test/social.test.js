import test from 'node:test';
import assert from 'node:assert/strict';
import { isXPostUrl, matchStatusUrl, xEmbedSrc } from '../src/lib/social.js';

test('extracts handle and status id from x.com and twitter.com urls', () => {
  assert.deepEqual(matchStatusUrl('https://x.com/SpaceX/status/2104551744713932971'), {
    handle: 'SpaceX',
    statusId: '2104551744713932971',
  });
  assert.deepEqual(matchStatusUrl('https://twitter.com/jack/status/20?s=20&t=abc'), {
    handle: 'jack',
    statusId: '20',
  });
  assert.equal(matchStatusUrl('https://x.com/SpaceX/status/2104551744713932971/photo/1').statusId, '2104551744713932971');
});

test('rejects non-status urls', () => {
  assert.equal(isXPostUrl('https://x.com/home'), false);
  assert.equal(isXPostUrl('https://x.com/SpaceX'), false);
  assert.equal(isXPostUrl('https://example.com/post/1'), false);
  assert.equal(isXPostUrl(null), false);
});

test('builds the platform.twitter.com embed src with the dark theme', () => {
  assert.equal(
    xEmbedSrc('https://x.com/SpaceX/status/2104551744713932971'),
    'https://platform.twitter.com/embed/Tweet.html?id=2104551744713932971&theme=dark',
  );
  assert.equal(xEmbedSrc('https://example.com/'), null);
});
