import test from 'node:test';
import assert from 'node:assert/strict';
import { communityPfpUrl, communityHue } from '../src/lib/community.js';

test('every known community resolves a portrait, AI included', () => {
  for (const slug of ['ai', 'technology', 'politics', 'startups', 'internet-culture', 'tv-and-film', 'media-literacy']) {
    assert.match(communityPfpUrl(slug), /^\/pfps\/.+\.svg$/, slug);
  }
});

test('unknown communities fall back to generated avatars', () => {
  assert.equal(communityPfpUrl('nope'), null);
  assert.equal(communityPfpUrl(''), null);
});

test('community colors are stable per slug', () => {
  assert.equal(communityHue('ai'), communityHue('ai'));
  assert.ok(communityHue('ai') >= 0 && communityHue('ai') < 360);
});
