import TrendingThreads from '../components/TrendingThreads';

export default function TrendingPage() {
  return (
    <div className="feed-page">
      <section className="feed-heading modern-feed-heading">
        <div>
          <div className="flex items-center gap-2">
            <h1>Trending today</h1>
          </div>
        </div>
      </section>
      <section className="rail-card">
        <TrendingThreads limit={25} />
      </section>
    </div>
  );
}
