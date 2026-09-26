import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { deleteComment } from '../lib/api';
import { createComment } from '../lib/mutations';
import { controversyScore, countReplies, nextCommentVote, wilsonScore } from '../lib/commentRanking';
import Avatar from './Avatar';
import { useToast } from './ToastProvider';

export default function CommentSection({ clipId, postOwnerId = null, communityId = null, focusCommentId = null }) {
  const location = useLocation();
  const [comments, setComments] = useState([]);
  const [body, setBody] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [replyBody, setReplyBody] = useState('');
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState('best');
  const [commentSearch, setCommentSearch] = useState('');
  const [commentVotes, setCommentVotes] = useState({});
  const [moderatorIds, setModeratorIds] = useState(new Set());
  const [deletingId, setDeletingId] = useState(null);
  const composerRef = useRef(null);
  const pendingVotes = useRef(new Set());
  const { push } = useToast();

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
      if (communityId) {
        const { data: roles } = await supabase.from('community_members').select('user_id, role').eq('community_id', communityId).in('role', ['moderator', 'owner']);
        if (active) setModeratorIds(new Set((roles || []).map((row) => row.user_id)));
      }
      const currentComments = [...new Map((data || [])
        .filter((comment) => comment?.id && typeof comment.body === 'string' && comment.body.trim())
        .map((comment) => [comment.id, comment])).values()];
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
  }, [clipId, communityId, focusCommentId, location.hash]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (composerRef.current && !body) composerRef.current.style.height = '';
  }, [body]);

  const visibleComments = useMemo(() => {
    const sorted = [...comments].sort((a, b) => {
      const newestFirst = new Date(b.created_at) - new Date(a.created_at);
      if (sort === 'new') return newestFirst;
      if (sort === 'old') return -newestFirst;
      if (sort === 'top') return (commentVotes[b.id]?.score || 0) - (commentVotes[a.id]?.score || 0) || newestFirst;
      if (sort === 'controversial') return controversyScore(commentVotes[b.id]) - controversyScore(commentVotes[a.id]) || newestFirst;
      return wilsonScore(commentVotes[b.id]) - wilsonScore(commentVotes[a.id]) || newestFirst;
    });
    const query = commentSearch.trim().toLowerCase();
    return query ? sorted.filter((comment) => `${comment.body} ${comment.profiles?.handle || ''}`.toLowerCase().includes(query)) : sorted;
  }, [comments, commentVotes, sort, commentSearch]);
  const focusedCommentId = focusCommentId || (location.hash.startsWith('#comment-') ? location.hash.slice('#comment-'.length) : null);
  const commentTree = useMemo(() => buildTree(visibleComments, focusedCommentId), [visibleComments, focusedCommentId]);

  const voteComment = async (commentId, direction) => {
    if (String(commentId).startsWith('temp-') || pendingVotes.current.has(commentId)) return;
    if (!session?.user) { push('Sign in to vote on comments.', 'info'); return; }
    const current = commentVotes[commentId] || { score: 0, vote_count: 0, direction: null };
    const nextVote = nextCommentVote(current, direction);
    setCommentVotes((value) => ({ ...value, [commentId]: nextVote }));
    pendingVotes.current.add(commentId);
    try {
      const { error } = await supabase.rpc('toggle_comment_vote', { p_comment_id: commentId, p_direction: direction });
      if (error) throw error;
    } catch (error) {
      setCommentVotes((value) => ({ ...value, [commentId]: current }));
      if (error.code === 'PGRST202' || error.code === '42883') push('Comment voting needs the latest Supabase migration.', 'error');
      else push('Comment vote could not be saved. Try again.', 'error');
    } finally {
      pendingVotes.current.delete(commentId);
    }
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
      setComments((current) => {
        const removed = new Set([commentId]);
        let size;
        do {
          size = removed.size;
          current.forEach((comment) => {
            if (removed.has(comment.parent_comment_id)) removed.add(comment.id);
          });
        } while (removed.size !== size);
        return current.filter((comment) => !removed.has(comment.id));
      });
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
        <label className="comment-sort-label">
          <span>Sort by</span>
          <span className="comment-sort-select-wrap">
            <select value={sort} onChange={(event) => setSort(event.target.value)} className="sort-chip" aria-label="Sort comments">
              <option value="best">Best</option><option value="top">Top</option><option value="new">New</option><option value="controversial">Controversial</option><option value="old">Old</option>
            </select>
            <CommentActionIcon name="caret" />
          </span>
        </label>
        <input type="search" value={commentSearch} onChange={(event) => setCommentSearch(event.target.value)} placeholder="Search comments" aria-label="Search comments" className="comment-search" />
      </div>

      <div className="comment-composer">
        <Avatar profile={session?.user ? authProfile(session.user) : null} size="md" />
        <div className="comment-composer-main">
          <textarea ref={composerRef} rows={2} maxLength={600} value={body} onChange={(event) => { setBody(event.target.value); resizeCommentField(event.currentTarget); }} onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') submitComment({ text: body }); }} placeholder={session ? 'Add a comment' : 'Sign in to comment'} className="comment-textarea" />
          <div className="comment-composer-footer">
            {body.length >= 480 && <span className="comment-character-count">{body.length}/600</span>}
            <button onClick={() => submitComment({ text: body })} disabled={!body.trim()} className="comment-submit-button">Comment</button>
          </div>
        </div>
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
          {comments.length === 0 && <p className="text-sm text-text-muted py-5">Be the first person to comment.</p>}
          {comments.length > 0 && visibleComments.length === 0 && <p className="text-sm text-text-muted py-5">No comments match your search.</p>}
        </div>
      )}
    </section>
  );
}

