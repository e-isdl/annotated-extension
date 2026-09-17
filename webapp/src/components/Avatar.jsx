export default function Avatar({ profile, size = 'md' }) {
  const sizeClasses = {
    xs: 'w-5 h-5 text-[8px]',
    sm: 'w-6 h-6 text-[10px]',
    md: 'w-8 h-8 text-xs',
    lg: 'w-12 h-12 text-sm',
  };

  return (
    <div
      className={`${sizeClasses[size]} rounded-full bg-accent/20 flex items-center justify-center text-accent font-bold shrink-0 overflow-hidden`}
    >
      {profile?.avatar_url ? (
        <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
      ) : (
        <span>{profile?.handle?.[0]?.toUpperCase() || '?'}</span>
      )}
    </div>
  );
}
