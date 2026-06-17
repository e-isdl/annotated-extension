import { useState, useRef, useEffect } from 'react';
import { supabase } from '../lib/supabase';

function fetchTranscriptViaMessage(videoId, startSec, endSec) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: 'FETCH_TRANSCRIPT', videoId, startSec, endSec },
      (response) => {
        resolve(response?.transcript || null);
      }
    );
  });
}

export default function AnnotationForm({ clipData, onBack, onPublish }) {
  const [text, setText] = useState('');
  const [audioUrl, setAudioUrl] = useState(null);
  const [mode, setMode] = useState('text');
  const [publishing, setPublishing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [transcript, setTranscript] = useState(null);
  const [transcriptLoading, setTranscriptLoading] = useState(false);
  const fileInputRef = useRef(null);
  const isYouTube = clipData?.source_type === 'youtube';
  const isArticle = clipData?.source_type === 'article';

  useEffect(() => {
    if (isYouTube && clipData.youtube_id && clipData.start_sec !== undefined && clipData.end_sec !== undefined) {
      setTranscriptLoading(true);
      fetchTranscriptViaMessage(clipData.youtube_id, clipData.start_sec, clipData.end_sec)
        .then(t => { if (t) setTranscript(t); })
        .catch(() => {})
        .finally(() => setTranscriptLoading(false));
    }
  }, [clipData]);

  const handlePublish = async () => {
    if (!text && !audioUrl) return;
    setPublishing(true);
    await onPublish({ text_content: text || null, audio_url: audioUrl });
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
      const { data, error } = await supabase.storage.from('clips').upload(filename, file, {
        contentType: file.type || 'audio/webm',
      });
      if (error) {
        console.error('Upload error:', error);
        setUploadError('Upload failed: ' + error.message);
      } else {
        const { data: { publicUrl } } = supabase.storage.from('clips').getPublicUrl(filename);
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
          <p className="text-[10px] text-accent font-medium uppercase tracking-widest mb-2">Transcript</p>
          {transcriptLoading ? (
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-accent/30 animate-pulse" />
              <p className="text-xs text-text-muted">Loading transcript...</p>
            </div>
          ) : transcript ? (
            <p className="text-xs text-text-secondary leading-relaxed">{transcript}</p>
          ) : (
            <p className="text-xs text-text-muted italic">No transcript available for this clip</p>
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

      <button
        onClick={handlePublish}
        disabled={(!text && !audioUrl) || publishing || uploading}
        className="btn-primary w-full disabled:opacity-40"
      >
        {publishing ? 'Publishing...' : 'Publish'}
      </button>
    </div>
  );
}

function formatTime(s) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}
