import { useState, useRef, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import AudioRecorder from './AudioRecorder';
import { excerptYouTubeTranscript, fetchYouTubeTranscript, formatYouTubeTranscript } from '../lib/youtubeTranscript';
import { cleanTranscript } from '../lib/text';

const ANNOTATION_LIMITS = { Reaction: 1000, 'Fact check': 1000, Explainer: 1000, 'Hot take': 1000, Question: 1000 };
const ANNOTATION_TYPES = Object.keys(ANNOTATION_LIMITS);
const MAX_AUDIO_SECONDS = 180; // keep in sync with MAX_SECONDS in AudioRecorder.jsx

async function fetchTranscriptDirect(videoId, startSec, endSec) {
  const { segments } = await fetchYouTubeTranscript(videoId);
  const full = formatYouTubeTranscript(segments);
  const filtered = excerptYouTubeTranscript(segments, startSec, endSec);
  if (!full) throw new Error('YouTube returned an empty caption track for this video.');
  if (!filtered) throw new Error('No complete sentences in the selected time range.');
  return { filtered, full, segments };
}

function expandTranscript(currentText, fullTranscript, words = 5) {
  if (!currentText || !fullTranscript) return currentText;
  const currentWords = currentText.trim().split(/\s+/).filter(Boolean);
  const fullWords = fullTranscript.trim().split(/\s+/).filter(Boolean);

  const lastFew = currentWords.slice(-8).join(' ');
  const matchIdx = fullTranscript.indexOf(lastFew);

  if (matchIdx !== -1) {
    const afterMatch = matchIdx + lastFew.length;
    const remaining = fullTranscript.slice(afterMatch).trim();
    const extraWords = remaining.split(/\s+/).filter(Boolean).slice(0, words);
    if (extraWords.length > 0) {
      return [...currentWords, ...extraWords].join(' ');
    }
  }

  const firstFew = currentWords.slice(0, 8).join(' ');
  const fwdIdx = fullTranscript.indexOf(firstFew);
  if (fwdIdx !== -1) {
    const afterText = fullTranscript.slice(fwdIdx).trim();
    const textWords = afterText.split(/\s+/).filter(Boolean);
    if (textWords.length > currentWords.length) {
      const extraWords = textWords.slice(currentWords.length, currentWords.length + words);
      if (extraWords.length > 0) {
        return [...currentWords, ...extraWords].join(' ');
      }
    }
  }

  return currentText;
}

function contractTranscript(currentText, words = 5) {
  if (!currentText) return currentText;
  const currentWords = currentText.trim().split(/\s+/).filter(Boolean);
  return currentWords.slice(0, -words).join(' ');
}

export default function AnnotationForm({ clipData, onBack, onPublish, onUseEmbed, transcriptCache, setTranscriptCache, onTranscriptChange, communities = [], communityId = '', onCommunityChange }) {
  const [text, setText] = useState('');
  const [annotationType, setAnnotationType] = useState('Reaction');
  const [audioUrl, setAudioUrl] = useState(null);
  const [mode, setMode] = useState('text');
  const [publishing, setPublishing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [transcript, setTranscript] = useState(null);
  const [fullTranscript, setFullTranscript] = useState(null);
  const [transcriptLoading, setTranscriptLoading] = useState(false);
  const [transcriptError, setTranscriptError] = useState('');
  const [editingTranscript, setEditingTranscript] = useState(false);
  const [editingFull, setEditingFull] = useState(false);
  const [showFull, setShowFull] = useState(false);
  const [showClipTranscript, setShowClipTranscript] = useState(false);
  const [transcriptRetry, setTranscriptRetry] = useState(0);
  const [editedText, setEditedText] = useState('');
  const [editedFullText, setEditedFullText] = useState('');
  const [communityOpen, setCommunityOpen] = useState(false);
  const [communityQuery, setCommunityQuery] = useState('');
  const selectedCommunity = communities.find((community) => community.id === communityId) || null;
  const communityFilter = communityQuery.trim().toLowerCase();
  const filteredCommunities = communityFilter
    ? communities.filter((community) => (`c/${community.name} ${community.slug || ''}`).toLowerCase().includes(communityFilter))
    : communities;
  const fileInputRef = useRef(null);
  const isYouTube = clipData?.source_type === 'youtube';
  const isArticle = clipData?.source_type === 'article';
  const isSocial = clipData?.source_type === 'social';
  const cacheKey = isYouTube ? clipData.youtube_id : null;
  const annotationLimit = ANNOTATION_LIMITS[annotationType];

  useEffect(() => {
    if (isYouTube && clipData.youtube_id && clipData.start_sec !== undefined && clipData.end_sec !== undefined) {
      if (transcriptCache && transcriptCache.key === cacheKey) {
        const full = transcriptCache.full;
        const segments = transcriptCache.segments;

        const excerpt = segments?.length
          ? excerptYouTubeTranscript(segments, clipData.start_sec, clipData.end_sec)
          : full;
        setTranscript(excerpt || '');

        setFullTranscript(full);
        return;
      }

      setTranscriptLoading(true);
      setTranscriptError('');
      setEditingTranscript(false);
      setEditingFull(false);
      setShowFull(false);
      setShowClipTranscript(false);
      fetchTranscriptDirect(clipData.youtube_id, clipData.start_sec, clipData.end_sec)
        .then(({ filtered, full, segments }) => {
          setTranscript(filtered);
          setFullTranscript(full);
          setTranscriptCache({ key: cacheKey, full, segments });
        })
        .catch(err => {
          setTranscriptError(err.message || 'Failed to fetch transcript');
        })
        .finally(() => setTranscriptLoading(false));
    }
  }, [clipData, transcriptRetry]);

  useEffect(() => {
    if (onTranscriptChange) onTranscriptChange(transcript);
  }, [transcript]);

  const [publishError, setPublishError] = useState(null);
  const [publishStage, setPublishStage] = useState(null);

  const handlePublish = async () => {
    if (!text && !audioUrl) return;
    setPublishing(true);
    setPublishError(null);
    try {
      await onPublish({
        text_content: text.trim() || null,
        audio_url: audioUrl,
        annotation_type: annotationType,
        onStage: setPublishStage,
      });
    } catch (err) {
      setPublishError({ message: err.message || 'Failed to publish. Please try again.', code: err.code || null });
    }
    setPublishing(false);
    setPublishStage(null);
  };

  const uploadAudioFile = async (file) => {
    if (!file) return;
    setUploading(true);
    setUploadError('');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const ext = file.name.split('.').pop() || 'webm';
      const filename = `annotations/${user?.id || 'anon'}/${Date.now()}.${ext}`;
      const { data, error } = await supabase.storage.from('annotation-audio').upload(filename, file, {
        contentType: file.type || 'audio/webm',
      });
      if (error) {
        console.error('Upload error:', error);
        setUploadError('Upload failed: ' + error.message);
      } else {
        const { data: { publicUrl } } = supabase.storage.from('annotation-audio').getPublicUrl(filename);
        setAudioUrl(publicUrl);
      }
    } catch (err) {
      console.error('Upload error:', err);
      setUploadError('Upload failed: ' + err.message);
    }
    setUploading(false);
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadAudioFile(file);
    e.target.value = '';
  };

  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [transcriptTab, setTranscriptTab] = useState('clip');

  const toggleTranscript = () => {
    setTranscriptOpen((open) => {
      const next = !open;
      if (next) setShowClipTranscript(true);
      return next;
    });
  };

  return (
    <div className="p-6 flex flex-col gap-5">
      <button onClick={onBack} className="flex items-center gap-1 text-sm font-medium text-accent-text hover:text-accent bg-accent/10 px-4 py-2 rounded-lg self-start transition-colors">
        ← Back to clip
      </button>

      <div className="bg-bg-surface border border-border rounded-xl p-5 flex items-start gap-4">
        {clipData.thumbnail && (
          <img src={clipData.thumbnail} className="w-14 h-10 object-cover rounded" />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-text-primary truncate">{clipData.title}</p>
          {hasMoment(clipData.start_sec, clipData.end_sec) && (
            <div className="flex items-center gap-1.5 mt-1">
              <span className="timestamp">{formatTime(clipData.start_sec)}</span>
              <span className="text-text-muted text-xs">→</span>
              <span className="timestamp">{formatTime(clipData.end_sec)}</span>
            </div>
          )}
        </div>
      </div>

      <div className="take-box">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="What stood out to you?"
          rows={5}
          maxLength={annotationLimit}
          className="take-input"
        />
        <div className="take-bar">
          <div className="take-bar-left">
            <button
              type="button"
              className="btn-ghost take-speak"
              onClick={() => setMode('audio')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 15a4 4 0 004-4V6a4 4 0 10-8 0v5a4 4 0 004 4z" />
                <path d="M19 11a7 7 0 01-14 0H3a9 9 0 008 8.94V22h2v-2.06A9 9 0 0021 11h-2z" />
              </svg>
              Speak it
            </button>
            <span className="take-hint">up to {Math.round(MAX_AUDIO_SECONDS / 60)} min</span>
          </div>
          <span className={`take-count ${text.length >= annotationLimit ? 'over' : ''}`}>
            {text.length} / {annotationLimit}
          </span>
        </div>
      </div>

      {mode === 'audio' && (
        <div className="flex flex-col gap-3">
          {audioUrl ? (
            <div className="bg-bg-surface border border-border rounded-xl p-4">
              <audio ref={el => { if (el) el.src = audioUrl; }} controls className="w-full" />
              <button
                onClick={() => { setAudioUrl(null); setMode('text'); }}
                className="text-sm text-[var(--red)] hover:text-[var(--red-btn-hover)] transition-colors"
              >
                Remove audio
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <AudioRecorder
                onUseFile={uploadAudioFile}
                disabled={uploading}
                uploadButton={(
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="flex-1 flex items-center justify-center gap-3 px-4 py-3 text-sm font-medium rounded-xl bg-bg-surface border border-border text-text-secondary hover:text-text-primary hover:bg-bg-raised transition-colors disabled:opacity-40"
                  >
                    {uploading ? (
                      <>
                        <div className="w-4 h-4 rounded-full bg-accent/50 animate-pulse" />
                        Uploading...
                      </>
                    ) : (
                      <>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M9 16h6v-6h4l-7-7-7 7h4v6zm-4 2h14v2H5v-2z" />
                        </svg>
                        Upload audio file
                      </>
                    )}
                  </button>
                )}
              />
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*"
                onChange={handleFileUpload}
                className="hidden"
              />
              {uploadError && (
                <p className="text-sm text-[var(--red)]">{uploadError}</p>
              )}
            </div>
          )}
        </div>
      )}

      {isYouTube && (
        <div className="transcript">
          <button
            type="button"
            onClick={toggleTranscript}
            aria-expanded={transcriptOpen}
            className="transcript-toggle"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
              className={`transcript-chevron ${transcriptOpen ? 'open' : ''}`}
            >
              <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>Transcript</span>
            <span className="transcript-state">{transcriptOpen ? 'Hide' : 'Show'}</span>
          </button>

          {transcriptOpen && (
            <div className="transcript-body">
              <div className="transcript-tabs" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={transcriptTab === 'clip'}
                  className={`transcript-tab ${transcriptTab === 'clip' ? 'active' : ''}`}
                  onClick={() => setTranscriptTab('clip')}
                >
                  Clip
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={transcriptTab === 'full'}
                  className={`transcript-tab ${transcriptTab === 'full' ? 'active' : ''}`}
                  onClick={() => setTranscriptTab('full')}
                >
                  Full
                </button>
              </div>

              <div className="transcript-scroll">
                {transcriptLoading ? (
                  <div className="flex items-center gap-3">
                    <div className="w-4 h-4 rounded-full bg-accent/30 animate-pulse" />
                    <p className="text-sm text-text-muted">Loading transcript...</p>
                  </div>
                ) : transcriptTab === 'clip' ? (
                  editingTranscript ? (
                    <div className="flex flex-col gap-3">
                      <textarea
                        value={editedText}
                        onChange={(e) => setEditedText(e.target.value)}
                        rows={8}
                        className="input resize-none text-base leading-relaxed"
                      />
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setEditedText(contractTranscript(editedText, 5))}
                          disabled={editedText.trim().split(/\s+/).filter(Boolean).length <= 5}
                          className="px-3 py-1.5 text-sm font-medium rounded-lg bg-bg-raised text-text-secondary hover:text-text-primary border border-border transition-colors disabled:opacity-30"
                        >
                          -5 words
                        </button>
                        <button
                          onClick={() => setEditedText(expandTranscript(editedText, fullTranscript, 5))}
                          className="px-3 py-1.5 text-sm font-medium rounded-lg bg-bg-raised text-text-secondary hover:text-text-primary border border-border transition-colors"
                        >
                          +5 words
                        </button>
                        <span className="text-sm text-text-muted ml-2 tabular-nums">{editedText.trim().split(/\s+/).filter(Boolean).length} words</span>
                        <button
                          onClick={() => { setTranscript(editedText); setEditingTranscript(false); }}
                          className="btn-primary text-sm py-2 ml-auto"
                        >
                          Save Changes
                        </button>
                      </div>
                    </div>
                  ) : transcript ? (
                    <div className="flex flex-col gap-2">
                      <p className="text-text-2 leading-relaxed whitespace-pre-wrap">{cleanTranscript(transcript)}</p>
                      <button
                        onClick={() => { setEditedText(transcript); setEditingTranscript(true); }}
                        className="text-sm text-text-muted hover:text-text-secondary transition-colors self-start"
                      >
                        Edit
                      </button>
                    </div>
                  ) : transcriptError ? (
                    <div className="flex flex-col gap-3">
                      <p className="text-sm text-[var(--red)]">{transcriptError}</p>
                      <button
                        onClick={() => setTranscriptRetry((count) => count + 1)}
                        className="text-sm text-accent hover:text-accent-strong transition-colors self-start"
                      >
                        Retry
                      </button>
                    </div>
                  ) : (
                    <p className="text-sm text-text-muted italic">No transcript available for this clip</p>
                  )
                ) : editingFull ? (
                  <div className="flex flex-col gap-3">
                    <textarea
                      value={editedFullText}
                      onChange={(e) => setEditedFullText(e.target.value)}
                      rows={10}
                      className="input resize-none text-base leading-relaxed"
                    />
                    <button
                      onClick={() => { setFullTranscript(editedFullText); setEditingFull(false); }}
                      className="btn-primary text-sm py-2 self-start"
                    >
                      Save Changes
                    </button>
                  </div>
                ) : fullTranscript ? (
                  <div className="flex flex-col gap-2">
                    <p className="text-sm text-text-muted tabular-nums">
                      {fullTranscript.split(/\s+/).filter(Boolean).length} words
                    </p>
                    <p className="text-text-2 leading-relaxed whitespace-pre-wrap">{cleanTranscript(fullTranscript)}</p>
                    <button
                      onClick={() => { setEditedFullText(fullTranscript); setEditingFull(true); }}
                      className="text-sm text-text-muted hover:text-text-secondary transition-colors self-start"
                    >
                      Edit
                    </button>
                  </div>
                ) : (
                  <p className="text-sm text-text-muted italic">No full transcript available</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="take-select-label">
        <span>Community <span className="text-text-muted">Optional</span></span>
        <div className="community-picker">
          <button
            type="button"
            className="take-select community-picker-btn"
            onClick={() => { setCommunityOpen((v) => !v); setCommunityQuery(''); }}
            aria-haspopup="listbox"
            aria-expanded={communityOpen}
          >
            <span className="community-picker-value">{selectedCommunity ? `c/${selectedCommunity.name}` : 'No community'}</span>
            <svg className="community-picker-chev" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {communityOpen && (
            <>
              <button type="button" aria-hidden="true" tabIndex={-1} className="community-picker-backdrop" onClick={() => setCommunityOpen(false)} />
              <div className="community-picker-menu" role="listbox" onKeyDown={(e) => { if (e.key === 'Escape') setCommunityOpen(false); }}>
                <input
                  autoFocus
                  type="text"
                  placeholder="Search communities"
                  value={communityQuery}
                  onChange={(e) => setCommunityQuery(e.target.value)}
                  className="community-picker-search"
                  aria-label="Search communities"
                />
                <div className="community-picker-list">
                  <button
                    type="button"
                    role="option"
                    aria-selected={!communityId}
                    className={`community-picker-item${!communityId ? ' is-selected' : ''}`}
                    onClick={() => { onCommunityChange?.(''); setCommunityOpen(false); }}
                  >
                    No community
                  </button>
                  {filteredCommunities.map((community) => (
                    <button
                      key={community.id}
                      type="button"
                      role="option"
                      aria-selected={community.id === communityId}
                      className={`community-picker-item${community.id === communityId ? ' is-selected' : ''}`}
                      onClick={() => { onCommunityChange?.(community.id); setCommunityOpen(false); }}
                    >
                      c/{community.name}
                    </button>
                  ))}
                  {filteredCommunities.length === 0 && (
                    <p className="community-picker-empty">No communities match.</p>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <label className="take-select-label">
        Post type
        <select value={annotationType} onChange={(event) => setAnnotationType(event.target.value)} className="input take-select">
          {ANNOTATION_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
        </select>
      </label>

      {publishError && (
        <div className="flex flex-col items-center gap-2">
          <p className="text-sm text-[var(--red)] text-center">{publishError.message}</p>
          <div className="flex gap-2">
            {publishError.code === 'upload_failed' && (
              <button
                type="button"
                onClick={handlePublish}
                disabled={publishing}
                className="btn-ghost text-sm px-4 py-2 disabled:opacity-40"
              >
                Try again
              </button>
            )}
            {publishError.code === 'clip_too_big' && onUseEmbed && (
              <button
                type="button"
                onClick={onUseEmbed}
                className="btn-ghost text-sm px-4 py-2"
              >
                Use embed instead
              </button>
            )}
          </div>
        </div>
      )}

      <button
        onClick={handlePublish}
        disabled={(!text && !audioUrl) || publishing || uploading}
        className="btn-primary w-full take-post disabled:opacity-40"
      >
        {publishing ? (
          publishStage === 'uploading' ? (
            <>
              <div className="w-4 h-4 rounded-full bg-accent/50 animate-pulse" />
              Uploading
            </>
          ) : (
            'Publishing...'
          )
        ) : (
          'Post annotation'
        )}
      </button>
    </div>
  );
}

function hasMoment(start, end) {
  if (start === null || start === undefined || end === null || end === undefined) return false;
  const startSec = Number(start);
  const endSec = Number(end);
  return Number.isFinite(startSec) && Number.isFinite(endSec) && startSec >= 0 && endSec > startSec;
}

function formatTime(s) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}
