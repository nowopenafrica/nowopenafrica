import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Building2, ShieldCheck, ShieldOff, FileText } from 'lucide-react';

import ConfirmDialog from '../ConfirmDialog';
import {
  listOwners, listPlacements, listContacts, saveOwner, verifyOwner, unverifyOwner, addContact,
  linkPlacements, recordConfirmation, setLifecycle, isAbsoluteHttpUrl, MEDIA_OWNER_MESSAGES,
  type MediaOwner, type PlacementRow, type OwnerContact, type ContactKind, type OwnerRole, type Result,
} from '../../lib/promote/mediaOwners';
import {
  listOwnerDocuments, signedDocumentUrl, adminRejectOwner, listPendingPlacements, adminReviewPlacement,
  listPendingClaims, decideClaim, ownerRateText,
  DOCUMENT_LABELS, type OwnerDocument, type PendingPlacement, type PendingClaim,
} from '../../lib/promote/partner';

/**
 * Media owners: who owns or represents an advertising placement, and whether a
 * person has checked their documents.
 *
 * WHAT THIS SCREEN IS FOR
 *
 * The Promote pages may only say "verified" or "available" when a human did the
 * checking, and the database enforces that. This is where the checking is
 * recorded: verify an owner against documents, record where each contact
 * detail was found, link placements to the owner, record an availability
 * confirmation, and reject or archive a placement with a reason.
 *
 * WAITING FOR VERIFICATION
 *
 * Owners who turned on Media owner mode and sent their documents
 * (verification = documents_submitted) are listed first. Each document opens
 * through a 120-second signed URL (the bucket is private). Verify reuses
 * verifyOwner (a note is required; the trigger stamps who and when); Reject
 * goes through admin_reject_owner, which records the reason the owner reads.
 *
 * PLACEMENTS WAITING FOR REVIEW
 *
 * A placement listed by an unverified owner is pending_review: no visitor sees
 * it. Approve calls admin_review_placement(id, true, null), which makes it
 * public: partner_verified if the owner is verified by then, partner_supplied
 * otherwise (the database decides). Reject needs a reason, and
 * the same function records it in the audit log. The photos open in a new tab
 * so the admin can judge whether they show a real site.
 *
 * CLAIMS WAITING FOR A DECISION
 *
 * A signed-in media owner can claim a placement that has no owner ("Is this
 * your site?"). Each claim lists the placement, who claims it and in what role,
 * their statement, and the authorisation letter a representative attached (it
 * opens through a signed URL). Approve calls admin_decide_claim(id, true, null):
 * the database sets owner_id and the lifecycle. Reject needs a reason, which
 * the owner reads.
 *
 * WHY EVERY SAVE SHOWS THE DATABASE'S OWN WORDS
 *
 * supabase-js resolves with `{ error }` instead of throwing, so a refused write
 * looks like a success unless the error is read. Each action here ends in
 * either a visible error (role="alert") or a refreshed list. There is no
 * "Saved" toast to be wrong.
 *
 * Touch targets are written in explicit px: the app's root font is below 16px,
 * so rem undersizes them.
 */

