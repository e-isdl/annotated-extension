import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { notify } from '../lib/notifications';

export default function FileClaimButton({ clipId }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async () => {
    if (!reason.trim() || !email.trim()) return;

    const { data: clipData } = await supabase
      .from('clips')
      .select('user_id, title')
      .eq('id', clipId)
      .single();

    const { error } = await supabase.from('claims').insert({
      clip_id: clipId,
      claimant_email: email,
      reason,
    });
    if (error) {
      console.error('Claim failed:', error);
      alert('Failed to submit claim. Please try again.');
      return;
    }

    if (clipData?.user_id) {
      notify({
        userId: clipData.user_id,
        type: 'claim',
        message: `New claim filed on "${clipData.title}" by ${email}: ${reason.slice(0, 100)}`,
        clipId,
      });
    }

    setSubmitted(true);
    setTimeout(() => { setOpen(false); setSubmitted(false); setReason(''); setEmail(''); }, 2500);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="text-[11px] text-text-muted hover:text-text-secondary transition-colors"
      >
        File a claim
      </button>

      {open && (
        <div className="absolute bottom-full right-0 mb-2 w-80 bg-bg-surface border border-border rounded-xl p-4 flex flex-col gap-3 shadow-xl z-10">
          <p className="text-xs text-text-secondary">Dispute the validity or accuracy of this clip. The owner will be notified and may reach out to you.</p>
          {submitted ? (
            <div className="text-center py-2">
              <p className="text-xs text-success font-medium">Claim submitted.</p>
              <p className="text-[11px] text-text-muted mt-1">The clip owner may contact you at <span className="text-text-primary">{email}</span></p>
            </div>
          ) : (
            <>
              <input
                type="email"
                placeholder="Your email (required)"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input text-xs py-2"
                required
              />
              <textarea
                placeholder="Describe your concern..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                className="input resize-none text-xs py-2"
              />
              <div className="flex gap-2">
                <button onClick={() => setOpen(false)} className="btn-ghost text-xs py-1.5 px-3 flex-1">
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={!reason.trim() || !email.trim()}
                  className="btn-primary text-xs py-1.5 px-3 flex-1 disabled:opacity-40"
                >
                  Submit
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
