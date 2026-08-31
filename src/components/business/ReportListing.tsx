import { useState } from 'react';
import toast from 'react-hot-toast';
import { Flag, Loader2, X } from 'lucide-react';

import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { REPORT_REASONS, reportIsUsable } from '../../lib/listingStatus';

/**
 * "Something wrong with this listing?"
 *
 * NowOpen tells people whether a business is open, which means it will
 * sometimes be wrong — a shop closes, a number changes, a listing turns out to
 * be nobody's. Until now a wrong fact had no way back in. This is the return
 * path, and it doubles as the cheapest data-quality network the platform will
 * ever have: the person who knows the shop shut down is standing outside it.
 *
 * No sign-in required. The customer who noticed is usually not a member, and
 * putting a registration wall in front of a correction loses the correction.
 */
export default function ReportListing({
  businessId,
  businessName,
}: {
  businessId: string;
  businessName: string;
}) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string>('');
  const [detail, setDetail] = useState('');
  const [contact, setContact] = useState('');
  const [saving, setSaving] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async () => {
    if (!reportIsUsable(reason, detail)) {
      toast.error(reason === 'other'
        ? 'Tell us a little more so we can check it.'
        : 'Pick what is wrong with this listing.');
      return;
    }
    setSaving(true);
    /*
     * No .select() and no `return=representation` here, deliberately.
     *
     * Reports are insert-only for the public — there is no SELECT policy for
     * anon, by design, because the table names businesses as fake, closed or
     * impersonating and that is exactly what a competitor would mine. Asking
     * for the row back makes RLS reject the whole statement and report it as an
     * insert violation, so the write appears to fail while the policy is doing
     * its job. Verified against live: plain insert 201, with representation
     * 42501.
     */
    const { error } = await supabase.from('business_reports').insert({
      business_id: businessId,
      user_id: user?.id ?? null,
      reason,
      detail: detail.trim() || null,
      contact: contact.trim() || null,
    });
    setSaving(false);

    if (error) {
      toast.error(/does not exist|schema cache/i.test(error.message)
        ? 'Reporting needs the business_reports migration applied first.'
        : 'That did not send. Please try again.');
      return;
    }
    setSent(true);
    setOpen(false);
    toast.success('Thank you — we will check it.');
  };

  // Once they have told us, stop asking. Repeating the prompt reads as though
  // the report went nowhere.
  if (sent) {
    return (
      <p className="text-[11px] text-gray-500 dark:text-gray-400 inline-flex items-center gap-1.5">
        <Flag size={12} /> Reported. Thank you.
      </p>
    );
  }

  const field = 'w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white';

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-[11px] text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 inline-flex items-center gap-1.5 underline underline-offset-2"
      >
        <Flag size={12} /> Something wrong with this listing?
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={`Report ${businessName}`}>
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-gray-800 shadow-2xl p-5">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <h2 className="text-base font-bold text-gray-900 dark:text-white">Report {businessName}</h2>
                <p className="text-[11px] text-gray-500 dark:text-gray-400">
                  A person reads every report. Nothing changes automatically.
                </p>
              </div>
              <button onClick={() => setOpen(false)} aria-label="Close" className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                <X size={19} />
              </button>
            </div>

            <fieldset className="space-y-1.5">
              <legend className="text-sm font-semibold text-gray-900 dark:text-white mb-1.5">
                What is wrong?
              </legend>
              {REPORT_REASONS.map((r) => (
                <label key={r.value} className="flex items-center gap-2.5 text-sm text-gray-700 dark:text-gray-200 cursor-pointer">
                  <input
                    type="radio"
                    name="report-reason"
                    value={r.value}
                    checked={reason === r.value}
                    onChange={(e) => setReason(e.target.value)}
                    className="w-4 h-4"
                  />
                  {r.label}
                </label>
              ))}
            </fieldset>

            <div className="mt-3 space-y-3">
              <div>
                <label htmlFor="report-detail" className="block text-sm font-semibold text-gray-900 dark:text-white">
                  Anything else? {reason === 'other' && <span className="text-red-600">Required</span>}
                </label>
                <textarea
                  id="report-detail" rows={2} value={detail}
                  onChange={(e) => setDetail(e.target.value)}
                  placeholder="They moved to Ikeja in June."
                  className={`${field} mt-1`}
                />
              </div>
              {!user && (
                <div>
                  <label htmlFor="report-contact" className="block text-sm font-semibold text-gray-900 dark:text-white">
                    Your email or phone <span className="font-normal text-gray-400">(optional)</span>
                  </label>
                  <input
                    id="report-contact" value={contact}
                    onChange={(e) => setContact(e.target.value)}
                    placeholder="Only if you are happy for us to follow up"
                    className={`${field} mt-1`}
                  />
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setOpen(false)} className="px-4 min-h-[44px] text-sm font-semibold text-gray-600 dark:text-gray-300">
                Cancel
              </button>
              <button
                onClick={submit} disabled={saving}
                className="inline-flex items-center gap-2 px-5 min-h-[44px] rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-bold disabled:opacity-50"
              >
                {saving ? <Loader2 size={15} className="animate-spin" /> : <Flag size={15} />} Send report
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
