import { useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

export default function Auth() {
  const [loadingProvider, setLoadingProvider] = useState(null);
  const [error, setError] = useState('');
  const flowRef = useRef(false);

  const signInWithGoogle = async () => {
    if (flowRef.current) return;
    flowRef.current = true;
    setLoadingProvider('google');
    setError('');

    try {
      const redirectUri = chrome.identity.getRedirectURL();
      const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUri,
          skipBrowserRedirect: true,
          queryParams: { prompt: 'select_account' },
        }
      });
      if (oauthError) throw oauthError;
      if (!data?.url) throw new Error('Supabase did not return a Google sign-in URL.');

      const redirectUrl = await Promise.race([
        new Promise((resolve, reject) => {
          chrome.identity.launchWebAuthFlow({ url: data.url, interactive: true }, (result) => {
            const launchError = chrome.runtime.lastError;
            if (launchError) reject(new Error(launchError.message));
            else if (!result) reject(new Error('Google sign-in was cancelled before it completed.'));
            else resolve(result);
          });
        }),
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error(
            `The sign-in window never came back to the extension. Supabase almost certainly redirected to your website instead — add ${redirectUri} to Authentication → URL Configuration → Redirect URLs, then reload the extension.`
          )), 120000);
        }),
      ]);

      const callback = new URL(redirectUrl);
      const callbackHash = new URLSearchParams(callback.hash.slice(1));
      const callbackParams = new URLSearchParams(callback.search);
      const providerError = callbackParams.get('error_description')
        || callbackParams.get('error')
        || callbackHash.get('error_description')
        || callbackHash.get('error');
      if (providerError) {
        const message = providerError;
        if (/redirect_to.*not allowed|redirect url.*not allowed/i.test(message)) {
          throw new Error(`Supabase is blocking this extension's OAuth callback. Add ${redirectUri} to Authentication → URL Configuration → Redirect URLs.`);
        }
        throw new Error(message);
      }

      const accessToken = callbackHash.get('access_token') || callbackParams.get('access_token');
      const refreshToken = callbackHash.get('refresh_token') || callbackParams.get('refresh_token');
      const code = callbackParams.get('code');
      if (accessToken && refreshToken) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (sessionError) throw sessionError;
      } else if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) throw exchangeError;
      } else {
        throw new Error(`Google returned to Chrome without a session code. Check that ${redirectUri} is allowed in Supabase Auth URL Configuration.`);
      }
    } catch (err) {
      console.error('Sign in error:', err);
      const message = err.message || 'Failed to sign in. Please try again.';
      setError(
        /only one web auth flow/i.test(message)
          ? 'Chrome still has a sign-in window open from an earlier attempt. Close any leftover Google/Annotated window — or restart Chrome — then try again.'
          : message
      );
    } finally {
      flowRef.current = false;
      setLoadingProvider(null);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-screen px-6 gap-6">
      <div className="text-center mb-2">
        <div className="w-10 h-10 rounded-lg bg-accent flex items-center justify-center mx-auto mb-3">
          <span className="text-bg-base font-bold text-lg">A</span>
        </div>
        <h1 className="text-xl font-bold text-text-primary tracking-tight">Annotated</h1>
        <p className="text-sm text-text-secondary mt-1">Clip. Annotate. Share.</p>
      </div>

      {error && (
        <div className="w-full bg-claim/10 border border-claim/20 rounded-lg p-3">
          <p className="text-xs text-claim">{error}</p>
        </div>
      )}

      <div className="w-full flex flex-col gap-3">
        <button 
          onClick={signInWithGoogle} 
          disabled={loadingProvider !== null}
          className="w-full flex items-center justify-center gap-3 bg-accent hover:bg-accent/90 rounded-lg py-3 px-4 text-sm font-medium text-white transition-colors disabled:opacity-50"
        >
          <GoogleIcon />
          {loadingProvider === 'google' ? 'Signing in...' : 'Continue with Google'}
        </button>
      </div>

      <p className="text-xs text-text-muted text-center">
        By continuing, you agree to the annotated.com terms.
      </p>
    </div>
  );
}

function GoogleIcon() {
  return <svg width="18" height="18" viewBox="0 0 18 18">
    <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#fff"/>
    <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.859-3.048.859-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" fill="#fff"/>
    <path d="M3.964 10.705A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.705V4.963H.957A9.005 9.005 0 0 0 0 9c0 1.452.348 2.827.957 4.037l3.007-2.332z" fill="#fff"/>
    <path d="M9 3.583c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.963L3.964 7.295C4.672 5.169 6.656 3.583 9 3.583z" fill="#fff"/>
  </svg>;
}

