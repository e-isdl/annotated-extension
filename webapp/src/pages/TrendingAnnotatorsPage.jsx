import SamplePeople from '../components/SamplePeople';

export default function TrendingAnnotatorsPage() {
  return (
    <div className="feed-page">
      <section className="feed-heading modern-feed-heading">
        <div>
          <div className="flex items-center gap-2">
            <h1>Trending annotators</h1>
          </div>
        </div>
      </section>
      <section className="rail-card">
        <SamplePeople limit={10} />
      </section>
    </div>
  );
}
