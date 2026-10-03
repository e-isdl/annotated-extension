import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { postHref } from '../lib/links';

export default function ClaimPage() {
  const { id } = useParams();
  const [claim, setClaim] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function load() {
      const { data } = await supabase
        .from('claims')
        .select('id, reason, created_at, clips(id, slug, title, communities(slug))')
        .eq('id', id)
        .maybeSingle();
      if (active) { setClaim(data); setLoading(false); }
    }
    load();
    return () => { active = false; };
  }, [id]);

  if (loading) return <div className="section-page"><p className="text-sm text-text-muted">Loading claim…</p></div>;
  if (!claim) return <div className="empty-state"><h1 className="text-xl font-semibold">Claim not found</h1><p className="text-sm text-text-secondary">This claim may be private or no longer available.</p></div>;

  const clip = claim.clips;
  return (
    <article className="section-page claim-page">
      <Link to={clip ? postHref(clip) : '/'} className="back-link">← Back to post</Link>
      <p className="eyebrow">Source claim</p>
      <h1 className="section-title">Claim about {clip?.title || 'this annotation'}</h1>
      <p className="section-subtitle">Filed {new Date(claim.created_at).toLocaleDateString()}</p>
      <div className="claim-thread-card">
        <p className="text-sm text-text-primary leading-relaxed">{claim.reason}</p>
        <p className="text-xs text-text-muted mt-4">This is a source or copyright claim, separate from reports about community conduct.</p>
      </div>
    </article>
  );
}
