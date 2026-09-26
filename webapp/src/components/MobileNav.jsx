import { Link, useLocation } from 'react-router-dom';

const ITEMS = [
  { label: 'Home', path: '/', icon: '⌂' },
  { label: 'Explore', path: '/explore', icon: '⌕' },
  { label: 'Create', path: '/create', icon: '+' },
  { label: 'Alerts', path: '/notifications', icon: '♧' },
  { label: 'Profile', path: '/u', icon: '○' },
];

export default function MobileNav() {
  const location = useLocation();
  return (
    <nav className="mobile-nav" aria-label="Mobile navigation">
      {ITEMS.map((item) => {
        const active = item.path === '/' ? location.pathname === '/' : location.pathname.startsWith(item.path);
        return <Link key={item.label} to={item.path} className={active ? 'mobile-nav-item mobile-nav-item-active' : 'mobile-nav-item'} aria-current={active ? 'page' : undefined}>
          <span className="mobile-nav-icon" aria-hidden="true">{item.icon}</span>
          <span>{item.label}</span>
        </Link>;
      })}
    </nav>
  );
}
