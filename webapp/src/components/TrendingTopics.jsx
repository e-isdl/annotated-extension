import { Link } from 'react-router-dom';
import CommunityAvatar from './CommunityAvatar';

// Sample topics until live activity fills this in.
const SAMPLE = [
  { slug: 'politics', name: 'Politics', count: 14 },
  { slug: 'technology', name: 'Technology', count: 9 },
  { slug: 'internet-culture', name: 'Internet Culture', count: 6 },
  { slug: 'tv-and-film', name: 'TV and Film', count: 3 },
];

export default function TrendingTopics() {
  return (
    <section className="rail-card">
      <div className="flex items-center justify-between mb-4">
        <h2 className="rail-heading">Trending topics</h2>
        <Link to="/explore" className="rail-seeall">See all</Link>
      </div>
      <div className="take-list">
        {SAMPLE.map((row) => (
          <Link key={row.slug} to={`/c/${row.slug}`} className="take-item no-underline">
            <CommunityAvatar slug={row.slug} name={row.name} className="community-dot community-dot-lg" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm text-text-primary truncate">c/{row.name}</span>
              <span className="block text-[11px] text-text-muted mt-0.5">{row.count} posts today</span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
