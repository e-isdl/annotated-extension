import Avatar from './Avatar';
import { SAMPLE_PEOPLE } from '../lib/samplePeople';

// Sample people rows (sidebar-link style) for discovery surfaces.
export default function SamplePeople({ limit = 10, size = 'dot' }) {
  return (
    <>
      {SAMPLE_PEOPLE.slice(0, Math.max(limit, 1)).map((p) => (
        <a
          key={p.handle}
          href={`https://x.com/${p.handle}`}
          target="_blank"
          rel="noopener noreferrer"
          className="sidebar-link"
        >
          <Avatar profile={{ handle: p.handle, display_name: p.name, avatar_url: p.pfp }} size={size} />
          <span className="min-w-0 flex-1 truncate">{p.name}</span>
          <span className="text-[11px] text-text-muted shrink-0">@{p.handle}</span>
        </a>
      ))}
    </>
  );
}
