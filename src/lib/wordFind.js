// Word find for the word clipper: atomic tokens, whole-word matching.
// Tokens are lowercase with apostrophes folded away, split on anything that
// is not a letter or digit - so phrases match regardless of punctuation or
// case ("real-world" is ["real", "world"], "don't" is ["dont"]).
// Single terms match WHOLE tokens only ("ai" matches "AI", never the "ai"
// inside "said" or "again"). Multi-word queries match exact token runs.
export function findAtoms(t) {
  return String(t || '').toLowerCase().replace(/[''’]/g, '').split(/[^a-z0-9]+/).filter(Boolean);
}

export function findWordRuns(wordTexts, query) {
  const qt = findAtoms(query);
  const runs = [];
  if (!qt.length || !wordTexts.length) return runs;
  const perWord = wordTexts.map((w) => findAtoms(w));
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
