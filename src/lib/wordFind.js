// Word find for the word clipper: atomic tokens, whole-word matching.
// Tokens are lowercase with apostrophes folded away, split on anything that
// is not a letter or digit - so phrases match regardless of punctuation or
// case ("real-world" is ["real", "world"], "don't" is ["dont"]).
// Single terms match WHOLE tokens only ("ai" matches "AI", never the "ai"
// inside "said" or "again"). Multi-word queries match exact token runs.
export function findAtoms(t) {
  return String(t || '').toLowerCase().replace(/[''’]/g, '').split(/[^a-z0-9]+/).filter(Boolean);
}

// Stem folding for COMPARISON ONLY (both sides fold identically, so the
// stems never need to be linguistically perfect): robot/robots,
// box/boxes, story/stories all meet. Short words and ss-endings are left
// alone so this/his/bus/class never collapse.
export function foldToken(atom) {
  const w = String(atom || '');
  if (w.length > 4 && w.endsWith('ies')) return `${w.slice(0, -3)}y`;
  if (w.length > 4 && /(s|x|z|ch|sh)es$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}

export function findWordRuns(wordTexts, query) {
  const qt = findAtoms(query).map(foldToken);
  const runs = [];
  if (!qt.length || !wordTexts.length) return runs;
  const perWord = wordTexts.map((w) => findAtoms(w).map(foldToken));
  if (qt.length === 1) {
    const q = qt[0];
    perWord.forEach((atoms, i) => {
      if (atoms.some((a) => a === q)) runs.push([i, i]);
    });
    return runs;
  }
  const flat = [];
  const owner = [];
  perWord.forEach((atoms, i) => { atoms.forEach((a) => { flat.push(a); owner.push(i); }); });
  for (let k = 0; k + qt.length <= flat.length; k += 1) {
    let ok = true;
    for (let j = 0; j < qt.length; j += 1) {
      if (flat[k + j] !== qt[j]) { ok = false; break; }
    }
    if (ok) runs.push([owner[k], owner[k + qt.length - 1]]);
  }
  return runs;
}

const ABBREV = new Set(['mr', 'mrs', 'ms', 'dr', 'st', 'ave', 'blvd', 'inc', 'ltd', 'jr', 'sr', 'vs', 'etc', 'eg', 'ie']);

// Split word texts into sentence ranges (word-index spans). Splits after
// . ! ? except for common abbreviations. Returns [] for empty input.
export function splitSentences(wordTexts) {
  const ranges = [];
  if (!wordTexts.length) return ranges;
  let start = 0;
  wordTexts.forEach((w, i) => {
    const text = String(w || '').trim();
    const m = text.match(/([.!?])[)"'’”]*$/);
    if (!m) return;
    const core = text.slice(0, text.length - m[0].length).trim().split(/\s+/).pop() || '';
    if (m[1] === '.' && ABBREV.has(core.toLowerCase().replace(/\./g, ''))) return;
    ranges.push({ start, end: i });
    start = i + 1;
  });
  if (start < wordTexts.length) ranges.push({ start, end: wordTexts.length - 1 });
  return ranges.filter((r) => r.end >= r.start);
}

// Sentence range containing a word index, or null.
export function sentenceAround(wordTexts, index) {
  if (index < 0 || index >= wordTexts.length) return null;
  const found = splitSentences(wordTexts).find((r) => index >= r.start && index <= r.end);
  return found || null;
}