function CommentNode({ comment, depth, session, replyTo, setReplyTo, replyBody, setReplyBody, submitComment, handleDelete, deletingId, commentVotes, voteComment, postOwnerId, moderatorIds }) {
  const { push } = useToast();
  const [collapsed, setCollapsed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const displayName = (comment.profiles?.handle || comment.profiles?.display_name || comment.user_id?.slice(0, 8) || 'Deleted user').replace(/^@/, '');
  const canDelete = session?.user && session.user.id === comment.user_id;
  const isOriginalPoster = Boolean(postOwnerId && comment.user_id && comment.user_id === postOwnerId);
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

  const toggleCollapse = () => {
    if (!replyCount) return;
    if (replyIsOpen) {
      setReplyTo(null);
      setReplyBody('');
    }
    setCollapsed((value) => !value);
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
    <div className={`comment-node${isFocused ? ' comment-node-focused' : ''}`} id={`comment-${comment.id}`} data-depth={safeDepth}>
      <div className="comment-main-row">
        <Link to={comment.profiles?.handle ? `/u/${comment.profiles.handle}` : '#'} className="comment-avatar-link" aria-label={`Open ${displayName}'s profile`}><Avatar profile={comment.profiles} size="md" /></Link>
        <div className="comment-content">
          {comment.focusContext?.length > 0 && <p className="comment-context">In reply to {comment.focusContext.map((name, index) => <span key={`${name}-${index}`}>{index ? ' › ' : ''}{name}</span>)}</p>}
          <div className="comment-header">
            <Link to={comment.profiles?.handle ? `/u/${comment.profiles.handle}` : '#'} className="comment-author no-underline">{displayName}</Link>
            {isOriginalPoster && <span className="comment-role-badge">OP</span>}
            {isBot && <span className="comment-role-badge comment-role-app">App</span>}
            {moderatorIds.has(comment.user_id) && <span className="comment-role-badge comment-role-mod">MOD</span>}
            {comment.is_pinned && <span className="comment-role-badge comment-role-mod">⌖ Stickied comment</span>}
            <span className="comment-header-dot" aria-hidden="true">·</span>
            <time className="comment-time" dateTime={comment.created_at}>{timeAgo(comment.created_at)}</time>
            {edited && <span className="comment-edited">(edited)</span>}
          </div>
          <p className="comment-body">{comment.body}</p>
          <div className={`comment-actions${replyCount > 0 ? ' comment-actions-has-replies' : ''}`} aria-label="Comment actions">
            {replyCount > 0 && <button type="button" className="comment-collapse" aria-label={collapsed ? `Expand ${replyCount} replies` : `Collapse ${replyCount} replies`} aria-expanded={!collapsed} onClick={toggleCollapse}>{collapsed ? '⊕' : '⊖'}</button>}
            <div className="comment-action-items">
              <div className="comment-vote-control" aria-label={`Comment score ${vote.score ?? 0}`}>
                <button type="button" className="comment-vote-up" aria-label="Upvote comment" aria-pressed={vote.direction === 1} onClick={() => voteComment(comment.id, 1)}><VoteChevron direction="up" /></button>
                <span className="comment-score">{vote.score ?? 0}</span>
                <button type="button" className="comment-vote-down" aria-label="Downvote comment" aria-pressed={vote.direction === -1} onClick={() => voteComment(comment.id, -1)}><VoteChevron direction="down" /></button>
              </div>
              <button type="button" className="comment-action-button" onClick={toggleReply}><CommentActionIcon name="reply" /><span>Reply</span></button>
              <button type="button" className="comment-action-button" onClick={() => push('Awards are not available yet.', 'info')}><CommentActionIcon name="award" /><span>Award</span></button>
              <button type="button" className="comment-action-button" onClick={async () => {
                try {
                  await navigator.clipboard.writeText(`${window.location.origin}${commentUrl}`);
                  push('Comment link copied.', 'info');
                } catch {
                  push('Could not copy the comment link.', 'error');
                }
              }}><CommentActionIcon name="share" /><span>Share</span></button>
              <div className="comment-more-wrap">
                <button type="button" className="comment-action-button" aria-label="More comment actions" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}><CommentActionIcon name="more" /><span>More</span></button>
                {menuOpen && <div className="comment-more-menu">
                  <button type="button" onClick={async () => {
                    setMenuOpen(false);
                    try { await navigator.clipboard.writeText(`${window.location.origin}${commentUrl}`); push('Comment link copied.', 'info'); }
                    catch { push('Could not copy the comment link.', 'error'); }
                  }}>Copy link</button>
                  {canDelete && <button type="button" onClick={() => { setMenuOpen(false); handleDelete(comment.id); }} disabled={deletingId === comment.id}>{deletingId === comment.id ? 'Deleting…' : 'Delete comment'}</button>}
                </div>}
              </div>
            </div>
          </div>
          {collapsed && replyCount > 0 && <button type="button" className="comment-collapse-summary" aria-expanded="false" onClick={() => setCollapsed(false)}>+ {replyCount} {replyCount === 1 ? 'reply' : 'replies'}</button>}
          <div className={`reply-composer${replyIsOpen ? ' reply-composer-open' : ''}`} aria-hidden={!replyIsOpen}>
            <div className="reply-composer-row">
              <textarea ref={replyInputRef} rows={2} maxLength={600} value={replyBody} onChange={(event) => { setReplyBody(event.target.value); resizeCommentField(event.currentTarget); }} onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') submitComment({ text: replyBody, parentCommentId: comment.id }); }} placeholder={`Reply to ${displayName}`} className="comment-reply-input" tabIndex={replyIsOpen ? 0 : -1} />
              <button onClick={() => submitComment({ text: replyBody, parentCommentId: comment.id })} disabled={!replyBody.trim()} className="comment-submit-button" tabIndex={replyIsOpen ? 0 : -1}>Reply</button>
            </div>
          </div>
        </div>
      </div>
      {!collapsed && depth >= 5 && children.length > 0 && <Link className="comment-continue" to={`/post/${comment.clip_id}/comment/${children[0].id}`}>+ Continue this thread</Link>}
      {!collapsed && depth < 5 && children.map((child) => <CommentNode key={child.id} {...{ comment: child, depth: depth + 1, session, replyTo, setReplyTo, replyBody, setReplyBody, submitComment, handleDelete, deletingId, commentVotes, voteComment, postOwnerId, moderatorIds }} />)}
    </div>
  );
}

function CommentActionIcon({ name }) {
  const paths = {
    reply: <><path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H5l-2 2v-9.5A7.5 7.5 0 0 1 10.5 4H12" /><path d="M16 3v8m-4-4h8" /></>,
    award: <><path d="M12 8v13m0-13H6.5a2.5 2.5 0 1 1 2.5-2.5C9 7 12 8 12 8Zm0 0h5.5a2.5 2.5 0 1 0-2.5-2.5C15 7 12 8 12 8Z" /><path d="M4 12h16v9H4z" /></>,
    share: <><path d="M12 16V4m-5 5 5-5 5 5" /><path d="M5 13v7h14v-7" /></>,
    more: <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>,
    caret: <path d="m7 10 5 5 5-5" />,
  };
  return <svg className={`comment-icon comment-icon-${name}`} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function authProfile(user) {
  return {
    id: user.id,
    handle: user.user_metadata?.user_name || user.email?.split('@')[0] || user.id.slice(0, 8),
    display_name: user.user_metadata?.full_name || null,
    avatar_url: user.user_metadata?.avatar_url || null,
  };
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
      context.unshift(parent.profiles?.handle || 'user');
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
