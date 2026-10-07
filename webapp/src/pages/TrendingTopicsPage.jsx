import TrendingKeywords from '../components/TrendingKeywords';

export default function TrendingTopicsPage() {
  return (
    <div className="feed-page">
      <section className="feed-heading modern-feed-heading">
        <div>
          <div className="flex items-center gap-2">
            <h1>Trending topics</h1>
          </div>
        </div>
      </section>
      <section className="rail-card">
        <TrendingKeywords limit={20} />
      </section>
    </div>
  );
}
