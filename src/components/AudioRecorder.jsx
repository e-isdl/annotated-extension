import { useEffect, useRef, useState } from 'react';
import AudioPlayer from '../../webapp/src/components/AudioPlayer';

const MAX_SECONDS = 180;
const WARNING_SECONDS = 15;
const PROMPT_TIMEOUT_MS = 10000;
const BARS = 5;

function pickMimeType() {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
  for (const candidate of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(candidate)) return candidate;
    } catch {
      // isTypeSupported can throw on unknown types
    }
  }
  return '';
}

function formatTime(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function plainError(err) {
  const name = err?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return "Microphone access is blocked. Allow it in Chrome's site settings for this extension";
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'No microphone found. Connect a microphone and try again.';
  }
  if (name === 'PromptTimeout') {
    return "The microphone permission prompt never appeared.";
  }
  if (name === 'NotReadableError') {
    return 'Recording failed. Your microphone is in use by another app.';
  }
  return 'Recording failed. Check your microphone and try again.';
}

function isConsentError(err) {
  const name = err?.name;
  return name === 'NotAllowedError' || name === 'SecurityError' || name === 'PromptTimeout';
}

function openPermissionPage() {
  try {
    chrome.tabs.create({ url: chrome.runtime.getURL('permission.html') });
  } catch (err) {
    console.error('Could not open the microphone permission page:', err);
  }
}

async function micPermissionState() {
  try {
    const result = await navigator.permissions.query({ name: 'microphone' });
    return result.state;
  } catch {
    return 'unknown';
  }
}

function pausePageMedia() {
  try {
    document.querySelectorAll('audio, video').forEach((el) => {
      try { el.pause(); } catch { /* cross-document media */ }
    });
  } catch { /* no media elements */ }
  try {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs?.[0];
      if (tab?.id != null) {
        chrome.tabs.sendMessage(tab.id, { type: 'PAUSE_MEDIA' }).catch(() => {});
      }
    });
  } catch { /* no tab access */ }
}

