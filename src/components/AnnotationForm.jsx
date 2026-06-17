import { useState, useRef, useEffect } from 'react';
import { supabase } from '../lib/supabase';

async function fetchYouTubeTranscript(videoId, startSec, endSec) {
  try {
    const listUrl = `https://www.youtube.com/api/timedtext?v=${videoId}&type=list`;
    const listRes = await fetch(listUrl);
    const listText = await listRes.text();
    const parser = new DOMParser();
    const listDoc = parser.parseFromString(listText, 'text/xml');
    const tracks = listDoc.querySelectorAll('track');
    let trackLang = 'en';
    let trackKind = '';
    for (const track of tracks) {
      if (track.getAttribute('lang_code') === 'en') {
        trackKind = track.getAttribute('kind') || '';
        break;
      }
    }
    const captionsUrl = `https://www.youtube.com/api/timedtext?v=${videoId}&lang=${trackLang}&kind=${trackKind}`;
    const captionsRes = await fetch(captionsUrl);
    const captionsText = await captionsRes.text();
    const captionsDoc = parser.parseFromString(captionsText, 'text/xml');
    const textNodes = captionsDoc.querySelectorAll('text');
    const lines = [];
    for (const node of textNodes) {
      const start = parseFloat(node.getAttribute('start'));
      const dur = parseFloat(node.getAttribute('dur') || '0');
      const end = start + dur;
      if (end >= startSec && start <= endSec) {
        lines.push(node.textContent.trim());
      }
    }
    return lines.join(' ');
  } catch (e) {
    return null;
  }
}

export default function AnnotationForm({ clipData, onBack, onPublish }) {
  const [text, setText] = useState('');
  const [audioUrl, setAudioUrl] = useState(null);
  const [mode, setMode] = useState('text');
  const [publishing, setPublishing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [transcript, setTranscript] = useState(null);
  const [transcriptLoading, setTranscriptLoading] = useState(false);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const fileInputRef = useRef(null);
  const isYouTube = clipData?.source_type === 'youtube';
  const isArticle = clipData?.source_type === 'article';

  useEffect(() => {
    if (isYouTube && clipData.youtube_id && clipData.start_sec !== undefined && clipData.end_sec !== undefined) {
      setTranscriptLoading(true);
      fetchYouTubeTranscript(clipData.youtube_id, clipData.start_sec, clipData.end_sec)
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

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        stream.getTracks().forEach(t => t.stop());
        setUploading(true);
        try {
          const { data: { user } } = await supabase.auth.getUser();
          const filename = `clips/annotations/${user.id}/${Date.now()}.webm`;
          const { error } = await supabase.storage.from('clips').upload(filename, blob);
          if (!error) {
            const { data: { publicUrl } } = supabase.storage.from('clips').getPublicUrl(filename);
            setAudioUrl(publicUrl);
          }
        } catch (err) {
          console.error('Upload error:', err);
        }
        setUploading(false);
      };
      mediaRecorder.start();
      setRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Microphone error:', err);
      alert('Could not access microphone. Please allow microphone access and try again.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      setRecording(false);
      clearInterval(timerRef.current);
    }
  };

  return (
    <div className="p-4 flex flex-col gap-4">
      <button onClick={onBack} className="flex items-center gap-1 text-xs font-medium text-accent-text hover:text-accent bg-accent/10 px-3 py-1.5 rounded-md self-start transition-colors">
        ← Back to clip
      </button>

      {/* Clip info */}
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

      {/* Transcript */}
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

      {/* Commentary label */}
      <p className="text-[10px] text-accent font-medium uppercase tracking-widest">Your commentary</p>

      {/* Text / Audio toggle */}
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
          ) : recording ? (
            <div className="bg-bg-surface border border-border rounded-lg p-4 flex flex-col items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
              <p className="text-xs text-text-muted font-mono">{formatTime(recordingTime)}</p>
              <button
                onClick={stopRecording}
                className="px-4 py-2 text-xs font-medium rounded-md bg-red-500 text-white hover:bg-red-600 transition-colors"
              >
                Stop Recording
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={startRecording}
                disabled={uploading}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 text-xs font-medium rounded-lg bg-bg-surface border border-border text-text-secondary hover:text-text-primary hover:bg-bg-raised transition-colors disabled:opacity-40"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                  <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
                </svg>
                Record audio
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 text-xs font-medium rounded-lg bg-bg-surface border border-border text-text-secondary hover:text-text-primary hover:bg-bg-raised transition-colors disabled:opacity-40"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M9 16h6v-6h4l-7-7-7 7h4v6zm-4 2h14v2H5v-2z"/>
                </svg>
                Upload file
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*"
                onChange={handleFileUpload}
                className="hidden"
              />
            </div>
          )}
          {uploading && (
            <p className="text-[11px] text-text-muted text-center">Uploading audio...</p>
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
