import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { getCurrentUser } from '../lib/authUser';
import ClipCard from '../components/ClipCard';
import FollowButton from '../components/FollowButton';
import Avatar from '../components/Avatar';
import { postHref } from '../lib/links';

const TABS = [
  { label: 'Posts', value: 'clips' },
  { label: 'Likes', value: 'likes' },
  { label: 'Connections', value: 'connections' },
  { label: 'Comments', value: 'comments' },
];

export default function Profile() {
  const { handle, tab: routeTab } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [profile, setProfile] = useState(null);
  const [activeTab, setActiveTab] = useState(routeTab === 'comments' ? 'comments' : 'clips');
  const [loading, setLoading] = useState(true);
  const [clips, setClips] = useState([]);
  const [likedClips, setLikedClips] = useState([]);
  const [followers, setFollowers] = useState([]);
  const [following, setFollowing] = useState([]);
  const [comments, setComments] = useState([]);
  const [claims, setClaims] = useState([]);
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [viewerId, setViewerId] = useState(null);
  const [connectionView, setConnectionView] = useState('followers');
  const [commentView, setCommentView] = useState('comments');
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileHandleDraft, setProfileHandleDraft] = useState('');
  const [profileNameDraft, setProfileNameDraft] = useState('');
  const [profileBioDraft, setProfileBioDraft] = useState('');
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState('');
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState('');

  useEffect(() => {
    async function load() {
      setLoading(true);
      const viewer = await getCurrentUser();
      setViewerId(viewer?.id || null);
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
            .from('clips_with_scores')
            .select('*, profiles(*), annotations(id, text_content, audio_url), communities(slug, name)')
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

        if (clipsRes.data) setClips(clipsRes.data.map(enrichClip));
        setFollowerCount(followerRes.count || 0);
        setFollowingCount(followingRes.count || 0);
      }
      setLoading(false);
    }
    load();
  }, [handle]);

  const isOwner = viewerId && profile?.id === viewerId;

  useEffect(() => {
    if (!profile) return;
    loadTab(activeTab);
  }, [activeTab, profile, isOwner]);

  useEffect(() => {
    setActiveTab(routeTab === 'comments' ? 'comments' : 'clips');
  }, [routeTab]);

  useEffect(() => {
    if (location.pathname.endsWith('/comments')) setActiveTab('comments');
    else if (location.pathname.endsWith('/annotations')) setActiveTab('clips');
    else if (location.pathname.endsWith('/connections')) setActiveTab('connections');
  }, [location.pathname]);

  useEffect(() => {
    if (avatarPreview.startsWith('blob:')) return () => URL.revokeObjectURL(avatarPreview);
    return undefined;
  }, [avatarPreview]);

  function openProfileEditor() {
    setProfileHandleDraft(profile.handle || '');
    setProfileNameDraft(profile.display_name || '');
    setProfileBioDraft(profile.bio || '');
    setAvatarFile(null);
    setAvatarPreview(profile.avatar_url || '');
    setRemoveAvatar(false);
    setProfileError('');
    setEditingProfile(true);
  }

  async function saveProfile(event) {
    event.preventDefault();
    const nextHandle = profileHandleDraft.trim().toLowerCase();
    if (!/^[a-z0-9_]{1,24}$/.test(nextHandle)) {
      setProfileError('Username must be 1–24 characters using letters, numbers, and underscores.');
      return;
    }
    if (avatarFile && (!['image/jpeg', 'image/png', 'image/webp'].includes(avatarFile.type) || avatarFile.size > 5 * 1024 * 1024)) {
      setProfileError('Choose a JPG, PNG, or WebP photo under 5 MB.');
      return;
    }

    setProfileSaving(true);
    setProfileError('');
    let avatarUrl = removeAvatar ? null : profile.avatar_url;
    let uploadedPath = null;
    try {
      if (avatarFile) {
        const extension = ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' })[avatarFile.type];
        uploadedPath = `${profile.id}/${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await supabase.storage.from('avatars').upload(uploadedPath, avatarFile, {
          cacheControl: '31536000',
          contentType: avatarFile.type,
          upsert: false,
        });
        if (uploadError) throw uploadError;
        avatarUrl = supabase.storage.from('avatars').getPublicUrl(uploadedPath).data.publicUrl;
      }

      const { data: updatedProfile, error } = await supabase
        .from('profiles')
        .update({
          handle: nextHandle,
          display_name: profileNameDraft.trim().slice(0, 60) || null,
          bio: profileBioDraft.trim().slice(0, 240) || null,
          avatar_url: avatarUrl,
        })
        .eq('id', profile.id)
        .select('*')
        .single();
      if (error) throw error;

      setProfile(updatedProfile);
      window.dispatchEvent(new CustomEvent('annotated:profile-updated', { detail: updatedProfile }));
      const { error: authUpdateError } = await supabase.auth.updateUser({ data: {
        user_name: updatedProfile.handle,
        full_name: updatedProfile.display_name,
        avatar_url: updatedProfile.avatar_url,
      } });
      if (authUpdateError) console.warn('Profile saved, but auth metadata could not be refreshed.', authUpdateError);
      setEditingProfile(false);
      navigate(`/u/${updatedProfile.handle}`, { replace: true });
    } catch (error) {
      if (uploadedPath) await supabase.storage.from('avatars').remove([uploadedPath]);
      if (error.code === '23505') setProfileError('That username is already taken.');
      else if (error.code === '42501' || error.code === 'PGRST301' || /bucket|storage|policy|permission/i.test(error.message || '')) setProfileError('Profile editing needs the latest Supabase migration.');
      else setProfileError(error.message || 'Profile could not be saved. Try again.');
    } finally {
      setProfileSaving(false);
    }
  }

  useEffect(() => {
    if (!isOwner && activeTab === 'likes') setActiveTab('clips');
  }, [isOwner, activeTab]);

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
          .from('clips_with_scores')
          .select('*, profiles(*), annotations(id, text_content, audio_url), communities(slug, name)')
          .in('id', votesData.map(v => v.clip_id))
          .order('created_at', { ascending: false });
        if (data) setLikedClips(data.map(enrichClip));
      } else {
        setLikedClips([]);
      }
    } else if (tab === 'connections') {
      const [followersRes, followingRes] = await Promise.all([
        supabase.from('follows').select('profiles!follows_follower_id_fkey(*)').eq('following_id', profile.id),
        supabase.from('follows').select('profiles!follows_following_id_fkey(*)').eq('follower_id', profile.id),
      ]);
      if (followersRes.data) setFollowers(followersRes.data.map((f) => f.profiles).filter(Boolean));
      if (followingRes.data) setFollowing(followingRes.data.map((f) => f.profiles).filter(Boolean));
    } else if (tab === 'comments') {
      const { data } = await supabase.from('comments').select('*, clips(id, slug, title, communities(slug), profiles!clips_user_id_fkey(handle))').eq('user_id', profile.id).order('created_at', { ascending: false });
      if (data) setComments(data);
      if (isOwner) {
        const { data: userClips } = await supabase.from('clips').select('id').eq('user_id', profile.id);
        if (userClips?.length) {
          const { data: claimRows } = await supabase.from('claims').select('*, clips(id, slug, title, communities(slug), profiles!clips_user_id_fkey(handle))').in('clip_id', userClips.map((clip) => clip.id)).order('created_at', { ascending: false });
          if (claimRows) setClaims(claimRows);
        } else setClaims([]);
      }
    }
  }

  if (loading) return <LoadingState />;
  if (!profile) return <NotFound />;

  const currentClips = activeTab === 'clips' ? clips : activeTab === 'likes' ? likedClips : [];

  return (
    <div className="profile-page">
      <div className="profile-banner" />
      <div className="profile-header">
        <div className="profile-identity">
          <div className="profile-avatar-shell"><Avatar profile={profile} size="lg" /></div>
          <div className="profile-copy">
            <h1 className="text-xl font-bold text-text-primary">{profile.display_name || profile.handle}</h1>
            <p className="text-sm text-text-secondary">{profile.handle}</p>
            {profile.bio && (
              <p className="text-sm text-text-secondary mt-2">{profile.bio}</p>
            )}
          </div>
        </div>
        <div className="profile-header-actions">
          {isOwner ? <button type="button" className="btn-ghost" onClick={openProfileEditor}>Edit profile</button> : <FollowButton profileId={profile.id} />}
        </div>
      </div>

      {editingProfile && <div className="profile-edit-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditingProfile(false); }}>
        <section className="profile-edit-dialog" role="dialog" aria-modal="true" aria-labelledby="profile-edit-title">
          <div className="profile-edit-heading">
            <div><h2 id="profile-edit-title">Edit profile</h2><p>Choose the name and photo people see.</p></div>
            <button type="button" className="profile-edit-close" aria-label="Close profile editor" onClick={() => setEditingProfile(false)}>×</button>
          </div>
          <form onSubmit={saveProfile} className="profile-edit-form">
            <div className="profile-photo-editor">
              <Avatar profile={{ ...profile, handle: profileHandleDraft || profile.handle, avatar_url: avatarPreview }} size="lg" />
              <div>
                <label className="profile-photo-button">Change photo<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  setAvatarFile(file);
                  setAvatarPreview(URL.createObjectURL(file));
                  setRemoveAvatar(false);
                  setProfileError('');
                }} /></label>
                {(avatarPreview || avatarFile) && <button type="button" className="profile-remove-photo" onClick={() => { setAvatarFile(null); setAvatarPreview(''); setRemoveAvatar(true); }}>Remove</button>}
                <small>JPG, PNG, or WebP · max 5 MB</small>
              </div>
            </div>
            <label className="profile-edit-label">Username<input className="input" value={profileHandleDraft} onChange={(event) => setProfileHandleDraft(event.target.value)} maxLength={24} autoComplete="username" /></label>
            <label className="profile-edit-label">Display name<input className="input" value={profileNameDraft} onChange={(event) => setProfileNameDraft(event.target.value)} maxLength={60} /></label>
            <label className="profile-edit-label">Bio<textarea className="input profile-bio-input" value={profileBioDraft} onChange={(event) => setProfileBioDraft(event.target.value)} maxLength={240} rows={3} /></label>
            {profileError && <p className="profile-edit-error" role="alert">{profileError}</p>}
            <div className="profile-edit-actions"><button type="button" className="btn-ghost" onClick={() => setEditingProfile(false)}>Cancel</button><button type="submit" className="btn-primary" disabled={profileSaving}>{profileSaving ? 'Saving…' : 'Save changes'}</button></div>
          </form>
        </section>
      </div>}

      <div className="profile-stats">
        <span><strong>{clips.length}</strong> posts</span>
        <span>{followerCount} followers</span>
        <span>{followingCount} following</span>
      </div>

      <div className="profile-tabs">
        {TABS.filter((tab) => tab.value !== 'likes' || isOwner).map((tab) => (
          <button
            key={tab.value}
            onClick={() => {
              setActiveTab(tab.value);
              if (tab.value === 'clips') navigate(`/u/${handle}/annotations`);
              else if (tab.value === 'comments') navigate(`/u/${handle}/comments`);
              else if (tab.value === 'connections') navigate(`/u/${handle}/connections`);
            }}
            className={`profile-tab ${
              activeTab === tab.value
                ? 'profile-tab-active'
                : ''
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="profile-content">
      {activeTab === 'connections' ? (
        <div>
          <div className="profile-subtabs"><button className={connectionView === 'followers' ? 'profile-subtab-active' : ''} onClick={() => setConnectionView('followers')}>Followers · {followerCount}</button><button className={connectionView === 'following' ? 'profile-subtab-active' : ''} onClick={() => setConnectionView('following')}>Following · {followingCount}</button></div>
          <div className="profile-people-list">
            {(connectionView === 'followers' ? followers : following).length === 0 && <p className="text-sm text-text-secondary text-center py-8">{connectionView === 'followers' ? 'No followers yet.' : 'Not following anyone yet.'}</p>}
            {(connectionView === 'followers' ? followers : following).map((user) => <Link key={user.id} to={`/u/${user.handle}`} className="profile-person no-underline"><Avatar profile={user} size="md" /><span><strong>{user.handle}</strong>{user.display_name && <small>{user.display_name}</small>}</span></Link>)}
          </div>
        </div>
      ) : activeTab === 'comments' ? (
        <div className="flex flex-col gap-3">
          <div className="profile-subtabs"><button className={commentView === 'comments' ? 'profile-subtab-active' : ''} onClick={() => setCommentView('comments')}>Comments</button>{isOwner && <button className={commentView === 'claims' ? 'profile-subtab-active' : ''} onClick={() => setCommentView('claims')}>Claims · {claims.length}</button>}</div>
          {commentView === 'comments' && <>
          {comments.length === 0 && (
            <p className="text-sm text-text-secondary text-center py-8">No comments yet.</p>
          )}
          {comments.map((comment) => (
            <div key={comment.id} className="bg-bg-surface border border-border rounded-lg p-3">
              <Link
                to={postHref(comment.clips)}
                className="text-xs text-accent-text hover:text-accent transition-colors no-underline block mb-2"
              >
                {comment.clips?.title || 'Untitled clip'}
                {comment.clips?.profiles?.handle && (
                  <span className="text-text-muted"> by {comment.clips.profiles.handle}</span>
                )}
              </Link>
              <p className="text-sm text-text-primary">{comment.body}</p>
              <p className="text-[11px] text-text-muted mt-2 font-mono">{timeAgo(comment.created_at)}</p>
            </div>
          ))}
          </>}
          {commentView === 'claims' && <>
          {claims.length === 0 && (
            <p className="text-sm text-text-secondary text-center py-8">No claims on your clips yet.</p>
          )}
          {claims.map((claim) => (
            <div key={claim.id} className="bg-bg-surface border border-border rounded-lg p-4 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <Link
                  to={postHref(claim.clips)}
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
          </>}
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

function enrichClip(clip) {
  return {
    ...clip,
    source_domain: clip.source_domain || getDomain(clip.source_url),
    community_name: clip.community_name || clip.communities?.name,
    community_slug: clip.community_slug || clip.communities?.slug,
  };
}

function getDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return 'source'; }
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
