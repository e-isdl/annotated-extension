import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import ClipCard from '../components/ClipCard';
import Avatar from '../components/Avatar';

const TABS = [
  { label: 'Clips', value: 'clips' },
  { label: 'Users', value: 'users' },
];

export default function SearchPage() {
  const [searchParams] = useSearchParams();
  const query = searchParams.get('q') || '';
  const [activeTab, setActiveTab] = useState('clips');
  const [clips, setClips] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!query.trim()) { setLoading(false); return; }
    setLoading(true);
    setActiveTab('clips');

    const q = query.trim();
    const pattern = `%${q}%`;

    Promise.all([
      supabase
        .from('clips')
        .select('*, profiles(*), annotations(id, text_content, audio_url)')
        .ilike('title', pattern)
        .order('created_at', { ascending: false })
        .limit(30),
      supabase
        .from('profiles')
        .select('*')
        .or(`handle.ilike.${pattern},display_name.ilike.${pattern}`)
        .limit(20),
    ]).then(async ([clipsRes, usersRes]) => {
      if (clipsRes.data) {
        const clipIds = clipsRes.data.map(c => c.id);
        const { data: votesData } = await supabase
          .from('votes')
          .select('clip_id, direction')
          .in('clip_id', clipIds);
        const scores = {};
        votesData?.forEach(v => { scores[v.clip_id] = (scores[v.clip_id] || 0) + v.direction; });
        const scoredClips = await Promise.all(clipsRes.data.map(async (clip) => {
          const { count } = await supabase
            .from('comments')
            .select('id', { count: 'exact', head: true })
            .eq('clip_id', clip.id);
          return { ...clip, score: scores[clip.id] || 0, comments_count: count ?? 0 };
        }));
        setClips(scoredClips);
      }
      if (usersRes.data) setUsers(usersRes.data);
      setLoading(false);
    });
  }, [query]);

  if (!query.trim()) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-text-muted">
          <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
        </svg>
        <p className="text-sm text-text-secondary">Search for clips and users</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="text-sm text-text-muted">
          Results for <span className="text-text-primary font-medium">"{query}"</span>
        </p>
      </div>

      <div className="flex gap-1 bg-bg-surface border border-border rounded-lg p-1">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setActiveTab(tab.value)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              activeTab === tab.value
                ? 'bg-accent text-white'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            {tab.label}
            <span className="ml-1.5 text-text-muted/60">{tab.value === 'clips' ? clips.length : users.length}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex flex-col gap-4 animate-pulse">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-bg-surface border border-border rounded-xl p-4 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-bg-raised" />
                <div className="w-24 h-3 bg-bg-raised rounded" />
              </div>
              <div className="w-full h-4 bg-bg-raised rounded" />
              <div className="w-3/4 h-4 bg-bg-raised rounded" />
            </div>
          ))}
        </div>
      ) : activeTab === 'clips' ? (
        <div className="flex flex-col gap-4">
          {clips.length === 0 ? (
            <p className="text-sm text-text-secondary text-center py-8">No clips found.</p>
          ) : (
            clips.map((clip) => <ClipCard key={clip.id} clip={clip} />)
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {users.length === 0 ? (
            <p className="text-sm text-text-secondary text-center py-8">No users found.</p>
          ) : (
            users.map((user) => (
              <Link
                key={user.id}
                to={`/u/${user.handle}`}
                className="flex items-center gap-3 p-3 bg-bg-surface border border-border rounded-lg hover:bg-bg-raised transition-colors no-underline"
              >
                <Avatar profile={user} size="md" />
                <div>
                  <p className="text-sm font-medium text-text-primary">@{user.handle}</p>
                  {user.display_name && (
                    <p className="text-xs text-text-muted">{user.display_name}</p>
                  )}
                  {user.bio && (
                    <p className="text-xs text-text-secondary mt-1 line-clamp-1">{user.bio}</p>
                  )}
                </div>
              </Link>
            ))
          )}
        </div>
      )}
    </div>
  );
}
