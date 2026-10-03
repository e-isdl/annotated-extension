import { useState, useEffect, useCallback, useRef } from 'react';
import YouTubeClipper from './YouTubeClipper';
import ArticleClipper from './ArticleClipper';
import TweetClipper from './TweetClipper';
import PodcastClipper from './PodcastClipper';
import AnnotationForm from './AnnotationForm';
import SuccessScreen from './SuccessScreen';
import FlowHeader from './FlowHeader';
import { supabase } from '../lib/supabase';
import { createExtensionPost, updateClipVideoUrl } from '../lib/postPublishing';
import { pageIdentity } from '../lib/pageInfo';

const MAX_CLIP_BYTES = 15 * 1024 * 1024;

async function uploadRecordedClip(supabase, recorded, clipId) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('not signed in');
    if (!recorded?.blob || recorded.blob.size === 0) throw new Error('empty recording');
    const ext = (recorded.mime || '').includes('mp4') ? 'mp4' : 'webm';
    const contentType = recorded.mime || (ext === 'mp4' ? 'video/mp4' : 'video/webm');
    const filename = `clips/recordings/${user.id}/${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from('clips').upload(filename, recorded.blob, { contentType });
    if (uploadError) throw uploadError;
    const publicUrl = supabase.storage.from('clips').getPublicUrl(filename).data.publicUrl;
    await updateClipVideoUrl(supabase, clipId, publicUrl, 'ready');
    return true;
  } catch (e) {
    console.error('[annotated] recorded clip upload failed:', e);
    try { await updateClipVideoUrl(supabase, clipId, null, 'failed'); } catch (e2) {}
    return false;
  }
}

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
  const [embedRequest, setEmbedRequest] = useState(0);
  const [theme, setTheme] = useState(() => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'));
  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.dataset.theme = next;
    localStorage.setItem('annotated-theme', next);
  };

  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const avatarMenuRef = useRef(null);
  useEffect(() => {
    if (!avatarMenuOpen) return;
    const onPointerDown = (event) => {
      if (avatarMenuRef.current && !avatarMenuRef.current.contains(event.target)) setAvatarMenuOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setAvatarMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [avatarMenuOpen]);
  const [profile, setProfile] = useState(null);
  useEffect(() => {
    if (!session?.user?.id) {
      setProfile(null);
      return;
    }
    let cancelled = false;
    supabase.from('profiles')
      .select('avatar_url, display_name')
      .eq('id', session.user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setProfile(data || null);
      })
      .catch(() => {
        if (!cancelled) setProfile(null);
      });
    return () => { cancelled = true; };
  }, [session?.user?.id]);
  const avatarUrl = profile?.avatar_url
    || session?.user?.user_metadata?.avatar_url
    || session?.user?.user_metadata?.picture
    || null;
  const avatarName = profile?.display_name || session?.user?.user_metadata?.full_name || session?.user?.email || '';
  const avatarInitial = avatarName.trim().charAt(0).toUpperCase() || '?';
  const [transcriptCache, setTranscriptCache] = useState(null);
  const [currentTranscript, setCurrentTranscript] = useState(null);
  const [uploadState, setUploadState] = useState({ status: 'idle', error: null });
  const recordedRef = useRef(null);
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
    setUploadState({ status: 'idle', error: null });
    recordedRef.current = null;
  }, [pageKey]);

  const handleClipReady = useCallback((data) => {
    setClipData(data);
    setCurrentTranscript(null);
    setStep('annotate');
  }, []);

  const clearPageHighlight = () => {
    try {
      chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
        if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: 'CLEAR_HIGHLIGHT' }).catch(() => {});
      });
    } catch (e) {}
  };

  const handlePublish = async (annotationData) => {
    const stage = annotationData.onStage || (() => {});
    const recorded = clipData.recorded_clip;
    if (recorded?.blob && recorded.blob.size > MAX_CLIP_BYTES) {
      const err = new Error('This clip is too big. Record a shorter one.');
      err.code = 'clip_too_big';
      throw err;
    }
    stage('creating');
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
      video_url: null,
      video_status: recorded?.blob ? 'uploading' : 'ready',
    });

    if (recorded?.blob) {
      recordedRef.current = recorded;
      setUploadState({ status: 'uploading', error: null });
      uploadRecordedClip(supabase, recorded, clip.id).then((ok) => {
        setUploadState(ok
          ? { status: 'ready', error: null }
          : { status: 'failed', error: 'Upload failed. Check your connection and retry.' });
      });
    } else {
      recordedRef.current = null;
      setUploadState({ status: 'idle', error: null });
    }

    let published = clip;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: prof } = await supabase.from('profiles').select('handle').eq('id', user.id).maybeSingle();
      if (prof?.handle) published = { ...clip, handle: prof.handle };
    } catch {}
    setPublishedClip(published);
    setStep('success');
    clearPageHighlight();
  };

  const useEmbedInstead = () => {
    setEmbedRequest((v) => v + 1);
    setStep('clip');
  };

  const retryUpload = () => {
    const recorded = recordedRef.current;
    const clipId = publishedClip?.id;
    if (!recorded?.blob || !clipId) return;
    setUploadState({ status: 'uploading', error: null });
    uploadRecordedClip(supabase, recorded, clipId).then((ok) => {
      setUploadState(ok
        ? { status: 'ready', error: null }
        : { status: 'failed', error: 'Upload failed. Check your connection and retry.' });
    });
  };

  const renderClipper = () => {
    if (!pageInfo) return <div className="p-4 text-text-muted text-sm">Navigate to a page to start clipping.</div>;
    switch (pageInfo.type) {
      case 'youtube': return <YouTubeClipper key={pageKey} pageInfo={pageInfo} onReady={handleClipReady} published={step === 'success'} embedRequest={embedRequest} />;
      case 'article': return <ArticleClipper key={pageKey} pageInfo={pageInfo} onReady={handleClipReady} />;
      case 'x': return <TweetClipper key={pageKey} pageInfo={pageInfo} onReady={handleClipReady} />;
      case 'podcast': return <PodcastClipper key={pageKey} pageInfo={pageInfo} onReady={handleClipReady} />;
      default: return <UnsupportedPage />;
    }
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <header className="flex items-center justify-between h-14 px-5 border-b border-border-subtle shrink-0">
        <div className="flex items-center gap-2.5">
          <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-accent text-white font-bold text-sm select-none">A</span>
          <span className="font-bold text-[18px] tracking-tight text-text-primary">Annotated</span>
        </div>
        <div className="flex items-center gap-2 relative" ref={avatarMenuRef}>
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            title={theme === 'dark' ? 'Light theme' : 'Dark theme'}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-text-secondary hover:text-text-primary hover:bg-bg-raised transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--focus)] focus-visible:ring-offset-[var(--bg)]"
          >
            {theme === 'dark' ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41m11.32-11.32 1.41-1.41"/></svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
            )}
          </button>
          <button
            type="button"
            onClick={() => setAvatarMenuOpen((open) => !open)}
            aria-haspopup="menu"
            aria-expanded={avatarMenuOpen}
            aria-label="Account menu"
            className="w-9 h-9 rounded-full overflow-hidden border border-border bg-bg-raised flex items-center justify-center hover:border-border-strong transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--focus)] focus-visible:ring-offset-[var(--bg)]"
          >
            <span className="relative w-full h-full flex items-center justify-center">
              <span className="text-sm font-bold text-text-secondary">{avatarInitial}</span>
              {avatarUrl && (
                <img
                  src={avatarUrl}
                  alt=""
                  onError={(event) => { event.currentTarget.style.display = 'none'; }}
                  className="absolute inset-0 w-full h-full object-cover"
                />
              )}
            </span>
          </button>
          {avatarMenuOpen && (
            <div role="menu" className="absolute right-0 top-full mt-1.5 min-w-[150px] rounded-xl border border-border bg-bg-surface shadow-lg py-1 z-50">
              <button
                type="button"
                role="menuitem"
                onClick={() => supabase.auth.signOut()}
                className="w-full text-left px-4 py-2.5 text-sm font-medium text-text-primary hover:bg-bg-raised transition-colors focus-visible:outline-none focus-visible:bg-bg-raised"
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </header>

      {step !== 'success' && (
        <FlowHeader step={step} pageInfo={pageInfo} />
      )}

      <div className="flex-1 overflow-y-auto">
        <div style={{ display: step === 'clip' ? 'block' : 'none' }}>
          {renderClipper()}
        </div>
        <div style={{ display: step === 'annotate' ? 'block' : 'none' }}>
          {clipData && <AnnotationForm clipData={clipData} onBack={() => setStep('clip')} onPublish={handlePublish} onUseEmbed={useEmbedInstead} transcriptCache={transcriptCache} setTranscriptCache={setTranscriptCache} onTranscriptChange={setCurrentTranscript} communities={communities} communityId={communityId} onCommunityChange={setCommunityId} />}
        </div>
        {step === 'success' && <SuccessScreen clip={publishedClip} uploadState={uploadState} onRetryUpload={retryUpload} onReset={() => { setStep('clip'); setClipData(null); }} />}
      </div>
    </div>
  );
}

function UnsupportedPage() {
  return (
    <div className="flex flex-col items-center justify-center h-48 px-6 gap-2 text-center">
      <span className="text-2xl">📎</span>
      <p className="text-sm text-text-secondary">This page type isn't supported yet.</p>
        <p className="text-xs text-text-muted">Navigate to a YouTube video, X post, news article, or podcast page.</p>
    </div>
  );
}
