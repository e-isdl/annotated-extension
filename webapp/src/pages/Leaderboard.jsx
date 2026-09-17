import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import Avatar from '../components/Avatar';
import VoteButtons from '../components/VoteButtons';

const PERIODS = [
  { label: 'Today', value: 'day' },
  { label: 'This week', value: 'week' },
  { label: 'All time', value: 'all' },
];

function getStartDate(period) {
  const now = new Date();
  if (period === 'day') {
    now.setHours(0, 0, 0, 0);
    return now.toISOString();
  }
  if (period === 'week') {
    now.setDate(now.getDate() - 7);
    return now.toISOString();
  }
  return null;
}

export default function Leaderboard() {
  const [period, setPeriod] = useState('day');
  const [clips, setClips] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const startDate = getStartDate(period);

      let query = supabase
        .from('clips_with_scores')
        .select('*, profiles(*)')
        .order('score', { ascending: false })
        .limit(10);

      if (startDate) {
        query = query.gte('created_at', startDate);
      }

      const { data } = await query;
      setClips(data || []);
      setLoading(false);
    }
    load();
  }, [period]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary tracking-tight">Leaderboard</h1>
        <p className="text-sm text-text-secondary mt-1">The most annotated content right now.</p>
      </div>

      <div className="flex gap-1 bg-bg-surface border border-border rounded-lg p-1 w-fit">
        {PERIODS.map((p) => (
          <button
            key={p.value}
            onClick={() => setPeriod(p.value)}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              period === p.value
                ? 'bg-accent text-bg-base'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {loading ? (
        <LoadingSkeleton />
      ) : clips.length === 0 ? (
        <p className="text-text-muted text-sm">No clips for this period yet.</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {clips.map((clip, index) => (
            <li key={clip.id} className="clip-card flex items-start gap-4">
              <div className="shrink-0 w-7 text-center">
                <span className={`font-mono font-bold text-lg ${
                  index === 0 ? 'text-accent' :
                  index === 1 ? 'text-text-secondary' :
                  index === 2 ? 'text-text-muted' : 'text-text-muted'
                }`}>
                  {index + 1}
                </span>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Avatar profile={clip.profiles} size="xs" />
                  <span className="text-xs text-text-muted">@{clip.profiles?.handle}</span>
                  <span className={`badge badge-${clip.source_type}`}>{clip.source_type}</span>
                </div>
                <Link
                  to={`/clip/${clip.slug || clip.id}`}
                  className="text-sm font-medium text-text-primary hover:text-accent-text transition-colors line-clamp-2"
                >
                  {clip.title}
                </Link>
                <div className="mt-2">
                  <LeaderboardVoteButtons clip={clip} />
                </div>
              </div>

              {clip.thumbnail && (
                <img
                  src={clip.thumbnail}
                  alt=""
                  className="w-16 h-10 object-cover rounded shrink-0 opacity-80"
                />
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function LeaderboardVoteButtons({ clip }) {
  const [score, setScore] = useState(clip.score ?? 0);
  return <VoteButtons clipId={clip.id} score={score} setScore={setScore} />;
}

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="clip-card h-20 animate-pulse bg-bg-raised" />
      ))}
    </div>
  );
}
