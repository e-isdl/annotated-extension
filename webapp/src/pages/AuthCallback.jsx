import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        navigate('/');
        return;
      }
      // Fallback: parse hash manually if getSession misses it
      const hash = window.location.hash;
      if (hash && hash.includes('access_token')) {
        const params = new URLSearchParams(hash.substring(1));
        const accessToken = params.get('access_token');
        const refreshToken = params.get('refresh_token');
        if (accessToken && refreshToken) {
          // Tokens must not linger in the URL: they survive in browser history
          // and are visible on screen shares. Consume them as soon as they are
          // handed to the Supabase client.
          window.history.replaceState(null, '', window.location.pathname + window.location.search);
          supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
            .then(() => navigate('/'));
          return;
        }
      }
      navigate('/');
    });
  }, [navigate]);

  return (
    <div className="flex items-center justify-center py-20">
      <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
