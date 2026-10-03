import { useState, useRef, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import AudioRecorder from './AudioRecorder';
import { excerptYouTubeTranscript, fetchYouTubeTranscript, formatYouTubeTranscript } from '../lib/youtubeTranscript';
import { cleanTranscript } from '../lib/text';

const ANNOTATION_LIMITS = { Reaction: 1000, 'Fact check': 1000, Explainer: 1000, 'Hot take': 1000, Question: 1000 };
const ANNOTATION_TYPES = Object.keys(ANNOTATION_LIMITS);

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

      <label className="flex flex-col gap-2 text-sm text-text-secondary">
        Community <span className="text-text-muted">Optional</span>
        <select value={communityId} onChange={(event) => onCommunityChange?.(event.target.value)} className="input">
          <option value="">No community</option>
          {communities.map((community) => <option key={community.id} value={community.id}>c/{community.name}</option>)}
        </select>
      </label>

      <label className="flex flex-col gap-2 text-sm text-text-secondary">
        Post type
        <select value={annotationType} onChange={(event) => setAnnotationType(event.target.value)} className="input">
          {ANNOTATION_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
        </select>
      </label>

      {isYouTube && (
        <div className="bg-bg-surface border border-border rounded-xl p-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-text-secondary">Transcript</p>
            {transcript && !transcriptLoading && (showClipTranscript || editingTranscript) && (
              <button
                onClick={() => {
                  if (editingTranscript) {
                    setEditingTranscript(false);
                  } else {
                    setEditedText(transcript);
                    setEditingTranscript(true);
                  }
                }}
                className="text-sm text-text-muted hover:text-text-secondary transition-colors"
              >
                {editingTranscript ? 'Cancel' : 'Edit'}
              </button>
            )}
          </div>

          {transcriptLoading ? (
            <div className="flex items-center gap-3">
              <div className="w-4 h-4 rounded-full bg-accent/30 animate-pulse" />
              <p className="text-sm text-text-muted">Loading transcript...</p>
            </div>
          ) : editingTranscript ? (
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
                  onClick={() => { setTranscript(editedText); setEditingTranscript(false); setShowClipTranscript(true); }}
                  className="btn-primary text-sm py-2 ml-auto"
                >
                  Save Changes
                </button>
              </div>
            </div>
          ) : transcript ? (
            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={() => setShowClipTranscript(!showClipTranscript)}
                aria-expanded={showClipTranscript}
                className="flex items-center gap-2 text-sm font-medium text-accent hover:text-accent-strong transition-colors text-left w-full"
              >
                <span className={`text-xs ${showClipTranscript ? 'rotate-180' : ''}`} style={{ transition: 'transform 0.15s ease' }}>▸</span>
                {showClipTranscript ? 'Hide clip transcript' : 'Show clip transcript'}
              </button>

              {showClipTranscript && (
                <p className="text-sm text-text-secondary leading-relaxed whitespace-pre-wrap">{cleanTranscript(transcript)}</p>
              )}

              <button
                onClick={() => setShowFull(!showFull)}
                className="flex items-center gap-2 text-sm font-medium text-accent hover:text-accent-strong transition-colors text-left w-full"
              >
                <span className={`text-xs ${showFull ? 'rotate-180' : ''}`} style={{ transition: 'transform 0.15s ease' }}>▸</span>
                Show full transcript ({fullTranscript?.split(/\s+/).filter(Boolean).length ?? 0} words)
              </button>
              {showFull && (
                <div className="flex flex-col gap-2">
                  <p className="text-xs text-text-muted">Complete transcript</p>
                  <button
                    onClick={() => {
                      if (editingFull) {
                        setEditingFull(false);
                      } else {
                        setEditedFullText(fullTranscript);
                        setEditingFull(true);
                      }
                    }}
                    className="text-sm text-text-muted hover:text-text-secondary transition-colors"
                  >
                    {editingFull ? 'Cancel' : 'Edit'}
                  </button>
                  {editingFull ? (
                    <div className="flex flex-col gap-3 mt-2">
                      <textarea
                        value={editedFullText}
                        onChange={(e) => setEditedFullText(e.target.value)}
                        rows={10}
                        className="input resize-none text-base leading-relaxed"
                      />
                      <button
                        onClick={() => { setFullTranscript(editedFullText); setEditingFull(false); }}
                        className="btn-primary text-sm py-2"
                      >
                        Save Changes
                      </button>
                    </div>
                  ) : (
                    <p className="text-sm text-text-secondary leading-relaxed whitespace-pre-wrap max-h-80 overflow-y-auto rounded-lg bg-bg-base p-4">
                      {cleanTranscript(fullTranscript)}
                    </p>
                  )}
                </div>
              )}
            </div>
          ) : transcriptError ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-[var(--red)]">{transcriptError}</p>
              <button
                onClick={() => setTranscriptRetry((count) => count + 1)}
                className="text-sm text-accent hover:text-accent-strong transition-colors"
              >
                Retry
              </button>
            </div>
          ) : (
            <p className="text-sm text-text-muted italic">No transcript available for this clip</p>
          )}
        </div>
      )}

      <p className="text-sm font-medium text-text-secondary">Your commentary</p>

      <div className="flex gap-1 bg-bg-surface border border-border rounded-xl p-1">
        <button
          onClick={() => setMode('text')}
          className={`flex-1 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors ${
            mode === 'text' ? 'bg-accent text-[var(--on-red)] shadow-sm' : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          Text
        </button>
        <button
          onClick={() => setMode('audio')}
          className={`flex-1 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors ${
            mode === 'audio' ? 'bg-accent text-[var(--on-red)] shadow-sm' : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          Audio
        </button>
      </div>

      {mode === 'text' ? (
        <div className="flex flex-col gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={isArticle || isSocial ? "What's your take on this?" : "What's your take on this clip?"}
            rows={7}
            maxLength={annotationLimit}
            className="input resize-none text-base leading-relaxed"
          />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {audioUrl ? (
            <div className="bg-bg-surface border border-border rounded-xl p-4">
              <audio ref={el => { if (el) el.src = audioUrl; }} controls className="w-full" />
              <button
                onClick={() => setAudioUrl(null)}
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
        className="btn-primary w-full disabled:opacity-40"
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
          'Publish'
        )}
      </button>
      {!text && !audioUrl && (
        <p className="text-sm text-text-muted text-center">Text or audio commentary required</p>
      )}
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
