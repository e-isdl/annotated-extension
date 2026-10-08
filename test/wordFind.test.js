import test from 'node:test';
import assert from 'node:assert/strict';
import { findAtoms, findWordRuns } from '../src/lib/wordFind.js';

test('single terms match whole words only, never substrings', () => {
  const words = ['said', 'AI', 'again', 'air', 'explain', 'ai'];
  assert.deepEqual(findWordRuns(words, 'AI'), [[1, 1], [5, 5]]);
});

test('matching ignores case and punctuation', () => {
  assert.deepEqual(findWordRuns(["Don't", 'stop'], 'dont'), [[0, 0]]);
  assert.deepEqual(findWordRuns(['state-of-the-art', 'x'], 'State Of The Art'), [[0, 0]]);
});

test('multi-word queries match exact token runs', () => {
  assert.deepEqual(findWordRuns(['an', 'open', 'source', 'thing'], 'open source'), [[1, 2]]);
  assert.deepEqual(findWordRuns(['an', 'open', 'sauce', 'thing'], 'open source'), []);
});

test('empty queries and empty word lists match nothing', () => {
  assert.deepEqual(findWordRuns(['hello'], ''), []);
  assert.deepEqual(findWordRuns(['hello'], '   '), []);
  assert.deepEqual(findWordRuns([], 'hello'), []);
});
