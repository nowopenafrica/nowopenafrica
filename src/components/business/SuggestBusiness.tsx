import { useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2, MapPinned, X } from 'lucide-react';

import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { normalizeBusiness } from '../../lib/radar/normalize';
import { scoreConfidence } from '../../lib/radar/confidence';

/**
 * "Know a business that is not here yet?"
 *
 * Radar's first provider that can actually run. Every other source in the
 * registry is waiting on a licence NowOpen does not have; this one needs no
 * permission from anybody, because the person is choosing to tell us.
 *
 * It writes a candidate, never a business. The public directory is not
 * reachable from this form — a suggestion sits in the review queue until an
 * admin publishes it, which is the whole point: anyone can say a business
 * exists, and saying so must not make it appear.
 */
export default function SuggestBusiness({
  place,
  onDone,
}: {
  /** Prefills the city when the empty state already knows where they looked. */
  place?: string;
  onDone?: () => void;
}) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '', category: '', city: place ?? '', address: '',
    phone: '', website: '', contact: '',
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async () => {
    const normalized = normalizeBusiness(form);
    if (!normalized) {
      toast.error('A business name is the one thing we need.');
      return;
    }
    if (!normalized.cityKey) {
      toast.error('Which town or city is it in?');
      return;
    }

    setSaving(true);
    /*
     * No .select() chained — radar_candidates has no SELECT policy for the
     * public, so asking for the row back makes RLS reject the whole insert and
     * report it as a write failure. Same trap as business_reports.
     *
     * confidence is sent as 0 and status as pending because the INSERT policy
     * requires exactly that. The real score is computed by the engine on the
     * server side of the queue; scoring here would let a submitter post their
     * own confidence.
     */
    const { error } = await supabase.from('radar_candidates').insert({
      source_key: 'public_suggestion',
      status: 'pending',
      confidence: 0,
      name: normalized.name,
      category: normalized.category,
      city: normalized.city,
      address: normalized.address,
      phone: normalized.phone,
      website: normalized.website,
      name_key: normalized.nameKey,
      city_key: normalized.cityKey,
      phone_e164: normalized.phone,
      domain: normalized.domain,
      submitted_by: user?.id ?? null,
      submitter_contact: form.contact.trim() || null,
    });
    setSaving(false);

    if (error) {
      toast.error(/does not exist|schema cache/i.test(error.message)
        ? 'Suggestions need the Radar migration applied first.'
        : 'That did not send. Please try again.');
      return;
    }
    setSent(true);
    setOpen(false);
    onDone?.();
    toast.success('Thank you — we will look into it.');
  };

  // What the reviewer will see, shown live so a thin suggestion looks thin.
  const preview = normalizeBusiness(form);
  const strength = preview ? scoreConfidence({ normalized: preview }).score : 0;

  if (sent) {
    return (
      <p className="text-sm text-gray-600 dark:text-gray-300">
        Thank you. We will check it and add it if it is right.
      </p>
    );
  }

  const field = 'w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white';

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-5 min-h-[44px] rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:border-gray-400"
      >
        <MapPinned size={16} /> Suggest a business
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Suggest a business">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-gray-800 shadow-2xl p-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <h2 className="text-base font-bold text-gray-900 dark:text-white">Suggest a business</h2>
                <p className="text-[11px] text-gray-500 dark:text-gray-400">
                  {/* Said plainly: a suggestion is a lead, not a listing. */}
                  We check every suggestion before it appears. Only add a business you know is real.
                </p>
              </div>
              <button onClick={() => setOpen(false)} aria-label="Close" className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                <X size={19} />
              </button>
            </div>

            <div className="space-y-3">
              {([
                ['name', 'Business name', 'Mama Ada Kitchen', true],
                ['city', 'Town or city', 'Lagos', true],
                ['category', 'What do they do?', 'Restaurant'],
                ['address', 'Address', '24 Admiralty Way, Lekki'],
                ['phone', 'Phone number', '0803 123 4567'],
                ['website', 'Website', 'mamaada.ng'],
              ] as const).map(([key, label, placeholder, required]) => (
                <div key={key}>
                  <label htmlFor={`sb-${key}`} className="block text-sm font-semibold text-gray-900 dark:text-white">
                    {label} {required && <span className="text-red-600">*</span>}
                  </label>
                  <input id={`sb-${key}`} value={form[key]} onChange={set(key)} placeholder={placeholder} className={`${field} mt-1`} />
                </div>
              ))}

              {!user && (
                <div>
                  <label htmlFor="sb-contact" className="block text-sm font-semibold text-gray-900 dark:text-white">
                    Your email <span className="font-normal text-gray-400">(optional)</span>
                  </label>
                  <input id="sb-contact" value={form.contact} onChange={set('contact')}
                    placeholder="Only if we may follow up" className={`${field} mt-1`} />
                </div>
              )}
            </div>

            {/* Honest feedback: the more they can tell us, the sooner it goes live. */}
            <div className="mt-3 rounded-lg bg-gray-50 dark:bg-gray-900/50 px-3 py-2">
              <div className="flex items-center justify-between text-[11px] text-gray-600 dark:text-gray-300">
                <span>How complete this is</span>
                <span className="font-mono font-bold">{strength}%</span>
              </div>
              <div className="mt-1.5 h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${strength}%` }} />
              </div>
              <p className="mt-1.5 text-[10px] text-gray-500 dark:text-gray-400">
                A phone number and an address are what let us confirm a business quickly.
              </p>
            </div>

            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setOpen(false)} className="px-4 min-h-[44px] text-sm font-semibold text-gray-600 dark:text-gray-300">
                Cancel
              </button>
              <button onClick={submit} disabled={saving}
                className="inline-flex items-center gap-2 px-5 min-h-[44px] rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-bold disabled:opacity-50">
                {saving ? <Loader2 size={15} className="animate-spin" /> : <MapPinned size={15} />} Send suggestion
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
