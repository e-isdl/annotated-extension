import { Link } from 'react-router-dom';
import TrendingThreads from './TrendingThreads';

// Most upvoted threads from the last 24 hours, in left-sidebar dress.
export default function TrendingToday() {
  return (
    <div className="border-t border-border-subtle pt-5">
      <div className="flex items-center justify-between mb-2">
        <p className="sidebar-label mb-0">Trending today</p>
        <Link to="/trending" className="rail-seeall">See all</Link>
      </div>
      <nav className="flex flex-col gap-1">
        <TrendingThreads limit={3} plain />
      </nav>
    </div>
  );
}
