import { useState, useEffect } from 'react';

const APIFY_DOCS_URL = 'https://console.apify.com/account/integrations';

export default function Settings({ onClose }) {
  const [apiKey, setApiKey] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    chrome.storage.local.get('apify_api_key', (result) => {
      if (result.apify_api_key) setApiKey(result.apify_api_key);
    });
  }, []);

  const save = () => {
    chrome.storage.local.set({ apify_api_key: apiKey.trim() }, () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  };

  return (
    <div className="absolute inset-0 z-50 bg-bg-base flex flex-col">
      <header className="flex items-center justify-between px-4 py-3 border-b border-border-subtle shrink-0">
        <span className="font-bold text-sm tracking-tight text-text-primary">Settings</span>
        <button onClick={onClose} className="text-xs text-text-muted hover:text-text-secondary transition-colors">Done</button>
      </header>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        <div className="bg-bg-surface border border-border rounded-lg p-4 flex flex-col gap-3">
          <p className="text-xs font-medium text-text-primary">Apify API Key</p>
          <p className="text-[11px] text-text-muted leading-relaxed">
            Required for YouTube transcript extraction. Free tier available.
          </p>

          <ol className="text-[11px] text-text-muted leading-relaxed list-decimal list-inside flex flex-col gap-1.5">
            <li>Go to <a href={APIFY_DOCS_URL} target="_blank" rel="noopener noreferrer" className="text-accent-text hover:text-accent underline">apify.com/account/integrations</a></li>
            <li>Sign up or log in</li>
            <li>Copy your API Token</li>
            <li>Paste it below</li>
          </ol>

          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="apify_api_..."
            className="input text-xs py-2"
          />

          <button
            onClick={save}
            disabled={!apiKey.trim()}
            className="btn-primary text-xs py-2 disabled:opacity-40"
          >
            {saved ? 'Saved!' : 'Save Key'}
          </button>

          {apiKey && (
            <p className="text-[10px] text-success">Key stored locally in your browser.</p>
          )}
        </div>

        <p className="text-[10px] text-text-muted text-center">
          Your key is stored in chrome.storage and never sent anywhere except Apify.
        </p>
      </div>
    </div>
  );
}
