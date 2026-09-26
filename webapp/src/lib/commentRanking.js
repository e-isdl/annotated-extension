export function wilsonScore(vote = {}) {
  const count = vote.vote_count || 0;
  if (!count) return 0;
  const positive = Math.max(0, Math.min(count, (count + (vote.score || 0)) / 2));
  const z = 1.96;
  const p = positive / count;
  return (p + z * z / (2 * count) - z * Math.sqrt((p * (1 - p) + z * z / (4 * count)) / count)) / (1 + z * z / count);
}

export function controversyScore(vote = {}) {
  const count = Number(vote.vote_count) || 0;
  const score = Number(vote.score) || 0;
  return count ? count / (Math.abs(score) + 1) : 0;
}

export function countReplies(children) {
  return children.reduce((total, child) => total + 1 + countReplies(child.children || []), 0);
}

export function nextCommentVote(current = {}, direction) {
  const previous = current.direction || null;
  if (direction !== 1 && direction !== -1) return current;
  if (previous === direction) {
    return { score: (current.score || 0) - direction, vote_count: Math.max(0, (current.vote_count || 0) - 1), direction: null };
  }
  return {
    score: (current.score || 0) + direction - (previous || 0),
    vote_count: (current.vote_count || 0) + (previous ? 0 : 1),
    direction,
  };
}
