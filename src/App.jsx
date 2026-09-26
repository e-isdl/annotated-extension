import { useEffect, useState, useRef } from 'react';
import { supabase, supabaseConfigError } from './lib/supabase';
import Auth from './components/Auth';
import ClipCreator from './components/ClipCreator';

export default function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pageInfo, setPageInfo] = useState(null);
  const retryRef = useRef(null);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });
    supabase.auth.onAuthStateChange((_event, session) => setSession(session));
  }, []);

  useEffect(() => {
    if (supabaseConfigError) return;
    const listener = (message) => {
      if (message.type === 'PAGE_INFO') {
        setPageInfo(message.data);
        if (message.data?.type === 'youtube' && message.data?.data?.duration > 0) {
          clearInterval(retryRef.current);
        }
      }
      if (message.type === 'SELECTION_CHANGED' && message.data?.selectedText) {
        setPageInfo(prev => {
          if (!prev || prev.type !== 'article') return prev;
          return {
            ...prev,
            data: { ...prev.data, selectedText: message.data.selectedText }
          };
        });
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  const fetchPageInfo = () => {
    chrome.runtime.sendMessage({ type: 'GET_PAGE_INFO' }, (response) => {
      if (response) {
        setPageInfo(prev => {
          if (!response.data?.duration && prev?.data?.duration) return prev;
          return response;
        });
        if (response.type === 'youtube' && response.data?.duration > 0) {
          clearInterval(retryRef.current);
        }
      }
    });
  };

  useEffect(() => {
    if (supabaseConfigError) return;
    fetchPageInfo();
    retryRef.current = setInterval(fetchPageInfo, 1000);
    return () => clearInterval(retryRef.current);
  }, []);

  if (loading) return <div className="flex items-center justify-center h-screen bg-bg-base">
    <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
  </div>;

  if (supabaseConfigError) return (
    <main className="min-h-screen bg-bg-base text-text-primary font-ui flex items-center justify-center p-6">
      <section className="max-w-sm rounded-xl border border-border bg-bg-surface p-5 text-center">
        <h1 className="text-base font-semibold">Extension setup needed</h1>
        <p className="mt-2 text-sm text-text-secondary">{supabaseConfigError}</p>
      </section>
    </main>
  );

  return (
    <div className="min-h-screen bg-bg-base text-text-primary font-ui">
      {!session ? <Auth /> : <ClipCreator pageInfo={pageInfo} session={session} />}
    </div>
  );
}
