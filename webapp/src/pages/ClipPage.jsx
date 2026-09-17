import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { deleteClip } from '../lib/api';
import YouTubeEmbed from '../components/YouTubeEmbed';
import AudioPlayer from '../components/AudioPlayer';
import AnnotationBlock from '../components/AnnotationBlock';
import FileClaimButton from '../components/FileClaimButton';
import CommentSection from '../components/CommentSection';
import VoteButtons from '../components/VoteButtons';
import Avatar from '../components/Avatar';

export default function ClipPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [clip, setClip] = useState(null);
  const [annotation, setAnnotation] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [thread, setThread] = useState([]);
  const [transcript, setTranscript] = useState(null);
  const [score, setScore] = useState(0);
  const [currentUser, setCurrentUser] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [claims, setClaims] = useState([]);

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      setCurrentUser(session?.user || null);

      let clipData = null;

      const { data: bySlug } = await supabase
        .from('clips')
        .select('*, profiles(*)')
        .eq('slug', id)
        .single();
      if (bySlug) {
        clipData = bySlug;
      } else {
        const { data: byId } = await supabase
          .from('clips')
          .select('*, profiles(*)')
          .eq('id', id)
          .single();
        clipData = byId;
      }

      if (clipData) {
        setClip(clipData);
        setProfile(clipData.profiles);

        const { data: votesData } = await supabase
          .from('votes')
          .select('direction')
          .eq('clip_id', clipData.id);
        const computedScore = votesData?.reduce((sum, v) => sum + v.direction, 0) || 0;
        setScore(computedScore);

        const { data: ann } = await supabase
          .from('annotations')
          .select('*')
          .eq('clip_id', clipData.id)
          .single();
        if (ann) setAnnotation(ann);

        const { data: claimsData } = await supabase
          .from('claims')
          .select('*')
          .eq('clip_id', clipData.id)
          .order('created_at', { ascending: false });
        if (claimsData) setClaims(claimsData);

        const { data: threadClips } = await supabase
          .from('clips')
          .select('*, profiles(*), annotations(id, text_content, audio_url)')
          .eq('parent_clip_id', clipData.id)
          .order('thread_position', { ascending: true });
        if (threadClips?.length) setThread(threadClips);

        if (clipData.source_type === 'youtube' && clipData.youtube_id) {
          setTranscript(clipData.transcript || null);
        }
      }
      setLoading(false);
    }
    load();
  }, [id]);

  const handleDeleteClip = async () => {
    setDeleting(true);
    try {
      await deleteClip(clip.id, currentUser.id);
      navigate('/');
    } catch (err) {
      console.error('Delete failed:', err);
      alert('Failed to delete clip.');
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  const isOwner = currentUser && clip && currentUser.id === clip.user_id;

  if (loading) return <LoadingState />;
  if (!clip) return <NotFound />;

  return (
    <article className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to={profile?.handle ? `/u/${profile.handle}` : '#'}>
            <Avatar profile={profile} size="md" />
          </Link>
          <div>
            <Link to={profile?.handle ? `/u/${profile.handle}` : '#'} className="no-underline">
              <p className="text-sm font-medium text-text-primary hover:text-accent transition-colors">@{profile?.handle}</p>
            </Link>
            <p className="text-xs text-text-muted">{formatDate(clip.created_at)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`badge badge-${clip.source_type}`}>{clip.source_type}</span>
          {isOwner && (
          <div className="flex items-center gap-1">
            {confirmDelete ? (
              <>
                <span className="text-[11px] text-red-400 mr-1">Delete?</span>
                <button
                  onClick={handleDeleteClip}
                  disabled={deleting}
                  className="text-[11px] px-2 py-1 rounded-md text-white bg-red-500 hover:bg-red-600 transition-colors disabled:opacity-40"
                >
                  {deleting ? '...' : 'Yes'}
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  disabled={deleting}
                  className="text-[11px] px-2 py-1 rounded-md text-text-muted bg-bg-raised hover:bg-bg-surface transition-colors"
                >
                  No
                </button>
              </>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="text-[11px] px-2 py-1 rounded-md text-red-400 bg-red-400/10 hover:bg-red-400/20 transition-colors"
              >
                Delete
              </button>
            )}
          </div>
        )}
        </div>
      </div>

      <h1 className="text-2xl font-bold text-text-primary leading-tight tracking-tight">
        {clip.title}
      </h1>

      {clip.source_type === 'youtube' && clip.start_sec !== undefined && clip.end_sec !== undefined && (
        <div className="flex items-center gap-1">
          <span className="timestamp">{formatTime(clip.start_sec)}</span>
          <span className="text-text-muted text-xs mx-1">&rarr;</span>
          <span className="timestamp">{formatTime(clip.end_sec)}</span>
        </div>
      )}

      <div className="flex items-center justify-between">
        <VoteButtons clipId={clip.id} score={score} setScore={setScore} />
        <FileClaimButton clipId={clip.id} />
      </div>

      <div className="rounded-xl overflow-hidden border border-border">
        {clip.source_type === 'youtube' && (
          <YouTubeEmbed videoId={clip.youtube_id} startSec={clip.start_sec} endSec={clip.end_sec} muted={false} autoplay />
        )}
        {clip.source_type === 'podcast' && (
          <AudioPlayer src={clip.audio_url} />
        )}
        {clip.source_type === 'article' && clip.article_text && (
          <div className="p-6 bg-bg-surface">
            <div className="border-l-2 border-accent/40 pl-5">
              <p className="text-base text-text-secondary leading-[1.9] whitespace-pre-wrap">{clip.article_text}</p>
            </div>
          </div>
        )}
      </div>

      {(transcript || annotation) && (
        <div className="flex flex-col gap-4">
          {transcript && (
            <div>
              <p className="text-[10px] text-text-muted font-medium uppercase tracking-widest mb-2">Transcript</p>
              <div className="bg-bg-surface border border-border rounded-xl p-5 sm:p-6">
                <p className="text-base sm:text-lg text-text-secondary/90 leading-[1.85] whitespace-pre-wrap font-medium">
                  &ldquo;{transcript}&rdquo;
                </p>
              </div>
            </div>
          )}

          {annotation && (annotation.text_content || annotation.audio_url) && (
            <div>
              <p className="text-[10px] text-accent font-medium uppercase tracking-widest mb-2">Commentary</p>
              <div className="relative">
                <div className="absolute left-0 top-3 bottom-3 w-[2px] bg-accent rounded-full" />
                <div className="ml-4 bg-gradient-to-br from-bg-surface/80 to-bg-surface/40 backdrop-blur-sm rounded-xl border border-accent/[0.08] overflow-hidden">
                  <div className="p-5 sm:p-6 flex flex-col gap-4">
                    {annotation.text_content && (
                      <p className="text-[15px] sm:text-base leading-[1.85] font-semibold" style={{ color: '#aaa' }}>
                        {annotation.text_content}
                      </p>
                    )}

                    {annotation.audio_url && (
                      <div className="flex flex-col gap-3">
                        <audio
                          ref={el => { if (el) el.src = annotation.audio_url; }}
                          onEnded={() => {}}
                        />
                        <div className="bg-bg-raised/60 rounded-lg p-3 flex items-center gap-3">
                          <button
                            onClick={() => {
                              const audio = document.querySelector('audio[src="' + annotation.audio_url + '"]');
                              if (audio) audio.paused ? audio.play() : audio.pause();
                            }}
                            className="w-9 h-9 rounded-full bg-accent/15 flex items-center justify-center text-accent hover:bg-accent/25 transition-colors shrink-0"
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M8 5v14l11-7z" />
                            </svg>
                          </button>
                          <span className="text-xs text-text-muted">Audio commentary</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <a
        href={clip.source_url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 text-sm text-text-secondary hover:text-accent-text transition-colors group"
      >
        <span className="font-mono text-xs text-text-muted group-hover:text-accent-text">↗</span>
        View original source
        <span className="font-mono text-xs text-text-muted truncate">{clip.source_url}</span>
      </a>

      {isOwner && claims.length > 0 && (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-text-muted font-medium uppercase tracking-wide">Claims ({claims.length})</p>
          {claims.map((claim) => (
            <div key={claim.id} className="bg-bg-surface border border-border rounded-lg p-4 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-text-secondary font-mono">{new Date(claim.created_at).toLocaleDateString()}</span>
                {claim.claimant_email && (
                  <a
                    href={`mailto:${claim.claimant_email}?subject=Re: Claim on your clip&body=Hi, I'm reaching out regarding your claim on my annotation.`}
                    className="text-xs text-accent-text hover:text-accent transition-colors"
                  >
                    Reply to {claim.claimant_email}
                  </a>
                )}
              </div>
              <p className="text-sm text-text-primary">{claim.reason}</p>
              {claim.claimant_email && (
                <p className="text-[11px] text-text-muted">From: {claim.claimant_email}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {thread.length > 0 && (
        <div className="flex flex-col gap-3 mt-2">
          <p className="text-xs text-text-muted font-medium uppercase tracking-wide">Thread</p>
          {thread.map((threadClip, i) => (
            <div key={threadClip.id} className="flex gap-3">
              <div className="flex flex-col items-center">
                <div className="w-px flex-1 bg-border" />
              </div>
              <Link
                to={`/clip/${threadClip.slug || threadClip.id}`}
                className="flex-1 annotation-mark bg-bg-surface rounded-r-lg p-3 hover:bg-bg-raised transition-colors block"
              >
                <p className="text-sm text-text-secondary leading-relaxed line-clamp-3">
                  {threadClip.article_text}
                </p>
                <p className="text-xs text-text-muted mt-1 font-mono">Part {i + 2}</p>
              </Link>
            </div>
          ))}
        </div>
      )}

      <CommentSection clipId={clip.id} />
    </article>
  );
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatTime(s) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

function LoadingState() {
  return (
    <div className="flex flex-col gap-6 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-bg-raised" />
        <div className="flex flex-col gap-1">
          <div className="w-24 h-3 bg-bg-raised rounded" />
          <div className="w-16 h-2 bg-bg-raised rounded" />
        </div>
      </div>
      <div className="w-3/4 h-8 bg-bg-raised rounded" />
      <div className="w-full aspect-video bg-bg-raised rounded-xl" />
    </div>
  );
}

function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
      <span className="text-4xl">📎</span>
      <h2 className="text-xl font-bold text-text-primary">Clip not found</h2>
      <p className="text-sm text-text-secondary">This clip may have been removed or doesn't exist.</p>
    </div>
  );
}
