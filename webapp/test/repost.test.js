import test from 'node:test';
import assert from 'node:assert/strict';
import { toggleRepost, createQuote, fetchQuotedPost, fetchRepostState, hrefForNewPost, quotedImage } from '../src/lib/repost.js';

test('repost toggles through one atomic database function', async () => {
  let call;
  const client = { rpc: async (...args) => { call = args; return { data: { reposted: true, id: 'new-id' }, error: null }; } };
  assert.deepEqual(await toggleRepost(client, 'clip-id'), { reposted: true, id: 'new-id' });
  assert.deepEqual(call, ['toggle_repost', { p_clip_id: 'clip-id' }]);
});

test('repost surfaces database errors without claiming success', async () => {
  const client = { rpc: async () => ({ data: null, error: new Error('own post') }) };
  await assert.rejects(toggleRepost(client, 'clip-id'), /own post/);
});

test('quotes carry commentary and community through one atomic function', async () => {
  let call;
  const client = { rpc: async (...args) => { call = args; return { data: { id: 'q-id', slug: 'q-slug' }, error: null }; } };
  const result = await createQuote(client, { clipId: 'clip-id', annotation: 'My take', communityId: 'c-id' });
  assert.deepEqual(result, { id: 'q-id', slug: 'q-slug' });
  assert.deepEqual(call, ['create_quote_post', { p_clip_id: 'clip-id', p_annotation: 'My take', p_community_id: 'c-id' }]);
});

test('quotes default to the original community when none is picked', async () => {
  let call;
  const client = { rpc: async (...args) => { call = args; return { data: { id: 'q-id' }, error: null }; } };
  await createQuote(client, { clipId: 'clip-id', annotation: 'My take' });
  assert.equal(call[1].p_community_id, null);
});

test('quoted embeds load the referenced post row', async () => {
  const row = { id: 'q-id', slug: 's', profiles: { handle: 'jason' } };
  const client = { from: (table) => {
    assert.equal(table, 'clips');
    return {
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }) }),
    };
  } };
  assert.deepEqual(await fetchQuotedPost(client, 'q-id'), row);
  assert.equal(await fetchQuotedPost(client, null), null);
});

test('repost state is false without a user, for demos, or on errors', async () => {
  assert.equal(await fetchRepostState({}, 'clip-id', null), false);
  assert.equal(await fetchRepostState({}, 'demo-1', 'user-id'), false);
  const failing = { from: () => { throw new Error('down'); } };
  assert.equal(await fetchRepostState(failing, 'clip-id', 'user-id'), false);
});

test('quoted cards prefer video thumbnails, then source images, then nothing', () => {
  assert.equal(
    quotedImage({ source_type: 'youtube', youtube_id: 'abc', source_image_url: 'https://x/img.png' }),
    'https://img.youtube.com/vi/abc/hqdefault.jpg',
  );
  assert.equal(quotedImage({ source_type: 'article', source_image_url: 'https://x/img.png' }), 'https://x/img.png');
  assert.equal(quotedImage({ source_type: 'article', thumbnail: 'https://x/t.png' }), 'https://x/t.png');
  assert.equal(quotedImage({ source_type: 'social', poster_url: 'https://x/p.png' }), 'https://x/p.png');
  assert.equal(quotedImage({ source_type: 'text' }), null);
  assert.equal(quotedImage(null), null);
});

test('new posts link to the posting profile when known', () => {
  assert.equal(hrefForNewPost({ id: 'i', slug: 's' }, 'Jason'), '/@jason/post/s');
  assert.equal(hrefForNewPost({ id: 'i', slug: null }, null), '/post/i');
});
