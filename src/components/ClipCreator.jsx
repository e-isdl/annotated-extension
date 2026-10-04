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
import { listDrafts, deleteDraft } from '../lib/drafts';
import DraftsScreen from './DraftsScreen';
import { pageIdentity } from '../lib/pageInfo';

const MAX_CLIP_BYTES = 15 * 1024 * 1024;
const UPLOAD_TIMEOUT_MS = 180000;

async function uploadClipFile(supabase, recorded) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('not signed in');
  if (!recorded?.blob || recorded.blob.size === 0) throw new Error('empty recording');
  const ext = (recorded.mime || '').includes('mp4') ? 'mp4' : 'webm';
  const contentType = recorded.mime || (ext === 'mp4' ? 'video/mp4' : 'video/webm');
  const filename = `clips/recordings/${user.id}/${Date.now()}.${ext}`;
  const { error: uploadError } = await supabase.storage.from('clips').upload(filename, recorded.blob, { contentType });
  if (uploadError) throw uploadError;
  return supabase.storage.from('clips').getPublicUrl(filename).data.publicUrl;
}

async function uploadRecordedClip(supabase, recorded, clipId) {
  const doUpload = async () => {
    try {
      const publicUrl = await uploadClipFile(supabase, recorded);
      await updateClipVideoUrl(supabase, clipId, publicUrl, 'ready');
      return true;
    } catch (e) {
      console.error('[annotated] recorded clip upload failed:', e);
      try { await updateClipVideoUrl(supabase, clipId, null, 'failed'); } catch (e2) {}
      return false;
    }
  };
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(async () => {
      try { await updateClipVideoUrl(supabase, clipId, null, 'failed'); } catch {}
      resolve(false);
    }, UPLOAD_TIMEOUT_MS);
  });
  try {
    return await Promise.race([doUpload(), timeout]);
  } finally {
    clearTimeout(timer);
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
  const [drafts, setDrafts] = useState([]);
  const [draftsLoading, setDraftsLoading] = useState(false);
  const [currentDraftId, setCurrentDraftId] = useState(null);
  const [resumeRange, setResumeRange] = useState(null);
  const [resumeForm, setResumeForm] = useState(null);
  const [formToken, setFormToken] = useState(0);
  const [passageFallback, setPassageFallback] = useState(false);
  const recordedRef = useRef(null);
  const pendingResumeRef = useRef(null);

  const pageKey = pageIdentity(pageInfo);

  const draftSessionKey = `annotated:draft:${pageKey}`;
  const draftSessionGet = async () => {
    try {
      if (!chrome?.storage?.session) return null;
      const result = await chrome.storage.session.get(draftSessionKey);
      return result?.[draftSessionKey] ?? null;
    } catch { return null; }
  };
  const draftSessionSet = (id) => {
    try { chrome?.storage?.session?.set({ [draftSessionKey]: id }); } catch {}
  };
  const draftSessionRemove = () => {
    try { chrome?.storage?.session?.remove(draftSessionKey); } catch {}
  };
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

  const enterAnnotate = (pending) => {
    setClipData(pending.clipPayload);
    setCurrentTranscript(null);
    if (pending.communityId) setCommunityId(pending.communityId);
    setCurrentDraftId(pending.draftId);
    draftSessionSet(pending.draftId);
    setResumeRange(null);
    setResumeForm(pending.form || null);
    setFormToken((t) => t + 1);
    setPassageFallback(false);
    setStep('annotate');
  };

  useEffect(() => {
    const pending = pendingResumeRef.current;
    if (pending && pageInfo && pageInfo.url === pending.sourceUrl) {
      pendingResumeRef.current = null;
      enterAnnotate(pending);
      restoreArticleHighlight(pending.passage);
      return;
    }
    setStep('clip');
    setClipData(null);
    setPublishedClip(null);
    setCurrentTranscript(null);
    setUploadState({ status: 'idle', error: null });
    setCurrentDraftId(null);
    setResumeRange(null);
    setResumeForm(null);
    setPassageFallback(false);
    recordedRef.current = null;
  }, [pageKey]);
  const handleClipReady = useCallback((data) => {
    setClipData(data);
    setCurrentTranscript(null);
    setResumeRange(null);
    setResumeForm(null);
    setFormToken((t) => t + 1);
    setStep('annotate');
  }, []);

  const loadDrafts = useCallback(async () => {
    if (!session?.user) { setDrafts([]); return; }
    setDraftsLoading(true);
    try {
      setDrafts(await listDrafts(supabase));
    } catch {
      setDrafts([]);
    } finally {
      setDraftsLoading(false);
    }
  }, [session?.user?.id]);

  const openDrafts = () => {
    setStep('drafts');
    loadDrafts();
  };

  const restoreArticleHighlight = async (passage) => {
    if (!passage) return;
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) { setPassageFallback(true); return; }
      const res = await chrome.tabs.sendMessage(tab.id, { type: 'RESTORE_HIGHLIGHT', text: passage }).catch(() => null);
      setPassageFallback(!res?.ok);
    } catch {
      setPassageFallback(true);
    }
  };

  const continueDraft = async (draft) => {
    const p = draft.payload || {};
    const sourceType = p.sourceType || 'article';
    const clipPayload = {
      source_url: draft.source_url,
      source_type: sourceType,
      title: draft.title || '',
      author: p.author || null,
      thumbnail: draft.thumbnail_url || null,
      youtube_id: p.youtubeId || null,
      article_text: p.articlePassage || null,
      start_sec: p.startSec ?? null,
      end_sec: p.endSec ?? null,
      duration: p.duration ?? null,
      audio_url: p.audioUrl || null,
    };
    const pending = {
      draftId: draft.id,
      sourceUrl: draft.source_url,
      clipPayload,
      communityId: draft.community_id || null,
      passage: sourceType === 'article' ? (p.articlePassage || null) : null,
      form: {
        text: p.commentary || '',
        annotationType: p.kind || 'Reaction',
        audioUrl: p.audioUrl || null,
      },
    };
    if (sourceType === 'youtube' && p.mode === 'record') {
      setCurrentDraftId(draft.id);
      draftSessionSet(draft.id);
      setResumeRange(
        p.startSec != null && p.endSec != null ? { start_sec: p.startSec, end_sec: p.endSec } : null,
      );
      setPassageFallback(false);
      setClipData(clipPayload);
      setCurrentTranscript(null);
      if (draft.community_id) setCommunityId(draft.community_id);
      setStep('clip');
      return;
    }
    if (sourceType === 'article') {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.id && tab.url !== draft.source_url) {
          pendingResumeRef.current = pending;
          await chrome.tabs.update(tab.id, { url: draft.source_url });
          return;
        }
      } catch {
        // fall through to in-place resume
      }
    }
    enterAnnotate(pending);
    if (sourceType === 'article') restoreArticleHighlight(pending.passage);
  };

  const deleteDraftConfirmed = async (id) => {
    try {
      await deleteDraft(supabase, id);
    } catch {}
    if (currentDraftId === id) {
      setCurrentDraftId(null);
      draftSessionRemove();
    }
    loadDrafts();
  };

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
      stage('uploading');
      const ok = await uploadRecordedClip(supabase, recorded, clip.id);
      setUploadState(ok
        ? { status: 'ready', error: null }
        : { status: 'failed', error: 'Upload failed. Check your connection and retry.' });
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
    if (currentDraftId) {
      try { await deleteDraft(supabase, currentDraftId); } catch {}
      setCurrentDraftId(null);
      draftSessionRemove();
      loadDrafts();
    }
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
      case 'youtube': return <YouTubeClipper key={pageKey} pageInfo={pageInfo} onReady={handleClipReady} published={step === 'success'} embedRequest={embedRequest} resumeRange={resumeRange} />;
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
            onClick={openDrafts}
            className="drafts-pill"
            aria-label="Drafts"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </svg>
            <span>Drafts</span>
            {drafts.length > 0 && (
              <span className="draft-count">{drafts.length > 99 ? '99+' : drafts.length}</span>
            )}
          </button>
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

      {step !== 'success' && step !== 'drafts' && (
        <FlowHeader step={step} pageInfo={pageInfo} />
      )}

      <div className="flex-1 overflow-y-auto">
        <div style={{ display: step === 'clip' ? 'block' : 'none' }}>
          {renderClipper()}
        </div>
        <div style={{ display: step === 'annotate' ? 'block' : 'none' }}>
          {clipData && <AnnotationForm key={`${pageKey}-${formToken}`} clipData={clipData} onBack={() => setStep('clip')} onPublish={handlePublish} onUseEmbed={useEmbedInstead} transcriptCache={transcriptCache} setTranscriptCache={setTranscriptCache} onTranscriptChange={setCurrentTranscript} communities={communities} communityId={communityId} onCommunityChange={setCommunityId} draftId={currentDraftId} onDraftIdChange={(id) => { setCurrentDraftId(id); if (id) draftSessionSet(id); }} canAutosave={Boolean(session?.user)} resume={resumeForm} showPassageFallback={passageFallback} onOpenDrafts={openDrafts} />}
        </div>
        {step === 'drafts' && (
          <DraftsScreen
            drafts={drafts}
            loading={draftsLoading}
            signedIn={Boolean(session?.user)}
            onBack={() => setStep(clipData ? 'annotate' : 'clip')}
            onContinue={continueDraft}
            onDeleteConfirmed={deleteDraftConfirmed}
          />
        )}
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
