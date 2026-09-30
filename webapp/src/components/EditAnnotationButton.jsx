import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { annotationLimitFor } from '../lib/annotationLimits';

export default function EditAnnotationButton({ clipId, annotationType, text, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const limit = annotationLimitFor(annotationType);
  const current = String(text || '').trim();
  const unchanged = value.trim() === current;

  async function save(event) {
    event.preventDefault();
    const next = value.trim();
    if (!next) { setError('The annotation cannot be empty. Use Delete on the post instead.'); return; }
    if (next.length > limit) { setError(`This annotation is limited to ${limit} characters.`); return; }
    if (next === current) { setEditing(false); return; }

    setSaving(true);
    setError('');
    const { error: rpcError } = await supabase.rpc('update_annotation', {
      p_clip_id: clipId,
      p_text: next,
    });
    setSaving(false);
    if (rpcError) {
      setError(
        /Could not find the function|PGRST202/i.test(rpcError.message)
          ? 'Editing needs the latest database patch. Ask the admin to apply sql/2026-09-30-update-annotation.sql.'
          : (rpcError.message || 'Could not save the edit. Try again.')
      );
      return;
    }
    onSaved?.(next);
    setEditing(false);
  }

  if (!editing) {
    return (
      <button
        type="button"
        className="post-action annotation-edit-trigger"
        onClick={() => { setValue(String(text || '')); setError(''); setEditing(true); }}
      >
        <svg className="post-action-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
        </svg>
        <span>Edit</span>
      </button>
    );
  }

  return (
    <form className="annotation-edit-form" onSubmit={save}>
      <textarea
        className="input resize-none"
        rows={4}
        autoFocus
        maxLength={limit + 50}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        aria-label="Edit annotation"
      />
      <div className="annotation-edit-footer">
        <span className={`text-xs ${value.trim().length > limit * 0.9 ? 'text-red-400' : 'text-text-muted'}`}>{value.trim().length}/{limit}</span>
        <div className="flex gap-2">
          <button type="button" className="btn-ghost text-xs py-1.5 px-3" onClick={() => setEditing(false)}>Cancel</button>
          <button type="submit" className="btn-primary text-xs py-1.5 px-3" disabled={saving || unchanged}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
      {error && <p className="text-xs text-red-400" role="alert">{error}</p>}
    </form>
  );
}
