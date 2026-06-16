import { useState, useRef } from 'react';
import { supabase } from '../lib/supabase';

export default function PodcastClipper({ pageInfo, onReady }) {
  const [recording, setRecording] = useState(false);
  const [recorded, setRecorded] = useState(false);
  const [audioUrl, setAudioUrl] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const mediaRef = useRef(null);
  const timerRef = useRef(null);
  const chunksRef = useRef([]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
      recorder.onstop = handleRecordingStop;
      recorder.start();
      setRecording(true);
      setSeconds(0);
      timerRef.current = setInterval(() => {
        setSeconds((s) => {
          if (s >= 90) {
            stopRecording();
            return 90;
          }
          return s + 1;
        });
      }, 1000);
    } catch (err) {
      alert('Please allow microphone access to record audio clips.');
    }
  };

  const stopRecording = () => {
    if (mediaRef.current?.state === 'recording') {
      mediaRef.current.stop();
      mediaRef.current.stream.getTracks().forEach(t => t.stop());
    }
    clearInterval(timerRef.current);
    setRecording(false);
  };

  const handleRecordingStop = async () => {
    const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
    const url = URL.createObjectURL(blob);
    setAudioUrl(url);
    setRecorded(true);

    setUploading(true);
    const { data: { user } } = await supabase.auth.getUser();
    const filename = `clips/podcasts/${user.id}/${Date.now()}.webm`;
    const { error } = await supabase.storage.from('clips').upload(filename, blob);
    if (!error) {
      const { data: { publicUrl } } = supabase.storage.from('clips').getPublicUrl(filename);
      onReady({
        source_url: pageInfo.url,
        source_type: 'podcast',
        title: pageInfo.data.title,
        audio_url: publicUrl,
      });
    }
    setUploading(false);
  };

  return (
    <div className="p-4 flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span className="badge badge-podcast">Podcast</span>
        <span className="text-xs text-text-secondary truncate">{pageInfo.data.title}</span>
      </div>

      <div className="bg-bg-surface border border-border rounded-lg p-5 flex flex-col items-center gap-4">
        <div className={`w-16 h-16 rounded-full flex items-center justify-center text-2xl transition-all ${recording ? 'bg-claim/20 animate-pulse' : 'bg-bg-raised'}`}>
          🎙️
        </div>

        {recording && (
          <div className="text-center">
            <span className="font-mono text-2xl font-bold text-accent">{seconds}s</span>
            <p className="text-xs text-text-muted mt-1">Max 90 seconds</p>
          </div>
        )}

        {!recording && !recorded && (
          <button onClick={startRecording} className="btn-primary">
            Start Recording
          </button>
        )}
        {recording && (
          <button onClick={stopRecording} className="btn-claim">
            ⏹ Stop Recording
          </button>
        )}
        {uploading && <p className="text-xs text-text-muted">Uploading...</p>}
      </div>
    </div>
  );
}
