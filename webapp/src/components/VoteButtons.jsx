import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { castVote, getUserVote } from '../lib/api';
import { notify } from '../lib/notifications';

export default function VoteButtons({ clipId, score, setScore }) {
  const [userVote, setUserVote] = useState(null);
  const [userId, setUserId] = useState(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setUserId(user.id);
        getUserVote(supabase, clipId, user.id).then(setUserVote);
      }
    });
  }, [clipId]);

  const handleVote = async (direction) => {
    if (!userId) { alert('Sign in to vote.'); return; }

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

    castVote(supabase, clipId, userId, direction).then(async () => {
      if (direction === 1 && prevVote !== 1) {
        try {
          const { data: clip } = await supabase.from('clips').select('user_id, title').eq('id', clipId).single();
          if (clip?.user_id && clip.user_id !== userId) {
            const { data: profile } = await supabase.from('profiles').select('handle').eq('id', userId).single();
            notify({
              userId: clip.user_id,
              type: 'like',
              message: `@${profile?.handle || 'Someone'} liked "${clip.title}"`,
              clipId,
            });
          }
        } catch {}
      }
    }).catch(() => {
      setUserVote(prevVote);
      setScore(prevScore);
    });
  };

  return (
    <div className="flex items-center gap-0.5">
      <button
        onClick={() => handleVote(1)}
        className={`w-8 h-8 flex items-center justify-center rounded-md text-sm transition-all duration-75 ${
          userVote === 1
            ? 'bg-accent text-bg-base scale-110'
            : 'text-text-muted hover:text-accent hover:bg-accent/10'
        }`}
      >
        &#9650;
      </button>

      <span
        className={`font-mono text-sm font-semibold min-w-[28px] text-center tabular-nums ${
          score > 0 ? 'text-accent-text' : score < 0 ? 'text-claim' : 'text-text-muted'
        }`}
      >
        {score > 0 ? `+${score}` : score}
      </span>

      <button
        onClick={() => handleVote(-1)}
        className={`w-8 h-8 flex items-center justify-center rounded-md text-sm transition-all duration-75 ${
          userVote === -1
            ? 'bg-claim/20 text-claim scale-110'
            : 'text-text-muted hover:text-claim hover:bg-claim/10'
        }`}
      >
        &#9660;
      </button>
    </div>
  );
}
