import { Link } from 'react-router-dom';
import TrendingPeople from './TrendingPeople';

export default function TopAnnotators() {
  return (
    <div className="border-t border-border-subtle pt-5">
      <div className="flex items-center justify-between mb-2">
        <p className="sidebar-label mb-0">Top annotators</p>
        <Link to="/leaderboard" className="rail-seeall">See all</Link>
      </div>
      <nav className="flex flex-col gap-1">
        <TrendingPeople limit={3} />
      </nav>
    </div>
  );
}
