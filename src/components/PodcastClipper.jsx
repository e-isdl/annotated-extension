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
  const decodedRef = useRef(null);
  const [trimPeaks, setTrimPeaks] = useState([]);
  const [trim, setTrim] = useState({ s: 0, e: 0 });
  const [takeDur, setTakeDur] = useState(0);
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
    decodedRef.current = null;
    setAudioUrl(null);
    setAudioBlob(null);
    setRecorded(false);
    setProcessing(false);
    setSeconds(0);
    setLevel(0);
    setEpHeld(false);
    setTrim({ s: 0, e: 0 });
    setTrimPeaks([]);
    setTakeDur(0);
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

  const decodeAudioBlob = async (blob) => {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    const ctx = new Ctx();
    try {
      const data = await blob.arrayBuffer();
      return await ctx.decodeAudioData(data);
    } catch (e) {
      return null;
    } finally {
      try { ctx.close(); } catch (e) {}
    }
  };

  const bufferPeaks = (buffer, n) => {
    const ch0 = buffer.getChannelData(0);
    const ch1 = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : null;
    const total = ch0.length;
    const step = Math.max(1, Math.floor(total / n));
    const out = [];
    for (let i = 0; i < n; i += 1) {
      let peak = 0;
      const from = i * step;
      const to = Math.min(total, from + step);
      for (let j = from; j < to; j += 8) {
        const v = Math.abs(ch0[j]) + (ch1 ? Math.abs(ch1[j]) : 0);
        if (v > peak) peak = v;
      }
      out.push(Math.min(1, peak / (ch1 ? 2 : 1)));
    }
    const max = Math.max(0.001, ...out);
    return out.map((p) => Math.max(0.06, Math.sqrt(p / max)));
  };

  // 16-bit PCM mono WAV encode of buffer[startSec, endSec). Keeps uploads
  // playable everywhere with no encoder dependency. 90s mono ≈ 8MB.
  const encodeWavSlice = (buffer, startSec, endSec) => {
    const rate = buffer.sampleRate;
    const s0 = Math.max(0, Math.floor(startSec * rate));
    const s1 = Math.min(buffer.length, Math.ceil(endSec * rate));
    const len = Math.max(1, s1 - s0);
    const chans = buffer.numberOfChannels;
    const data = new Int16Array(len);
    for (let i = 0; i < len; i += 1) {
      let v = 0;
      for (let c = 0; c < chans; c += 1) v += buffer.getChannelData(c)[s0 + i] || 0;
      v /= chans;
      const clamped = Math.max(-1, Math.min(1, v));
      data[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7FFF;
    }
    const header = new ArrayBuffer(44);
    const dv = new DataView(header);
    const wstr = (off, s) => { for (let i = 0; i < s.length; i += 1) dv.setUint8(off + i, s.charCodeAt(i)); };
    wstr(0, 'RIFF');
    dv.setUint32(4, 36 + len * 2, true);
    wstr(8, 'WAVE');
    wstr(12, 'fmt ');
    dv.setUint32(16, 16, true);
    dv.setUint16(20, 1, true);
    dv.setUint16(22, 1, true);
    dv.setUint32(24, rate, true);
    dv.setUint32(28, rate * 2, true);
    dv.setUint16(32, 2, true);
    dv.setUint16(34, 16, true);
    wstr(36, 'data');
    dv.setUint32(40, len * 2, true);
    return new Blob([header, data.buffer], { type: 'audio/wav' });
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
      const decoded = await decodeAudioBlob(blob);
      const dur = decoded && decoded.duration > 0 ? decoded.duration : 0;
      if (decoded && dur > 0) {
        const ch = decoded.getChannelData(0);
        let sum = 0;
        let n = 0;
        for (let i = 0; i < ch.length; i += 10) { sum += ch[i] * ch[i]; n += 1; }
        if (Math.sqrt(sum / Math.max(1, n)) < 0.004 || maxLevelRef.current < 0.02) {
          setError('We could not hear anything. Make sure the episode is playing (and tab audio is shared), then try again.');
          return;
        }
        decodedRef.current = decoded;
        setTakeDur(dur);
        setSeconds(Math.round(dur));
        setTrim({ s: 0, e: dur });
        setTrimPeaks(bufferPeaks(decoded, 56));
      } else {
        // Undecodable but non-empty: accept the whole take, trimming off.
        decodedRef.current = null;
        setTrimPeaks([]);
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
      // Trimmed takes are re-encoded as WAV slices; full takes upload raw.
      const full = !decodedRef.current || (trim.s <= 0.5 && trim.e >= takeDur - 0.5);
      let file = audioBlob;
      let ext = 'webm';
      let contentType = 'audio/webm';
      let clipSeconds = seconds;
      if (!full) {
        file = encodeWavSlice(decodedRef.current, trim.s, trim.e);
        ext = 'wav';
        contentType = 'audio/wav';
        clipSeconds = Math.max(1, Math.round(trim.e - trim.s));
      }
      if (file.size > 15 * 1024 * 1024) throw new Error('This clip is too big. Trim it shorter and try again.');
      const filename = `clips/podcasts/${user.id}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from('clips').upload(filename, file, { contentType });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from('clips').getPublicUrl(filename);
      decodedRef.current = null;
      onReady({
        source_url: pageInfo.url,
        source_type: 'podcast',
        title: episodeTitle,
        audio_url: publicUrl,
        duration: clipSeconds,
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
            {trimPeaks.length > 0 && takeDur > 0 ? (
              <TrimPreview url={audioUrl} dur={takeDur} peaks={trimPeaks} trim={trim} onTrim={setTrim} />
            ) : (
              <AudioPreview url={audioUrl} seconds={seconds} />
            )}
            <p className="text-xs text-text-muted">Recorded {seconds}s. Listen back, trim it, then continue.</p>
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

function TrimPreview({ url, dur, peaks, trim, onTrim }) {
  const audioRef = useRef(null);
  const barRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(trim.s);
  const n = Math.max(1, peaks.length);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return undefined;
    const onTime = () => {
      const ct = el.currentTime || 0;
      setT(ct);
      if (ct >= trim.e - 0.05) {
        try { el.pause(); } catch (e) {}
        try { el.currentTime = trim.s; } catch (e) {}
      }
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnd = () => setPlaying(false);
    el.addEventListener('timeupdate', onTime);
    el.addEventListener('play', onPlay);
    el.addEventListener('pause', onPause);
    el.addEventListener('ended', onEnd);
    return () => {
      el.removeEventListener('timeupdate', onTime);
      el.removeEventListener('play', onPlay);
      el.removeEventListener('pause', onPause);
      el.removeEventListener('ended', onEnd);
    };
  }, [url, trim.s, trim.e]);

  const toggle = () => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) {
      const from = (t >= trim.s && t < trim.e) ? t : trim.s;
      try { el.currentTime = from; } catch (e) {}
      el.play().catch(() => {});
    } else {
      el.pause();
    }
  };

  const posToTime = (clientX) => {
    const r = barRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - r.left, Math.max(1, r.width)));
    return Math.round((x / Math.max(1, r.width)) * dur);
  };

  const onHandleDown = (which) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    const move = (ev) => {
      const v = posToTime(ev.clientX);
      if (which === 's') onTrim((p) => ({ ...p, s: Math.max(0, Math.min(v, p.e - 1)) }));
      else onTrim((p) => ({ ...p, e: Math.min(dur, Math.max(v, p.s + 1)) }));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  const seekPreview = (e) => {
    const el = audioRef.current;
    if (!el || !barRef.current) return;
    const r = barRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - r.left, Math.max(1, r.width)));
    try { el.currentTime = (x / Math.max(1, r.width)) * dur; } catch (err) {}
  };

  const lo = Math.max(0, Math.min(100, (trim.s / Math.max(1, dur)) * 100));
  const hi = Math.max(0, Math.min(100, (trim.e / Math.max(1, dur)) * 100));
  const playPct = Math.max(0, Math.min(100, (t / Math.max(1, dur)) * 100));

  return (
    <div className="pod-trim">
      <div className="pod-trim-top">
        <button type="button" className="pod-play" onClick={toggle} aria-label={playing ? "Pause preview" : "Play trimmed preview"}>
          {playing ? (
            <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5h4v14H6zM14 5h4v14h-4z" fill="currentColor" /></svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor" /></svg>
          )}
        </button>
        <span className="pod-time">{fmtTime(t)} / {fmtTime(dur)}</span>
      </div>
      <div ref={barRef} className="pod-trim-bar" onPointerDown={seekPreview} role="slider"
        aria-label="Trim range" aria-valuemin={0} aria-valuemax={Math.round(dur)}
        aria-valuetext={`${fmtTime(trim.s)} to ${fmtTime(trim.e)}`} tabIndex={0}>
        <audio ref={audioRef} src={url} preload="metadata" />
        <div className="pod-trim-bars" aria-hidden="true">
          {peaks.map((p, i) => {
            const center = ((i + 0.5) / n) * 100;
            const inRegion = center >= lo && center <= hi;
            const played = center <= playPct;
            return (
              <span
                key={i}
                className="pod-trim-bar-seg"
                style={{
                  height: `${Math.round(8 + p * 92)}%`,
                  background: played && inRegion ? 'var(--red-btn)' : 'var(--border-strong)',
                  opacity: inRegion ? 1 : 0.3,
                }}
              />
            );
          })}
        </div>
        <div className="pod-trim-range" style={{ left: `${lo}%`, width: `${Math.max(0, hi - lo)}%` }} aria-hidden="true" />
        <button type="button" className="pod-trim-handle is-start" style={{ left: `${lo}%` }}
          onPointerDown={onHandleDown('s')} aria-label={`Trim start, ${fmtTime(trim.s)}`} />
        <button type="button" className="pod-trim-handle is-end" style={{ left: `${hi}%` }}
          onPointerDown={onHandleDown('e')} aria-label={`Trim end, ${fmtTime(trim.e)}`} />
      </div>
      <p className="pod-trim-foot">Trim {fmtTime(trim.s)} - {fmtTime(trim.e)} ({fmtTime(trim.e - trim.s)})</p>
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
