import { Link } from 'react-router-dom';
import Avatar from './Avatar';

export default function AnnotationLead({ text, profile, annotationType = 'Annotation', asHeading = false }) {
  if (!text) return null;

  const verb = annotationVerb(annotationType);
  const Copy = asHeading ? 'h1' : 'p';

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
        <span className="annotation-lead-meta">{verb}</span>
      </div>
      <Copy className="annotation-lead-copy">{text}</Copy>
    </section>
  );
}

function annotationVerb(type) {
  const value = String(type || '').toLowerCase();
  if (value.includes('fact')) return 'fact-checks';
  if (value.includes('explain')) return 'explains';
  if (value.includes('steel')) return 'steelmans';
  if (value.includes('receipt')) return 'brings receipts';
  if (value.includes('reaction') || value.includes('hot take')) return 'reacts';
  return 'adds context';
}
