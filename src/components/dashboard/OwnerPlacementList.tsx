import { useCallback, useEffect, useState } from 'react';
import { CalendarCheck, Loader2, Pencil, Plus } from 'lucide-react';

import {
  listMyPlacements, ownerRateText, recordAvailability, PARTNER_MESSAGES,
  type AvailabilityStatus, type MyMediaOwner, type OwnerPlacement,
} from '../../lib/promote/partner';
import { trustLabelText } from '../../lib/promote/trust';
import OwnerPlacementForm from './OwnerPlacementForm';

/**
 * The owner's own placements in the Media owner tab: what is listed, what is
 * waiting for review, and the two things an owner keeps current (the details
 * and price, through the form; availability, through a short form here).
 *
 * WHAT EACH STATUS SAYS
 *
 * Read straight from the lifecycle the database set. "Waiting for review" is
 * pending_review: an unverified owner's placement that no visitor can see
 * until an admin approves it. No timing promise, because nobody here knows
 * how long that takes.
 *
 * AVAILABILITY
 *
 * owner_record_availability stamps method 'portal' and the placement's own
 * owner, which is what the public line "Available · confirmed {date} by
 * {owner}" is built from. A start date is always required; "Booked until"
 * needs its end date, and an end date before the start is refused. All are
 * checked before any call.
 *
 * A REJECTED OWNER
 *
 * Can see their placements but not change them: owner_update_placement and
 * owner_record_availability refuse a rejected owner, so Edit and Availability
 * are disabled here with the database's own words, instead of opening a form
 * that can only fail.
 *
 * Touch targets are in explicit px: the app's root font is below 16px.
 */

