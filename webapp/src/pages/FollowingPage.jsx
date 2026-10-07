import FollowingList from '../components/FollowingList';

export default function FollowingPage() {
  return (
    <div className="feed-page">
      <section className="feed-heading modern-feed-heading">
        <div>
          <div className="flex items-center gap-2">
            <h1>Following</h1>
          </div>
        </div>
      </section>
      <FollowingList />
    </div>
  );
}
