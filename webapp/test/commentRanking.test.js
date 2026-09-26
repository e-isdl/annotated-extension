import test from 'node:test';
import assert from 'node:assert/strict';
import { controversyScore, countReplies, nextCommentVote, wilsonScore } from '../src/lib/commentRanking.js';

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

test('controversial ranking favors active, close-score discussions', () => {
  assert.ok(controversyScore({ score: 2, vote_count: 42 }) > controversyScore({ score: 37, vote_count: 40 }));
  assert.ok(controversyScore({ score: 0, vote_count: 20 }) > controversyScore({ score: 0, vote_count: 3 }));
});

test('comment votes optimistically add, switch, and remove with accurate counts', () => {
  assert.equal(nextCommentVote({ score: 0, vote_count: 0 }, -1).score, -1);
  const added = nextCommentVote({ score: 4, vote_count: 5 }, 1);
  assert.deepEqual(added, { score: 5, vote_count: 6, direction: 1 });
  const switched = nextCommentVote(added, -1);
  assert.deepEqual(switched, { score: 3, vote_count: 6, direction: -1 });
  assert.deepEqual(nextCommentVote(switched, -1), { score: 4, vote_count: 5, direction: null });
});
