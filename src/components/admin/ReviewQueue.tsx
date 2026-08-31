import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Check, Loader2, X, ExternalLink, RefreshCw } from 'lucide-react';

import { supabase } from '../../lib/supabase';
import { scoreConfidence } from '../../lib/radar/confidence';
import { normalizeBusiness } from '../../lib/radar/normalize';

/**
 * Admin → Data Operations → Review Queue.
 *
 * The missing half. Suggestions could be received and imports staged, but
 * nothing could be acted on: an admin had no way to approve what the public
 * sent. This is that screen, and it deliberately serves every origin — a
 * customer suggestion, a bulk import row and a Radar discovery all arrive here
 * looking the same, because they are all the same thing: an assertion that a
 * business exists, waiting for a person to agree.
 *
 * Publishing creates an UNCLAIMED business. It never assigns an owner.
 */
interface Candidate {
  id: string;
  source_key: string;
  name: string;
  category: string | null;
  city: string | null;
  address: string | null;
  phone: string | null;
  website: string | null;
  email: string | null;
  description: string | null;
  confidence: number;
  status: string;
  created_at: string;
}

const SOURCE_LABEL: Record<string, string> = {
  public_suggestion: 'Suggested by a customer',
  business_submission: 'Submitted by the business',
  admin_import: 'Bulk import',
};

export default function ReviewQueue() {
  const [rows, setRows] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('radar_candidates')
      .select('id,source_key,name,category,city,address,phone,website,email,description,confidence,status,created_at')
      .in('status', ['pending', 'review'])
      .order('confidence', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(200);
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    setRows((data as Candidate[]) ?? []);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const publish = async (c: Candidate) => {
    setWorking(c.id);
    const { error } = await supabase.rpc('radar_publish_candidate', { p_candidate: c.id });
    setWorking(null);
    if (error) { toast.error(error.message); return; }
    toast.success(`${c.name} published as an unclaimed listing`);
    setRows((r) => r.filter((x) => x.id !== c.id));
  };

  const reject = async (c: Candidate) => {
    setWorking(c.id);
    const { error } = await supabase
      .from('radar_candidates')
      .update({ status: 'rejected', reviewed_at: new Date().toISOString(), decision_reason: 'Rejected in review' })
      .eq('id', c.id);
    setWorking(null);
    if (error) { toast.error(error.message); return; }
    setRows((r) => r.filter((x) => x.id !== c.id));
  };

  if (loading) {
    return (
      <p className="flex items-center gap-2 text-sm text-gray-500 py-8">
        <Loader2 size={16} className="animate-spin" /> Loading the queue…
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Review Queue</h2>
          <p className="text-[12px] text-gray-500 dark:text-gray-400">
            Suggestions, imports and discoveries, strongest first. Publishing creates an unclaimed
            listing — it never gives anyone an account.
          </p>
        </div>
        <button onClick={() => void load()} className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-gray-600 dark:text-gray-300">
          <RefreshCw size={13} /> Refresh
        </button>
      </header>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 dark:border-gray-700 p-10 text-center">
          <p className="text-sm text-gray-600 dark:text-gray-300">Nothing waiting. The queue is clear.</p>
        </div>
      ) : (
        <>
          <p className="text-[12px] text-gray-500">{rows.length} waiting</p>
          <ul className="space-y-2">
            {rows.map((c) => {
              // Recomputed here so the score reflects the current rules rather
              // than whatever was stored when the row was created.
              const n = normalizeBusiness(c);
              const live = n ? scoreConfidence({ normalized: n }) : null;
              return (
                <li key={c.id} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-gray-900 dark:text-white">{c.name}</p>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400">
                        {[c.category, c.city].filter(Boolean).join(' · ') || 'No category or city'}
                      </p>
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        {SOURCE_LABEL[c.source_key] ?? c.source_key}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-lg font-bold tabular-nums text-gray-900 dark:text-white">
                        {live?.score ?? c.confidence}%
                      </span>
                      <span className="block text-[10px] text-gray-500">confidence</span>
                    </div>
                  </div>

                  <dl className="mt-2 grid sm:grid-cols-2 gap-x-4 gap-y-0.5 text-[11px]">
                    {([['Phone', c.phone], ['Website', c.website], ['Email', c.email], ['Address', c.address]] as const)
                      .filter(([, v]) => v)
                      .map(([k, v]) => (
                        <div key={k} className="flex gap-1.5 min-w-0">
                          <dt className="text-gray-400 shrink-0">{k}</dt>
                          <dd className="text-gray-700 dark:text-gray-200 truncate">{v}</dd>
                        </div>
                      ))}
                  </dl>

                  {/* What is missing is the useful thing to show a reviewer —
                      it is the difference between publishing and not. */}
                  {live && live.missing.length > 0 && (
                    <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-300">
                      Missing: {live.missing.join(', ')}
                    </p>
                  )}

                  <div className="flex flex-wrap gap-2 mt-3">
                    <button onClick={() => void publish(c)} disabled={working === c.id}
                      className="inline-flex items-center gap-1.5 px-4 min-h-[38px] rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-[13px] font-bold disabled:opacity-50">
                      {working === c.id ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                      Publish as unclaimed
                    </button>
                    <button onClick={() => void reject(c)} disabled={working === c.id}
                      className="inline-flex items-center gap-1.5 px-4 min-h-[38px] rounded-lg border border-gray-300 dark:border-gray-600 text-[13px] font-semibold text-gray-700 dark:text-gray-200 disabled:opacity-50">
                      <X size={14} /> Reject
                    </button>
                    {c.website && (
                      <a href={c.website} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 min-h-[38px] text-[13px] font-semibold text-blue-600 dark:text-blue-400">
                        <ExternalLink size={13} /> Check the site
                      </a>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
