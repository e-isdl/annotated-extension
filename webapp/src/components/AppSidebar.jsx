import { Link, useLocation } from 'react-router-dom';
import { DEMO_COMMUNITIES } from '../lib/demoData';

const NAV_ITEMS = [
  { label: 'Home', path: '/', icon: '⌂' },
  { label: 'Popular', path: '/?sort=top', icon: '✦' },
  { label: 'Latest', path: '/?sort=new', icon: '◷' },
  { label: 'Explore', path: '/explore', icon: '⌕' },
  { label: 'Saved', path: '/saved', icon: '▱' },
];

export default function AppSidebar() {
  const location = useLocation();
  const isActive = (path) => path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);

  return (
    <aside className="community-sidebar">
      <div className="sidebar-section">
        <p className="sidebar-label">Discover</p>
        <nav className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.label}
              to={item.path}
              className={`sidebar-link ${isActive(item.path) ? 'sidebar-link-active' : ''}`}
            >
              <span className="sidebar-icon">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>
      </div>

      <div className="sidebar-section border-t border-border-subtle pt-5">
        <div className="flex items-center justify-between mb-2">
          <p className="sidebar-label mb-0">Your communities</p>
          <Link to="/explore" className="text-xs text-text-muted hover:text-accent-text">+</Link>
        </div>
        <nav className="flex flex-col gap-1">
          {DEMO_COMMUNITIES.map((community) => (
            <Link key={community.slug} to={`/c/${community.slug}`} className="community-link">
              <span className="community-dot">{community.name[0]}</span>
              <span className="truncate">{community.name}</span>
            </Link>
          ))}
        </nav>
      </div>

      <div className="sidebar-note">
        <span className="text-lg">✎</span>
        <p>Good arguments start with good context.</p>
      </div>
    </aside>
  );
}
