import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useToast } from './ToastProvider';

const REASONS = ['Spam', 'Harassment', 'Off-topic', 'Misleading context', 'Other'];

export default function ReportButton({ clipId }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(REASONS[0]);
  const [details, setDetails] = useState('');
  const [sending, setSending] = useState(false);
  const { push } = useToast();

  async function submit(event) {
    event.preventDefault();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { push('Sign in to report a post.', 'info'); return; }
    setSending(true);
    const { error } = await supabase.from('reports').insert({
      clip_id: clipId,
      reporter_id: user.id,
      reason: `${reason}${details.trim() ? `: ${details.trim()}` : ''}`,
    });
    setSending(false);
    if (error?.code === '23505') {
      push('You already reported this post.', 'info');
      setOpen(false);
      return;
    }
    if (error) { push('Report could not be submitted.', 'error'); return; }
    setOpen(false);
    setDetails('');
    push('Thanks. Your report was submitted for review.', 'info');
  }

  return (
    <div className="report-control">
      <button type="button" className="post-action" onClick={() => setOpen((value) => !value)}>
        <svg className="post-action-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 21V4m0 0h11l-2 4 2 4H5" /></svg>
        <span>Report</span>
      </button>
      {open && <form className="report-popover" onSubmit={submit}>
        <p className="text-xs text-text-secondary">What is wrong with this post?</p>
        <select className="input text-xs" value={reason} onChange={(event) => setReason(event.target.value)}>
          {REASONS.map((item) => <option key={item}>{item}</option>)}
        </select>
        <textarea className="input resize-none text-xs" rows={3} maxLength={1900} value={details} onChange={(event) => setDetails(event.target.value)} placeholder="Optional details" />
        <div className="flex gap-2 justify-end">
          <button type="button" className="btn-ghost text-xs py-1.5 px-3" onClick={() => setOpen(false)}>Cancel</button>
          <button type="submit" className="btn-primary text-xs py-1.5 px-3" disabled={sending}>{sending ? 'Sending…' : 'Submit report'}</button>
        </div>
      </form>}
    </div>
  );
}
