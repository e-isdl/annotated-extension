import { useState } from 'react';
import FollowingList from '../components/FollowingList';

const TABS = [
  { value: 'foryou', label: 'For You' },
  { value: 'following', label: 'Following' },
];

export default function ForYouPage() {
  const [tab, setTab] = useState('foryou');

  return (
    <div className="feed-page">
      <section className="feed-heading modern-feed-heading">
        <div>
          <div className="flex items-center gap-2">
            <h1>For You</h1>
          </div>
        </div>
      </section>

      <div className="feed-tabs" role="tablist" aria-label="For you">
        {TABS.map((option) => (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={tab === option.value}
            onClick={() => setTab(option.value)}
            className={tab === option.value ? 'feed-tab feed-tab-active' : 'feed-tab'}
          >
            {option.label}
          </button>
        ))}
      </div>

      {tab === 'following' ? (
        <FollowingList />
      ) : (
        <div className="empty-state">
          <p className="text-sm text-text-secondary">This feature is not available right now.</p>
        </div>
      )}
    </div>
  );
}
