import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { deleteComment } from '../lib/api';
import { notify } from '../lib/notifications';
import Avatar from './Avatar';

export default function CommentSection({ clipId }) {
  const [comments, setComments] = useState([]);
  const [body, setBody] = useState('');
  const [anonName, setAnonName] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [replyBody, setReplyBody] = useState('');
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState('best');
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => {
    let active = true;
    async function load() {
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      const { data } = await supabase
        .from('comments')
        .select('*, profiles(*)')
        .eq('clip_id', clipId)
        .order('created_at', { ascending: true });
      if (!active) return;
      setSession(currentSession);
      setComments(data || []);
      setLoading(false);
    }
    load();
    return () => { active = false; };
  }, [clipId]);

  const visibleComments = useMemo(() => {
    if (sort === 'new') return [...comments].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return comments;
  }, [comments, sort]);

  const submitComment = async ({ text, parentCommentId = null }) => {
    if (!text.trim()) return;
    const { data: { user } } = await supabase.auth.getUser();
    const commentBody = text.trim();
    const tempId = `temp-${Date.now()}`;
    const optimisticComment = {
      id: tempId,
      body: commentBody,
      parent_comment_id: parentCommentId,
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

    setComments((current) => [...current, optimisticComment]);
    if (parentCommentId) setReplyBody('');
    else { setBody(''); setAnonName(''); }
    setReplyTo(null);

    try {
      const insertPayload = user
        ? { clip_id: clipId, user_id: user.id, body: commentBody, ...(parentCommentId ? { parent_comment_id: parentCommentId } : {}) }
        : { clip_id: clipId, user_id: null, body: commentBody, anonymous_name: optimisticComment.anonymous_name, ...(parentCommentId ? { parent_comment_id: parentCommentId } : {}) };

      const { data, error } = await supabase
        .from('comments')
        .insert(insertPayload)
        .select('*, profiles(*)')
        .single();
      if (error) throw error;
      setComments((current) => current.map((comment) => comment.id === tempId ? data : comment));

      if (user) {
        const { data: clipData } = await supabase.from('clips').select('user_id, title').eq('id', clipId).single();
        if (clipData?.user_id && clipData.user_id !== user.id) {
          const { data: commenterProfile } = await supabase.from('profiles').select('handle').eq('id', user.id).single();
          notify({ userId: clipData.user_id, type: 'comment', message: `@${commenterProfile?.handle || 'Someone'} commented on "${clipData.title}": ${commentBody.slice(0, 80)}`, clipId });
        }
      }
    } catch (error) {
      console.error('Comment failed:', error);
      setComments((current) => current.filter((comment) => comment.id !== tempId));
      if (parentCommentId) setReplyBody(commentBody);
      else setBody(commentBody);
    }
  };

  const handleDelete = async (commentId) => {
    if (!session?.user) return;
    setDeletingId(commentId);
    try {
      await deleteComment(commentId, session.user.id);
      setComments((current) => current.filter((comment) => comment.id !== commentId && comment.parent_comment_id !== commentId));
    } catch (error) {
      console.error('Delete failed:', error);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <section className="comment-section">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-text-primary">Discussion <span className="text-text-muted font-normal">({comments.length})</span></h3>
        <select value={sort} onChange={(event) => setSort(event.target.value)} className="sort-chip">
          <option value="best">Best</option>
          <option value="new">New</option>
        </select>
      </div>

      <div className="comment-composer">
        {!session && <input type="text" value={anonName} onChange={(event) => setAnonName(event.target.value)} placeholder="Your name (optional)" className="input text-sm" />}
        <div className="flex gap-2">
          <input type="text" value={body} onChange={(event) => setBody(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') submitComment({ text: body }); }} placeholder={session ? 'Add to the conversation…' : 'Add a comment…'} className="input flex-1 text-sm" />
          <button onClick={() => submitComment({ text: body })} disabled={!body.trim()} className="btn-primary text-sm disabled:opacity-40">Comment</button>
        </div>
      </div>

      {loading ? <CommentSkeleton /> : (
        <div className="comment-tree">
          {buildTree(visibleComments).map((comment) => (
            <CommentNode
              key={comment.id}
              comment={comment}
              depth={0}
              session={session}
              replyTo={replyTo}
              setReplyTo={setReplyTo}
              replyBody={replyBody}
              setReplyBody={setReplyBody}
              submitComment={submitComment}
              handleDelete={handleDelete}
              deletingId={deletingId}
            />
          ))}
          {comments.length === 0 && <p className="text-sm text-text-muted py-5">Be the first person to add context.</p>}
        </div>
      )}
    </section>
  );
}

function CommentNode({ comment, depth, session, replyTo, setReplyTo, replyBody, setReplyBody, submitComment, handleDelete, deletingId }) {
  const displayName = comment.user_id ? `@${comment.profiles?.handle || 'user'}` : comment.anonymous_name || 'Anonymous';
  const canDelete = session?.user && session.user.id === comment.user_id;
  const children = comment.children || [];
  const safeDepth = Math.min(depth, 5);

  return (
    <div className="comment-node" style={{ marginLeft: safeDepth ? `${safeDepth * 18}px` : 0 }}>
      <div className="flex items-start gap-2.5">
        <Link to={comment.profiles?.handle ? `/u/${comment.profiles.handle}` : '#'} className="shrink-0"><Avatar profile={comment.profiles} size="sm" /></Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Link to={comment.profiles?.handle ? `/u/${comment.profiles.handle}` : '#'} className="text-xs font-semibold text-text-primary hover:text-accent-text no-underline">{displayName}</Link>
            <span className="text-[10px] text-text-muted font-mono">{timeAgo(comment.created_at)}</span>
            {canDelete && <button onClick={() => handleDelete(comment.id)} disabled={deletingId === comment.id} className="text-[10px] text-claim hover:text-claim/80">{deletingId === comment.id ? '…' : 'delete'}</button>}
          </div>
          <p className="comment-body">{comment.body}</p>
          <div className="comment-tools"><button onClick={() => setReplyTo(replyTo === comment.id ? null : comment.id)}>Reply</button><button>Share</button></div>
          {replyTo === comment.id && (
            <div className="flex gap-2 mt-2">
              <input autoFocus value={replyBody} onChange={(event) => setReplyBody(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') submitComment({ text: replyBody, parentCommentId: comment.id }); }} placeholder={`Reply to ${displayName}`} className="input text-xs flex-1" />
              <button onClick={() => submitComment({ text: replyBody, parentCommentId: comment.id })} disabled={!replyBody.trim()} className="btn-primary text-xs px-3 disabled:opacity-40">Reply</button>
            </div>
          )}
        </div>
      </div>
      {children.map((child) => <CommentNode key={child.id} {...{ comment: child, depth: depth + 1, session, replyTo, setReplyTo, replyBody, setReplyBody, submitComment, handleDelete, deletingId }} />)}
    </div>
  );
}

function buildTree(comments) {
  const byId = new Map(comments.map((comment) => [comment.id, comment]));
  const byParent = new Map();
  comments.forEach((comment) => {
    const key = comment.parent_comment_id || 'root';
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push({ ...comment, children: [] });
  });
  const attach = (items, trail = new Set()) => items.map((item) => {
    if (trail.has(item.id)) return { ...item, children: [] };
    const nextTrail = new Set(trail);
    nextTrail.add(item.id);
    return { ...item, children: attach(byParent.get(item.id) || [], nextTrail) };
  });
  const roots = comments
    .filter((comment) => !comment.parent_comment_id || !byId.has(comment.parent_comment_id))
    .map((comment) => ({ ...comment, children: [] }));
  return attach(roots);
}

function CommentSkeleton() {
  return <div className="flex flex-col gap-3 py-4">{[1, 2].map((item) => <div key={item} className="h-16 rounded bg-bg-raised animate-pulse" />)}</div>;
}

function timeAgo(dateStr) {
  const diff = Math.max(0, Date.now() - new Date(dateStr).getTime());
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${Math.max(1, mins)}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}
