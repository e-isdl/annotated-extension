import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchStatusUrl, isXPostUrl, tweetIdFromUrl } from '../src/lib/social.js';

test('extracts handle and status id from x.com and twitter.com', () => {
  assert.deepEqual(matchStatusUrl('https://x.com/SpaceX/status/2104551744713932971'), {
    handle: 'SpaceX',
    statusId: '2104551744713932971',
  });
  assert.equal(matchStatusUrl('https://twitter.com/foo_bar/status/123?s=20').statusId, '123');
  assert.equal(matchStatusUrl('https://www.x.com/a/status/42').handle, 'a');
});

test('rejects non x.com hosts and malformed urls', () => {
  assert.equal(matchStatusUrl('https://evil.com/x.com/foo/status/123'), null);
  assert.equal(matchStatusUrl('https://notx.com/foo/status/123'), null);
  assert.equal(matchStatusUrl('not a url'), null);
  assert.equal(matchStatusUrl(''), null);
  assert.equal(matchStatusUrl(null), null);
});

test('isXPostUrl and tweetIdFromUrl', () => {
  const url = 'https://x.com/SpaceX/status/2104551744713932971';
  assert.equal(isXPostUrl(url), true);
  assert.equal(isXPostUrl('https://example.com/watch?v=abc'), false);
  assert.equal(tweetIdFromUrl(url), '2104551744713932971');
  assert.equal(tweetIdFromUrl('https://example.com'), null);
});
