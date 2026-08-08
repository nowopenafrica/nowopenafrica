import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  Loader2, FileSignature, KeyRound, PenSquare, CheckCircle2, X, Send,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { NOWOPEN_ORG_ID } from '../../lib/workforce';
import {
  mapOnboardingRow, ONBOARDING_SEED,
  type OnboardingProfile, type OnboardingRow,
} from '../../lib/onboardingProfiles';
import {
  mapDocumentRow, DOCUMENTS_SEED, templateById,
  type OsDocument, type DocumentRow,
} from '../../lib/documents';
import {
  completeSigning, mapSignatureRow, provisioningFor, summarizeProvisioning,
  summarizeSignatures, SIGNING_METHODS, SIGNING_METHOD_LABELS,
  SIGNING_SEED, type SigningRecord, type SignatureRow, type SigningMethod,
} from '../../lib/signatures';

// Signing Vault — the People OS signature layer. Every "sent" document in the
// Document Centre is a signing request: capture the counterparty's signature
// here (manual or digital), and once every required document for a profile's
// relationship is signed, its OS-20 access grants are provisioned. The email on
// the signature must match the document's counterparty — a mismatch is refused.

const STATUS_BADGE: Record<'granted' | 'pending', string> = {
  granted: 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400',
  pending: 'bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400',
};

