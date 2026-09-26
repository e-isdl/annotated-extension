import test from 'node:test';
import assert from 'node:assert/strict';
import { countReplies, wilsonScore } from '../src/lib/commentRanking.js';

test('Best ranking rewards confidence instead of a single early upvote', () => {
  assert.ok(wilsonScore({ score: 45, vote_count: 50 }) > wilsonScore({ score: 1, vote_count: 1 }));
  assert.ok(wilsonScore({ score: -20, vote_count: 20 }) < wilsonScore({ score: 45, vote_count: 50 }));
  assert.equal(wilsonScore({ score: 10, vote_count: 0 }), 0);
});

test('collapsed reply count includes every nested descendant', () => {
  assert.equal(countReplies([
    { children: [{ children: [{}] }] },
    {},
  ]), 4);
});