const BADGE: Record<string, { label: string; tone: string }> = {
  verified: { label: 'Verified', tone: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200' },
  documents_submitted: { label: 'Documents submitted', tone: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200' },
  rejected: { label: 'Rejected', tone: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200' },
  unverified: { label: 'Unverified', tone: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200' },
};

const FIELD = 'min-h-[44px] rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-2 text-sm';
const BTN = 'min-h-[44px] min-w-[44px] inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed';
const BTN_PRIMARY = `${BTN} bg-blue-600 text-white hover:bg-blue-700`;
const BTN_PLAIN = `${BTN} border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700`;
const CARD = 'rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 space-y-3';

type Pending =
  | { kind: 'unverify'; owner: MediaOwner }
  | { kind: 'reject-owner'; owner: MediaOwner }
  | { kind: 'reject-review'; placement: PendingPlacement }
  | { kind: 'reject-claim'; claim: PendingClaim }
  | { kind: 'rejected' | 'archived'; placement: PlacementRow };

export default function MediaOwnersPanel() {
  const [owners, setOwners] = useState<MediaOwner[]>([]);
  const [placements, setPlacements] = useState<PlacementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [managing, setManaging] = useState<string | null>(null);
  const [contacts, setContacts] = useState<OwnerContact[]>([]);

  const [pending, setPending] = useState<Pending | null>(null);
  const [reason, setReason] = useState('');
  const [confirming, setConfirming] = useState<PlacementRow | null>(null);
  /** Documents of the owners waiting for verification, by owner id. */
  const [waitingDocs, setWaitingDocs] = useState<Record<string, OwnerDocument[]>>({});
  const [reviewQueue, setReviewQueue] = useState<PendingPlacement[]>([]);
  const [claimQueue, setClaimQueue] = useState<PendingClaim[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const [o, p, q, cl] = await Promise.all([listOwners(), listPlacements(), listPendingPlacements(), listPendingClaims()]);
    if (!o.ok) setError(o.error);
    else if (!p.ok) setError(p.error);
    else if (!q.ok) setError(q.error);
    else if (!cl.ok) setError(cl.error);
    else setError(null);
    if (cl.ok) setClaimQueue(cl.claims);
    if (o.ok) setOwners(o.owners);
    if (p.ok) setPlacements(p.placements);
    // Filtered again here: the queue is a promise about lifecycle, not a query.
    if (q.ok) setReviewQueue(q.placements.filter((r) => r.lifecycle === 'pending_review'));
    if (o.ok) {
      const waiting = o.owners.filter((w) => w.verification === 'documents_submitted');
      const lists = await Promise.all(waiting.map((w) => listOwnerDocuments(w.id)));
      const byOwner: Record<string, OwnerDocument[]> = {};
      lists.forEach((r, i) => {
        if (r.ok) byOwner[waiting[i].id] = r.documents;
        else setError(r.error);
      });
      setWaitingDocs(byOwner);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!managing) { setContacts([]); return; }
    let alive = true;
    void listContacts(managing).then((r) => {
      if (!alive) return;
      if (r.ok) setContacts(r.contacts);
      else setError(r.error);
    });
    return () => { alive = false; };
  }, [managing]);

  /** Run a write; show its error or refresh. Returns whether it worked. */
  const act = async (run: () => Promise<Result>): Promise<boolean> => {
    setBusy(true);
    const r = await run();
    setBusy(false);
    if (!r.ok) { setError(r.error); return false; }
    setError(null);
    await load();
    if (managing) {
      const c = await listContacts(managing);
      if (c.ok) setContacts(c.contacts);
    }
    return true;
  };

  const closePending = () => { setPending(null); setReason(''); };

  const confirmPending = async () => {
    if (!pending || !reason.trim()) return;
    const ok = await act(() => pending.kind === 'unverify'
      ? unverifyOwner(pending.owner.id, reason)
      : pending.kind === 'reject-owner'
        ? adminRejectOwner(pending.owner.id, reason)
        : pending.kind === 'reject-review'
          ? adminReviewPlacement(pending.placement.id, false, reason)
          : pending.kind === 'reject-claim'
            ? decideClaim(pending.claim.id, false, reason)
            : setLifecycle(pending.placement.id, pending.kind, reason));
    if (ok) closePending();
    // On failure the dialog closes and the error banner explains. The typed
    // reason is not kept: every way of reopening the dialog clears it, so the
    // admin types it again.
    else closePending();
  };

  const owner = owners.find((o) => o.id === managing) ?? null;
  const waiting = owners.filter((o) => o.verification === 'documents_submitted');

  const openDocument = async (path: string) => {
    const r = await signedDocumentUrl(path);
    if (!r.ok) { setError(r.error); return; }
    setError(null);
    window.open(r.url, '_blank', 'noopener');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white inline-flex items-center gap-2">
            <Building2 size={18} /> Media owners
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Verify who owns a placement, record where each contact came from, and say when an owner last confirmed availability.
          </p>
        </div>
        <button type="button" className={BTN_PLAIN} onClick={() => void load()} disabled={loading}>
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-rose-50 dark:bg-rose-900/30 text-rose-800 dark:text-rose-200 text-sm p-3">
          {error}
        </p>
      )}

      <section className={CARD} aria-label="Waiting for verification">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Waiting for verification ({waiting.length})</h3>
        {!loading && waiting.length === 0 && (
          <p className="text-sm text-gray-500">Nobody is waiting for verification.</p>
        )}
        <ul className="space-y-3">
          {waiting.map((o) => (
            <WaitingOwner
              key={o.id}
              owner={o}
              documents={waitingDocs[o.id] ?? []}
              busy={busy}
              onOpen={(path) => void openDocument(path)}
              onVerify={(note) => act(() => verifyOwner(o.id, note))}
              onReject={() => { setReason(''); setPending({ kind: 'reject-owner', owner: o }); }}
            />
          ))}
        </ul>
      </section>

      <section className={CARD} aria-label="Placements waiting for review">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Placements waiting for review ({reviewQueue.length})</h3>
        {!loading && reviewQueue.length === 0 && (
          <p className="text-sm text-gray-500">No placements are waiting for review.</p>
        )}
        <ul className="space-y-3">
          {reviewQueue.map((p) => (
            <ReviewPlacement
              key={p.id}
              placement={p}
              ownerName={owners.find((o) => o.id === p.owner_id)?.name ?? null}
              busy={busy}
              onApprove={() => void act(() => adminReviewPlacement(p.id, true))}
              onReject={() => { setReason(''); setPending({ kind: 'reject-review', placement: p }); }}
            />
          ))}
        </ul>
      </section>

      <section className={CARD} aria-label="Claims waiting for a decision">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Claims waiting for a decision ({claimQueue.length})</h3>
        {!loading && claimQueue.length === 0 && (
          <p className="text-sm text-gray-500">No claims are waiting for a decision.</p>
        )}
        <ul className="space-y-3">
          {claimQueue.map((c) => (
            <ReviewClaim
              key={c.id}
              claim={c}
              ownerName={owners.find((o) => o.id === c.owner_id)?.name ?? null}
              busy={busy}
              onOpen={(path) => void openDocument(path)}
              onApprove={() => void act(() => decideClaim(c.id, true))}
              onReject={() => { setReason(''); setPending({ kind: 'reject-claim', claim: c }); }}
            />
          ))}
        </ul>
      </section>

      <AddOwnerForm busy={busy} onSave={(input) => act(() => saveOwner(input))} />

      <section className={CARD} aria-label="Owners">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Owners ({owners.length})</h3>
        {!loading && owners.length === 0 && (
          <p className="text-sm text-gray-500">No media owners yet. Add one above.</p>
        )}
        <ul className="space-y-2">
          {owners.map((o) => {
            const badge = BADGE[o.verification] ?? BADGE.unverified;
            return (
              <li key={o.id} data-testid={`owner-${o.id}`} className="rounded-lg border border-gray-100 dark:border-gray-700 p-3 flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{o.name}</p>
                  <p className="text-xs text-gray-500">
                    {[o.country_codes.join(', '), o.website].filter(Boolean).join(' · ') || 'No website or country recorded'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-medium rounded-full px-2 py-1 ${badge.tone}`}>{badge.label}</span>
                  <button
                    type="button"
                    className={BTN_PLAIN}
                    aria-label={`Manage ${o.name}`}
                    aria-expanded={managing === o.id}
                    onClick={() => setManaging(managing === o.id ? null : o.id)}
                  >
                    Manage
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {owner && (
        <OwnerDetail
          key={owner.id}
          owner={owner}
          owners={owners}
          contacts={contacts}
          placements={placements}
          busy={busy}
          onVerify={(note) => act(() => verifyOwner(owner.id, note))}
          onUnverify={() => { setReason(''); setPending({ kind: 'unverify', owner }); }}
          onAddContact={(c) => act(() => addContact(owner.id, c))}
          onLink={(ids, role) => act(() => linkPlacements(owner.id, ids, role))}
          onError={setError}
        />
      )}

      <section className={CARD} aria-label="Placements">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Placements ({placements.length})</h3>
        <ul className="space-y-2">
          {placements.map((p) => {
            const linked = owners.find((o) => o.id === p.owner_id);
            return (
              <li key={p.id} className="rounded-lg border border-gray-100 dark:border-gray-700 p-3 space-y-2">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{p.title}</p>
                    <p className="text-xs text-gray-500">
                      {p.lifecycle.replace('_', ' ')} · {linked ? `owner: ${linked.name}` : 'no owner linked'}
                    </p>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <button type="button" className={BTN_PLAIN} aria-label={`Confirm availability for ${p.title}`}
                      onClick={() => setConfirming(confirming?.id === p.id ? null : p)}>
                      Confirm availability
                    </button>
                    <button type="button" className={BTN_PLAIN} aria-label={`Reject ${p.title}`}
                      disabled={p.lifecycle === 'rejected'}
                      onClick={() => { setReason(''); setPending({ kind: 'rejected', placement: p }); }}>
                      Reject
                    </button>
                    <button type="button" className={BTN_PLAIN} aria-label={`Archive ${p.title}`}
                      disabled={p.lifecycle === 'archived'}
                      onClick={() => { setReason(''); setPending({ kind: 'archived', placement: p }); }}>
                      Archive
                    </button>
                  </div>
                </div>
                {confirming?.id === p.id && (
                  <ConfirmationForm
                    placement={p}
                    busy={busy}
                    onRecord={async (c) => {
                      const ok = await act(() => recordConfirmation(p.id, c));
                      if (ok) setConfirming(null);
                      return ok;
                    }}
                  />
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <ConfirmDialog
        open={pending !== null}
        tone="danger"
        busy={busy}
        confirmDisabled={!reason.trim()}
        title={
          pending?.kind === 'unverify' ? `Remove verification from ${pending.owner.name}?`
            : pending?.kind === 'reject-owner' ? `Reject ${pending.owner.name}?`
            : pending?.kind === 'reject-review' ? `Reject ${pending.placement.title}?`
            : pending?.kind === 'reject-claim' ? `Reject this claim on ${pending.claim.advert_title ?? 'this placement'}?`
            : pending?.kind === 'rejected' ? 'Reject this placement?'
            : 'Archive this placement?'
        }
        confirmLabel={
          pending?.kind === 'unverify' ? 'Remove verification'
            : pending?.kind === 'reject-owner' ? 'Reject owner'
            : pending?.kind === 'reject-claim' ? 'Reject claim'
            : pending?.kind === 'rejected' || pending?.kind === 'reject-review' ? 'Reject placement'
            : 'Archive placement'
        }
        message={
          <div className="space-y-2">
            <p>
              {pending?.kind === 'unverify'
                ? "This owner's partner-verified placements drop back to partner-supplied."
                : pending?.kind === 'reject-owner'
                  ? 'The owner sees this reason and can send new documents. It is written to the audit log.'
                  : pending?.kind === 'reject-claim'
                    ? 'The owner who claimed this placement sees this reason. It is written to the audit log.'
                  : 'The reason is written to the audit log.'}
            </p>
            <label className="block text-xs text-gray-500">
              Reason
              <textarea
                aria-label="Reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className={`${FIELD} w-full mt-1`}
                rows={3}
              />
            </label>
            {!reason.trim() && <p className="text-xs text-amber-700">A reason is required.</p>}
          </div>
        }
        onConfirm={() => void confirmPending()}
        onCancel={closePending}
      />
    </div>
  );
}

function WaitingOwner({ owner, documents, busy, onOpen, onVerify, onReject }: {
  owner: MediaOwner;
  documents: OwnerDocument[];
  busy: boolean;
  onOpen: (path: string) => void;
  onVerify: (note: string) => Promise<boolean>;
  onReject: () => void;
}) {
  const [note, setNote] = useState('');
  return (
    <li className="rounded-lg border border-gray-100 dark:border-gray-700 p-3 space-y-2">
      <div>
        <p className="text-sm font-medium text-gray-900 dark:text-white">{owner.name}</p>
        <p className="text-xs text-gray-500">
          {[owner.country_codes.join(', '), owner.website].filter(Boolean).join(' · ') || 'No website or country recorded'}
        </p>
      </div>
      {documents.length === 0 ? (
        <p className="text-sm text-gray-500">No documents found.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {documents.map((d) => {
            const label = DOCUMENT_LABELS[d.kind] ?? d.kind;
            return (
              <button key={d.id} type="button" className={BTN_PLAIN}
                aria-label={`Open ${label} for ${owner.name}`}
                onClick={() => onOpen(d.storage_path)}>
                <FileText size={15} /> {label}
              </button>
            );
          })}
        </div>
      )}
      <label className="block text-xs text-gray-500">
        Documents checked
        <textarea
          aria-label={`Verification note for ${owner.name}`}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Which documents did you check? e.g. CAC certificate, signage permit"
          className={`${FIELD} w-full mt-1`}
          rows={2}
        />
      </label>
      <div className="flex gap-2 flex-wrap">
        <button type="button" className={BTN_PRIMARY} aria-label={`Verify ${owner.name}`}
          disabled={busy || !note.trim()}
          onClick={async () => { if (await onVerify(note)) setNote(''); }}>
          <ShieldCheck size={15} /> Verify
        </button>
        <button type="button" className={BTN_PLAIN} aria-label={`Reject ${owner.name}`}
          disabled={busy} onClick={onReject}>
          Reject
        </button>
      </div>
    </li>
  );
}

function ReviewPlacement({ placement, ownerName, busy, onApprove, onReject }: {
  placement: PendingPlacement;
  ownerName: string | null;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  const p = placement;
  const rate = ownerRateText(p) ?? 'No price given';
  const photos = (p.media_urls?.length ? p.media_urls : p.image_url ? [p.image_url] : []);
  return (
    <li className="rounded-lg border border-gray-100 dark:border-gray-700 p-3 space-y-2">
      <div>
        <p className="text-sm font-medium text-gray-900 dark:text-white">{p.title}</p>
        <p className="text-xs text-gray-500">
          {[p.category, ownerName ? `owner: ${ownerName}` : 'no owner linked'].filter(Boolean).join(' · ')}
        </p>
        <p className="text-xs text-gray-500">
          {[p.location, p.site_address, p.dimensions, rate].filter(Boolean).join(' · ')}
        </p>
      </div>
      {photos.length === 0 ? (
        <p className="text-sm text-gray-500">No photos.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {photos.map((url, i) => (
            <a key={url} href={url} target="_blank" rel="noopener noreferrer" aria-label={`Photo ${i + 1} of ${p.title}`}
              className="inline-flex min-h-[44px] min-w-[44px] rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
              <img src={url} alt="" className="h-16 w-24 object-cover" />
            </a>
          ))}
        </div>
      )}
      <div className="flex gap-2 flex-wrap">
        <button type="button" className={BTN_PRIMARY} aria-label={`Approve ${p.title}`} disabled={busy} onClick={onApprove}>
          <ShieldCheck size={15} /> Approve
        </button>
        <button type="button" className={BTN_PLAIN} aria-label={`Reject ${p.title}`} disabled={busy} onClick={onReject}>
          Reject
        </button>
      </div>
    </li>
  );
}

function ReviewClaim({ claim, ownerName, busy, onOpen, onApprove, onReject }: {
  claim: PendingClaim;
  ownerName: string | null;
  busy: boolean;
  onOpen: (path: string) => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  const title = claim.advert_title ?? 'Placement';
  const role = claim.role === 'authorised_representative' ? 'authorised representative' : 'owner';
  return (
    <li className="rounded-lg border border-gray-100 dark:border-gray-700 p-3 space-y-2">
      <div>
        <p className="text-sm font-medium text-gray-900 dark:text-white">{title}</p>
        <p className="text-xs text-gray-500">
          {[claim.advert_location, `claimed by ${ownerName ?? 'an unknown owner'} as ${role}`].filter(Boolean).join(' · ')}
        </p>
      </div>
      <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{claim.statement}</p>
      {claim.document_path && (
        <button type="button" className={BTN_PLAIN} aria-label={`Open authorisation letter for ${title}`}
          onClick={() => onOpen(claim.document_path!)}>
          <FileText size={15} /> Authorisation letter
        </button>
      )}
      <div className="flex gap-2 flex-wrap">
        <button type="button" className={BTN_PRIMARY} aria-label={`Approve claim for ${title}`} disabled={busy} onClick={onApprove}>
          <ShieldCheck size={15} /> Approve
        </button>
        <button type="button" className={BTN_PLAIN} aria-label={`Reject claim for ${title}`} disabled={busy} onClick={onReject}>
          Reject
        </button>
      </div>
    </li>
  );
}

function AddOwnerForm({ busy, onSave }: {
  busy: boolean;
  onSave: (input: { name: string; website?: string; countryCodes: string[] }) => Promise<boolean>;
}) {
  const [name, setName] = useState('');
  const [website, setWebsite] = useState('');
  const [countries, setCountries] = useState('');
  return (
    <section className={CARD} aria-label="Add owner">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Add a media owner</h3>
      <div className="grid gap-2 sm:grid-cols-3">
        <input aria-label="Owner name" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} className={FIELD} />
        <input aria-label="Owner website" placeholder="https://" value={website} onChange={(e) => setWebsite(e.target.value)} className={FIELD} />
        <input aria-label="Country codes" placeholder="Countries, e.g. NG, GH" value={countries} onChange={(e) => setCountries(e.target.value)} className={FIELD} />
      </div>
      <button
        type="button"
        className={BTN_PRIMARY}
        disabled={busy || !name.trim()}
        onClick={async () => {
          const ok = await onSave({
            name,
            website: website || undefined,
            countryCodes: countries.split(/[\s,]+/).filter(Boolean),
          });
          if (ok) { setName(''); setWebsite(''); setCountries(''); }
        }}
      >
        Add owner
      </button>
    </section>
  );
}

function OwnerDetail({ owner, owners, contacts, placements, busy, onVerify, onUnverify, onAddContact, onLink, onError }: {
  owner: MediaOwner;
  /** Every owner, to name the one a placement is linked to now. */
  owners: MediaOwner[];
  contacts: OwnerContact[];
  placements: PlacementRow[];
  busy: boolean;
  onVerify: (note: string) => Promise<boolean>;
  onUnverify: () => void;
  onAddContact: (c: { kind: ContactKind; value: string; sourceUrl: string; confidence: 'high' | 'medium' | 'low'; isPublicBusinessContact: boolean }) => Promise<boolean>;
  onLink: (ids: string[], role: OwnerRole) => Promise<boolean>;
  onError: (message: string | null) => void;
}) {
  const [note, setNote] = useState('');
  const [kind, setKind] = useState<ContactKind>('email');
  const [value, setValue] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [confidence, setConfidence] = useState<'high' | 'medium' | 'low'>('low');
  const [isPublic, setIsPublic] = useState(false);
  const [chosen, setChosen] = useState<string[]>([]);
  const [role, setRole] = useState<OwnerRole>('owner');
  const [contactError, setContactError] = useState<string | null>(null);
  const verified = owner.verification === 'verified';

  return (
    <section className={CARD} aria-label={`Manage ${owner.name}`}>
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{owner.name}</h3>

      <div className="space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Verification</h4>
        {verified ? (
          <>
            <p className="text-sm text-gray-600 dark:text-gray-300">Documents noted: {owner.verification_note}</p>
            <button type="button" className={BTN_PLAIN} disabled={busy} onClick={onUnverify}>
              <ShieldOff size={15} /> Remove verification
            </button>
          </>
        ) : (
          <>
            <label className="block text-xs text-gray-500">
              Documents checked
              <textarea
                aria-label="Documents checked"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Which documents did you see? e.g. CAC certificate, site lease"
                className={`${FIELD} w-full mt-1`}
                rows={2}
              />
            </label>
            <button
              type="button"
              className={BTN_PRIMARY}
              disabled={busy || !note.trim()}
              onClick={async () => { if (await onVerify(note)) setNote(''); }}
            >
              <ShieldCheck size={15} /> Verify
            </button>
          </>
        )}
      </div>

      <div className="space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Contacts</h4>
        {contacts.length === 0 && <p className="text-sm text-gray-500">No contacts recorded.</p>}
        <ul className="space-y-1">
          {contacts.map((c) => (
            <li key={c.id} className="text-sm text-gray-700 dark:text-gray-300">
              {c.kind}: {c.value} <span className="text-xs text-gray-500">({c.confidence}, found at {c.source_url})</span>
            </li>
          ))}
        </ul>
        <div className="grid gap-2 sm:grid-cols-2">
          <select aria-label="Contact kind" value={kind} onChange={(e) => setKind(e.target.value as ContactKind)} className={FIELD}>
            {(['email', 'phone', 'form', 'social', 'other'] as ContactKind[]).map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
          <input aria-label="Contact value" placeholder="Contact detail" value={value} onChange={(e) => setValue(e.target.value)} className={FIELD} />
          <input aria-label="Source URL" placeholder="Where you found it (https://...)" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} className={FIELD} />
          <select aria-label="Confidence" value={confidence} onChange={(e) => setConfidence(e.target.value as 'high' | 'medium' | 'low')} className={FIELD}>
            <option value="low">low confidence</option>
            <option value="medium">medium confidence</option>
            <option value="high">high confidence</option>
          </select>
        </div>
        <label className="inline-flex items-center gap-2 text-sm min-h-[44px]">
          <input type="checkbox" className="w-5 h-5" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
          Public business contact
        </label>
        {contactError && <p className="text-sm text-rose-700 dark:text-rose-300">{contactError}</p>}
        <div>
          <button
            type="button"
            className={BTN_PRIMARY}
            disabled={busy}
            onClick={async () => {
              setContactError(null);
              onError(null);
              // A contact with no source is refused here, in the person's words,
              // before any call; addContact() re-checks and the database enforces it.
              if (!isAbsoluteHttpUrl(sourceUrl)) { setContactError(MEDIA_OWNER_MESSAGES.contactSourceRequired); return; }
              if (!value.trim()) { setContactError(MEDIA_OWNER_MESSAGES.contactValueRequired); return; }
              if (await onAddContact({ kind, value, sourceUrl, confidence, isPublicBusinessContact: isPublic })) {
                setValue(''); setSourceUrl(''); setIsPublic(false);
              }
            }}
          >
            Add contact
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Link placements</h4>
        <ul className="space-y-1 max-h-60 overflow-auto">
          {placements.map((p) => {
            // Linking a placement that belongs to another owner moves it.
            // The audit log records the move; the admin is told before it.
            const elsewhere = p.owner_id && p.owner_id !== owner.id
              ? owners.find((o) => o.id === p.owner_id)?.name ?? 'another owner'
              : null;
            return (
              <li key={p.id}>
                <label className="inline-flex items-center gap-2 text-sm min-h-[44px]">
                  <input
                    type="checkbox"
                    className="w-5 h-5"
                    aria-label={`Select placement ${p.title}`}
                    checked={chosen.includes(p.id)}
                    onChange={(e) => setChosen(e.target.checked ? [...chosen, p.id] : chosen.filter((id) => id !== p.id))}
                  />
                  {p.title}
                </label>
                {elsewhere && (
                  <p className="ml-7 text-xs text-amber-700 dark:text-amber-300">Already linked to {elsewhere} — linking moves it</p>
                )}
              </li>
            );
          })}
        </ul>
        <div className="flex gap-2 flex-wrap items-center">
          <select aria-label="Link role" value={role} onChange={(e) => setRole(e.target.value as OwnerRole)} className={FIELD}>
            <option value="owner">Owner</option>
            <option value="authorised_representative">Authorised representative</option>
          </select>
          <button
            type="button"
            className={BTN_PRIMARY}
            disabled={busy || chosen.length === 0}
            onClick={async () => { if (await onLink(chosen, role)) setChosen([]); }}
          >
            Link placements
          </button>
        </div>
      </div>
    </section>
  );
}

function ConfirmationForm({ placement, busy, onRecord }: {
  placement: PlacementRow;
  busy: boolean;
  onRecord: (c: {
    status: 'available' | 'booked' | 'unavailable' | 'maintenance';
    periodFrom: string; periodTo?: string;
    method: 'email' | 'phone' | 'document' | 'admin';
    ownerId?: string; note?: string;
  }) => Promise<boolean>;
}) {
  const [status, setStatus] = useState<'available' | 'booked' | 'unavailable' | 'maintenance'>('available');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [method, setMethod] = useState<'' | 'email' | 'phone' | 'document' | 'admin'>('');
  const [byOwner, setByOwner] = useState(false);
  const [note, setNote] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  return (
    <div className="rounded-lg bg-gray-50 dark:bg-gray-900/40 p-3 space-y-2">
      <div className="grid gap-2 sm:grid-cols-2">
        <select aria-label="Availability status" value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className={FIELD}>
          <option value="available">Available</option>
          <option value="booked">Booked</option>
          <option value="unavailable">Unavailable</option>
          <option value="maintenance">Maintenance</option>
        </select>
        <select aria-label="Method" value={method} onChange={(e) => setMethod(e.target.value as typeof method)} className={FIELD}>
          <option value="">Choose method</option>
          <option value="email">Email</option>
          <option value="phone">Phone</option>
          <option value="document">Document</option>
          <option value="admin">Admin check</option>
        </select>
        <label className="text-xs text-gray-500">From date
          <input type="date" aria-label="From date" value={from} onChange={(e) => setFrom(e.target.value)} className={`${FIELD} w-full`} />
        </label>
        <label className="text-xs text-gray-500">To date (optional)
          <input type="date" aria-label="To date" value={to} onChange={(e) => setTo(e.target.value)} className={`${FIELD} w-full`} />
        </label>
      </div>
      {placement.owner_id && (
        <label className="inline-flex items-center gap-2 text-sm min-h-[44px]">
          <input type="checkbox" className="w-5 h-5" checked={byOwner} onChange={(e) => setByOwner(e.target.checked)} />
          Confirmed by the linked owner
        </label>
      )}
      <input aria-label="Confirmation note" placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} className={`${FIELD} w-full`} />
      {formError && <p className="text-sm text-rose-700 dark:text-rose-300">{formError}</p>}
      <button
        type="button"
        className={BTN_PRIMARY}
        disabled={busy}
        onClick={async () => {
          setFormError(null);
          if (!method || !from) { setFormError(MEDIA_OWNER_MESSAGES.confirmationMethodAndFrom); return; }
          await onRecord({
            status, periodFrom: from, periodTo: to || undefined, method,
            ownerId: byOwner && placement.owner_id ? placement.owner_id : undefined,
            note: note || undefined,
          });
        }}
      >
        Record confirmation
      </button>
    </div>
  );
}
