import { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';

function fmtTime(s) {
  const n = Math.max(0, Math.floor(s || 0));
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
}

// Spotify (and most web players) encrypt their streams, and the extension
// holds no tab-capture permission by design, so episode audio is captured
// through the system share picker: pick the Spotify tab and share its tab
// audio for real full-quality sound. Takes run a silence check so a muted
// source can never produce a dead clip.
export default function PodcastClipper({ pageInfo, onReady }) {
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [recorded, setRecorded] = useState(false);
  const [audioUrl, setAudioUrl] = useState(null);
  const [audioBlob, setAudioBlob] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [seconds, setSeconds] = useState(0);
  const [level, setLevel] = useState(0);
  const [epKnown, setEpKnown] = useState(false);
  const [epPaused, setEpPaused] = useState(true);
  const [epTime, setEpTime] = useState(0);
  const [epDur, setEpDur] = useState(0);
  const [epHeld, setEpHeld] = useState(false);
  const mediaRef = useRef(null);
  const streamRef = useRef(null);
  const timerRef = useRef(null);
  const epPollRef = useRef(0);
  const chunksRef = useRef([]);
  const analyserRef = useRef(null);
  const levelRafRef = useRef(0);
  const levelTimeRef = useRef(0);
  const maxLevelRef = useRef(0);
  const audioUrlRef = useRef(null);
  const recordingRef = useRef(false);
  const episodeTitle = pageInfo?.data?.title || '';

  useEffect(() => () => {
    clearInterval(timerRef.current);
    clearInterval(epPollRef.current);
    cancelAnimationFrame(levelRafRef.current);
    if (mediaRef.current?.state === 'recording' || mediaRef.current?.state === 'paused') {
      try { mediaRef.current.stop(); } catch (e) {}
    }
    stopStreamTracks();
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
  }, []);

  // Episode transport: poll the tab's audio state so the panel gets
  // Play/Pause like the video clipper, and so a paused episode pauses
  // the recording instead of baking silence into the clip.
  useEffect(() => {
    let alive = true;
    const poll = async () => {
      let res = null;
      try {
        if (typeof chrome === 'undefined' || !chrome.tabs) return;
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id) return;
        res = await chrome.tabs.sendMessage(tab.id, { type: 'PODCAST_STATE' });
      } catch (e) {
        res = null;
      }
      if (!alive) return;
      if (!res || !res.ok) {
        setEpKnown(false);
        return;
      }
      setEpKnown(true);
      const paused = !!res.paused;
      setEpPaused(paused);
      if (typeof res.time === 'number') setEpTime(res.time);
      if (typeof res.duration === 'number') setEpDur(res.duration);
      // Couple the take to the episode: pause the recorder while the
      // episode is paused, resume when it plays again.
      try {
        const r = mediaRef.current;
        if (recordingRef.current && r) {
          if (paused && r.state === 'recording') {
            r.pause();
            setEpHeld(true);
          } else if (!paused && r.state === 'paused') {
            r.resume();
            setEpHeld(false);
          }
        } else if (!recordingRef.current) {
          setEpHeld(false);
        }
      } catch (e) {}
    };
    poll();
    epPollRef.current = setInterval(poll, 1000);
    return () => {
      alive = false;
      clearInterval(epPollRef.current);
    };
  }, []);

  const toggleEpisode = async () => {
    try {
      if (typeof chrome === 'undefined' || !chrome.tabs) return;
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return;
      const res = await chrome.tabs.sendMessage(tab.id, { type: 'PODCAST_TOGGLE' });
      if (res?.ok) setEpPaused((p) => !p);
    } catch (e) {}
  };

  const stopStreamTracks = () => {
    try { streamRef.current?.getTracks().forEach((t) => t.stop()); } catch (e) {}
    streamRef.current = null;
    analyserRef.current = null;
  };

  const resetTake = () => {
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    audioUrlRef.current = null;
    setAudioUrl(null);
    setAudioBlob(null);
    setRecorded(false);
    setProcessing(false);
    setSeconds(0);
    setLevel(0);
    setEpHeld(false);
    setError('');
  };

  const watchLevel = (stream) => {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      const ctx = new Ctx();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser);
      analyserRef.current = { analyser, ctx };
      maxLevelRef.current = 0;
      levelTimeRef.current = 0;
      const buf = new Uint8Array(analyser.fftSize);
      const loop = () => {
        if (!analyserRef.current) return;
        levelRafRef.current = requestAnimationFrame(loop);
        analyser.getByteTimeDomainData(buf);
        let peak = 0;
        for (let i = 0; i < buf.length; i += 1) {
          const v = Math.abs(buf[i] - 128) / 128;
          if (v > peak) peak = v;
        }
        if (peak > maxLevelRef.current) maxLevelRef.current = peak;
        const now = performance.now();
        if (now - levelTimeRef.current > 100) {
          levelTimeRef.current = now;
          setLevel(peak);
        }
      };
      loop();
    } catch (e) {}
  };

  const stopLevelWatch = () => {
    cancelAnimationFrame(levelRafRef.current);
    try { analyserRef.current?.ctx.close(); } catch (e) {}
    analyserRef.current = null;
  };

  const pickMime = () => {
    const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
    for (const m of candidates) {
      try { if (window.MediaRecorder?.isTypeSupported(m)) return m; } catch (e) {}
    }
    return '';
  };

  const blobIsSilent = async (blob) => {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      const ctx = new Ctx();
      try {
        const data = await blob.arrayBuffer();
        const decoded = await ctx.decodeAudioData(data);
        const ch = decoded.getChannelData(0);
        let sum = 0;
        let n = 0;
        for (let i = 0; i < ch.length; i += 10) { sum += ch[i] * ch[i]; n += 1; }
        const rms = Math.sqrt(sum / Math.max(1, n));
        return rms < 0.004;
      } finally {
        try { ctx.close(); } catch (e) {}
      }
    } catch (e) {
      return false;
    }
  };

  const beginCapture = async () => {
    setError('');
    resetTake();
    let stream = null;
    try {
      // No extension permission needed. Chrome asks the user to pick the
      // Spotify tab with tab audio shared.
      const picked = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: true });
      try { picked.getVideoTracks().forEach((t) => t.stop()); } catch (e) {}
      const audioTracks = picked.getAudioTracks();
      if (!audioTracks.length) {
        try { picked.getTracks().forEach((t) => t.stop()); } catch (e) {}
        throw new Error('no-audio-shared');
      }
      stream = new MediaStream(audioTracks);
      // If the user stops sharing mid-take, finish the recording.
      audioTracks[0].onended = () => stopRecording();
    } catch (err) {
      const message = String(err?.message || err || '');
      if (err?.name === 'NotAllowedError' || /denied|permission/i.test(message)) {
        setError('Sharing was blocked. Press capture again, pick the Spotify tab, and share its audio.');
      } else if (message === 'no-audio-shared' || /no audio/i.test(message)) {
        setError('No audio was shared. Pick the Spotify tab again and turn on "Share tab audio".');
      } else {
        setError('Could not start capturing. Try again.');
      }
      return;
    }

    streamRef.current = stream;
    const mime = pickMime();
    let recorder = null;
    try {
      recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    } catch (err) {
      stopStreamTracks();
      setError('This browser cannot record audio here. Try Chrome on desktop.');
      return;
    }
    mediaRef.current = recorder;
    chunksRef.current = [];
    recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunksRef.current.push(e.data); };
    recorder.onstop = () => finishTake(mime || 'audio/webm');
    try {
      recorder.start();
    } catch (err) {
      stopStreamTracks();
      setError('Could not start recording. Try again.');
      return;
    }
    watchLevel(stream);
    setRecording(true);
    recordingRef.current = true;
    setEpHeld(false);
    setSeconds(0);
    timerRef.current = setInterval(() => {
      // Paused spans (episode paused) cost no budget.
      if (mediaRef.current && mediaRef.current.state === 'paused') return;
      setSeconds((s) => {
        if (s + 1 >= 90) {
          stopRecording();
          return 90;
        }
        return s + 1;
      });
    }, 1000);
  };

  const finishTake = async (mime) => {
    clearInterval(timerRef.current);
    stopLevelWatch();
    stopStreamTracks();
    setRecording(false);
    recordingRef.current = false;
    setEpHeld(false);
    setProcessing(true);
    try {
      const blob = new Blob(chunksRef.current, { type: mime });
      chunksRef.current = [];
      if (!blob.size) {
        setError('Recording captured no audio. Try again.');
        return;
      }
      const flat = maxLevelRef.current < 0.02;
      const silent = await blobIsSilent(blob);
      if (flat || silent) {
        setError('We could not hear anything. Make sure the episode is playing (and tab audio is shared), then try again.');
        return;
      }
      setAudioBlob(blob);
      const url = URL.createObjectURL(blob);
      audioUrlRef.current = url;
      setAudioUrl(url);
      setRecorded(true);
    } finally {
      setProcessing(false);
    }
  };

  const stopRecording = () => {
    clearInterval(timerRef.current);
    recordingRef.current = false;
    setEpHeld(false);
    if (mediaRef.current?.state === 'recording' || mediaRef.current?.state === 'paused') {
      try { mediaRef.current.stop(); } catch (e) { setRecording(false); }
    } else {
      stopLevelWatch();
      stopStreamTracks();
      setRecording(false);
    }
  };

  const continueToAnnotate = async () => {
    if (!audioBlob || uploading) return;
    setUploading(true);
    setError('');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Sign in again before uploading this audio clip.');
      const filename = `clips/podcasts/${user.id}/${Date.now()}.webm`;
      const { error } = await supabase.storage.from('clips').upload(filename, audioBlob, { contentType: 'audio/webm' });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from('clips').getPublicUrl(filename);
      onReady({
        source_url: pageInfo.url,
        source_type: 'podcast',
        title: episodeTitle,
        audio_url: publicUrl,
        duration: seconds,
      });
    } catch (uploadError) {
      setError(uploadError.message || 'Audio upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="p-4 flex flex-col gap-4">
      <div className="bg-bg-surface border border-border rounded-lg p-5 flex flex-col items-center gap-4">
        <div className={`w-16 h-16 rounded-full flex items-center justify-center text-2xl transition-all ${recording ? 'bg-claim/20 animate-pulse' : 'bg-bg-raised'}`}>
          🎙️
        </div>

        {episodeTitle ? (
          <p className="text-sm text-text-muted text-center line-clamp-2" title={episodeTitle}>{episodeTitle}</p>
        ) : null}

        {epKnown && (
          <div className="pod-player" aria-label="Episode controls">
            <button type="button" className="pod-play" onClick={toggleEpisode} aria-label={epPaused ? 'Play episode' : 'Pause episode'}>
              {epPaused ? (
                <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor" /></svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5h4v14H6zM14 5h4v14h-4z" fill="currentColor" /></svg>
              )}
            </button>
            <span className="pod-time">{fmtTime(epTime)}{epDur > 0 ? ` / ${fmtTime(epDur)}` : ''}</span>
            <span className="text-xs text-text-muted">{epPaused ? 'Paused' : 'Playing'}</span>
          </div>
        )}

        {!recording && !recorded && !processing && (
          <>
            <p className="text-xs text-text-muted text-center">
              Press capture, pick the Spotify tab, and turn on tab audio. Up to 90 seconds.
            </p>
            <button onClick={beginCapture} className="btn-primary w-full">
              Capture episode audio
            </button>
          </>
        )}
        {recording && (
          <div className="text-center w-full">
            <span className="font-mono text-2xl font-bold text-accent">{seconds}s</span>
            <p className="text-xs text-text-muted mt-1">Max 90 seconds</p>
            <div className="pod-level" aria-hidden="true">
              <div className="pod-level-fill" style={{ width: `${Math.round(Math.min(1, level * 2.5) * 100)}%` }} />
            </div>
            <p className="text-xs text-text-muted mt-1">Capturing the Spotify tab. Keep it playing.</p>
            {epHeld && (
              <p className="text-xs text-text-muted mt-1">Episode paused. Recording waits for it.</p>
            )}
          </div>
        )}
        {processing && <p className="text-xs text-text-muted">Checking the recording...</p>}
        {recording && (
          <button onClick={stopRecording} className="btn-claim">
            ⏹ Stop Recording
          </button>
        )}
        {recorded && audioUrl && (
          <>
            <AudioPreview url={audioUrl} seconds={seconds} />
            <p className="text-xs text-text-muted">Recorded {seconds}s. Listen back, then continue.</p>
          </>
        )}
        {uploading && <p className="text-xs text-text-muted">Uploading...</p>}
        {error && <p className="text-xs text-claim text-center" role="alert">{error}</p>}
        {recorded && !uploading && (
          <div className="flex gap-2 w-full">
            <button onClick={resetTake} className="btn-ghost flex-1">
              Re-record
            </button>
            <button onClick={continueToAnnotate} className="btn-primary flex-1">
              Continue to Annotate →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function AudioPreview({ url, seconds }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const [dur, setDur] = useState(seconds || 0);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return undefined;
    const onTime = () => setT(el.currentTime || 0);
    const onMeta = () => { if (el.duration && isFinite(el.duration)) setDur(el.duration); };
    const onEnd = () => setPlaying(false);
    el.addEventListener('timeupdate', onTime);
    el.addEventListener('loadedmetadata', onMeta);
    el.addEventListener('ended', onEnd);
    return () => {
      el.removeEventListener('timeupdate', onTime);
      el.removeEventListener('loadedmetadata', onMeta);
      el.removeEventListener('ended', onEnd);
    };
  }, [url]);

  const toggle = () => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) {
      el.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    } else {
      el.pause();
      setPlaying(false);
    }
  };

  const seek = (e) => {
    const el = audioRef.current;
    if (!el || !dur) return;
    const v = Number(e.target.value);
    try { el.currentTime = v; } catch (err) {}
    setT(v);
  };

  const fmt = (s) => {
    const n = Math.max(0, Math.floor(s || 0));
    return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
  };

  return (
    <div className="pod-player">
      <audio ref={audioRef} src={url} preload="metadata" />
      <button type="button" className="pod-play" onClick={toggle} aria-label={playing ? 'Pause preview' : 'Play preview'}>
        {playing ? (
          <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5h4v14H6zM14 5h4v14h-4z" fill="currentColor" /></svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor" /></svg>
        )}
      </button>
      <span className="pod-time">{fmt(t)} / {fmt(dur)}</span>
      <input
        type="range"
        className="pod-seek"
        min={0}
        max={Math.max(1, dur)}
        step={0.1}
        value={Math.min(t, Math.max(1, dur))}
        onChange={seek}
        aria-label="Seek preview"
      />
    </div>
  );
}