const STATUS: Record<string, { label: string; tone: string }> = {
  pending_review: { label: 'Waiting for review', tone: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200' },
  partner_verified: { label: `Live · ${trustLabelText('partner_verified')}`, tone: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200' },
  partner_supplied: { label: `Live · ${trustLabelText('partner_supplied')}`, tone: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200' },
  imported: { label: 'Live', tone: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200' },
  discovered: { label: 'Live', tone: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200' },
  rejected: { label: 'Not approved', tone: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200' },
  archived: { label: 'Archived', tone: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200' },
};

const AVAILABILITY_OPTIONS: { value: AvailabilityStatus; label: string }[] = [
  { value: 'available', label: 'Available' },
  { value: 'booked', label: 'Booked until' },
  { value: 'unavailable', label: 'Unavailable' },
  { value: 'maintenance', label: 'Maintenance' },
];

const FIELD = 'min-h-[44px] w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-2 text-sm';
const BTN = 'min-h-[44px] min-w-[44px] inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed';
const BTN_PRIMARY = `${BTN} bg-blue-600 text-white hover:bg-blue-700`;
const BTN_PLAIN = `${BTN} border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700`;

type Open = { kind: 'new' } | { kind: 'edit'; placement: OwnerPlacement } | null;

export default function OwnerPlacementList({ owner }: { owner: MyMediaOwner }) {
  const [placements, setPlacements] = useState<OwnerPlacement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Open>(null);
  const [availabilityFor, setAvailabilityFor] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await listMyPlacements(owner.id);
    if (r.ok) { setPlacements(r.placements); setError(null); }
    else setError(r.error);
    setLoading(false);
  }, [owner.id]);

  useEffect(() => { void load(); }, [load]);

  const afterSave = (message: string) => {
    setOpen(null);
    setAvailabilityFor(null);
    setSaved(message);
    void load();
  };

  const rejected = owner.verification === 'rejected';

  return (
    <section aria-label="Placements" className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Your placements</h3>
        {!open && (
          <button type="button" className={BTN_PRIMARY} disabled={rejected}
            onClick={() => { setSaved(null); setAvailabilityFor(null); setOpen({ kind: 'new' }); }}>
            <Plus size={15} /> Add a placement
          </button>
        )}
      </div>
      {rejected && (
        <>
          <p className="text-sm text-gray-600 dark:text-gray-400">Send new documents for review before listing placements.</p>
          <p className="text-sm text-gray-600 dark:text-gray-400">{PARTNER_MESSAGES.ownerRejected}</p>
        </>
      )}
      {!rejected && owner.verification !== 'verified' && (
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Until your business is verified, each new placement is checked by NowOpen before advertisers can see it.
        </p>
      )}

      {saved && (
        <p role="status" className="rounded-lg bg-green-50 dark:bg-green-900/30 text-green-800 dark:text-green-200 text-sm p-3">{saved}</p>
      )}
      {error && (
        <p role="alert" className="rounded-lg bg-rose-50 dark:bg-rose-900/30 text-rose-800 dark:text-rose-200 text-sm p-3">{error}</p>
      )}

      {open && !(rejected && open.kind === 'edit') && (
        <OwnerPlacementForm
          key={open.kind === 'edit' ? open.placement.id : 'new'}
          owner={owner}
          placement={open.kind === 'edit' ? open.placement : undefined}
          onSaved={afterSave}
          onCancel={() => setOpen(null)}
        />
      )}

      {loading ? (
        <Loader2 className="animate-spin text-gray-400" aria-label="Loading placements" />
      ) : placements.length === 0 ? (
        <p className="text-sm text-gray-500">No placements yet.</p>
      ) : (
        <ul className="space-y-2">
          {placements.map((p) => {
            const status = STATUS[p.lifecycle] ?? { label: p.lifecycle, tone: STATUS.archived.tone };
            const rate = ownerRateText(p);
            return (
              <li key={p.id} data-testid={`owner-placement-${p.id}`} className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 space-y-2">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{p.title}</p>
                    <p className="text-xs text-gray-500">
                      {[p.category, p.location, p.dimensions, rate].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <span className={`text-xs font-medium rounded-full px-2 py-1 ${status.tone}`}>{status.label}</span>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <button type="button" className={BTN_PLAIN} aria-label={`Edit ${p.title}`} disabled={rejected}
                    title={rejected ? PARTNER_MESSAGES.ownerRejected : undefined}
                    onClick={() => { setSaved(null); setAvailabilityFor(null); setOpen({ kind: 'edit', placement: p }); }}>
                    <Pencil size={15} /> Edit
                  </button>
                  <button type="button" className={BTN_PLAIN} aria-label={`Availability for ${p.title}`}
                    aria-expanded={availabilityFor === p.id} disabled={rejected}
                    title={rejected ? PARTNER_MESSAGES.ownerRejected : undefined}
                    onClick={() => { setSaved(null); setAvailabilityFor(availabilityFor === p.id ? null : p.id); }}>
                    <CalendarCheck size={15} /> Availability
                  </button>
                </div>
                {!rejected && availabilityFor === p.id && (
                  <AvailabilityForm placement={p} onSaved={() => afterSave('Availability saved')} />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function AvailabilityForm({ placement, onSaved }: { placement: OwnerPlacement; onSaved: () => void }) {
  const [status, setStatus] = useState<AvailabilityStatus>('available');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const booked = status === 'booked';

  const save = async () => {
    if (busy) return;
    setError(null);
    setBusy(true);
    // recordAvailability checks the dates before any call, in the same words.
    const r = await recordAvailability(placement.id, status, from, to || null);
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    onSaved();
  };

  return (
    <form
      aria-label={`Availability for ${placement.title}`}
      className="rounded-lg bg-gray-50 dark:bg-gray-900/40 p-3 space-y-2"
      onSubmit={(e) => { e.preventDefault(); void save(); }}
      noValidate
    >
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="text-xs text-gray-500 space-y-1"><span>Status</span>
          <select aria-label="Status" className={FIELD} value={status} onChange={(e) => setStatus(e.target.value as AvailabilityStatus)}>
            {AVAILABILITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        <label className="text-xs text-gray-500 space-y-1"><span>From</span>
          <input type="date" aria-label="From" className={FIELD} value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="text-xs text-gray-500 space-y-1"><span>{booked ? 'Booked until' : 'To (optional)'}</span>
          <input type="date" aria-label={booked ? 'Booked until' : 'To (optional)'} className={FIELD} value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
      </div>
      {error && <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">{error}</p>}
      <button type="submit" className={BTN_PRIMARY} disabled={busy}>
        {busy && <Loader2 size={15} className="animate-spin" />}
        Save availability
      </button>
    </form>
  );
}
