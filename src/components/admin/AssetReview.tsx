import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2 } from 'lucide-react';
import ConfirmDialog from '../ConfirmDialog';
import {
  approvalBlockers, approveAsset, evidenceUrl, listAssets, retireAsset, returnAsset,
  type AssetStatus, type Outcome, type ReviewAsset,
} from '../../lib/design/assetAdmin';

type Pending = { kind: 'approve' | 'send-back' | 'retire'; asset: ReviewAsset } | null;

const FILTERS: { status: AssetStatus; label: string }[] = [
  { status: 'draft', label: 'Drafts' },
  { status: 'in_review', label: 'In review' },
  { status: 'approved', label: 'Approved' },
];

export default function AssetReview() {
  const [status, setStatus] = useState<AssetStatus>('draft');
  const [assets, setAssets] = useState<ReviewAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await listAssets(status);
    if (r.ok) { setAssets(r.assets); setProblem(null); } else { setAssets([]); setProblem(r.reason); }
    setLoading(false);
  }, [status]);

  useEffect(() => { void load(); }, [load]);

  const close = () => { setPending(null); setReason(''); };

  const run = async () => {
    if (!pending) return;
    setBusy(true);
    const { kind, asset } = pending;
    let r: Outcome;
    if (kind === 'approve') r = await approveAsset(asset.id);
    else if (kind === 'send-back') r = await returnAsset(asset.id);
    else r = await retireAsset(asset.id, reason);
    setBusy(false);
    close();
    // One message, not two: a failure shows inline; a success clears it.
    if (!r.ok) { setProblem(r.reason); return; }
    setProblem(null);
    if (r.warning) toast.error(r.warning);
    else toast.success(kind === 'approve' ? 'Approved.' : kind === 'send-back' ? 'Sent back.' : 'Retired.');
    void load();
  };

  const viewEvidence = async (a: ReviewAsset) => {
    if (!a.licence_evidence_path) return;
    const r = await evidenceUrl(a.licence_evidence_path);
    if (!r.ok) { setProblem(r.reason); return; }
    window.open(r.url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.status}
            type="button"
            onClick={() => setStatus(f.status)}
            aria-pressed={status === f.status}
            className={`min-h-[40px] rounded-lg px-3 text-xs font-semibold ${
              status === f.status
                ? 'bg-purple-600 text-white'
                : 'border border-gray-300 text-gray-700 dark:border-gray-600 dark:text-gray-200'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        Tell the uploader what to change; notes are not stored yet.
      </p>

      {problem && (
        <p role="alert" className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
          {problem}
        </p>
      )}

      {loading ? (
        <p className="flex items-center gap-2 text-xs text-gray-500"><Loader2 size={14} className="animate-spin" /> Loading…</p>
      ) : assets.length === 0 && !problem ? (
        <p className="text-xs text-gray-500">Nothing here.</p>
      ) : (
        <ul className="space-y-3">
          {assets.map((a) => {
            const blockers = approvalBlockers(a, { permits_people_without_release: a.licence_permits_people });
            return (
            <li key={a.id} className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1 text-xs text-gray-600 dark:text-gray-300">
                  <p className="text-sm font-bold text-gray-900 dark:text-white">{a.title}</p>
                  <p>{a.kind} · {a.mime} · from {a.source_name}{a.creator_name ? ` by ${a.creator_name}` : ''}</p>
                  <p>Licence: {a.licence_name}</p>
                  <p>Restrictions: {[a.restrictions, a.licence_restrictions].filter(Boolean).join(' · ') || 'None recorded'}</p>
                  <p>
                    {a.contains_people ? (a.release_on_file ? 'People, release on file' : 'People, no release') : 'No people'}
                    {a.contains_brands ? ' · Shows a brand' : ''}
                    {a.mime === 'image/svg+xml' ? (a.sanitised_at ? ' · SVG checked' : ' · SVG not checked') : ''}
                  </p>
                  {a.status !== 'approved' && blockers.length > 0 && (
                    <ul className="list-disc pl-4 text-amber-800 dark:text-amber-200">
                      {blockers.map((b) => <li key={b}>{b}</li>)}
                    </ul>
                  )}
                  <button
                    type="button"
                    disabled={!a.licence_evidence_path}
                    onClick={() => void viewEvidence(a)}
                    className="font-semibold text-purple-700 underline disabled:text-gray-400 disabled:no-underline dark:text-purple-300"
                  >
                    {a.licence_evidence_path ? 'View evidence' : 'No evidence attached'}
                  </button>
                </div>
                {a.status !== 'approved' && (
                  <div className="flex shrink-0 gap-2">
                    <button type="button" disabled={blockers.length > 0} onClick={() => setPending({ kind: 'approve', asset: a })}
                      className="min-h-[40px] rounded-lg bg-green-600 px-3 text-xs font-bold text-white hover:bg-green-700 disabled:opacity-50">Approve</button>
                    {a.status === 'in_review' && (
                      <button type="button" onClick={() => setPending({ kind: 'send-back', asset: a })}
                        className="min-h-[40px] rounded-lg border border-gray-300 px-3 text-xs font-semibold dark:border-gray-600 dark:text-gray-200">Send back</button>
                    )}
                    <button type="button" onClick={() => setPending({ kind: 'retire', asset: a })}
                      className="min-h-[40px] rounded-lg border border-red-300 px-3 text-xs font-semibold text-red-700">Retire</button>
                  </div>
                )}
                {a.status === 'approved' && (
                  <button type="button" onClick={() => setPending({ kind: 'retire', asset: a })}
                    className="min-h-[40px] rounded-lg border border-red-300 px-3 text-xs font-semibold text-red-700">Retire</button>
                )}
              </div>
            </li>
            );
          })}
        </ul>
      )}

      {pending && (
        <ConfirmDialog
          open
          busy={busy}
          title={
            pending.kind === 'approve' ? `Approve “${pending.asset.title}”?`
              : pending.kind === 'send-back' ? `Send back “${pending.asset.title}”?`
              : `Retire “${pending.asset.title}”?`
          }
          message={
            pending.kind === 'approve' ? 'The file is copied to the public library and the asset goes live.'
              : pending.kind === 'send-back' ? 'It goes back to draft. No note is saved.'
              : (
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold">Reason</span>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={3}
                    className="w-full rounded-lg border border-gray-300 p-2 text-sm dark:border-gray-600 dark:bg-gray-900"
                  />
                </label>
              )
          }
          confirmLabel={pending.kind === 'approve' ? 'Approve now' : pending.kind === 'send-back' ? 'Send back' : 'Retire'}
          tone={pending.kind === 'retire' ? 'danger' : 'primary'}
          confirmDisabled={pending.kind === 'retire' && !reason.trim()}
          onConfirm={() => void run()}
          onCancel={close}
        />
      )}
    </div>
  );
}
