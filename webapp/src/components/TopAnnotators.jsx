import { Link } from 'react-router-dom';
import TrendingPeople from './TrendingPeople';

export default function TopAnnotators() {
  return (
    <section className="rail-card">
      <div className="flex items-center justify-between mb-4">
        <h2 className="rail-heading">Trending annotators</h2>
        <Link to="/trending-annotators" className="rail-seeall">See all</Link>
      </div>
      <TrendingPeople limit={3} />
    </section>
  );
}
