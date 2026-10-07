import { Link } from 'react-router-dom';
import TrendingThreads from './TrendingThreads';

// Most upvoted threads from the last 24 hours.
export default function TrendingToday() {
  return (
    <section className="rail-card">
      <div className="flex items-center justify-between mb-4">
        <h2 className="rail-heading">Trending today</h2>
        <Link to="/trending" className="rail-seeall">See all</Link>
      </div>
      <TrendingThreads limit={3} />
    </section>
  );
}
