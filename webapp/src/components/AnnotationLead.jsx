import { Link } from 'react-router-dom';
import Avatar from './Avatar';

export default function AnnotationLead({ text, profile, annotationType = 'Annotation', asHeading = false, showType = true, showAuthor = true }) {
  if (!text) return null;

  const Copy = asHeading ? 'h1' : 'p';

  return (
    <section className="annotation-lead" aria-label="Author annotation">
      {showType && <div className="annotation-lead-kicker">
        <span className="badge badge-article">{annotationType}</span>
      </div>}
      {showAuthor && (
        <div className="annotation-lead-author">
          <Link to={profile?.handle ? `/u/${profile.handle}` : '#'} className="no-underline">
            <Avatar profile={profile} size="sm" />
          </Link>
          <Link to={profile?.handle ? `/u/${profile.handle}` : '#'} className="annotation-lead-handle no-underline">
            {profile?.handle || 'anonymous'}
          </Link>
        </div>
      )}
      <Copy className="annotation-lead-copy" data-tour="web-cliptitle">{text}</Copy>
    </section>
  );
}
