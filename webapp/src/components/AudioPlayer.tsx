import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";


const PANEL = "var(--audio-panel, var(--surface))";   // same inset color as the text commentary panel
const PLAYED = "var(--text)";
const UNPLAYED = "var(--border)";
const MUTED = "var(--text-3)";
const DEFAULT_BARS = 56;


/** Peaks computed from real files, shared across mounts so feed + detail decode once. */
const peaksCache = new Map<string, number[]>();


const fmt = (s: number) => {
  if (!isFinite(s) || s < 0) return "0:00";
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
};


/** Flat bars shown while real peaks load: clearly pending, never fake data. */
function loadingPeaks(n: number): number[] {
  return Array.from({ length: n }, () => 0.08);
}


/** Real peaks from the file (falls back silently, e.g. on CORS errors). */
function decodeBuffer(buf: ArrayBuffer): Promise<AudioBuffer> {
  const Ctx = window.AudioContext || (window as any).webkitAudioContext;
  const ctx: AudioContext = new Ctx();
  try {
    const maybePromise = (ctx.decodeAudioData as any)(buf);
    if (maybePromise && typeof maybePromise.then === "function") {
      return (maybePromise as Promise<AudioBuffer>).finally(() => {
        try { ctx.close(); } catch {}
      }) as Promise<AudioBuffer>;
    }
  } catch {}
  // Legacy callback form (older Safari).
  return new Promise<AudioBuffer>((resolve, reject) => {
    try {
      (ctx.decodeAudioData as any)(
        buf,
        (decoded: AudioBuffer) => { try { ctx.close(); } catch {} resolve(decoded); },
        (err: unknown) => { try { ctx.close(); } catch {} reject(err); },
      );
    } catch (err) {
      try { ctx.close(); } catch {}
      reject(err);
    }
  });
}


async function realPeaks(src: string, n: number): Promise<number[]> {
  const cached = peaksCache.get(src);
  if (cached && cached.length === n) return cached;
  const res = await fetch(src, { mode: "cors" });
  if (!res.ok) throw new Error(`audio fetch ${res.status}`);
  const buf = await res.arrayBuffer();
  if (!buf.byteLength) throw new Error("audio empty");
  const data = (await decodeBuffer(buf)).getChannelData(0);
  const step = Math.floor(data.length / n) || 1;
  const peaks = Array.from({ length: n }, (_, i) => {
    let sum = 0;
    let count = 0;
    for (let j = i * step; j < (i + 1) * step && j < data.length; j++) { sum += data[j] * data[j]; count += 1; }
    return Math.sqrt(sum / Math.max(1, count));
  });
  const max = Math.max(...peaks) || 1;
  // Square-root dynamics: quiet passages stay visible, loud ones don't clip.
  const shaped = peaks.map((p) => Math.max(0.05, Math.sqrt(Math.max(0, p / max))));
  peaksCache.set(src, shaped);
  return shaped;
}




/**
 * Minimal voice-note style player for audio commentary.
 * Place it at the very top of the post body, above the source title/embed.
 * `compact` = feed version. `bars` tunes waveform resolution.
 * `durationHint` shows a length before metadata loads.
 */
