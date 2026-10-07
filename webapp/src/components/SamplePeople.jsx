import { Link } from 'react-router-dom';
import Avatar from './Avatar';
import { SAMPLE_PEOPLE } from '../lib/samplePeople';

// Sample people rows (sidebar-link style) linking to their demo profiles.
export default function SamplePeople({ limit = 10, exclude = null }) {
  const skip = String(exclude || '').toLowerCase();
  const rows = SAMPLE_PEOPLE.filter((p) => p.handle.toLowerCase() !== skip).slice(0, Math.max(limit, 1));
  return (
    <>
      {rows.map((p) => (
        <Link
          key={p.handle}
          to={`/u/${p.handle}`}
          className="sidebar-link"
        >
          <Avatar profile={{ handle: p.handle, display_name: p.name, avatar_url: p.pfp }} size="dot" />
          <span className="min-w-0 flex-1 truncate">{p.name}</span>
          <span className="text-[11px] text-text-muted shrink-0">@{p.handle}</span>
        </Link>
      ))}
    </>
  );
}
