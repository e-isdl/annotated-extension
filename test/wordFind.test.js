import test from 'node:test';
import assert from 'node:assert/strict';
import { findAtoms, findWordRuns, foldToken, splitSentences, sentenceAround } from '../src/lib/wordFind.js';

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

test('plurals meet their singulars without collapsing short words', () => {
  assert.equal(foldToken('robots'), foldToken('robot'));
  assert.equal(foldToken('boxes'), foldToken('box'));
  assert.equal(foldToken('stories'), foldToken('story'));
  assert.equal(foldToken('churches'), foldToken('church'));
  assert.equal(foldToken('class'), 'class');
  assert.equal(foldToken('bus'), 'bus');
  assert.equal(foldToken('was'), 'was');
  assert.deepEqual(findWordRuns(['robots', 'dogs', 'this'], 'robot'), [[0, 0]]);
  assert.deepEqual(findWordRuns(['this', 'that'], 'this'), [[0, 0]]);
  assert.deepEqual(findWordRuns(['the church', 'bench'], 'churches'), [[0, 0]]);
});

test('sentences split on end marks but not abbreviations', () => {
  assert.deepEqual(
    splitSentences(['It', 'was', 'dark.', 'Then', 'light!']),
    [{ start: 0, end: 2 }, { start: 3, end: 4 }],
  );
  assert.deepEqual(
    splitSentences(['Meet', 'Mr.', 'Smith', 'here.', 'Bye.']),
    [{ start: 0, end: 3 }, { start: 4, end: 4 }],
  );
  assert.deepEqual(splitSentences([]), []);
  assert.deepEqual(splitSentences(['no', 'end', 'here']), [{ start: 0, end: 2 }]);
});

test('sentenceAround finds the enclosing sentence', () => {
  const words = ['It', 'was', 'dark.', 'Then', 'light!'];
  assert.deepEqual(sentenceAround(words, 1), { start: 0, end: 2 });
  assert.deepEqual(sentenceAround(words, 4), { start: 3, end: 4 });
  assert.equal(sentenceAround(words, 9), null);
  assert.equal(sentenceAround([], 0), null);
});
