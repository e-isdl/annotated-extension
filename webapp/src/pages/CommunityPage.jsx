import { useParams, Link } from 'react-router-dom';
import { DEMO_CLIPS, getDemoCommunity } from '../lib/demoData';
import ClipCard from '../components/ClipCard';

export default function CommunityPage() {
  const { slug } = useParams();
  const community = getDemoCommunity(slug) || { slug, name: slug.replace(/-/g, ' '), members: 'New', description: 'A new place for thoughtful source-based conversations.' };
  const clips = DEMO_CLIPS.filter((clip) => clip.community_slug === slug);

  return (
    <div className="section-page community-page">
      <div className="community-hero">
        <div className="community-hero-mark">{community.name[0]}</div>
        <div className="flex-1 min-w-0">
          <p className="eyebrow">COMMUNITY</p>
          <h1>c/{community.name}</h1>
          <p>{community.description}</p>
        </div>
        <button type="button" className="btn-ghost">Join</button>
      </div>

      <div className="community-stats">
        <span><strong>{community.members}</strong> members</span>
        <span><strong>{clips.length || '—'}</strong> featured threads</span>
        <span>Public community</span>
      </div>

      <div className="community-toolbar">
        <div className="feed-tabs">
          <button className="feed-tab feed-tab-active">Best</button>
          <button className="feed-tab">New</button>
          <button className="feed-tab">Top</button>
        </div>
        <Link to="/create" className="btn-primary text-xs py-2 px-3">Create thread</Link>
      </div>

      <div className="feed-list">
        {clips.length ? clips.map((clip) => <ClipCard key={clip.id} clip={clip} />) : (
          <div className="empty-state compact-empty">
            <span className="text-3xl">✎</span>
            <h2 className="text-lg font-semibold text-text-primary">Be the first to start this conversation.</h2>
            <Link to="/create" className="btn-primary">Create a thread</Link>
          </div>
        )}
      </div>
    </div>
  );
}
