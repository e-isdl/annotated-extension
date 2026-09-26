import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { deleteComment } from '../lib/api';
import { createComment } from '../lib/mutations';
import { countReplies, wilsonScore } from '../lib/commentRanking';
import Avatar from './Avatar';
import { useToast } from './ToastProvider';

export default function CommentSection({ clipId, postOwnerId = null, communityId = null, focusCommentId = null, demoComments = null }) {
  const location = useLocation();
  const [comments, setComments] = useState([]);
  const [body, setBody] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [replyBody, setReplyBody] = useState('');
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState('best');
  const [commentVotes, setCommentVotes] = useState({});
  const [moderatorIds, setModeratorIds] = useState(new Set());
  const [deletingId, setDeletingId] = useState(null);
  const composerRef = useRef(null);
  const { push } = useToast();

  useEffect(() => {
    let active = true;
    async function load() {
      if (demoComments) {
        const rows = demoComments.map((comment) => ({
          ...comment,
          clip_id: clipId,
          parent_comment_id: comment.parent_comment_id || null,
          created_at: comment.created_at || new Date(Date.now() - (comment.ageMinutes || 1) * 60000).toISOString(),
          profiles: comment.profiles || { handle: comment.handle || 'reader' },
        }));
        const initialVotes = {};
        rows.forEach((comment) => { initialVotes[comment.id] = { score: comment.score || 0, vote_count: comment.vote_count || 0, direction: null }; });
        setCommentVotes(initialVotes);
        setComments(rows);
        setSession(null);
        setLoading(false);
        const targetId = focusCommentId || (window.location.hash.startsWith('#comment-') ? window.location.hash.slice('#comment-'.length) : null);
        if (targetId) window.setTimeout(() => document.getElementById(`comment-${targetId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80);
        return () => { active = false; };
      }
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      const { data } = await supabase
        .from('comments')
        .select('*, profiles(*)')
        .eq('clip_id', clipId)
        .order('created_at', { ascending: true });
      if (!active) return;
      if (communityId) {
        const { data: roles } = await supabase.from('community_members').select('user_id, role').eq('community_id', communityId).in('role', ['moderator', 'owner']);
        if (active) setModeratorIds(new Set((roles || []).map((row) => row.user_id)));
      }
      const currentComments = data || [];
      const commentIds = currentComments.map((comment) => comment.id);
      if (commentIds.length) {
        const [{ data: scoreRows }, { data: userVoteRows }] = await Promise.all([
          supabase.from('comment_vote_scores').select('comment_id, score, vote_count').in('comment_id', commentIds),
          currentSession?.user ? supabase.from('comment_votes').select('comment_id, direction').eq('user_id', currentSession.user.id).in('comment_id', commentIds) : Promise.resolve({ data: [] }),
        ]);
        const voteMap = {};
        (scoreRows || []).forEach((vote) => {
          voteMap[vote.comment_id] = { score: vote.score, vote_count: vote.vote_count, direction: null };
        });
        (userVoteRows || []).forEach((vote) => {
          voteMap[vote.comment_id] = { ...voteMap[vote.comment_id], direction: vote.direction };
        });
        if (active) setCommentVotes(voteMap);
      }
      setSession(currentSession);
      setComments(currentComments);
      setLoading(false);
      const targetId = focusCommentId || (window.location.hash.startsWith('#comment-') ? window.location.hash.slice('#comment-'.length) : null);
      if (targetId) {
        window.setTimeout(() => document.getElementById(`comment-${targetId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80);
      }
    }
    load();
    return () => { active = false; };
  }, [clipId, communityId, focusCommentId, location.hash, demoComments]);

  useEffect(() => {
    if (composerRef.current && !body) composerRef.current.style.height = '';
  }, [body]);

  const visibleComments = useMemo(() => {
    if (sort === 'new') return [...comments].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    if (sort === 'oldest') return comments;
    return [...comments].sort((a, b) => wilsonScore(commentVotes[b.id]) - wilsonScore(commentVotes[a.id]));
  }, [comments, commentVotes, sort]);
  const focusedCommentId = focusCommentId || (location.hash.startsWith('#comment-') ? location.hash.slice('#comment-'.length) : null);
  const commentTree = useMemo(() => buildTree(visibleComments, focusedCommentId), [visibleComments, focusedCommentId]);

  const voteComment = async (commentId, direction) => {
    if (String(commentId).startsWith('temp-')) return;
    if (!session?.user) { push('Sign in to vote on comments.', 'info'); return; }
    const { error } = await supabase.rpc('toggle_comment_vote', { p_comment_id: commentId, p_direction: direction });
    if (error) { push('Comment vote could not be saved.', 'error'); return; }
    const current = commentVotes[commentId] || { score: 0, vote_count: 0, direction: null };
    const nextScore = current.direction === direction ? current.score - direction : current.score + direction - (current.direction || 0);
    const nextDirection = current.direction === direction ? null : direction;
    const nextCount = current.vote_count + (current.direction === direction ? -1 : current.direction ? 0 : 1);
    setCommentVotes((value) => ({ ...value, [commentId]: { score: nextScore, vote_count: nextCount, direction: nextDirection } }));
  };

  const submitComment = async ({ text, parentCommentId = null }) => {
    if (!text.trim()) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { push('Sign in to join the discussion.', 'info'); return; }
    const commentBody = text.trim();
    const tempId = `temp-${Date.now()}`;
    const optimisticComment = {
      id: tempId,
      body: commentBody,
      parent_comment_id: parentCommentId,
      user_id: user.id,
      created_at: new Date().toISOString(),
      profiles: {
        id: user.id,
        handle: user.user_metadata?.user_name || user.email?.split('@')[0] || 'user',
        display_name: user.user_metadata?.full_name || null,
        avatar_url: user.user_metadata?.avatar_url || null,
      },
    };

    setComments((current) => [...current, optimisticComment]);
    if (parentCommentId) setReplyBody('');
    else setBody('');
    setReplyTo(null);

    try {
      const insertPayload = { clip_id: clipId, user_id: user.id, body: commentBody, ...(parentCommentId ? { parent_comment_id: parentCommentId } : {}) };

      const data = await createComment(supabase, insertPayload);
      setComments((current) => current.map((comment) => comment.id === tempId ? data : comment));

    } catch (error) {
      console.error('Comment failed:', error);
      setComments((current) => current.filter((comment) => comment.id !== tempId));
      if (parentCommentId) setReplyBody(commentBody);
      else setBody(commentBody);
      push('Comment could not be posted. Please try again.', 'error');
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
      push('Comment could not be deleted.', 'error');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <section className="comment-section" id="comments">
      <div className="comment-toolbar">
        <select value={sort} onChange={(event) => setSort(event.target.value)} className="sort-chip">
          <option value="best">Best</option>
          <option value="new">New</option>
          <option value="oldest">Old</option>
        </select>
      </div>

      <div className="comment-composer">
        <div className="flex gap-2">
          <textarea ref={composerRef} rows={2} maxLength={600} value={body} onChange={(event) => { setBody(event.target.value); resizeCommentField(event.currentTarget); }} onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') submitComment({ text: body }); }} placeholder={session ? 'Add to the conversation…' : 'Sign in to add to the conversation…'} className="input flex-1 text-sm comment-textarea" />
          <button onClick={() => submitComment({ text: body })} disabled={!body.trim()} className="btn-primary text-sm disabled:opacity-40">Comment</button>
        </div>
        {body.length >= 480 && <span className="comment-character-count">{body.length}/600</span>}
      </div>

      {loading ? <CommentSkeleton /> : (
        <div className="comment-tree">
          {commentTree.map((comment) => (
            <CommentNode
              key={comment.id}
              comment={comment}
              postOwnerId={postOwnerId}
              moderatorIds={moderatorIds}
              depth={0}
              session={session}
              replyTo={replyTo}
              setReplyTo={setReplyTo}
              replyBody={replyBody}
              setReplyBody={setReplyBody}
              submitComment={submitComment}
              handleDelete={handleDelete}
              deletingId={deletingId}
              commentVotes={commentVotes}
              voteComment={voteComment}
            />
          ))}
          {comments.length === 0 && <p className="text-sm text-text-muted py-5">Be the first person to add context.</p>}
        </div>
      )}
    </section>
  );
}

function CommentNode({ comment, depth, session, replyTo, setReplyTo, replyBody, setReplyBody, submitComment, handleDelete, deletingId, commentVotes, voteComment, postOwnerId, moderatorIds }) {
  const { push } = useToast();
  const [collapsed, setCollapsed] = useState(false);
  const displayName = `@${comment.profiles?.handle || 'user'}`;
  const canDelete = session?.user && session.user.id === comment.user_id;
  const children = comment.children || [];
  const replyCount = countReplies(children);
  const replyInputRef = useRef(null);
  const safeDepth = Math.min(depth, 5);
  const vote = commentVotes[comment.id] || { score: 0, direction: null };
  const edited = comment.updated_at && new Date(comment.updated_at) - new Date(comment.created_at) > 60000;
  const isBot = comment.profiles?.is_bot || String(comment.profiles?.handle || '').toLowerCase() === 'automoderator';
  const isFocused = Boolean(comment.focusContext?.length || window.location.pathname.endsWith(`/comment/${comment.id}`));
  const commentUrl = `/post/${comment.clip_id}/comment/${comment.id}`;
  const replyIsOpen = replyTo === comment.id;

  const collapseReplies = () => {
    if (replyTo) {
      setReplyTo(null);
      setReplyBody('');
    }
    setCollapsed(true);
  };
  const toggleReply = () => {
    setReplyBody('');
    setReplyTo(replyIsOpen ? null : comment.id);
  };

  useEffect(() => {
    if (replyIsOpen && !collapsed) replyInputRef.current?.focus();
    else if (replyInputRef.current) {
      if (replyInputRef.current === document.activeElement) replyInputRef.current.blur();
      if (!replyBody) replyInputRef.current.style.height = '';
    }
  }, [replyIsOpen, replyBody, collapsed]);

  return (
    <div className={`comment-node${isFocused ? ' comment-node-focused' : ''}`} id={`comment-${comment.id}`} data-depth={safeDepth} style={{ marginLeft: safeDepth ? `${safeDepth * 18}px` : 0 }}>
      {children.length > 0 && <button type="button" className="comment-thread-toggle" aria-label={collapsed ? 'Expand replies by clicking the thread line' : 'Collapse replies by clicking the thread line'} aria-expanded={!collapsed} onClick={() => collapsed ? setCollapsed(false) : collapseReplies()} />}
      <div className="flex items-start gap-2.5">
        <Link to={comment.profiles?.handle ? `/u/${comment.profiles.handle}` : '#'} className="shrink-0"><Avatar profile={comment.profiles} size="sm" /></Link>
        <div className="min-w-0 flex-1">
          {comment.focusContext?.length > 0 && <p className="comment-context">In reply to {comment.focusContext.map((name, index) => <span key={`${name}-${index}`}>{index ? ' › ' : ''}{name}</span>)}</p>}
          <div className="flex items-center gap-2 flex-wrap">
            <Link to={comment.profiles?.handle ? `/u/${comment.profiles.handle}` : '#'} className="text-xs font-semibold text-text-primary hover:text-accent-text no-underline">{displayName}</Link>
            {isBot && <span className="comment-role-badge comment-role-app">App</span>}
            {comment.user_id === postOwnerId && <span className="comment-role-badge">OP</span>}
            {moderatorIds.has(comment.user_id) && <span className="comment-role-badge comment-role-mod">MOD</span>}
            {comment.is_pinned && <span className="comment-role-badge comment-role-mod">⌖ Stickied comment</span>}
            <span className="text-[10px] text-text-muted font-mono">{timeAgo(comment.created_at)}</span>
            {edited && <span className="text-[10px] text-text-muted">(edited)</span>}
            {canDelete && <button onClick={() => handleDelete(comment.id)} disabled={deletingId === comment.id} className="text-[10px] text-claim hover:text-claim/80">{deletingId === comment.id ? '…' : 'delete'}</button>}
          </div>
          {!collapsed && <p className="comment-body">{comment.body}</p>}
          {collapsed ? (
            <button type="button" className="comment-collapse-summary" aria-expanded="false" onClick={() => setCollapsed(false)}>
              <span>⊕</span><span>{replyCount} {replyCount === 1 ? 'reply' : 'replies'}</span>
            </button>
          ) : (
            <div className="comment-actions" aria-label="Comment actions">
              {children.length > 0 && <button type="button" className="comment-collapse" aria-label="Collapse replies" aria-expanded="true" onClick={collapseReplies}>⊖</button>}
              <button type="button" className="comment-vote-up" aria-label="Upvote comment" aria-pressed={vote.direction === 1} onClick={() => voteComment(comment.id, 1)}><VoteChevron direction="up" /></button>
              <span className="comment-score">{vote.score || ''}</span>
              <button type="button" className="comment-vote-down" aria-label="Downvote comment" aria-pressed={vote.direction === -1} onClick={() => voteComment(comment.id, -1)}><VoteChevron direction="down" /></button>
              <button type="button" onClick={toggleReply}>Reply</button>
              <button type="button" onClick={async () => {
                try {
                  await navigator.clipboard.writeText(`${window.location.origin}${commentUrl}`);
                  push('Comment link copied.', 'info');
                } catch {
                  push('Could not copy the comment link.', 'error');
                }
              }}>Share</button>
            </div>
          )}
          <div className={`reply-composer${replyIsOpen ? ' reply-composer-open' : ''}`} aria-hidden={!replyIsOpen}>
            <div className="flex gap-2 mt-2">
              <textarea ref={replyInputRef} rows={2} maxLength={600} value={replyBody} onChange={(event) => { setReplyBody(event.target.value); resizeCommentField(event.currentTarget); }} onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') submitComment({ text: replyBody, parentCommentId: comment.id }); }} placeholder={`Reply to ${displayName}`} className="input text-xs flex-1 comment-reply-input" tabIndex={replyIsOpen ? 0 : -1} />
              <button onClick={() => submitComment({ text: replyBody, parentCommentId: comment.id })} disabled={!replyBody.trim()} className="btn-primary text-xs px-3 disabled:opacity-40" tabIndex={replyIsOpen ? 0 : -1}>Reply</button>
            </div>
          </div>
        </div>
      </div>
      {!collapsed && depth >= 5 && children.length > 0 && <Link className="comment-continue" to={`/post/${comment.clip_id}/comment/${children[0].id}`}>+ Continue this thread</Link>}
      {!collapsed && depth < 5 && children.map((child) => <CommentNode key={child.id} {...{ comment: child, depth: depth + 1, session, replyTo, setReplyTo, replyBody, setReplyBody, submitComment, handleDelete, deletingId, commentVotes, voteComment, postOwnerId, moderatorIds }} />)}
    </div>
  );
}

function VoteChevron({ direction }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {direction === 'up'
        ? <path d="m5 14 7-7 7 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        : <path d="m5 10 7 7 7-7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  );
}

function resizeCommentField(field) {
  field.style.height = 'auto';
  field.style.height = `${Math.min(field.scrollHeight, 192)}px`;
  field.style.overflowY = field.scrollHeight > 192 ? 'auto' : 'hidden';
}

function buildTree(comments, focusId = null) {
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
  if (focusId && byId.has(focusId)) {
    const target = byId.get(focusId);
    const context = [];
    let parentId = target.parent_comment_id;
    const seen = new Set([target.id]);
    while (parentId && byId.has(parentId) && !seen.has(parentId)) {
      seen.add(parentId);
      const parent = byId.get(parentId);
      context.unshift(`@${parent.profiles?.handle || 'user'}`);
      parentId = parent.parent_comment_id;
    }
    return attach([{ ...target, children: [], focusContext: context }]);
  }
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
