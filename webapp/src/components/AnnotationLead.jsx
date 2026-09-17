import { Link } from 'react-router-dom';
import Avatar from './Avatar';

export default function AnnotationLead({ text, profile, annotationType = 'Annotation' }) {
  if (!text) return null;

  return (
    <section className="annotation-lead" aria-label="Author annotation">
      <div className="annotation-lead-kicker">
        <span className="annotation-lead-label">ANNOTATION</span>
        <span className="badge badge-article">{annotationType}</span>
      </div>
      <div className="annotation-lead-author">
        <Link to={profile?.handle ? `/u/${profile.handle}` : '#'} className="no-underline">
          <Avatar profile={profile} size="sm" />
        </Link>
        <Link to={profile?.handle ? `/u/${profile.handle}` : '#'} className="annotation-lead-handle no-underline">
          @{profile?.handle || 'anonymous'}
        </Link>
        <span className="annotation-lead-meta">adds context</span>
      </div>
      <p>{text}</p>
    </section>
  );
}
