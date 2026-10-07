import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { getCurrentUser } from '../lib/authUser';
import { getUserVote } from '../lib/api';
import { castVote } from '../lib/mutations';
import { useToast } from './ToastProvider';
import VoteArrow from './VoteArrow';
import './VoteButtons.css';

export default function VoteButtons({ clipId, score, setScore }) {
  const isDemo = String(clipId).startsWith('demo-');
  const [userVote, setUserVote] = useState(null);
  const [userId, setUserId] = useState(null);
  const { push } = useToast();

  useEffect(() => {
    if (isDemo) return;
    getCurrentUser().then((user) => {
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
    <div className="vw-container" data-buddy="post-vote" aria-label="Vote on this post">
      <button
        type="button"
        aria-label="Upvote post"
        aria-pressed={userVote === 1}
        onClick={() => handleVote(1)}
        className={`vw-btn up${userVote === 1 ? ' active' : ''}`}
      >
        <VoteArrow direction="up" />
      </button>

      <span className="vw-count">{score}</span>

      <button
        type="button"
        aria-label="Downvote post"
        aria-pressed={userVote === -1}
        onClick={() => handleVote(-1)}
        className={`vw-btn down${userVote === -1 ? ' active' : ''}`}
      >
        <VoteArrow direction="down" />
      </button>
    </div>
  );
}
