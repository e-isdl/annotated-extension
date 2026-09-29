import { communityPfpUrl, communityStyle } from '../lib/community';

export default function CommunityAvatar({ slug, name, className = 'community-dot' }) {
  const src = communityPfpUrl(slug);
  return (
    <span className={className} style={communityStyle(slug)}>
      {src ? <img src={src} alt="" loading="lazy" className="community-pfp" /> : (name ? String(name)[0] : '?')}
    </span>
  );
}
