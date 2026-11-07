import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Megaphone } from 'lucide-react';

import { enableMediaOwner, getMyMediaOwner, type MyMediaOwner } from '../../lib/promote/partner';
import OwnerVerificationPanel from './OwnerVerificationPanel';
import OwnerPlacementList from './OwnerPlacementList';
import PlacementImport from './PlacementImport';

/**
 * The business Dashboard's "Media owner" tab: a business that sells
 * advertising space turns on Media owner mode and gets verified.
 *
 * WHO SEES IT
 *
 * Anyone who owns or is a member of a business (the Dashboard passes both
 * lists). The database decides what they may do: enable_media_owner and
 * get_my_media_owner both check is_business_member and refuse otherwise, and
 * that refusal is shown here as text.
 *
 * WHY THE TOGGLE ONLY TURNS ON
 *
 * There is no "turn off" in the database (an owner may already have
 * placements and documents on file). Once on, the switch shows on and is
 * inert, rather than offering an action that cannot happen.
 *
 * WHY A REF GUARD AS WELL AS `disabled`
 *
 * A fast double tap can land before React re-renders the disabled state. The
 * RPC is idempotent, but a second call would still be a wasted round trip and
 * a second audit attempt; the ref makes it exactly one.
 *
 * PLACEMENTS
 *
 * Once on, the owner's placements sit under verification (OwnerPlacementList).
 * Listing does not wait for verification: an unverified owner's placement goes
 * to review (pending_review) and a verified owner's is live at once. The
 * database decides which.
 *
 * SPREADSHEET IMPORT
 *
 * Below the list, PlacementImport adds many placements at once through the
 * same owner paths. After an import the list is remounted (its key changes)
 * so it reads the new rows; nothing in it is mid-edit at that moment.
 */

export interface MemberBusiness { id: string; name: string }

export default function MediaOwnerTab({ businesses }: { businesses: MemberBusiness[] }) {
  const [businessId, setBusinessId] = useState<string>(businesses[0]?.id ?? '');
  const [owner, setOwner] = useState<MyMediaOwner | null>(null);
  const [rejectReason, setRejectReason] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [enabling, setEnabling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const enablingRef = useRef(false);
  const [imports, setImports] = useState(0);

  // The list can arrive after first render (memberships load separately).
  useEffect(() => {
    if (!businessId && businesses[0]) setBusinessId(businesses[0].id);
  }, [businesses, businessId]);

  // The spinner shows only on the first read for a business. A re-read after
  // enable or submit keeps the panel mounted: swapping it for a spinner would
  // destroy its state (documents, any error it is showing) mid-task.
  const load = useCallback(async (initial = false) => {
    if (!businessId) { setLoading(false); return; }
    if (initial) setLoading(true);
    const r = await getMyMediaOwner(businessId);
    if (r.ok) { setOwner(r.owner); setRejectReason(r.rejectReason); setError(null); }
    else { setOwner(null); setRejectReason(null); setError(r.error); }
    setLoading(false);
  }, [businessId]);

  useEffect(() => { void load(true); }, [load]);

  const enable = async () => {
    if (owner || enablingRef.current || !businessId) return;
    enablingRef.current = true;
    setEnabling(true);
    setError(null);
    const r = await enableMediaOwner(businessId);
    if (!r.ok) setError(r.error);
    else await load();
    setEnabling(false);
    enablingRef.current = false;
  };

  if (businesses.length === 0) {
    return <p className="text-sm text-gray-500">Add a business first to sell advertising space.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <Megaphone size={20} className="mt-1 text-blue-600 dark:text-blue-400 shrink-0" />
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Media owner</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            List the billboards, screens and other advertising space your business sells. Your business profile is your public page.
          </p>
        </div>
      </div>

      {businesses.length > 1 && (
        <label className="block text-sm text-gray-700 dark:text-gray-300">
          Business
          <select
            aria-label="Business"
            value={businessId}
            onChange={(e) => setBusinessId(e.target.value)}
            className="mt-1 block min-h-[44px] rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-2 text-sm"
          >
            {businesses.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </label>
      )}

      {error && (
        <p role="alert" className="rounded-lg bg-rose-50 dark:bg-rose-900/30 text-rose-800 dark:text-rose-200 text-sm p-3">{error}</p>
      )}

      {loading ? (
        <Loader2 className="animate-spin text-gray-400" aria-label="Loading" />
      ) : (
        <>
          <label className="inline-flex items-center gap-3 min-h-[44px] cursor-pointer text-sm font-medium text-gray-900 dark:text-white">
            <input
              type="checkbox"
              className="w-[22px] h-[22px]"
              checked={owner !== null}
              disabled={owner !== null || enabling}
              onChange={() => void enable()}
            />
            I sell advertising space
            {enabling && <Loader2 size={15} className="animate-spin" />}
          </label>

          {owner && (
            <OwnerVerificationPanel
              key={owner.id}
              owner={owner}
              rejectReason={rejectReason}
              onChanged={() => load()}
            />
          )}

          {owner && <OwnerPlacementList key={`placements-${owner.id}-${imports}`} owner={owner} />}

          {/* Not for a rejected owner: the database refuses every row they could
              import (create, update and claim all refuse 'rejected'). */}
          {owner && owner.verification !== 'rejected' && (
            <PlacementImport key={`import-${owner.id}`} owner={owner} onImported={() => setImports((n) => n + 1)} />
          )}
        </>
      )}
    </div>
  );
}
