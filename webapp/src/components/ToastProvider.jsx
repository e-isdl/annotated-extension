import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback((message, tone = 'neutral') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const action = /^Sign in\b/i.test(message) ? {
      label: 'Sign in',
      run: () => supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${window.location.origin}/auth/callback` } }),
    } : null;
    setToasts((current) => [...current, { id, message, tone, action }].slice(-3));
    window.setTimeout(() => dismiss(id), 2400);
    return id;
  }, [dismiss]);

  const value = useMemo(() => ({ push, dismiss }), [push, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-region" aria-live="polite" aria-atomic="true">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast-${toast.tone}`} role="status">
            <span>{toast.message}</span>
            {toast.action && <button type="button" className="toast-action" onClick={() => { toast.action.run(); dismiss(toast.id); }}>{toast.action.label}</button>}
            <button type="button" onClick={() => dismiss(toast.id)} aria-label="Dismiss notification">×</button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside ToastProvider');
  return context;
}
