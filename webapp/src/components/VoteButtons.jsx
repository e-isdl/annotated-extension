import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { getUserVote } from '../lib/api';
import { castVote } from '../lib/mutations';
import { useToast } from './ToastProvider';

export default function VoteButtons({ clipId, score, setScore }) {
  const isDemo = String(clipId).startsWith('demo-');
  const [userVote, setUserVote] = useState(null);
  const [userId, setUserId] = useState(null);
  const { push } = useToast();

  useEffect(() => {
    if (isDemo) return;
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setUserId(user.id);
        getUserVote(supabase, clipId, user.id).then(setUserVote);
      }
    });
  }, [clipId]);

  const handleVote = async (direction) => {
    if (isDemo) {
      setUserVote((current) => {
        if (current === direction) {
          setScore((value) => value - direction);
          return null;
        }
        setScore((value) => current ? value - current + direction : value + direction);
        return direction;
      });
      return;
    }
    if (!userId) { push('Sign in to vote on a post.', 'info'); return; }

    const prevVote = userVote;
    const prevScore = score;

    if (prevVote === direction) {
      setUserVote(null);
      setScore((s) => s - direction);
    } else if (prevVote !== null) {
      setUserVote(direction);
      setScore((s) => s - prevVote + direction);
    } else {
      setUserVote(direction);
      setScore((s) => s + direction);
    }

    castVote(supabase, clipId, userId, direction).catch(() => {
      setUserVote(prevVote);
      setScore(prevScore);
      push('Your vote could not be saved. Try again.', 'error');
    });
  };

  return (
    <div className="vote-pill" aria-label="Vote on this post">
      <button
        type="button"
        aria-label="Upvote post"
        aria-pressed={userVote === 1}
        onClick={() => handleVote(1)}
        className={`vote-pill-button vote-up-button ${
          userVote === 1
            ? 'bg-accent text-bg-base scale-110'
            : 'text-text-muted hover:text-accent hover:bg-accent/10'
        }`}
      >
        <VoteArrow direction="up" />
      </button>

      <span
        className="vote-pill-score"
      >
        {score > 0 ? `+${score}` : score}
      </span>

      <button
        type="button"
        aria-label="Downvote post"
        aria-pressed={userVote === -1}
        onClick={() => handleVote(-1)}
        className={`vote-pill-button vote-down-button ${
          userVote === -1
            ? 'bg-bg-raised text-text-primary scale-110'
            : 'text-text-muted hover:text-text-primary hover:bg-bg-raised'
        }`}
      >
        <VoteArrow direction="down" />
      </button>
    </div>
  );
}

function VoteArrow({ direction }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {direction === 'up'
        ? <path d="m5 14 7-7 7 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        : <path d="m5 10 7 7 7-7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  );
}
