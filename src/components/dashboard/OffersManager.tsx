import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { X, Plus, Trash2, Loader2, Ticket, Clock, BellRing } from 'lucide-react';

import { supabase } from '../../lib/supabase';
import { isRunning, isUpcoming, hasExpired, endsLabel, offerHeadline, type Offer } from '../../lib/offers';

/**
 * Offers, from the owner's side.
 *
 * The thing worth knowing while using this: publishing an offer MESSAGES
 * people. A database trigger notifies everyone who keeps this business and
 * asked for promotions, subject to the six-hour throttle. So the form says so
 * before the button is pressed rather than after — an owner who discovers that
 * by accident learns to distrust the whole dashboard.
 */
interface Props {
  businessId: string;
  businessName: string;
  onClose: () => void;
}

const field = 'w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white';

export default function OffersManager({ businessId, businessName, onClose }: Props) {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);

  const [title, setTitle] = useState('');
  const [headline, setHeadline] = useState('');
  const [description, setDescription] = useState('');
  const [code, setCode] = useState('');
  const [endsAt, setEndsAt] = useState('');

  const load = useCallback(async () => {
    // The owner needs to see paused and finished offers too, which the public
    // policy hides — this read is allowed by the owner policy.
    const { data } = await supabase
      .from('business_offers')
      .select('*')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false });
    setOffers((data as Offer[]) || []);
    setLoading(false);
  }, [businessId]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [onClose]);

  const create = async () => {
    if (!title.trim()) { toast.error('Give the offer a name first.'); return; }
    if (endsAt) {
      const t = new Date(endsAt).getTime();
      if (Number.isFinite(t) && t < Date.now()) {
        toast.error('That end time has already passed.');
        return;
      }
    }
    setSaving(true);
    const { error } = await supabase.from('business_offers').insert({
      business_id: businessId,
      title: title.trim(),
      headline: headline.trim() || null,
      description: description.trim() || null,
      code: code.trim() || null,
      ends_at: endsAt ? new Date(endsAt).toISOString() : null,
      active: true,
    });
    setSaving(false);
    if (error) {
      toast.error(/does not exist|schema cache/i.test(error.message)
        ? 'Offers need the business_offers migration applied first.'
        : error.message);
      return;
    }
    toast.success('Offer published — anyone keeping you has been told');
    setTitle(''); setHeadline(''); setDescription(''); setCode(''); setEndsAt('');
    setAdding(false);
    void load();
  };

  const setActive = async (o: Offer, next: boolean) => {
    const { error } = await supabase.from('business_offers').update({ active: next }).eq('id', o.id);
    if (error) { toast.error(error.message); return; }
    void load();
  };

  const remove = async (o: Offer) => {
    const { error } = await supabase.from('business_offers').delete().eq('id', o.id);
    if (error) { toast.error(error.message); return; }
    toast.success('Offer removed');
    void load();
  };

  const now = new Date();

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center p-4 overflow-y-auto" role="dialog" aria-modal="true" aria-label="Manage offers">
      <div className="w-full max-w-2xl my-8 rounded-2xl bg-white dark:bg-gray-800 shadow-2xl">
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Ticket size={17} className="text-rose-600 dark:text-rose-400" /> Offers
            </h2>
            <p className="text-[11px] text-gray-500 dark:text-gray-400">{businessName}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <X size={20} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {!adding ? (
            <button
              onClick={() => setAdding(true)}
              className="inline-flex items-center gap-2 px-4 min-h-[44px] rounded-lg bg-rose-600 text-white text-sm font-bold hover:bg-rose-700"
            >
              <Plus size={15} /> New offer
            </button>
          ) : (
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="of-head" className="block text-sm font-semibold text-gray-900 dark:text-white">Headline</label>
                  <input id="of-head" value={headline} onChange={(e) => setHeadline(e.target.value)} maxLength={40}
                    placeholder="20% OFF" className={`${field} mt-1`} />
                  <p className="text-[10px] text-gray-400 mt-1">The big text on the card.</p>
                </div>
                <div>
                  <label htmlFor="of-title" className="block text-sm font-semibold text-gray-900 dark:text-white">Offer name</label>
                  <input id="of-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120}
                    placeholder="Weekend Special" className={`${field} mt-1`} />
                </div>
              </div>
              <div>
                <label htmlFor="of-desc" className="block text-sm font-semibold text-gray-900 dark:text-white">Details</label>
                <textarea id="of-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
                  placeholder="On all cuts, in store and for delivery." className={`${field} mt-1`} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="of-code" className="block text-sm font-semibold text-gray-900 dark:text-white">Code (optional)</label>
                  <input id="of-code" value={code} onChange={(e) => setCode(e.target.value)} maxLength={24}
                    placeholder="WEEKEND20" className={`${field} mt-1`} />
                </div>
                <div>
                  <label htmlFor="of-ends" className="block text-sm font-semibold text-gray-900 dark:text-white">Ends</label>
                  <input id="of-ends" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)}
                    className={`${field} mt-1`} />
                  <p className="text-[10px] text-gray-400 mt-1">Leave blank to run until you stop it.</p>
                </div>
              </div>

              {/* Said before the button, not after. */}
              <p className="text-[11px] text-amber-700 dark:text-amber-400 flex items-start gap-1.5">
                <BellRing size={13} className="mt-0.5 shrink-0" />
                Publishing notifies everyone who keeps {businessName} and asked about promotions — at most one such message every few hours.
              </p>

              <div className="flex gap-2">
                <button onClick={create} disabled={saving}
                  className="inline-flex items-center gap-2 px-4 min-h-[44px] rounded-lg bg-rose-600 text-white text-sm font-bold hover:bg-rose-700 disabled:opacity-50">
                  {saving ? <Loader2 size={15} className="animate-spin" /> : <Ticket size={15} />} Publish offer
                </button>
                <button onClick={() => setAdding(false)} className="px-4 min-h-[44px] text-sm font-semibold text-gray-600 dark:text-gray-300">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {loading ? (
            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 py-6">
              <Loader2 size={15} className="animate-spin" /> Loading offers…
            </div>
          ) : offers.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 py-4">
              No offers yet. An offer shows on your page, in the Offers tab, and reaches the people who keep you.
            </p>
          ) : (
            <ul className="space-y-2">
              {offers.map((o) => {
                const live = isRunning(o, now);
                const soon = isUpcoming(o, now);
                const done = hasExpired(o, now);
                const ends = endsLabel(o, now);
                return (
                  <li key={o.id} className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 flex items-start gap-3">
                    <span className={`px-2 py-1 rounded-md text-[11px] font-extrabold shrink-0 ${
                      live ? 'bg-rose-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                    }`}>
                      {offerHeadline(o)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{o.title}</p>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                        {done ? 'Ended' : soon ? 'Scheduled' : live ? 'Running' : 'Paused'}
                        {ends && !done && <><Clock size={10} /> {ends}</>}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {!done && (
                        <button onClick={() => setActive(o, !o.active)}
                          className="px-2 py-1 rounded text-[11px] font-semibold border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300">
                          {o.active === false ? 'Resume' : 'Pause'}
                        </button>
                      )}
                      <button onClick={() => remove(o)} aria-label={`Delete ${o.title}`}
                        className="px-2 py-1 text-gray-400 hover:text-red-500">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
