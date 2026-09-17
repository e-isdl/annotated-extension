import { useRef, useState } from 'react';

export default function AudioPlayer({ src }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);

  const togglePlay = () => {
    if (audioRef.current.paused) {
      audioRef.current.play();
      setPlaying(true);
    } else {
      audioRef.current.pause();
      setPlaying(false);
    }
  };

  return (
    <div className="bg-bg-surface p-6 flex flex-col items-center gap-4">
      <audio ref={audioRef} src={src} onEnded={() => setPlaying(false)} />
      <button
        onClick={togglePlay}
        className="w-16 h-16 rounded-full bg-accent flex items-center justify-center text-bg-base text-2xl hover:opacity-90 transition-opacity"
      >
        {playing ? '⏸' : '▶'}
      </button>
      <p className="text-xs text-text-muted font-mono">Podcast clip</p>
    </div>
  );
}
