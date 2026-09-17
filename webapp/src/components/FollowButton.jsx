import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { notify } from '../lib/notifications';

export default function FollowButton({ profileId }) {
  const [isFollowing, setIsFollowing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState(null);

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setCurrentUserId(session.user.id);
        const { data } = await supabase
          .from('follows')
          .select('*')
          .eq('follower_id', session.user.id)
          .eq('following_id', profileId)
          .single();
        setIsFollowing(!!data);
      }
      setLoading(false);
    }
    load();
  }, [profileId]);

  const handleFollow = async () => {
    if (!currentUserId) return;
    if (isFollowing) {
      await supabase
        .from('follows')
        .delete()
        .eq('follower_id', currentUserId)
        .eq('following_id', profileId);
      setIsFollowing(false);
    } else {
      await supabase
        .from('follows')
        .insert({ follower_id: currentUserId, following_id: profileId });
      setIsFollowing(true);

      const { data: followerProfile } = await supabase
        .from('profiles')
        .select('handle')
        .eq('id', currentUserId)
        .single();

      if (followerProfile) {
        notify({
          userId: profileId,
          type: 'follow',
          message: `@${followerProfile.handle} started following you`,
        });
      }
    }
  };

  if (loading || !currentUserId || currentUserId === profileId) return null;

  return (
    <button
      onClick={handleFollow}
      className={isFollowing ? 'btn-ghost' : 'btn-primary text-sm'}
    >
      {isFollowing ? 'Following' : 'Follow'}
    </button>
  );
}
