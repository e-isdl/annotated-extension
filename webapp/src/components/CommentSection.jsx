import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { deleteComment } from '../lib/api';
import { notify } from '../lib/notifications';
import Avatar from './Avatar';

export default function CommentSection({ clipId }) {
  const [comments, setComments] = useState([]);
  const [body, setBody] = useState('');
  const [anonName, setAnonName] = useState('');
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);

      const { data } = await supabase
        .from('comments')
        .select('*, profiles(*)')
        .eq('clip_id', clipId)
        .order('created_at', { ascending: true });
      if (data) setComments(data);
      setLoading(false);
    }
    load();
  }, [clipId]);

  const handleComment = async () => {
    if (!body.trim()) return;

    const { data: { user } } = await supabase.auth.getUser();
    const commentBody = body;
    const tempId = `temp-${Date.now()}`;

    const optimisticComment = {
      id: tempId,
      body: commentBody,
      user_id: user?.id || null,
      anonymous_name: user ? null : (anonName || 'Anonymous'),
      created_at: new Date().toISOString(),
      profiles: user ? {
        id: user.id,
        handle: user.user_metadata?.user_name || user.email?.split('@')[0] || 'user',
        display_name: user.user_metadata?.full_name || null,
        avatar_url: user.user_metadata?.avatar_url || null,
      } : null,
    };

    setComments([...comments, optimisticComment]);
    setBody('');
    setAnonName('');

    try {
      const insertPayload = user
        ? { clip_id: clipId, user_id: user.id, body: commentBody }
        : { clip_id: clipId, user_id: null, body: commentBody, anonymous_name: optimisticComment.anonymous_name };

      const { data, error } = await supabase
        .from('comments')
        .insert(insertPayload)
        .select('*, profiles(*)')
        .single();

      if (error) throw error;

      setComments(prev => prev.map(c => c.id === tempId ? data : c));

      if (user) {
        const { data: clipData } = await supabase
          .from('clips')
          .select('user_id, title')
          .eq('id', clipId)
          .single();

        if (clipData?.user_id && clipData.user_id !== user.id) {
          const { data: commenterProfile } = await supabase
            .from('profiles')
            .select('handle')
            .eq('id', user.id)
            .single();

          notify({
            userId: clipData.user_id,
            type: 'comment',
            message: `@${commenterProfile?.handle || 'Someone'} commented on "${clipData.title}": ${commentBody.slice(0, 80)}`,
            clipId,
          });
        }
      }
    } catch (err) {
      console.error('Comment failed:', err);
      setComments(prev => prev.filter(c => c.id !== tempId));
      setBody(commentBody);
      alert('Failed to post comment.');
    }
  };

  const handleDelete = async (commentId) => {
    setDeletingId(commentId);
    try {
      await deleteComment(commentId, session.user.id);
      setComments(comments.filter(c => c.id !== commentId));
    } catch (err) {
      console.error('Delete failed:', err);
      alert('Failed to delete comment.');
    }
    setDeletingId(null);
    setConfirmDeleteId(null);
  };

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-sm font-medium text-text-primary">Comments ({comments.length})</h3>

      <div className="flex flex-col gap-2">
        {!session && (
          <input
            type="text"
            value={anonName}
            onChange={(e) => setAnonName(e.target.value)}
            placeholder="Your name (optional)"
            className="input text-sm"
          />
        )}
        <div className="flex gap-2">
          <input
            type="text"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={session ? "Add a comment..." : "Add a comment (anonymous)..."}
            className="input flex-1 text-sm"
          />
          <button
            onClick={handleComment}
            disabled={!body.trim()}
            className="btn-primary text-sm disabled:opacity-40"
          >
            Post
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col gap-3">
          {[1, 2].map((i) => (
            <div key={i} className="flex items-start gap-3 animate-pulse">
              <div className="w-8 h-8 rounded-full bg-bg-raised" />
              <div className="flex-1">
                <div className="w-20 h-2 bg-bg-raised rounded mb-1" />
                <div className="w-full h-3 bg-bg-raised rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {comments.map((comment) => {
            const displayName = comment.user_id
              ? `@${comment.profiles?.handle}`
              : comment.anonymous_name || 'Anonymous';
            const canDelete = session?.user && session.user.id === comment.user_id;
            return (
              <div key={comment.id} className="flex items-start gap-3 group">
                <Link to={comment.profiles?.handle ? `/u/${comment.profiles.handle}` : '#'}>
                  <Avatar profile={comment.profiles} size="sm" />
                </Link>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Link to={comment.profiles?.handle ? `/u/${comment.profiles.handle}` : '#'} className="text-xs font-medium text-text-primary hover:text-accent transition-colors">
                      {displayName}
                    </Link>
                    <span className="text-xs text-text-muted font-mono">{timeAgo(comment.created_at)}</span>
                    {canDelete && (
                      <div className="flex items-center gap-1">
                        {confirmDeleteId === comment.id ? (
                          <>
                            <button
                              onClick={() => handleDelete(comment.id)}
                              disabled={deletingId === comment.id}
                              className="text-[10px] px-1.5 py-0.5 rounded text-white bg-red-500 hover:bg-red-600 transition-colors disabled:opacity-40"
                            >
                              {deletingId === comment.id ? '...' : 'yes'}
                            </button>
                            <button
                              onClick={() => setConfirmDeleteId(null)}
                              disabled={deletingId === comment.id}
                              className="text-[10px] px-1.5 py-0.5 rounded text-text-muted bg-bg-raised hover:bg-bg-surface transition-colors"
                            >
                              no
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => setConfirmDeleteId(comment.id)}
                            className="text-[10px] px-1.5 py-0.5 rounded text-red-400 bg-red-400/10 hover:bg-red-400/20 transition-colors"
                          >
                            delete
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  <p className="text-sm text-text-secondary mt-1">{comment.body}</p>
                </div>
              </div>
            );
          })}
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
