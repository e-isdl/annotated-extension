import { Link } from 'react-router-dom';
import TrendingKeywords from './TrendingKeywords';

export default function TrendingTopics() {
  return (
    <div className="border-t border-border-subtle pt-5">
      <div className="flex items-center justify-between mb-2">
        <p className="sidebar-label mb-0">Trending topics</p>
        <Link to="/trending-topics" className="rail-seeall">See all</Link>
      </div>
      <nav className="flex flex-col gap-1">
        <TrendingKeywords limit={6} />
      </nav>
    </div>
  );
}
