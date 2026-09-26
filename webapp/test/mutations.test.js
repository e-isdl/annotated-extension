import test from 'node:test';
import assert from 'node:assert/strict';
import { castVote, createAnnotatedPost, createComment } from '../src/lib/mutations.js';

test('post creation goes through one atomic database function with source and annotation together', async () => {
  let call;
  const client = { rpc: async (...args) => { call = args; return { data: { id: 'clip-id', slug: 'new-post' }, error: null }; } };
  const result = await createAnnotatedPost(client, {
    community_id: 'community-id', title: 'Source title', source_url: 'https://example.com/a',
    source_type: 'article', source_domain: 'example.com', source_title: 'Source title',
    annotation_type: 'Explainer', article_text: 'A quote', start_sec: null, end_sec: null,
    slug: 'new-post', annotation: 'Here is why this matters.',
  });
  assert.deepEqual(result, { id: 'clip-id', slug: 'new-post' });
  assert.equal(call[0], 'create_annotated_post');
  assert.equal(call[1].p_annotation, 'Here is why this matters.');
  assert.equal(call[1].p_community_id, 'community-id');
});

test('post creation surfaces database errors without claiming success', async () => {
  const client = { rpc: async () => ({ data: null, error: new Error('insert rejected') }) };
  await assert.rejects(createAnnotatedPost(client, {}), /insert rejected/);
});

test('post votes use the database toggle RPC', async () => {
  let call;
  const client = { rpc: async (...args) => { call = args; return { data: 'switched', error: null }; } };
  assert.equal(await castVote(client, 'clip-id', 'user-id', -1), 'switched');
  assert.deepEqual(call, ['toggle_vote', { p_clip_id: 'clip-id', p_direction: -1 }]);
});

test('comment creation writes an authenticated comment and returns its row', async () => {
  const inserted = { clip_id: 'clip-id', user_id: 'user-id', body: 'Useful context' };
  const row = { ...inserted, id: 'comment-id' };
  let written;
  const client = { from: (table) => ({
    insert: (payload) => { assert.equal(table, 'comments'); written = payload; return { select: () => ({ single: async () => ({ data: row, error: null }) }) }; },
  }) };
  assert.deepEqual(await createComment(client, inserted), row);
  assert.deepEqual(written, inserted);
});
