import { Link } from 'react-router-dom';

export default function ForYouPage() {
  return (
    <div>
      <h1>For You</h1>
      <section className="rail-card">
        <Link to="/following" className="no-underline">
          <h2 className="rail-heading">Following</h2>
          <p className="text-sm text-text-secondary">Posts from people you follow, all in one place.</p>
        </Link>
      </section>
    </div>
  );
}
