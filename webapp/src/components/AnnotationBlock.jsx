import { useRef, useState } from 'react';

export default function AnnotationBlock({ annotation, transcript }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (audioRef.current.paused) {
      audioRef.current.play();
      setPlaying(true);
    } else {
      audioRef.current.pause();
      setPlaying(false);
    }
  };

  const handleSeek = (e) => {
    if (!audioRef.current || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pct = Math.max(0, Math.min(1, x / rect.width));
    audioRef.current.currentTime = pct * duration;
  };

  return (
    <div className="flex flex-col gap-4">
      {transcript && (
        <div className="bg-bg-surface border border-border rounded-xl overflow-hidden">
          <div className="p-5 sm:p-6">
            <p className="text-base sm:text-lg text-text-secondary/90 leading-[1.85] whitespace-pre-wrap font-medium">
              &ldquo;{transcript}&rdquo;
            </p>
          </div>
        </div>
      )}

      {annotation && (annotation.text_content || annotation.audio_url) && (
        <div className="relative">
          <div className="absolute left-0 top-3 bottom-3 w-[2px] bg-accent rounded-full" />
          <div className="ml-4 bg-gradient-to-br from-bg-surface/80 to-bg-surface/40 backdrop-blur-sm rounded-xl border border-accent/[0.08] overflow-hidden">
            <div className="p-5 sm:p-6 flex flex-col gap-4">
              {annotation.text_content && (
                <p className="text-[15px] sm:text-base leading-[1.85] font-semibold" style={{ color: '#aaa' }}>
                  {annotation.text_content}
                </p>
              )}

              {annotation.audio_url && (
                <div className="flex flex-col gap-3">
                  <audio
                    ref={audioRef}
                    src={annotation.audio_url}
                    onEnded={() => setPlaying(false)}
                    onTimeUpdate={() => setProgress(audioRef.current?.currentTime || 0)}
                    onLoadedMetadata={() => setDuration(audioRef.current?.duration || 0)}
                  />
                  <div className="bg-bg-raised/60 rounded-lg p-3 flex items-center gap-3">
                    <button
                      onClick={togglePlay}
                      className="w-9 h-9 rounded-full bg-accent/15 flex items-center justify-center text-accent hover:bg-accent/25 transition-colors shrink-0"
                    >
                      {playing ? (
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                        </svg>
                      ) : (
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      )}
                    </button>
                    <div className="flex-1 flex flex-col gap-1.5 min-w-0">
                      <div
                        className="h-1 bg-border rounded-full overflow-hidden cursor-pointer group"
                        onClick={handleSeek}
                      >
                        <div
                          className="h-full bg-accent/70 rounded-full relative"
                          style={{ width: duration ? `${(progress / duration) * 100}%` : '0%' }}
                        >
                          <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-accent opacity-0 group-hover:opacity-100 transition-opacity shadow-sm" />
                        </div>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[10px] text-text-muted/60 font-mono tabular-nums">{formatTime(progress)}</span>
                        <span className="text-[10px] text-text-muted/60 font-mono tabular-nums">{formatTime(duration)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function formatTime(s) {
  if (!s || !isFinite(s)) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}
