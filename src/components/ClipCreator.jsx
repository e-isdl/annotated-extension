import { useState, useEffect, useCallback } from 'react';
import YouTubeClipper from './YouTubeClipper';
import ArticleClipper from './ArticleClipper';
import PodcastClipper from './PodcastClipper';
import AnnotationForm from './AnnotationForm';
import SuccessScreen from './SuccessScreen';
import { supabase } from '../lib/supabase';
import { createExtensionPost } from '../lib/postPublishing';
import { pageIdentity } from '../lib/pageInfo';

function generateSlug(title) {
  if (!title) return Math.random().toString(36).slice(2, 10);

  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60)
    + '-' + Math.random().toString(36).slice(2, 7);
}

export default function ClipCreator({ pageInfo, session }) {
  const [step, setStep] = useState('clip');
  const [clipData, setClipData] = useState(null);
  const [publishedClip, setPublishedClip] = useState(null);
  const [transcriptCache, setTranscriptCache] = useState(null);
  const [currentTranscript, setCurrentTranscript] = useState(null);
  const [communities, setCommunities] = useState([]);
  const [communityId, setCommunityId] = useState('');

  useEffect(() => {
    let active = true;
    supabase.from('communities').select('id, slug, name').order('name')
      .then(({ data, error }) => {
        if (active && !error) setCommunities(data || []);
      })
      .catch(() => { if (active) setCommunities([]); });
    return () => { active = false; };
  }, []);

  const pageKey = pageIdentity(pageInfo);

  useEffect(() => {
    setStep('clip');
    setClipData(null);
    setPublishedClip(null);
    setCurrentTranscript(null);
  }, [pageKey]);

  const handleClipReady = useCallback((data) => {
    setClipData(data);
    setCurrentTranscript(null);
    setStep('annotate');
  }, []);

  const handlePublish = async (annotationData) => {
    const sourceUrl = clipData.source_url;
    const sourceDomain = sourceUrl ? new URL(sourceUrl).hostname.replace(/^www\./, '') : null;
    const clip = await createExtensionPost(supabase, {
      community_id: communityId || null,
      title: clipData.title,
      source_url: sourceUrl,
      source_type: clipData.source_type,
      source_domain: sourceDomain,
      source_title: clipData.title,
      author: clipData.author || null,
      thumbnail: clipData.thumbnail || null,
      youtube_id: clipData.youtube_id || null,
      source_audio_url: clipData.source_type === 'podcast' ? clipData.audio_url : null,
      transcript: currentTranscript || null,
      annotation_type: annotationData.annotation_type,
      article_text: clipData.article_text || null,
      start_sec: clipData.start_sec ?? null,
      end_sec: clipData.end_sec ?? null,
      duration: clipData.duration ?? null,

      slug: generateSlug(clipData.title),
      annotation_text: annotationData.text_content,
      annotation_audio_url: annotationData.audio_url,
    });

    setPublishedClip(clip);
    setStep('success');
  };

  const renderClipper = () => {
    if (!pageInfo) return <div className="p-4 text-text-muted text-sm">Navigate to a page to start clipping.</div>;
    switch (pageInfo.type) {
      case 'youtube': return <YouTubeClipper key={pageKey} pageInfo={pageInfo} onReady={handleClipReady} />;
      case 'article': return <ArticleClipper key={pageKey} pageInfo={pageInfo} onReady={handleClipReady} />;
      case 'podcast': return <PodcastClipper key={pageKey} pageInfo={pageInfo} onReady={handleClipReady} />;
      default: return <UnsupportedPage />;
    }
  };

  const getStepLabel = (stepName) => {
    if (stepName === 'annotate') return 'Annotate';
    if (!pageInfo) return 'Select clip';
    switch (pageInfo.type) {
      case 'youtube': return 'Select range';
      case 'article': return 'Select text';
      case 'podcast': return 'Select range';
      default: return 'Select clip';
    }
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <header className="flex items-center justify-between px-4 py-3 border-b border-border-subtle shrink-0">
        <span className="font-bold text-sm tracking-tight text-text-primary">Annotated</span>
        <div className="flex items-center gap-3">
          <button
            onClick={() => supabase.auth.signOut()}
            className="text-xs text-text-muted hover:text-text-secondary transition-colors"
          >Sign out</button>
        </div>
      </header>

      {step !== 'success' && (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-border-subtle bg-bg-surface shrink-0">
          {['clip', 'annotate'].map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              {i > 0 && <div className="w-6 h-px bg-border" />}
              <div className={`flex items-center gap-1.5 text-xs font-medium ${step === s ? 'text-accent' : step === 'annotate' && s === 'clip' ? 'text-text-muted' : 'text-text-muted'}`}>
                <div className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] ${step === s ? 'bg-accent text-bg-base' : 'bg-bg-raised text-text-muted'}`}>
                  {i + 1}
                </div>
                {getStepLabel(s)}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        <div style={{ display: step === 'clip' ? 'block' : 'none' }}>
          {renderClipper()}
        </div>
        <div style={{ display: step === 'annotate' ? 'block' : 'none' }}>
          {clipData && <AnnotationForm clipData={clipData} onBack={() => setStep('clip')} onPublish={handlePublish} transcriptCache={transcriptCache} setTranscriptCache={setTranscriptCache} onTranscriptChange={setCurrentTranscript} communities={communities} communityId={communityId} onCommunityChange={setCommunityId} />}
        </div>
        {step === 'success' && <SuccessScreen clip={publishedClip} onReset={() => { setStep('clip'); setClipData(null); }} />}
      </div>
    </div>
  );
}

function UnsupportedPage() {
  return (
    <div className="flex flex-col items-center justify-center h-48 px-6 gap-2 text-center">
      <span className="text-2xl">📎</span>
      <p className="text-sm text-text-secondary">This page type isn't supported yet.</p>
      <p className="text-xs text-text-muted">Navigate to a YouTube video, news article, or podcast page.</p>
    </div>
  );
}
