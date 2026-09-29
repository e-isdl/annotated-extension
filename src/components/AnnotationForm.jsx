import { useState, useRef, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import AudioRecorder from './AudioRecorder';
import { excerptYouTubeTranscript, fetchYouTubeTranscript, formatYouTubeTranscript } from '../lib/youtubeTranscript';

const ANNOTATION_LIMITS = { Reaction: 280, 'Fact check': 500, Explainer: 600, Steelman: 800, 'Found receipts': 1000 };
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

export default function AnnotationForm({ clipData, onBack, onPublish, transcriptCache, setTranscriptCache, onTranscriptChange, communities = [], communityId = '', onCommunityChange }) {
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
  }, [clipData]);

  useEffect(() => {
    if (onTranscriptChange) onTranscriptChange(transcript);
  }, [transcript]);

  const [publishError, setPublishError] = useState('');

  const handlePublish = async () => {
    if (!text && !audioUrl) return;
    setPublishing(true);
    setPublishError('');
    try {
      await onPublish({ text_content: text.trim() || null, audio_url: audioUrl, annotation_type: annotationType });
    } catch (err) {
      setPublishError(err.message || 'Failed to publish. Please try again.');
    }
    setPublishing(false);
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
    <div className="p-4 flex flex-col gap-4">
      <button onClick={onBack} className="flex items-center gap-1 text-xs font-medium text-accent-text hover:text-accent bg-accent/10 px-3 py-1.5 rounded-md self-start transition-colors">
        ← Back to clip
      </button>

      <div className="bg-bg-surface border border-border rounded-lg p-3 flex items-start gap-3">
        {clipData.thumbnail && (
          <img src={clipData.thumbnail} className="w-12 h-8 object-cover rounded" />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-text-primary truncate">{clipData.title}</p>
          {hasMoment(clipData.start_sec, clipData.end_sec) && (
            <div className="flex items-center gap-1 mt-0.5">
              <span className="timestamp">{formatTime(clipData.start_sec)}</span>
              <span className="text-text-muted text-xs">→</span>
              <span className="timestamp">{formatTime(clipData.end_sec)}</span>
            </div>
          )}
        </div>
      </div>

      <label className="flex flex-col gap-1.5 text-xs text-text-secondary">
        Community <span className="text-text-muted">Optional</span>
        <select value={communityId} onChange={(event) => onCommunityChange?.(event.target.value)} className="input">
          <option value="">No community</option>
          {communities.map((community) => <option key={community.id} value={community.id}>c/{community.name}</option>)}
        </select>
      </label>

      <label className="flex flex-col gap-1.5 text-xs text-text-secondary">
        Post type
        <select value={annotationType} onChange={(event) => setAnnotationType(event.target.value)} className="input">
          {ANNOTATION_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
        </select>
      </label>

      {isYouTube && (
        <div className="bg-bg-surface border border-border rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] text-accent font-medium uppercase tracking-widest">Transcript</p>
            {transcript && !transcriptLoading && (
              <button
                onClick={() => {
                  if (editingTranscript) {
                    setEditingTranscript(false);
                  } else {
                    setEditedText(transcript);
                    setEditingTranscript(true);
                  }
                }}
                className="text-[10px] text-text-muted hover:text-text-secondary transition-colors"
              >
                {editingTranscript ? 'Cancel' : 'Edit'}
              </button>
            )}
          </div>

          {transcriptLoading ? (
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-accent/30 animate-pulse" />
              <p className="text-xs text-text-muted">Loading transcript...</p>
            </div>
          ) : editingTranscript ? (
            <div className="flex flex-col gap-2">
              <textarea
                value={editedText}
                onChange={(e) => setEditedText(e.target.value)}
                rows={6}
                className="input resize-none text-xs leading-relaxed"
              />
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setEditedText(contractTranscript(editedText, 5))}
                  disabled={editedText.trim().split(/\s+/).filter(Boolean).length <= 5}
                  className="px-2 py-1 text-[10px] font-medium rounded bg-bg-raised text-text-secondary hover:text-text-primary border border-border transition-colors disabled:opacity-30"
                >
                  −5 words
                </button>
                <button
                  onClick={() => setEditedText(expandTranscript(editedText, fullTranscript, 5))}
                  className="px-2 py-1 text-[10px] font-medium rounded bg-bg-raised text-text-secondary hover:text-text-primary border border-border transition-colors"
                >
                  +5 words
                </button>
                <span className="text-[10px] text-text-muted ml-1">{editedText.trim().split(/\s+/).filter(Boolean).length} words</span>
                <button
                  onClick={() => { setTranscript(editedText); setEditingTranscript(false); }}
                  className="btn-primary text-xs py-1.5 ml-auto"
                >
                  Save Changes
                </button>
              </div>
            </div>
          ) : transcript ? (
            <p className="text-xs text-text-secondary leading-relaxed whitespace-pre-wrap">{transcript}</p>
          ) : transcriptError ? (
            <p className="text-xs text-red-400">{transcriptError}</p>
          ) : (
            <p className="text-xs text-text-muted italic">No transcript available for this clip</p>
          )}

          {fullTranscript && !transcriptLoading && !editingTranscript && (
            <div className="mt-3 border-t border-border pt-3">
              <button
                onClick={() => setShowFull(!showFull)}
                className="flex items-center gap-1.5 text-[10px] text-text-muted hover:text-text-secondary transition-colors w-full"
              >
                <span className="text-[8px]">{showFull ? '\u25BE' : '\u25B8'}</span>
                Full Transcript
                <span className="text-text-muted/50 ml-auto">{fullTranscript.split(/\s+/).filter(Boolean).length} words</span>
              </button>

              {showFull && (
                <div className="mt-2">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-[10px] text-text-muted">Complete transcript</p>
                    <button
                      onClick={() => {
                        if (editingFull) {
                          setEditingFull(false);
                        } else {
                          setEditedFullText(fullTranscript);
                          setEditingFull(true);
                        }
                      }}
                      className="text-[10px] text-text-muted hover:text-text-secondary transition-colors"
                    >
                      {editingFull ? 'Cancel' : 'Edit'}
                    </button>
                  </div>

                  {editingFull ? (
                    <div className="flex flex-col gap-2">
                      <textarea
                        value={editedFullText}
                        onChange={(e) => setEditedFullText(e.target.value)}
                        rows={8}
                        className="input resize-none text-xs leading-relaxed"
                      />
                      <button
                        onClick={() => { setFullTranscript(editedFullText); setEditingFull(false); }}
                        className="btn-primary text-xs py-1.5"
                      >
                        Save Changes
                      </button>
                    </div>
                  ) : (
                    <p className="text-[11px] text-text-muted leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto rounded bg-bg-base p-2">
                      {fullTranscript}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <p className="text-[10px] text-accent font-medium uppercase tracking-widest">Your commentary</p>

      <div className="flex gap-1 bg-bg-surface border border-border rounded-lg p-1">
        <button
          onClick={() => setMode('text')}
          className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
            mode === 'text' ? 'bg-accent text-white' : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          Text
        </button>
        <button
          onClick={() => setMode('audio')}
          className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
            mode === 'audio' ? 'bg-accent text-white' : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          Audio
        </button>
      </div>

      {mode === 'text' ? (
        <div className="flex flex-col gap-1">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={isArticle || isSocial ? "What's your take on this?" : "What's your take on this clip?"}
            rows={5}
            maxLength={annotationLimit}
            className="input resize-none text-sm leading-relaxed"
          />
          <p className="text-[10px] text-text-muted text-right">{text.length}/{annotationLimit}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {audioUrl ? (
            <div className="bg-bg-surface border border-border rounded-lg p-3">
              <audio ref={el => { if (el) el.src = audioUrl; }} controls className="w-full" />
              <button
                onClick={() => setAudioUrl(null)}
                className="text-[11px] text-red-400 hover:text-red-300 mt-2 transition-colors"
              >
                Remove audio
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <AudioRecorder
                onUseFile={uploadAudioFile}
                disabled={uploading}
                uploadButton={(
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 text-xs font-medium rounded-lg bg-bg-surface border border-border text-text-secondary hover:text-text-primary hover:bg-bg-raised transition-colors disabled:opacity-40"
                  >
                    {uploading ? (
                      <>
                        <div className="w-3 h-3 rounded-full bg-accent/50 animate-pulse" />
                        Uploading...
                      </>
                    ) : (
                      <>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M9 16h6v-6h4l-7-7-7 7h4v6zm-4 2h14v2H5v-2z"/>
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
                <p className="text-[11px] text-red-400">{uploadError}</p>
              )}
            </div>
          )}
        </div>
      )}

      {publishError && <p className="text-xs text-red-400 text-center">{publishError}</p>}

      <button
        onClick={handlePublish}
        disabled={(!text && !audioUrl) || publishing || uploading}
        className="btn-primary w-full disabled:opacity-40"
      >
        {publishing ? 'Publishing...' : 'Publish'}
      </button>
      {!text && !audioUrl && (
        <p className="text-[11px] text-text-muted text-center -mt-2">Text or audio commentary required</p>
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
  return `${m}:${sec.toString().padStart(2, '0')}`;
}
