import { useEffect, useState, useRef } from 'react';
import { supabase } from './lib/supabase';
import Auth from './components/Auth';
import ClipCreator from './components/ClipCreator';

export default function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pageInfo, setPageInfo] = useState(null);
  const retryRef = useRef(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });
    supabase.auth.onAuthStateChange((_event, session) => setSession(session));
  }, []);

  useEffect(() => {
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
    fetchPageInfo();
    retryRef.current = setInterval(fetchPageInfo, 1000);
    return () => clearInterval(retryRef.current);
  }, []);

  if (loading) return <div className="flex items-center justify-center h-screen bg-bg-base">
    <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
  </div>;

  return (
    <div className="min-h-screen bg-bg-base text-text-primary font-ui">
      {!session ? <Auth /> : <ClipCreator pageInfo={pageInfo} session={session} />}
    </div>
  );
}
