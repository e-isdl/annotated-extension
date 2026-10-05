import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import ClipCard from '../components/ClipCard';

export default function SourcePage() {
  const { domain } = useParams();
  const decodedDomain = decodeURIComponent(domain || '');
  const [clips, setClips] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function load() {
      const { data } = await supabase
        .from('clips_with_scores')
        .select('*, profiles(*), annotations(id, text_content, audio_url), communities(slug, name)')
        .eq('source_domain', decodedDomain)
        .order('best_score', { ascending: false, nullsFirst: false })
        .limit(50);
      if (active) { setClips(data || []); setLoading(false); }
    }
    load();
    return () => { active = false; };
  }, [decodedDomain]);

  return (
    <section className="section-page source-page">
      <Link to="/explore" className="back-link">← Explore</Link>
      <p className="eyebrow">Source domain</p>
      <h1 className="section-title">{decodedDomain}</h1>
      <p className="section-subtitle">Annotations that keep this source in view.</p>
      {loading ? <div className="post-card post-skeleton" /> : clips.length ? <div className="feed-list">{clips.map((clip) => <ClipCard key={clip.id} autoPlayVideo clip={{ ...clip, community_name: clip.community_name || clip.communities?.name, community_slug: clip.community_slug || clip.communities?.slug }} />)}</div> : <div className="empty-state compact-empty"><h2 className="text-lg font-semibold text-text-primary">No annotations yet.</h2><Link to="/create" className="btn-primary">Start one</Link></div>}
    </section>
  );
}
