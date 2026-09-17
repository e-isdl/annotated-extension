import { Link } from 'react-router-dom';
import { DEMO_COMMUNITIES } from '../lib/demoData';

export default function RightRail() {
  return (
    <aside className="right-rail">
      <Link to="/create" className="create-prompt no-underline">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent-text">Start a thread</p>
            <h2 className="text-lg font-semibold text-text-primary mt-2 leading-tight">What did you find worth arguing with?</h2>
          </div>
          <span className="text-2xl text-accent">↗</span>
        </div>
        <p className="text-xs text-text-secondary leading-relaxed mt-3">Share the source, point to the moment, and let the community add context.</p>
      </Link>

      <section className="rail-card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="rail-heading">Trending communities</h2>
          <Link to="/explore" className="text-[11px] text-accent-text hover:text-accent">See all</Link>
        </div>
        <div className="flex flex-col gap-3">
          {DEMO_COMMUNITIES.slice(0, 3).map((community, index) => (
            <Link key={community.slug} to={`/c/${community.slug}`} className="flex items-center gap-3 no-underline group">
              <span className="text-xs font-mono text-text-muted w-4">0{index + 1}</span>
              <span className="community-dot community-dot-lg">{community.name[0]}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm text-text-primary group-hover:text-accent-text truncate">{community.name}</span>
                <span className="block text-[11px] text-text-muted mt-0.5">{community.members} members</span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="rail-card">
        <h2 className="rail-heading mb-3">How Annotated works</h2>
        <div className="flex flex-col gap-3">
          {[
            ['01', 'Find the moment', 'A sentence, screenshot, or timestamp worth keeping.'],
            ['02', 'Add your angle', 'React, explain, fact-check, or steelman it.'],
            ['03', 'Open the floor', 'Let other people bring the missing context.'],
          ].map(([number, title, text]) => (
            <div key={number} className="flex gap-3">
              <span className="step-number">{number}</span>
              <div>
                <p className="text-xs font-semibold text-text-primary">{title}</p>
                <p className="text-[11px] text-text-secondary leading-relaxed mt-0.5">{text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <footer className="rail-footer">
        <span>Open source community notes</span>
        <a href="https://github.com/e-isdl/annotated-extension" target="_blank" rel="noopener noreferrer">GitHub ↗</a>
      </footer>
    </aside>
  );
}
