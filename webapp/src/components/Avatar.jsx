import { useEffect, useState } from 'react';

export default function Avatar({ profile, size = 'md' }) {
  const [showImage, setShowImage] = useState(Boolean(profile?.avatar_url));
  useEffect(() => setShowImage(Boolean(profile?.avatar_url)), [profile?.avatar_url]);
  const identity = profile?.id || profile?.handle || profile?.display_name || profile?.email || 'annotated-user';
  const initial = String(profile?.display_name || profile?.handle || profile?.email || 'A').replace(/^@/, '').trim().charAt(0).toUpperCase() || 'A';
  const hue = [...String(identity)].reduce((value, character) => (value * 31 + character.charCodeAt(0)) >>> 0, 7) % 360;
  const sizeClasses = {
    xs: 'w-5 h-5 text-[8px]',
    sm: 'w-6 h-6 text-[10px]',
    md: 'w-8 h-8 text-xs',
    lg: 'w-12 h-12 text-sm',
  };

  return (
    <div
      className={`${sizeClasses[size]} avatar-circle flex items-center justify-center rounded-full font-bold shrink-0 overflow-hidden`}
      style={{ '--avatar-color': `hsl(${hue} 76% 36%)` }}
    >
      {showImage ? (
        <img src={profile.avatar_url} alt="" onError={() => setShowImage(false)} className="w-full h-full object-cover" />
      ) : (
        <span>{initial}</span>
      )}
    </div>
  );
}
