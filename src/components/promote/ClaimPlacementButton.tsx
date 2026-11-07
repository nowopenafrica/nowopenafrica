import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

import { useAuth } from '../../contexts/AuthContext';
import {
  claimPlacement, findMyMediaOwner, listMyClaims, CLAIM_MESSAGES, DOCUMENT_LABELS,
  type ClaimRole, type MyClaim, type MyMediaOwner,
} from '../../lib/promote/partner';

/**
 * "Is this your site? Claim it", on a placement that has no owner.
 *
 * WHO SEES IT
 *
 * Only a signed-in member of a media-owner business. A visitor, or a member
 * whose business has not turned on Media owner mode, gets nothing at all (and
 * a visitor costs no query). Nor does an owner whose verification was
 * rejected: owner_claim_placement refuses them, so a button would only fail. The page renders this only while the placement
 * has no owner; the database refuses a claim on an owned placement anyway.
 *
 * WHAT IT SHOWS
 *
 * - A pending claim by this owner reads "Claim sent for review".
 * - A rejected claim shows its reason and offers the claim again.
 * - Another owner's pending claim is invisible to this viewer (members read
 *   only their own), so the button shows and the database refuses the second
 *   claim in its own words, which this component displays.
 *
 * A representative must attach the owner's signed authorisation letter. The
 * file is checked here first so a refusal costs no upload and no call.
 */

const BTN = 'min-h-[44px] min-w-[44px] inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed';
const BTN_PRIMARY = `${BTN} bg-blue-600 text-white hover:bg-blue-700`;
const BTN_PLAIN = `${BTN} border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700`;
const FIELD = 'min-h-[44px] rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-2 text-sm';

export default function ClaimPlacementButton({ advertId }: { advertId: string }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [owner, setOwner] = useState<MyMediaOwner | null>(null);
  const [claim, setClaim] = useState<MyClaim | null>(null);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<ClaimRole>('owner');
  const [statement, setStatement] = useState('');
  const [letter, setLetter] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    setOwner(null); setClaim(null); setReady(false); setSent(false); setOpen(false);
    if (!userId) return undefined;
    let live = true;
    void (async () => {
      const found = await findMyMediaOwner(userId);
      if (!live) return;
      // A failed lookup shows nothing rather than a button that may not apply.
      if (!found.ok || !found.owner) { setReady(true); return; }
      const mine = await listMyClaims(found.owner.id);
      if (!live) return;
      setOwner(found.owner);
      if (mine.ok) {
        // Newest first: a pending claim here wins, else the latest rejection.
        const here = mine.claims.filter((c) => c.advert_id === advertId);
        setClaim(here.find((c) => c.status === 'pending') ?? here.find((c) => c.status === 'rejected') ?? null);
      }
      setReady(true);
    })();
    return () => { live = false; };
  }, [userId, advertId]);

  if (!userId || !ready || !owner || owner.verification === 'rejected') return null;

  if (sent || claim?.status === 'pending') {
    return <p className="text-sm text-gray-600 dark:text-gray-300" data-testid="claim-sent">Claim sent for review</p>;
  }

  const send = async () => {
    setError(null);
    if (!statement.trim()) { setError(CLAIM_MESSAGES.statementRequired); return; }
    if (role === 'authorised_representative' && !letter) { setError(CLAIM_MESSAGES.letterRequired); return; }
    setBusy(true);
    const r = await claimPlacement(advertId, owner.id, role, statement, letter);
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    setSent(true);
  };

  return (
    <div className="space-y-2">
      {claim?.status === 'rejected' && (
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Your last claim on this placement was not approved{claim.reason ? `: ${claim.reason}` : '.'}
        </p>
      )}
      {!open ? (
        <button type="button" className={BTN_PLAIN} onClick={() => setOpen(true)}>
          Is this your site? Claim it
        </button>
      ) : (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 space-y-3">
          <fieldset className="space-y-1">
            <legend className="text-sm font-medium text-gray-900 dark:text-white">You are claiming as</legend>
            <label className="flex items-center gap-2 min-h-[44px] text-sm">
              <input type="radio" name={`claim-role-${advertId}`} className="w-5 h-5" checked={role === 'owner'}
                onChange={() => setRole('owner')} />
              I own this site
            </label>
            <label className="flex items-center gap-2 min-h-[44px] text-sm">
              <input type="radio" name={`claim-role-${advertId}`} className="w-5 h-5" checked={role === 'authorised_representative'}
                onChange={() => setRole('authorised_representative')} />
              I represent the owner
            </label>
          </fieldset>
          <label className="block text-xs text-gray-500">
            How is this site yours?
            <textarea
              aria-label="How is this site yours?"
              value={statement}
              onChange={(e) => setStatement(e.target.value)}
              className={`${FIELD} w-full mt-1`}
              rows={3}
            />
          </label>
          {role === 'authorised_representative' && (
            <label className="block text-xs text-gray-500">
              {DOCUMENT_LABELS.authorisation_letter} (the owner&apos;s signed letter; PDF, JPG or PNG)
              <input
                type="file"
                aria-label="Authorisation letter"
                accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                onChange={(e) => setLetter(e.target.files?.[0] ?? null)}
                className={`${FIELD} w-full mt-1`}
              />
            </label>
          )}
          {error && (
            <p role="alert" className="rounded-lg bg-rose-50 dark:bg-rose-900/30 text-rose-800 dark:text-rose-200 text-sm p-3">{error}</p>
          )}
          <div className="flex gap-2 flex-wrap">
            <button type="button" className={BTN_PRIMARY} disabled={busy} onClick={() => void send()}>
              {busy && <Loader2 size={15} className="animate-spin" />} Send claim
            </button>
            <button type="button" className={BTN_PLAIN} disabled={busy} onClick={() => { setOpen(false); setError(null); }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
