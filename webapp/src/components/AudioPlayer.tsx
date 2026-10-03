import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";


const PANEL = "var(--audio-panel, var(--surface))";   // same inset color as the text commentary panel
const PLAYED = "var(--text)";
const UNPLAYED = "var(--border)";
const MUTED = "var(--text-3)";
const BARS = 56;


const fmt = (s: number) => {
  if (!isFinite(s) || s < 0) return "0:00";
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
};


/** Deterministic, smooth-looking placeholder waveform (used until real peaks load, or if they can't). */
function fakePeaks(seed: string, n: number): number[] {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) | 0;
  const rnd = () => ((h = (h * 1664525 + 1013904223) | 0) >>> 0) / 4294967296;
  let v = 0.5;
  return Array.from({ length: n }, (_, i) => {
    v = 0.55 * v + 0.45 * rnd();
    const env = 0.55 + 0.45 * Math.sin((i / n) * Math.PI * 3 + 1);
    return Math.max(0.14, Math.min(1, v * env * 1.5));
  });
}


/** Real peaks from the file (falls back silently, e.g. on CORS errors). */
async function realPeaks(src: string, n: number): Promise<number[]> {
  const buf = await (await fetch(src)).arrayBuffer();
  const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  const data = (await ctx.decodeAudioData(buf)).getChannelData(0);
  ctx.close();
  const step = Math.floor(data.length / n) || 1;
  const peaks = Array.from({ length: n }, (_, i) => {
    let sum = 0;
    for (let j = i * step; j < (i + 1) * step && j < data.length; j++) sum += data[j] * data[j];
    return Math.sqrt(sum / step);
  });
  const max = Math.max(...peaks) || 1;
  return peaks.map((p) => Math.max(0.14, p / max));
}


const CSS = `
.ap-btn{transition:transform .12s ease,filter .12s ease}
.ap-btn:hover{filter:brightness(1.12)}
.ap-btn:active{transform:scale(.94)}
.ap-btn:focus-visible,.ap-wave:focus-visible{outline:2px solid var(--focus);outline-offset:3px}
.ap-wave span{transition:background-color .12s ease}
.ap-wave:hover span{filter:brightness(1.15)}
@media (prefers-reduced-motion:reduce){.ap-btn,.ap-wave span{transition:none}}
`;


/**
 * Minimal voice-note style player for audio commentary.
 * Place it at the very top of the post body, above the source title/embed.
 * `compact` = feed version.
 */
export function AudioPlayer({ src, compact = false }: { src: string; compact?: boolean }) {
  const audio = useRef<HTMLAudioElement>(null);
  const wave = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [dur, setDur] = useState(0);
  const [failed, setFailed] = useState(false);
  const [peaks, setPeaks] = useState<number[]>(() => fakePeaks(src, BARS));


  useEffect(() => {
    let live = true;
    setPeaks(fakePeaks(src, BARS));
    realPeaks(src, BARS).then((p) => live && setPeaks(p)).catch(() => {});
    return () => { live = false; };
  }, [src]);


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
      <style>{CSS}</style>
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
          width: size, height: size, borderRadius: "50%", border: 0, background: PLAYED, flex: "none",
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
              background: (i + 0.5) / BARS <= pct ? PLAYED : UNPLAYED,
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
