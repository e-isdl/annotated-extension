import test from 'node:test';
import assert from 'node:assert/strict';
import { createExtensionPost } from '../src/lib/postPublishing.js';

test('extension publishing sends the current capture fields atomically and allows no community', async () => {
  let call;
  const client = {
    rpc: async (...args) => {
      call = args;
      return { data: { id: 'post-id', slug: 'captured-post' }, error: null };
    },
  };
  const result = await createExtensionPost(client, {
    title: 'Captured article',
    source_url: 'https://example.com/article',
    source_type: 'article',
    annotation_type: 'Explainer',
    annotation_text: 'Here is the context.',
  });
  assert.deepEqual(result, { id: 'post-id', slug: 'captured-post' });
  assert.equal(call[0], 'create_extension_post');
  assert.equal(call[1].p_community_id, null);
  assert.equal(call[1].p_title, 'Captured article');
  assert.equal(call[1].p_annotation, 'Here is the context.');
  assert.equal(call[1].p_annotation_audio_url, null);
});

test('extension publishing surfaces RPC failures for the form to display', async () => {
  const client = { rpc: async () => ({ data: null, error: new Error('post failed') }) };
  await assert.rejects(createExtensionPost(client, {}), /post failed/);
});

test('extension publishing preserves podcast and voice annotation media', async () => {
  let call;
  const client = { rpc: async (...args) => { call = args; return { data: { id: 'post-id' }, error: null }; } };
  await createExtensionPost(client, {
    community_id: 'community-id',
    source_type: 'podcast',
    source_audio_url: 'https://storage.example/source.webm',
    annotation_audio_url: 'https://storage.example/commentary.webm',
    annotation_type: 'Reaction',
  });
  assert.equal(call[1].p_community_id, 'community-id');
  assert.equal(call[1].p_source_audio_url, 'https://storage.example/source.webm');
  assert.equal(call[1].p_annotation_audio_url, 'https://storage.example/commentary.webm');
});
