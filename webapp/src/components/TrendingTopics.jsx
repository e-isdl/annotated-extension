import { Link } from 'react-router-dom';
import CommunityAvatar from './CommunityAvatar';

// Sample topics until live activity fills them in.
const SAMPLE = [
  { slug: 'politics', name: 'Politics', count: 14 },
  { slug: 'technology', name: 'Technology', count: 9 },
  { slug: 'internet-culture', name: 'Internet Culture', count: 6 },
  { slug: 'tv-and-film', name: 'TV and Film', count: 3 },
];

export default function TrendingTopics() {
  return (
    <div className="border-t border-border-subtle pt-5">
      <div className="flex items-center justify-between mb-2">
        <p className="sidebar-label mb-0">Trending topics <span className="text-text-muted font-normal">(demo)</span></p>
        <Link to="/explore" className="rail-seeall">See all</Link>
      </div>
      <nav className="flex flex-col gap-1">
        {SAMPLE.map((row) => (
          <Link key={row.slug} to={`/c/${row.slug}`} className="sidebar-link">
            <CommunityAvatar slug={row.slug} name={row.name} />
            <span className="min-w-0 flex-1 truncate">c/{row.name}</span>
            <span className="text-[11px] text-text-muted shrink-0">{row.count} today</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
