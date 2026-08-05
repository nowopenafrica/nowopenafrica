import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { X, ShieldCheck, Check, Loader2, Upload, FileText, Eye, CircleDot } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import {
  TIERS, deriveTier, computeTrustScore, VERIFICATION_STEPS, DOC_TYPES, TrustSignals,
} from '../../lib/trust';
import TrustBadge from '../TrustBadge';

interface TrustPanelProps {
  businessId: string;
  businessName: string;
  admin?: boolean; // admin reviewers get editable toggles + doc approval
  onClose: () => void;
  onSaved?: () => void;
}

const FLAG_KEYS = VERIFICATION_STEPS.map((s) => s.key);

export default function TrustPanel({ businessId, businessName, admin = false, onClose, onSaved }: TrustPanelProps) {
  const { user } = useAuth();
  const [business, setBusiness] = useState<any>(null);
  const [docs, setDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [docType, setDocType] = useState(DOC_TYPES[0].value);
  const [flags, setFlags] = useState<Record<string, boolean>>({});

  const fetchAll = useCallback(async () => {
    const [{ data: b }, { data: d }] = await Promise.all([
      supabase.from('businesses').select('*').eq('id', businessId).maybeSingle(),
      supabase.from('verification_documents').select('*').eq('business_id', businessId).order('created_at', { ascending: false }),
    ]);
    setBusiness(b);
    setDocs(d || []);
    if (b) setFlags(Object.fromEntries(FLAG_KEYS.map((k) => [k, !!b[k]])));
    setLoading(false);
  }, [businessId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const signals: TrustSignals = { ...(business || {}), ...flags };
  const tier = deriveTier(signals);
  const { score, breakdown } = computeTrustScore(signals, Date.now());

  const uploadDoc = async (file: File) => {
    if (!user) return;
    if (file.size > 10 * 1024 * 1024) { toast.error('File too large — max 10 MB'); return; }
    setUploading(true);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'bin';
      const path = `${user.id}/${businessId}/${docType}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('verification-docs').upload(path, file, { upsert: false });
      if (upErr) throw upErr;
      const { error: insErr } = await supabase.from('verification_documents').insert({
        business_id: businessId, user_id: user.id, doc_type: docType, file_path: path, status: 'pending',
      });
      if (insErr) throw insErr;
      toast.success('Document submitted for review');
      fetchAll();
    } catch (err: any) {
      toast.error(`Upload failed: ${err.message || 'unknown error'}. If it mentions a missing bucket/table, run scripts/sql/apply_all_migrations.sql.`);
    } finally {
      setUploading(false);
    }
  };

  const viewDoc = async (path: string) => {
    const { data, error } = await supabase.storage.from('verification-docs').createSignedUrl(path, 120);
    if (error || !data) { toast.error('Could not open document'); return; }
    window.open(data.signedUrl, '_blank', 'noopener');
  };

  const reviewDoc = async (id: string, status: 'approved' | 'rejected') => {
    const { data, error } = await supabase.from('verification_documents')
      .update({ status, reviewed_by: user?.id ?? null, reviewed_at: new Date().toISOString() })
      .eq('id', id).select();
    if (error) { toast.error(`Update failed: ${error.message}`); return; }
    if (!data || data.length === 0) { toast.error('Nothing updated — admin RLS may not be applied.'); return; }
    setDocs((prev) => prev.map((x) => (x.id === id ? { ...x, status } : x)));
    toast.success(`Document ${status}`);
  };

  // Admin: persist the toggled flags and recompute tier + score.
  const saveReview = async () => {
    setSaving(true);
    try {
      const newTier = deriveTier(signals);
      const newScore = computeTrustScore(signals, Date.now()).score;
      const { data, error } = await supabase.from('businesses').update({
        ...flags,
        verification_tier: newTier,
        trust_score: newScore,
        verified: TIERS[newTier].rank >= 3, // Gold/Platinum earn the trusted badge
      }).eq('id', businessId).select();
      if (error) throw error;
      if (!data || data.length === 0) {
        toast.error('Nothing saved — you need an admin role and the admin RLS policies applied.');
        return;
      }
      toast.success(`Saved — ${TIERS[newTier].label} · score ${newScore}`);
      onSaved?.();
      fetchAll();
    } catch (err: any) {
      toast.error(`Save failed: ${err.message || 'unknown error'}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-800">
          <div className="flex items-center gap-2">
            <ShieldCheck size={20} className="text-blue-600 dark:text-blue-400" />
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">
              Trust &amp; Verification{admin ? ' — Review' : ''}
            </h2>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"><X size={20} /></button>
        </div>

        {loading ? (
          <div className="p-10 text-center text-gray-500"><Loader2 className="animate-spin mx-auto" /></div>
        ) : !business ? (
          <div className="p-10 text-center text-gray-500">Business not found.</div>
        ) : (
          <div className="p-5 space-y-6">
            {/* Header: name, tier, score */}
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <p className="font-bold text-gray-900 dark:text-white">{businessName}</p>
                <div className="mt-1"><TrustBadge tier={tier} score={score} size="md" /></div>
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold text-gray-900 dark:text-white">{score}<span className="text-base text-gray-400">/100</span></p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Trust score</p>
              </div>
            </div>

            {/* Score breakdown */}
            <div>
              <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-2">What builds this score</h3>
              <div className="space-y-1.5">
                {breakdown.map((row) => (
                  <div key={row.label} className="flex items-center gap-3">
                    <span className="w-40 shrink-0 text-xs text-gray-600 dark:text-gray-400">{row.label}</span>
                    <div className="flex-1 h-2 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                      <div className="h-full bg-blue-500" style={{ width: `${row.max ? (row.earned / row.max) * 100 : 0}%` }} />
                    </div>
                    <span className="w-10 text-right text-xs text-gray-500">{row.earned}/{row.max}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Verification checklist */}
            <div>
              <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-2">Verification steps</h3>
              <div className="space-y-2">
                {VERIFICATION_STEPS.map((step) => {
                  const on = !!flags[step.key];
                  return (
                    <div key={step.key} className="flex items-start justify-between gap-3 rounded-lg border border-gray-200 dark:border-gray-700 p-3">
                      <div className="flex items-start gap-2.5">
                        {on
                          ? <Check size={18} className="mt-0.5 text-green-500 shrink-0" />
                          : <CircleDot size={18} className="mt-0.5 text-gray-300 dark:text-gray-600 shrink-0" />}
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-white">
                            {step.label}
                            <span className={`ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${TIERS[step.tier].badge}`}>{TIERS[step.tier].label}</span>
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{step.detail}</p>
                        </div>
                      </div>
                      {admin ? (
                        <label className="inline-flex items-center cursor-pointer">
                          <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            checked={on} onChange={() => setFlags((f) => ({ ...f, [step.key]: !f[step.key] }))} />
                        </label>
                      ) : (
                        <span className={`text-[11px] font-semibold ${on ? 'text-green-600 dark:text-green-400' : 'text-gray-400'}`}>{on ? 'Verified' : 'Pending'}</span>
                      )}
                    </div>
                  );
                })}
              </div>
              {admin && (
                <button onClick={saveReview} disabled={saving}
                  className="mt-3 inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">
                  {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                  Save verification &amp; recompute tier
                </button>
              )}
            </div>

            {/* Documents */}
            <div>
              <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-2">
                {admin ? 'Submitted documents' : 'Upload documents for review'}
              </h3>

              {!admin && (
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <select value={docType} onChange={(e) => setDocType(e.target.value)}
                    className="px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-white rounded-lg text-sm">
                    {DOC_TYPES.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                  </select>
                  <label className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium cursor-pointer ${uploading ? 'bg-gray-200 text-gray-500' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>
                    {uploading ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
                    {uploading ? 'Uploading…' : 'Upload'}
                    <input type="file" accept="image/*,application/pdf" className="hidden" disabled={uploading}
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadDoc(f); e.target.value = ''; }} />
                  </label>
                  <span className="text-[11px] text-gray-400">Private — only you &amp; our reviewers can see these. PDF/image, max 10 MB.</span>
                </div>
              )}

              {docs.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">No documents submitted yet.</p>
              ) : (
                <div className="space-y-2">
                  {docs.map((doc) => {
                    const label = DOC_TYPES.find((d) => d.value === doc.doc_type)?.label ?? doc.doc_type;
                    const statusColor = doc.status === 'approved' ? 'text-green-600 dark:text-green-400'
                      : doc.status === 'rejected' ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400';
                    return (
                      <div key={doc.id} className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 dark:border-gray-700 p-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <FileText size={16} className="text-gray-400 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{label}</p>
                            <p className={`text-[11px] font-semibold capitalize ${statusColor}`}>{doc.status}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {doc.file_path && (
                            <button onClick={() => viewDoc(doc.file_path)} className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
                              <Eye size={13} /> View
                            </button>
                          )}
                          {admin && doc.status !== 'approved' && (
                            <button onClick={() => reviewDoc(doc.id, 'approved')} className="px-2.5 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700">Approve</button>
                          )}
                          {admin && doc.status !== 'rejected' && (
                            <button onClick={() => reviewDoc(doc.id, 'rejected')} className="px-2.5 py-1.5 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700">Reject</button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
