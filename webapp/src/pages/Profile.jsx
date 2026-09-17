import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import ClipCard from '../components/ClipCard';
import FollowButton from '../components/FollowButton';
import Avatar from '../components/Avatar';

const TABS = [
  { label: 'Clips', value: 'clips' },
  { label: 'Likes', value: 'likes' },
  { label: 'Followers', value: 'followers' },
  { label: 'Following', value: 'following' },
  { label: 'Comments', value: 'comments' },
  { label: 'Claims', value: 'claims' },
];

export default function Profile() {
  const { handle } = useParams();
  const [profile, setProfile] = useState(null);
  const [activeTab, setActiveTab] = useState('clips');
  const [loading, setLoading] = useState(true);
  const [clips, setClips] = useState([]);
  const [likedClips, setLikedClips] = useState([]);
  const [followers, setFollowers] = useState([]);
  const [following, setFollowing] = useState([]);
  const [comments, setComments] = useState([]);
  const [claims, setClaims] = useState([]);
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);

  useEffect(() => {
    async function load() {
      setLoading(true);
      let { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('handle', handle)
        .single();

      if (!profileData) {
        const { data } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', handle)
          .single();
        profileData = data;
      }

      if (profileData) {
        setProfile(profileData);

        const [clipsRes, followerRes, followingRes] = await Promise.all([
          supabase
            .from('clips')
            .select('*, profiles(*), annotations(id, text_content, audio_url)')
            .eq('user_id', profileData.id)
            .order('created_at', { ascending: false }),
          supabase
            .from('follows')
            .select('follower_id', { count: 'exact', head: true })
            .eq('following_id', profileData.id),
          supabase
            .from('follows')
            .select('following_id', { count: 'exact', head: true })
            .eq('follower_id', profileData.id),
        ]);

        if (clipsRes.data) {
          const clipIds = clipsRes.data.map(c => c.id);
          const { data: votesData } = await supabase
            .from('votes')
            .select('clip_id, direction')
            .in('clip_id', clipIds);

          const scores = {};
          votesData?.forEach(v => {
            scores[v.clip_id] = (scores[v.clip_id] || 0) + v.direction;
          });

          const clipsWithCounts = await Promise.all(clipsRes.data.map(async (clip) => {
            const { count } = await supabase
              .from('comments')
              .select('id', { count: 'exact', head: true })
              .eq('clip_id', clip.id);
            return { ...clip, score: scores[clip.id] || 0, comments_count: count ?? 0 };
          }));
          setClips(clipsWithCounts);
        }
        setFollowerCount(followerRes.count || 0);
        setFollowingCount(followingRes.count || 0);
      }
      setLoading(false);
    }
    load();
  }, [handle]);

  useEffect(() => {
    if (!profile) return;
    loadTab(activeTab);
  }, [activeTab, profile]);

  async function loadTab(tab) {
    if (!profile) return;
    if (tab === 'likes') {
      const { data: votesData } = await supabase
        .from('votes')
        .select('clip_id')
        .eq('user_id', profile.id)
        .eq('direction', 1);
      if (votesData?.length) {
        const { data } = await supabase
          .from('clips')
          .select('*, profiles(*), annotations(id, text_content, audio_url)')
          .in('id', votesData.map(v => v.clip_id))
          .order('created_at', { ascending: false });
        if (data) {
          const clipIds = data.map(c => c.id);
          const { data: votesData2 } = await supabase
            .from('votes')
            .select('clip_id, direction')
            .in('clip_id', clipIds);
          const scores = {};
          votesData2?.forEach(v => {
            scores[v.clip_id] = (scores[v.clip_id] || 0) + v.direction;
          });
          const likedWithCounts = await Promise.all(data.map(async (clip) => {
            const { count } = await supabase
              .from('comments')
              .select('id', { count: 'exact', head: true })
              .eq('clip_id', clip.id);
            return { ...clip, score: scores[clip.id] || 0, comments_count: count ?? 0 };
          }));
          setLikedClips(likedWithCounts);
        }
      } else {
        setLikedClips([]);
      }
    } else if (tab === 'followers') {
      const { data } = await supabase
        .from('follows')
        .select('profiles!follows_follower_id_fkey(*)')
        .eq('following_id', profile.id);
      if (data) setFollowers(data.map(f => f.profiles).filter(Boolean));
    } else if (tab === 'following') {
      const { data } = await supabase
        .from('follows')
        .select('profiles!follows_following_id_fkey(*)')
        .eq('follower_id', profile.id);
      if (data) setFollowing(data.map(f => f.profiles).filter(Boolean));
    } else if (tab === 'comments') {
      const { data } = await supabase
        .from('comments')
        .select('*, clips(id, slug, title, profiles!clips_user_id_fkey(handle))')
        .eq('user_id', profile.id)
        .order('created_at', { ascending: false });
      if (data) setComments(data);
    } else if (tab === 'claims') {
      const { data: userClips } = await supabase
        .from('clips')
        .select('id')
        .eq('user_id', profile.id);
      if (userClips?.length) {
        const { data } = await supabase
          .from('claims')
          .select('*, clips(id, slug, title)')
          .in('clip_id', userClips.map(c => c.id))
          .order('created_at', { ascending: false });
        if (data) setClaims(data);
      } else {
        setClaims([]);
      }
    }
  }

  if (loading) return <LoadingState />;
  if (!profile) return <NotFound />;

  const currentClips = activeTab === 'clips' ? clips : activeTab === 'likes' ? likedClips : [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Avatar profile={profile} size="lg" />
          <div>
            <h1 className="text-xl font-bold text-text-primary">{profile.display_name || profile.handle}</h1>
            <p className="text-sm text-text-secondary">@{profile.handle}</p>
            {profile.bio && (
              <p className="text-sm text-text-secondary mt-2">{profile.bio}</p>
            )}
          </div>
        </div>
        <FollowButton profileId={profile.id} />
      </div>

      <div className="flex items-center gap-4 text-sm text-text-muted">
        <span>{clips.length} clips</span>
        <span>{followerCount} followers</span>
        <span>{followingCount} following</span>
      </div>

      <div className="flex gap-1 bg-bg-surface border border-border rounded-lg p-1 flex-wrap">
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
          </button>
        ))}
      </div>

      {activeTab === 'followers' ? (
        <div className="flex flex-col gap-3">
          {followers.length === 0 && (
            <p className="text-sm text-text-secondary text-center py-8">No followers yet.</p>
          )}
          {followers.map((user) => (
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
              </div>
            </Link>
          ))}
        </div>
      ) : activeTab === 'following' ? (
        <div className="flex flex-col gap-3">
          {following.length === 0 && (
            <p className="text-sm text-text-secondary text-center py-8">Not following anyone yet.</p>
          )}
          {following.map((user) => (
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
              </div>
            </Link>
          ))}
        </div>
      ) : activeTab === 'comments' ? (
        <div className="flex flex-col gap-3">
          {comments.length === 0 && (
            <p className="text-sm text-text-secondary text-center py-8">No comments yet.</p>
          )}
          {comments.map((comment) => (
            <div key={comment.id} className="bg-bg-surface border border-border rounded-lg p-3">
              <Link
                to={`/clip/${comment.clips?.slug || comment.clips?.id}`}
                className="text-xs text-accent-text hover:text-accent transition-colors no-underline block mb-2"
              >
                {comment.clips?.title || 'Untitled clip'}
                {comment.clips?.profiles?.handle && (
                  <span className="text-text-muted"> by @{comment.clips.profiles.handle}</span>
                )}
              </Link>
              <p className="text-sm text-text-primary">{comment.body}</p>
              <p className="text-[11px] text-text-muted mt-2 font-mono">{timeAgo(comment.created_at)}</p>
            </div>
          ))}
        </div>
      ) : activeTab === 'claims' ? (
        <div className="flex flex-col gap-3">
          {claims.length === 0 && (
            <p className="text-sm text-text-secondary text-center py-8">No claims on your clips yet.</p>
          )}
          {claims.map((claim) => (
            <div key={claim.id} className="bg-bg-surface border border-border rounded-lg p-4 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <Link
                  to={`/clip/${claim.clips?.slug || claim.clips?.id}`}
                  className="text-xs text-accent-text hover:text-accent transition-colors no-underline"
                >
                  {claim.clips?.title || 'Untitled clip'}
                </Link>
                <span className="text-[11px] text-text-muted font-mono">{timeAgo(claim.created_at)}</span>
              </div>
              <p className="text-sm text-text-primary">{claim.reason}</p>
              <div className="flex items-center justify-between mt-1">
                {claim.claimant_email && (
                  <a
                    href={`mailto:${claim.claimant_email}?subject=Re: Claim on your clip&body=Hi, I'm reaching out regarding your claim.`}
                    className="text-xs text-accent-text hover:text-accent transition-colors no-underline"
                  >
                    Reply to {claim.claimant_email}
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {currentClips.length === 0 && (
            <p className="text-sm text-text-secondary text-center py-8">
              {activeTab === 'clips' ? 'No clips yet.' : 'No liked clips yet.'}
            </p>
          )}
          {currentClips.map((clip) => (
            <ClipCard key={clip.id} clip={clip} />
          ))}
        </div>
      )}
    </div>
  );
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

function LoadingState() {
  return (
    <div className="flex flex-col gap-6 animate-pulse">
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-bg-raised" />
        <div className="flex flex-col gap-2">
          <div className="w-32 h-5 bg-bg-raised rounded" />
          <div className="w-24 h-3 bg-bg-raised rounded" />
        </div>
      </div>
    </div>
  );
}

function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
      <span className="text-4xl">👤</span>
      <h2 className="text-xl font-bold text-text-primary">User not found</h2>
      <p className="text-sm text-text-secondary">This user doesn't exist or has been removed.</p>
    </div>
  );
}
