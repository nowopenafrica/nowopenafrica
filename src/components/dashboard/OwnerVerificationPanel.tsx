import { useCallback, useEffect, useState } from 'react';
import { FileText, Loader2, ShieldCheck, Upload } from 'lucide-react';

import {
  listOwnerDocuments, uploadOwnerDocument, submitVerification, signedDocumentUrl,
  verificationStatusText, missingDocuments, checkDocumentFile,
  DOCUMENT_LABELS, SITE_PROOF_KINDS,
  type MyMediaOwner, type OwnerDocument, type DocumentKind, type SiteProofKind,
} from '../../lib/promote/partner';
import { formatLocalDate } from '../../lib/dates';

/**
 * Verification for a media owner: two documents (company registration and one
 * site proof), then "Send for review".
 *
 * WHY THE STATUS LINE IS THE ONLY CLAIM
 *
 * The status comes from verificationStatusText and nowhere else, so this panel
 * cannot say "verified" or "under review" in words the database does not back.
 * No timing promise: nobody here knows how long a review takes.
 *
 * WHY ERRORS ARE TEXT
 *
 * supabase-js resolves with `{ error }` instead of throwing; a refused upload
 * or submit would otherwise look like nothing happened. Every failure lands in
 * a role="alert" line in the database's (or the file check's) own words.
 *
 * Touch targets are in explicit px: the app's root font is below 16px.
 */

const BTN = 'min-h-[44px] min-w-[44px] inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed';
const BTN_PRIMARY = `${BTN} bg-blue-600 text-white hover:bg-blue-700`;
const BTN_PLAIN = `${BTN} border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700`;
// The file input is visually hidden, so the label IS the button: while an
// upload runs it must look and act disabled too, not only the input.
const PICKER_STATE = (busy: boolean) => (busy ? 'opacity-50 cursor-not-allowed pointer-events-none' : 'cursor-pointer');
const FIELD = 'min-h-[44px] rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-2 text-sm';

export default function OwnerVerificationPanel({ owner, rejectReason, onChanged }: {
  owner: MyMediaOwner;
  rejectReason: string | null;
  /** Called after a successful submit so the parent re-reads the owner row. */
  onChanged: () => void | Promise<void>;
}) {
  const [docs, setDocs] = useState<OwnerDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proofKind, setProofKind] = useState<SiteProofKind>('signage_permit');

  const loadDocs = useCallback(async () => {
    const r = await listOwnerDocuments(owner.id);
    if (r.ok) setDocs(r.documents);
    else setError(r.error);
    setLoading(false);
  }, [owner.id]);

  useEffect(() => { void loadDocs(); }, [loadDocs]);

  // Sent or verified: the evidence stays as filed, so no more uploads here.
  const locked = owner.verification === 'documents_submitted' || owner.verification === 'verified';
  const status = verificationStatusText(owner, docs, rejectReason);
  const ready = missingDocuments(docs).length === 0;

  const upload = async (kind: DocumentKind, file: File | undefined) => {
    if (!file) return;
    setError(null);
    // Checked here as well as in uploadOwnerDocument so a refused file never
    // flips the busy state or touches the network.
    const refused = checkDocumentFile(file);
    if (refused) { setError(refused); return; }
    setBusy(true);
    const r = await uploadOwnerDocument(owner.id, kind, file);
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    await loadDocs();
  };

  const submit = async () => {
    setError(null);
    setBusy(true);
    const r = await submitVerification(owner.id);
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    await onChanged();
  };

  const open = async (path: string) => {
    setError(null);
    const r = await signedDocumentUrl(path);
    if (!r.ok) { setError(r.error); return; }
    window.open(r.url, '_blank', 'noopener');
  };

  return (
    <section aria-label="Verification" className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-4">
      <div className="flex items-start gap-2">
        <ShieldCheck size={18} className="mt-0.5 text-blue-600 dark:text-blue-400 shrink-0" />
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Verification</h3>
          <p className="text-sm text-gray-700 dark:text-gray-300" data-testid="owner-status">{status}</p>
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-rose-50 dark:bg-rose-900/30 text-rose-800 dark:text-rose-200 text-sm p-3">{error}</p>
      )}

      {!locked && (
        <div className="space-y-3">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Private: only your team and NowOpen reviewers can open these. PDF, JPG or PNG, up to 10MB each.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-gray-900 dark:text-white w-44">1. Company registration</span>
            <label className={`${BTN_PLAIN} ${PICKER_STATE(busy)}`} aria-disabled={busy || undefined}>
              <Upload size={15} /> Choose file
              <input
                type="file"
                aria-label="Upload company registration"
                accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                className="sr-only"
                disabled={busy}
                onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; void upload('registration', f); }}
              />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-gray-900 dark:text-white w-44">2. One site proof</span>
            <select
              aria-label="Site proof type"
              value={proofKind}
              onChange={(e) => setProofKind(e.target.value as SiteProofKind)}
              className={FIELD}
            >
              {SITE_PROOF_KINDS.map((k) => <option key={k} value={k}>{DOCUMENT_LABELS[k]}</option>)}
            </select>
            <label className={`${BTN_PLAIN} ${PICKER_STATE(busy)}`} aria-disabled={busy || undefined}>
              <Upload size={15} /> Choose file
              <input
                type="file"
                aria-label="Upload site proof"
                accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                className="sr-only"
                disabled={busy}
                onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; void upload(proofKind, f); }}
              />
            </label>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Your documents</h4>
        {loading ? (
          <Loader2 size={16} className="animate-spin text-gray-400" aria-label="Loading documents" />
        ) : docs.length === 0 ? (
          <p className="text-sm text-gray-500">No documents yet.</p>
        ) : (
          <ul className="space-y-2">
            {docs.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 dark:border-gray-700 p-2">
                <span className="inline-flex items-center gap-2 text-sm text-gray-800 dark:text-gray-200 min-w-0">
                  <FileText size={15} className="text-gray-400 shrink-0" />
                  <span className="truncate">{DOCUMENT_LABELS[d.kind] ?? d.kind}</span>
                  <span className="text-xs text-gray-500">· {formatLocalDate(d.uploaded_at)}</span>
                </span>
                <button
                  type="button"
                  className={BTN_PLAIN}
                  aria-label={`Open ${DOCUMENT_LABELS[d.kind] ?? d.kind}`}
                  onClick={() => void open(d.storage_path)}
                >
                  Open
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {!locked && (
        <button type="button" className={BTN_PRIMARY} disabled={busy || !ready} onClick={() => void submit()}>
          {busy && <Loader2 size={15} className="animate-spin" />} Send for review
        </button>
      )}
    </section>
  );
}