export default function AudioRecorder({ uploadButton, onUseFile, disabled = false }) {
  const [phase, setPhase] = useState('idle');
  const [error, setError] = useState('');
  const [blocked, setBlocked] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [levels, setLevels] = useState(() => Array(BARS).fill(0));
  const [blobUrl, setBlobUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [quiet, setQuiet] = useState(false);

  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const blobRef = useRef(null);
  const blobUrlRef = useRef('');
  const audioCtxRef = useRef(null);
  const rafRef = useRef(0);
  const timerRef = useRef(0);
  const quietTimerRef = useRef(0);
  const signalRef = useRef(false);
  const meterReadyRef = useRef(false);
  const startedRef = useRef(0);
  const lastMeterRef = useRef(0);
  const aliveRef = useRef(true);

  const teardownMedia = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = 0;
    if (quietTimerRef.current) clearTimeout(quietTimerRef.current);
    quietTimerRef.current = 0;
    meterReadyRef.current = false;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    const ctx = audioCtxRef.current;
    audioCtxRef.current = null;
    if (ctx && ctx.state !== 'closed') ctx.close().catch(() => {});
  };

  const stopRecording = () => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      try { recorder.stop(); } catch { teardownMedia(); }
    } else {
      teardownMedia();
    }
  };

  useEffect(() => {
    const stopEverything = () => {
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== 'inactive') {
        try { recorder.stop(); } catch { /* already stopped */ }
      }
      teardownMedia();
    };
    window.addEventListener('pagehide', stopEverything);
    window.addEventListener('beforeunload', stopEverything);
    return () => {
      aliveRef.current = false;
      window.removeEventListener('pagehide', stopEverything);
      window.removeEventListener('beforeunload', stopEverything);
      stopEverything();
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    };
  }, []);

  const startRecording = async () => {
    setError('');
    setBlocked(false);
    pausePageMedia();

    const mediaPromise = navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    });
    const promptTimeout = new Promise((_, reject) => {
      setTimeout(() => reject(Object.assign(new Error('timed out'), { name: 'PromptTimeout' })), PROMPT_TIMEOUT_MS);
    });

    let stream;
    try {
      stream = await Promise.race([mediaPromise, promptTimeout]);
    } catch (err) {
      mediaPromise.then((late) => late.getTracks().forEach((track) => track.stop())).catch(() => {});
      if (!aliveRef.current) return;
      if (isConsentError(err)) {
        const state = await micPermissionState();
        setBlocked(true);
        setError(state === 'denied'
          ? "Microphone access is blocked. Allow it in Chrome's site settings for this extension"
          : "Chrome can't ask for the microphone inside the panel, so we opened a page for you. Click Allow microphone there, then press Record again.");
        openPermissionPage();
      } else {
        setError(plainError(err));
      }
      return;
    }

    if (!aliveRef.current) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }

    const inputTrack = stream.getAudioTracks()[0];
    if (inputTrack && inputTrack.muted) {
      stream.getTracks().forEach((track) => track.stop());
      setError('Chrome has this microphone muted for the extension. Click the microphone icon in the address bar, choose Allow, then try again.');
      setBlocked(true);
      return;
    }

    streamRef.current = stream;
    signalRef.current = false;
    setQuiet(false);
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      const ctx = new Ctx();
      audioCtxRef.current = ctx;
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.55;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const bins = new Uint8Array(analyser.frequencyBinCount);
      const meterTick = (now) => {
        analyser.getByteFrequencyData(bins);
        if (now - lastMeterRef.current > 60) {
          lastMeterRef.current = now;
          const span = Math.floor(bins.length * 0.6);
          const next = [];
          for (let bar = 0; bar < BARS; bar++) {
            const from = Math.floor((bar / BARS) * span);
            const to = Math.max(from + 1, Math.floor(((bar + 1) / BARS) * span));
            let sum = 0;
            for (let i = from; i < to; i++) sum += bins[i];
            next.push(Math.min(1, sum / (to - from) / 190));
          }
          if (ctx.state === 'running' && next.some((value) => value > 0.02)) signalRef.current = true;
          setLevels(next);
        }
        rafRef.current = requestAnimationFrame(meterTick);
      };
      rafRef.current = requestAnimationFrame(meterTick);
      meterReadyRef.current = true;
    } catch {
      // The level meter is optional; recording can continue without it.
      meterReadyRef.current = false;
    }

    const mimeType = pickMimeType();
    let recorder;
    try {
      recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    } catch (err) {
      setError(plainError(err));
      teardownMedia();
      return;
    }

    recorderRef.current = recorder;
    chunksRef.current = [];
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size) chunksRef.current.push(event.data);
    };
    recorder.onerror = () => {
      if (!aliveRef.current) return;
      teardownMedia();
      recorderRef.current = null;
      setLevels(Array(BARS).fill(0));
      setError('Recording failed. Check your microphone and try again.');
      setPhase('idle');
    };
    recorder.onstop = () => {
      const type = mimeType || chunksRef.current[0]?.type || 'audio/webm';
      const blob = new Blob(chunksRef.current, { type });
      const seconds = (Date.now() - startedRef.current) / 1000;
      teardownMedia();
      recorderRef.current = null;
      if (!aliveRef.current) return;
      setLevels(Array(BARS).fill(0));
      if (!blob.size) {
        setError('Recording failed. Nothing was captured. Try again.');
        setPhase('idle');
        return;
      }
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
      blobRef.current = blob;
      blobUrlRef.current = URL.createObjectURL(blob);
      setBlobUrl(blobUrlRef.current);
      setElapsed(seconds);
      setPhase('review');
    };

    startedRef.current = Date.now();
    lastMeterRef.current = 0;
    setElapsed(0);
    setPhase('recording');
    try {
      recorder.start(250);
    } catch (err) {
      setError(plainError(err));
      teardownMedia();
      recorderRef.current = null;
      setPhase('idle');
      return;
    }
    timerRef.current = setInterval(() => {
      const seconds = (Date.now() - startedRef.current) / 1000;
      setElapsed(seconds);
      if (seconds >= MAX_SECONDS) stopRecording();
    }, 200);
    if (meterReadyRef.current) {
      quietTimerRef.current = setTimeout(() => {
        if (aliveRef.current && !signalRef.current) setQuiet(true);
      }, 4000);
    }
  };

  const discardRecording = () => {
    if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    blobUrlRef.current = '';
    blobRef.current = null;
    setBlobUrl('');
    setElapsed(0);
    setError('');
    setPhase('idle');
  };

  const useRecording = async () => {
    const blob = blobRef.current;
    if (!blob || saving) return;
    const file = new File([blob], 'commentary.webm', { type: blob.type || 'audio/webm' });
    setSaving(true);
    try {
      await onUseFile(file);
    } finally {
      if (aliveRef.current) setSaving(false);
    }
  };

  if (phase === 'recording') {
    const remaining = Math.max(0, MAX_SECONDS - elapsed);
    return (
      <div className="flex flex-col gap-2 rounded-lg bg-bg-surface border border-border p-3">
        <div className="flex items-center gap-3">
          <div className="flex items-end gap-[3px] h-5" aria-hidden="true">
            {levels.map((level, index) => (
              <span
                key={index}
                className={`w-1 rounded-sm ${level > 0.04 ? 'bg-accent' : 'bg-border'}`}
                style={{ height: `${Math.max(3, Math.round(3 + level * 17))}px` }}
              />
            ))}
          </div>
          <span className="font-mono text-xs text-text-secondary tabular-nums">{formatTime(elapsed)}</span>
          {remaining <= WARNING_SECONDS && (
            <span className="font-mono text-[10px] text-accent-text tabular-nums">stops in {formatTime(remaining)}</span>
          )}
          <button
            onClick={stopRecording}
            className="ml-auto px-3 py-1.5 text-xs font-medium rounded-md bg-accent text-[var(--on-red)] hover:opacity-90 transition-opacity"
          >
            Stop
          </button>
        </div>
        <p className="text-[10px] text-text-muted">Use headphones if a video is playing.</p>
        {quiet && (
          <p className="text-[10px] text-accent-text">
            No sound is reaching the microphone. Check that it is not muted and that it is the selected input device.
          </p>
        )}
        <p className="text-[10px] text-accent-text">Closing the panel loses this recording.</p>
      </div>
    );
  }

  if (phase === 'review' && blobUrl) {
    return (
      <div className="flex flex-col gap-2">
        <AudioPlayer src={blobUrl} compact />
        <div className="flex gap-2">
          <button
            onClick={discardRecording}
            disabled={saving}
            className="flex-1 px-4 py-3 text-xs font-medium rounded-lg bg-bg-surface border border-border text-text-secondary hover:text-text-primary hover:bg-bg-raised transition-colors disabled:opacity-40"
          >
            Re-record
          </button>
          <button
            onClick={useRecording}
            disabled={saving}
            className="btn-primary flex-1 disabled:opacity-40"
          >
            {saving ? 'Uploading...' : 'Use recording'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        {uploadButton}
        <button
          onClick={startRecording}
          disabled={disabled}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-3 text-xs font-medium rounded-lg bg-bg-surface border border-border text-text-secondary hover:text-text-primary hover:bg-bg-raised transition-colors disabled:opacity-40"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-2.08A7 7 0 0 0 19 12h-2z" />
          </svg>
          Record
        </button>
      </div>
      {error && (
        <div className="flex flex-col gap-1">
          <p className="text-[11px] text-[var(--red)]">{error}</p>
          {blocked && (
            <button
              onClick={openPermissionPage}
              className="text-[11px] text-accent-text hover:text-accent self-start transition-colors"
            >
              Fix microphone access
            </button>
          )}
        </div>
      )}
    </div>
  );
}
