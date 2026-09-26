export function wilsonScore(vote = {}) {
  const count = vote.vote_count || 0;
  if (!count) return 0;
  const positive = Math.max(0, Math.min(count, (count + (vote.score || 0)) / 2));
  const z = 1.96;
  const p = positive / count;
  return (p + z * z / (2 * count) - z * Math.sqrt((p * (1 - p) + z * z / (4 * count)) / count)) / (1 + z * z / count);
}

export function countReplies(children) {
  return children.reduce((total, child) => total + 1 + countReplies(child.children || []), 0);
}
