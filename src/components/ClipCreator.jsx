import { useState, useEffect } from 'react';
import YouTubeClipper from './YouTubeClipper';
import ArticleClipper from './ArticleClipper';
import PodcastClipper from './PodcastClipper';
import AnnotationForm from './AnnotationForm';
import SuccessScreen from './SuccessScreen';
import { supabase } from '../lib/supabase';

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

  const handleClipReady = (data) => {
    setClipData(data);
    setStep('annotate');
  };

  const handlePublish = async (annotationData) => {
    const { data: clip, error: clipErr } = await supabase
      .from('clips')
      .insert({
        user_id: session.user.id,
        ...clipData,
        slug: generateSlug(clipData.title),
      })
      .select()
      .single();
    if (clipErr) { console.error(clipErr); return; }

    await supabase.from('annotations').insert({
      clip_id: clip.id,
      user_id: session.user.id,
      ...annotationData,
    });

    setPublishedClip(clip);
    setStep('success');
  };

  const renderClipper = () => {
    if (!pageInfo) return <div className="p-4 text-text-muted text-sm">Navigate to a page to start clipping.</div>;
    switch (pageInfo.type) {
      case 'youtube': return <YouTubeClipper pageInfo={pageInfo} onReady={handleClipReady} />;
      case 'article': return <ArticleClipper pageInfo={pageInfo} onReady={handleClipReady} />;
      case 'podcast': return <PodcastClipper pageInfo={pageInfo} onReady={handleClipReady} />;
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
        <button
          onClick={() => supabase.auth.signOut()}
          className="text-xs text-text-muted hover:text-text-secondary transition-colors"
        >Sign out</button>
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
        {step === 'clip' && renderClipper()}
        {step === 'annotate' && <AnnotationForm clipData={clipData} onBack={() => setStep('clip')} onPublish={handlePublish} />}
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