export function AudioPlayer({ src, compact = false, bars = DEFAULT_BARS, durationHint = 0, accent = PLAYED }: { src: string; compact?: boolean; bars?: number; durationHint?: number; accent?: string }) {
  const audio = useRef<HTMLAudioElement>(null);
  const wave = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [dur, setDur] = useState(durationHint || 0);
  const [failed, setFailed] = useState(false);
  const [peaks, setPeaks] = useState<number[]>(() => loadingPeaks(bars));


  useEffect(() => {
    let live = true;
    setPeaks(loadingPeaks(bars));
    setDur(durationHint || 0);
    realPeaks(src, bars).then((p) => live && setPeaks(p)).catch(() => {});
    return () => { live = false; };
  }, [src, bars, durationHint]);


  // One media item at a time.
  useEffect(() => {
    const onOther = (e: Event) => {
      if ((e as CustomEvent).detail !== audio.current) audio.current?.pause();
    };
    window.addEventListener("annotated:play", onOther);
    return () => window.removeEventListener("annotated:play", onOther);
  }, []);


  const toggle = () => {
    const a = audio.current;
    if (!a) return;
    if (a.paused) {
      window.dispatchEvent(new CustomEvent("annotated:play", { detail: a }));
      a.play().catch(() => setFailed(true));
    } else a.pause();
  };


  const seekTo = (x: number) => {
    const a = audio.current, w = wave.current;
    if (!a || !w || !dur) return;
    const r = w.getBoundingClientRect();
    a.currentTime = Math.min(Math.max((x - r.left) / r.width, 0), 1) * dur;
  };
  const down = (e: PointerEvent) => {
    dragging.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    seekTo(e.clientX);
  };
  const move = (e: PointerEvent) => dragging.current && seekTo(e.clientX);
  const up = () => (dragging.current = false);
  const key = (e: KeyboardEvent) => {
    const a = audio.current;
    if (!a) return;
    if (e.key === "ArrowRight") { a.currentTime = Math.min(a.currentTime + 5, dur); e.preventDefault(); }
    if (e.key === "ArrowLeft") { a.currentTime = Math.max(a.currentTime - 5, 0); e.preventDefault(); }
  };


  const size = compact ? 32 : 40;
  const waveH = compact ? 24 : 32;
  const pct = dur ? time / dur : 0;


  if (failed) {
    return (
      <div style={{ background: PANEL, borderRadius: 14, padding: compact ? "12px 14px" : "16px 18px", color: MUTED, fontSize: 13 }}>
        Audio unavailable
      </div>
    );
  }


  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: compact ? 12 : 14, background: PANEL, borderRadius: 14,
        padding: compact ? "8px 16px 8px 8px" : "10px 18px 10px 10px",
      }}
    >
      <audio
        ref={audio}
        src={src}
        preload="metadata"
        onLoadedMetadata={(e) => setDur(e.currentTarget.duration)}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onError={() => setFailed(true)}
      />


      <button
        type="button"
        className="ap-btn"
        onClick={toggle}
        aria-label={playing ? "Pause audio commentary" : "Play audio commentary"}
        style={{
          width: size, height: size, borderRadius: "50%", border: 0, background: accent, flex: "none",
          display: "grid", placeItems: "center", cursor: "pointer",
        }}
      >
        <svg width={size * 0.42} height={size * 0.42} viewBox="0 0 24 24" fill="var(--bg)" aria-hidden="true">
          {playing ? (
            <>
              <rect x="5.5" y="4.5" width="4.5" height="15" rx="1.2" />
              <rect x="14" y="4.5" width="4.5" height="15" rx="1.2" />
            </>
          ) : (
            <path d="M8.5 4.9v14.2a1 1 0 0 0 1.52.85l11.2-7.1a1 1 0 0 0 0-1.7L10.02 4.05A1 1 0 0 0 8.5 4.9z" />
          )}
        </svg>
      </button>


      <div
        ref={wave}
        className="ap-wave"
        role="slider"
        tabIndex={0}
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={Math.round(dur)}
        aria-valuenow={Math.round(time)}
        aria-valuetext={`${fmt(time)} of ${fmt(dur)}`}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onKeyDown={key}
        style={{ flex: 1, height: waveH, display: "flex", alignItems: "center", gap: 2, cursor: "pointer", touchAction: "none" }}
      >
        {peaks.map((p, i) => (
          <span
            key={i}
            style={{
              flex: 1, height: 4 + p * (waveH - 4), borderRadius: 2,
              background: (i + 0.5) / peaks.length <= pct ? accent : UNPLAYED,
            }}
          />
        ))}
      </div>


      <span style={{ color: MUTED, fontSize: 13, fontVariantNumeric: "tabular-nums", minWidth: 34, textAlign: "right" }}>
        {playing || time > 0 ? fmt(time) : fmt(dur)}
      </span>
    </div>
  );
}


export default AudioPlayer;
