import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { annotationLimitFor } from '../lib/annotationLimits';

export function EditAnnotationMenuItem({ onEdit }) {
  return (
    <button
      type="button"
      className="w-full text-left text-[11px] px-2 py-1.5 rounded-md text-text-secondary hover:text-text-primary hover:bg-bg-raised transition-colors"
      onClick={onEdit}
    >
      Edit
    </button>
  );
}

export default function AnnotationEditForm({ clipId, annotationType, text, onSaved, active, onDone }) {
  const [value, setValue] = useState(() => String(text || '').trim());
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
    if (next === current) { onDone?.(); return; }

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
    onDone?.();
  }

  function cancel() {
    setValue(current);
    setError('');
    onDone?.();
  }

  if (!active) return null;

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
        <span className={`text-xs ${value.trim().length > limit * 0.9 ? 'text-[var(--red)]' : 'text-text-muted'}`}>{value.trim().length}/{limit}</span>
        <div className="flex gap-2">
          <button type="button" className="btn-ghost text-xs py-1.5 px-3" onClick={cancel}>Cancel</button>
          <button type="submit" className="btn-primary text-xs py-1.5 px-3" disabled={saving || unchanged}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
      {error && <p className="text-xs text-[var(--red)]" role="alert">{error}</p>}
    </form>
  );
}
