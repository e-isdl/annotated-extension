import { useState, useRef, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const APIFY_ACTOR_URL = 'https://api.apify.com/v2/actors/akash9078~youtube-transcript-extractor/run-sync-get-dataset-items';

async function getApifyToken() {
  const envToken = import.meta.env.VITE_APIFY_TOKEN;
  if (envToken) return envToken;
  return new Promise((resolve) => {
    chrome.storage.local.get('apify_api_key', (result) => resolve(result.apify_api_key || ''));
  });
}

async function fetchTranscriptDirect(videoId, startSec, endSec) {
  const s = Number(startSec);
  const e = Number(endSec);

  const token = await getApifyToken();
  if (!token) throw new Error('No Apify API key. Open Settings to add one.');

  const res = await fetch(`${APIFY_ACTOR_URL}?token=${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ videoUrl: `https://www.youtube.com/watch?v=${videoId}` }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Apify HTTP ${res.status}: ${errText}`);
  }

  const items = await res.json();
  if (!items?.length) throw new Error('Apify returned no results');
  const item = items[0];
  if (!item.success) throw new Error(`Apify failed: ${item.error || 'unknown'}`);

  const full = item.transcript || '';
  const segments = item.transcript_segments;

  if (segments?.length > 0 && !isNaN(s) && !isNaN(e)) {
    const filtered = segments.filter(seg => {
      const t = Number(seg.start);
      return t >= s && t <= e;
    });
    if (filtered.length > 0) {
      let joined = filtered.map(seg => seg.text.replace(/>>\s*/g, '')).join(' ');

      // Trim to start after a sentence boundary (., !, ?)
      const sentenceStart = joined.search(/[.!?]\s+[A-Z]/);
      if (sentenceStart !== -1) {
        joined = joined.slice(sentenceStart + 2).trim();
      }

      // Trim to end at a sentence boundary
      const lastPeriod = joined.search(/[.!?](?:\s|$)/g);
      if (lastPeriod !== -1) {
        // Find the last sentence boundary
        let lastIdx = -1;
        const re = /[.!?]/g;
        let m;
        while ((m = re.exec(joined)) !== null) {
          lastIdx = m.index;
        }
        if (lastIdx !== -1 && lastIdx < joined.length - 1) {
          joined = joined.slice(0, lastIdx + 1).trim();
        }
      }

      if (joined.trim()) return { filtered: joined, full: full.replace(/>>\s*/g, ''), segments };
    }
  }

  if (full) {
    if (!isNaN(s) && !isNaN(e) && e > s) {
      const words = full.split(/\s+/).filter(Boolean);
      const wordsPerSecond = 2.5;
      const estimatedTotalDuration = words.length / wordsPerSecond;
      const startWord = Math.floor((s / estimatedTotalDuration) * words.length);
      const endWord = Math.min(Math.ceil((e / estimatedTotalDuration) * words.length), words.length);
      const snippet = words.slice(startWord, endWord).join(' ');
      if (snippet.trim()) return { filtered: snippet, full: full.replace(/>>\s*/g, ''), segments: null };
    }
    return { filtered: full.replace(/>>\s*/g, ''), full: full.replace(/>>\s*/g, ''), segments: null };
  }

  throw new Error('No transcript available');
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

export default function AnnotationForm({ clipData, onBack, onPublish, transcriptCache, setTranscriptCache, onTranscriptChange }) {
  const [text, setText] = useState('');
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
  const cacheKey = isYouTube ? clipData.youtube_id : null;

  useEffect(() => {
    if (isYouTube && clipData.youtube_id && clipData.start_sec !== undefined && clipData.end_sec !== undefined) {
      if (transcriptCache && transcriptCache.key === cacheKey) {
        const s = Number(clipData.start_sec);
        const e = Number(clipData.end_sec);
        const full = transcriptCache.full;
        const segments = transcriptCache.segments;

        if (segments?.length > 0 && !isNaN(s) && !isNaN(e)) {
          const filtered = segments.filter(seg => {
            const t = Number(seg.start);
            return t >= s && t <= e;
          });
          if (filtered.length > 0) {
            let joined = filtered.map(seg => seg.text.replace(/>>\s*/g, '')).join(' ');

            // Trim to start after a sentence boundary
            const sentenceStart = joined.search(/[.!?]\s+[A-Z]/);
            if (sentenceStart !== -1) {
              joined = joined.slice(sentenceStart + 2).trim();
            }

            // Trim to end at a sentence boundary
            let lastIdx = -1;
            const re = /[.!?]/g;
            let m;
            while ((m = re.exec(joined)) !== null) {
              lastIdx = m.index;
            }
            if (lastIdx !== -1 && lastIdx < joined.length - 1) {
              joined = joined.slice(0, lastIdx + 1).trim();
            }

            setTranscript(joined);
          } else if (full) {
            const words = full.split(/\s+/).filter(Boolean);
            const wordsPerSecond = 2.5;
            const estimatedTotalDuration = words.length / wordsPerSecond;
            const startWord = Math.floor((s / estimatedTotalDuration) * words.length);
            const endWord = Math.min(Math.ceil((e / estimatedTotalDuration) * words.length), words.length);
            setTranscript(words.slice(startWord, endWord).join(' '));
          }
        } else if (full) {
          setTranscript(full.replace(/>>\s*/g, ''));
        }

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
      await onPublish({ text_content: text || null, audio_url: audioUrl });
    } catch (err) {
      setPublishError(err.message || 'Failed to publish. Please try again.');
    }
    setPublishing(false);
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
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
          {clipData.start_sec !== undefined && (
            <div className="flex items-center gap-1 mt-0.5">
              <span className="timestamp">{formatTime(clipData.start_sec)}</span>
              <span className="text-text-muted text-xs">→</span>
              <span className="timestamp">{formatTime(clipData.end_sec)}</span>
            </div>
          )}
        </div>
      </div>

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
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={isArticle ? "What's your take on this?" : "What's your take on this clip?"}
          rows={5}
          className="input resize-none text-sm leading-relaxed"
        />
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
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex items-center justify-center gap-2 px-4 py-3 text-xs font-medium rounded-lg bg-bg-surface border border-border text-text-secondary hover:text-text-primary hover:bg-bg-raised transition-colors disabled:opacity-40"
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

function formatTime(s) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}
