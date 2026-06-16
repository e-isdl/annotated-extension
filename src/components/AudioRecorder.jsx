import { useState, useRef, useEffect } from 'react';
import { supabase } from '../lib/supabase';

async function ensureOffscreenDocument() {
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT']
  });
  if (existingContexts.length > 0) return;
  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['USER_MEDIA'],
    justification: 'Audio recording for annotations'
  });
}

export default function AudioRecorder({ onRecorded }) {
  const [recording, setRecording] = useState(false);
  const [recorded, setRecorded] = useState(false);
  const [audioUrl, setAudioUrl] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState('');
  const timerRef = useRef(null);

  useEffect(() => {
    const listener = (message) => {
      if (message.type === 'RECORDING_STARTED') {
        setRecording(true);
        setSeconds(0);
        timerRef.current = setInterval(() => {
          setSeconds((s) => {
            if (s >= 90) {
              chrome.runtime.sendMessage({ type: 'STOP_RECORDING' });
              return 90;
            }
            return s + 1;
          });
        }, 1000);
      }

      if (message.type === 'RECORDING_COMPLETE') {
        clearInterval(timerRef.current);
        setRecording(false);
        const dataUrl = message.data;
        setAudioUrl(dataUrl);
        setRecorded(true);
        uploadAudio(dataUrl);
      }

      if (message.type === 'RECORDING_ERROR') {
        clearInterval(timerRef.current);
        setRecording(false);
        setError(message.error);
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  const uploadAudio = async (dataUrl) => {
    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const filename = `clips/annotations/${user.id}/${Date.now()}.webm`;
      const { error } = await supabase.storage.from('clips').upload(filename, blob);
      if (!error) {
        const { data: { publicUrl } } = supabase.storage.from('clips').getPublicUrl(filename);
        onRecorded(publicUrl);
      }
    } catch (e) {
      console.error('Upload error:', e);
    }
    setUploading(false);
  };

  const startRecording = async () => {
    setError('');
    try {
      await ensureOffscreenDocument();
      chrome.runtime.sendMessage({ type: 'START_RECORDING' });
    } catch (err) {
      console.error('Recording error:', err);
      setError('Could not start recording. Please try again.');
    }
  };

  const stopRecording = () => {
    chrome.runtime.sendMessage({ type: 'STOP_RECORDING' });
  };

  return (
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

      {error && (
        <div className="text-center">
          <p className="text-xs text-claim">{error}</p>
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
      {recorded && !uploading && (
        <div className="text-center">
          <p className="text-sm text-success">Recording saved</p>
          <audio src={audioUrl} controls className="mt-2 w-full" />
        </div>
      )}
      {uploading && <p className="text-xs text-text-muted">Uploading...</p>}
    </div>
  );
}
