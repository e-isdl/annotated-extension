import { useState, useRef } from 'react';
import { supabase } from '../lib/supabase';

export default function AnnotationForm({ clipData, onBack, onPublish }) {
  const [text, setText] = useState('');
  const [audioUrl, setAudioUrl] = useState(null);
  const [mode, setMode] = useState('text');
  const [publishing, setPublishing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);
  const isArticle = clipData?.source_type === 'article';

  const handlePublish = async () => {
    if (!text && !audioUrl) return;
    setPublishing(true);
    await onPublish({ text_content: text, audio_url: audioUrl });
    setPublishing(false);
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const ext = file.name.split('.').pop() || 'webm';
      const filename = `clips/annotations/${user.id}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from('clips').upload(filename, file);
      if (!error) {
        const { data: { publicUrl } } = supabase.storage.from('clips').getPublicUrl(filename);
        setAudioUrl(publicUrl);
      }
    } catch (err) {
      console.error('Upload error:', err);
    }
    setUploading(false);
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

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={isArticle ? "What's your take on this?" : "What's your take on this clip?"}
        rows={5}
        className="input resize-none text-sm leading-relaxed"
      />

      <button
        onClick={handlePublish}
        disabled={!text || publishing}
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