export default function SigningVault() {
  const { user } = useAuth();
  const currentUser = useMemo(
    () => (user?.id ? { id: user.id, email: user.email } : undefined),
    [user?.id, user?.email],
  );
  const [documents, setDocuments] = useState<OsDocument[]>([]);
  const [signatures, setSignatures] = useState<SigningRecord[]>([]);
  const [profiles, setProfiles] = useState<OnboardingProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [usingFallback, setUsingFallback] = useState(false);
  const [signTarget, setSignTarget] = useState<OsDocument | null>(null);
  const [signerName, setSignerName] = useState('');
  const [signerEmail, setSignerEmail] = useState('');
  const [method, setMethod] = useState<SigningMethod>('digital');
  const [signError, setSignError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [docsRes, sigRes, profRes] = await Promise.all([
        supabase.from('os_documents').select('*').eq('org_id', NOWOPEN_ORG_ID),
        supabase.from('os_signatures').select('*').eq('org_id', NOWOPEN_ORG_ID),
        supabase.from('os_onboarding').select('*').eq('org_id', NOWOPEN_ORG_ID),
      ]);
      const docRows = (docsRes.data ?? []) as DocumentRow[];
      const sigRows = (sigRes.data ?? []) as SignatureRow[];
      const profRows = (profRes.data ?? []) as OnboardingRow[];
      if (docsRes.error || docRows.length === 0 || profRows.length === 0) {
        throw new Error('signing ledgers unavailable');
      }
      setDocuments(docRows.map(mapDocumentRow));
      setSignatures(sigRows.map(mapSignatureRow));
      setProfiles(profRows.map(mapOnboardingRow));
      setUsingFallback(false);
    } catch {
      setDocuments(DOCUMENTS_SEED);
      setSignatures(SIGNING_SEED);
      setProfiles(ONBOARDING_SEED);
      setUsingFallback(true);
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  useEffect(() => { void load(); }, [load]);

  const awaiting = useMemo(() => documents.filter((d) => d.status === 'sent'), [documents]);
  const sigSummary = useMemo(() => summarizeSignatures(signatures, documents), [signatures, documents]);
  const provSummary = useMemo(() => summarizeProvisioning(profiles, documents), [profiles, documents]);

  const persistDocument = async (next: OsDocument) => {
    if (usingFallback) {
      setDocuments((d) => d.map((x) => (x.id === next.id ? next : x)));
      return true;
    }
    const { id: _id, ...row } = next;
    const { error } = await supabase.from('os_documents').update(row).eq('id', next.id);
    if (error) return false;
    return true;
  };

  const persistSignature = async (record: SigningRecord) => {
    if (usingFallback) {
      setSignatures((s) => [record, ...s]);
      return true;
    }
    const { id: _id, ...row } = record;
    const { error } = await supabase.from('os_signatures').insert(row);
    if (error) return false;
    return true;
  };

  const openSign = (doc: OsDocument) => {
    setSignTarget(doc);
    setSignerName(doc.counterparty_name);
    setSignerEmail(doc.counterparty_email);
    setMethod('digital');
    setSignError(null);
  };

  const capture = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signTarget) return;
    const result = completeSigning(signTarget, { signerName, signerEmail, method });
    if (!result.ok) {
      setSignError(result.error);
      return;
    }
    setBusy(true);
    try {
      const docOk = await persistDocument(result.document);
      const sigOk = await persistSignature(result.record);
      if (docOk && sigOk) {
        toast.success(`Signature captured — ${result.document.counterparty_name} signed ${result.document.title}.`);
        setSignTarget(null);
        setSignError(null);
      } else {
        toast.error('Could not save the signature — admin permissions needed.');
      }
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-gray-500 dark:text-gray-400">
        <Loader2 size={16} className="animate-spin mr-2" /> Reading the signature ledgers…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {usingFallback && (
        <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          Showing the dev ledgers — apply the os_documents, os_onboarding and os_signatures migrations to persist real signatures.
        </div>
      )}

      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
              <FileSignature size={18} className="text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900 dark:text-white">Signing Vault</p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">
                {sigSummary.awaiting} awaiting signature · {sigSummary.total} captured ({sigSummary.perMethod.manual} manual, {sigSummary.perMethod.digital} digital) · {provSummary.granted} of {provSummary.total} profiles provisioned ({provSummary.provisionedRate}%)
              </p>
            </div>
          </div>
        </div>
        <p className="mt-2 text-[11px] text-gray-400 dark:text-gray-500">
          A sent document is a signing request. Capturing the signature moves it to signed — and once every required document for a relationship is signed, the profile's access grants are provisioned.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide flex items-center gap-1">
            <Send size={11} /> Awaiting signature · {awaiting.length}
          </p>
          {awaiting.length === 0 && (
            <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">Nothing out for signature right now.</p>
          )}
          <div className="mt-3 space-y-2">
            {awaiting.map((d) => (
              <div key={d.id} className="rounded-lg border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30 p-3 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-gray-900 dark:text-white truncate">{d.title}</p>
                  <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">{d.counterparty_email}</p>
                </div>
                <button type="button" onClick={() => openSign(d)}
                  className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold text-white bg-purple-600 hover:bg-purple-700 transition">
                  <PenSquare size={11} /> Capture signature
                </button>
              </div>
            ))}
          </div>

          <p className="mt-5 text-[10px] font-bold text-gray-400 uppercase tracking-wide flex items-center gap-1">
            <FileSignature size={11} /> Recently captured · {signatures.length}
          </p>
          <div className="mt-2 space-y-1.5">
            {signatures.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-2 text-[11px]">
                <div className="min-w-0 flex items-center gap-1.5">
                  <CheckCircle2 size={12} className="text-emerald-500 shrink-0" />
                  <span className="text-gray-700 dark:text-gray-300 truncate">{r.document_title}</span>
                </div>
                <span className="shrink-0 text-[10px] font-semibold text-gray-400">
                  {SIGNING_METHOD_LABELS[r.method]} · {new Date(r.signed_at).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide flex items-center gap-1">
            <KeyRound size={11} /> Provisioning · {provSummary.granted} of {provSummary.total} profiles
          </p>
          {profiles.length === 0 && (
            <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">No profiles to provision yet.</p>
          )}
          <div className="mt-3 space-y-2">
            {profiles.map((p) => {
              const prov = provisioningFor(p, documents);
              return (
                <div key={p.id} className="rounded-lg border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-bold text-gray-900 dark:text-white truncate">{p.full_name}</p>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_BADGE[prov.status]}`}>
                      {prov.status === 'granted' ? 'Access granted' : 'Awaiting documents'}
                    </span>
                  </div>
                  <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
                    {prov.signedRequired.length} of {prov.required.length} required documents signed
                  </p>
                  {prov.status === 'pending' && prov.missing.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {prov.missing.map((id) => (
                        <span key={id} className="px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-900/30 text-[9px] font-bold text-amber-600 dark:text-amber-400">
                          Missing: {templateById(id)?.title ?? id}
                        </span>
                      ))}
                    </div>
                  )}
                  {prov.status === 'granted' && prov.accessGranted.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {prov.accessGranted.map((a) => (
                        <span key={a} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-900/30 text-[9px] font-bold text-emerald-600 dark:text-emerald-400">
                          <KeyRound size={9} /> {a}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {signTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" role="dialog" aria-label="Capture signature">
          <form onSubmit={capture}
            className="w-full max-w-md rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-gray-900 dark:text-white">Capture signature</p>
              <button type="button" onClick={() => setSignTarget(null)} aria-label="Close signing dialog">
                <X size={14} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200" />
              </button>
            </div>
            <p className="text-[11px] text-gray-500 dark:text-gray-400">{signTarget.title}</p>
            <label className="block">
              <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Signer name</span>
              <input value={signerName}
                onChange={(e) => setSignerName(e.target.value)}
                aria-label="Signer name"
                className="mt-1 w-full px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500" />
            </label>
            <label className="block">
              <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Signer email</span>
              <input type="email" value={signerEmail}
                onChange={(e) => setSignerEmail(e.target.value)}
                aria-label="Signer email"
                className="mt-1 w-full px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500" />
              <span className="mt-1 block text-[10px] text-gray-400">Must match the counterparty on the document.</span>
            </label>
            <label className="block">
              <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Method</span>
              <select value={method}
                onChange={(e) => setMethod(e.target.value as SigningMethod)}
                aria-label="Signing method"
                className="mt-1 w-full px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500">
                {SIGNING_METHODS.map((m) => (
                  <option key={m} value={m}>{SIGNING_METHOD_LABELS[m]}</option>
                ))}
              </select>
            </label>
            {signError && (
              <p className="text-[11px] font-semibold text-red-600 dark:text-red-400">{signError}</p>
            )}
            <button type="submit" disabled={busy}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 transition">
              {busy ? <Loader2 size={13} className="animate-spin" /> : <PenSquare size={13} />} Capture signature
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
