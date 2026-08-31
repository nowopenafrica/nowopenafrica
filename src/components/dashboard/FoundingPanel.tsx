import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Award, Check, Loader2, Circle } from 'lucide-react';

import { supabase } from '../../lib/supabase';
import {
  FOUNDING_CAP,
  foundingRequirements,
  foundingGaps,
  foundingProgress,
  progressLabel,
  tierOf,
  tierLabel,
  foundingNumberLabel,
} from '../../lib/founding';

/**
 * The owner's side of the Founding 1,000.
 *
 * Its real job is the checklist. A business that does not qualify is almost
 * always two fields away — usually opening hours, which 30 of the 32 listings
 * are missing — and "you don't qualify" with no reason is how you lose somebody
 * who would have finished the page in four minutes. So the panel always shows
 * exactly what is outstanding, in the same order the database checks it.
 *
 * The claim button only calls the RPC. The database re-checks everything and
 * assigns the number, so a user who forces the button gets an error, not a
 * spot — the checklist here is guidance, never the gate.
 */
export default function FoundingPanel({ business }: { business: Record<string, unknown> }) {
  const businessId = String(business?.id ?? '');
  const [number, setNumber] = useState<number | null>(null);
  const [taken, setTaken] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);

  const load = useCallback(async () => {
    if (!businessId) return;
    const [mine, all] = await Promise.all([
      supabase.from('founding_members').select('number').eq('business_id', businessId).maybeSingle(),
      supabase.from('founding_members').select('business_id', { count: 'exact', head: true }),
    ]);
    setNumber((mine.data as { number: number } | null)?.number ?? null);
    setTaken(all.count ?? 0);
    setLoading(false);
  }, [businessId]);

  useEffect(() => { void load().catch(() => setLoading(false)); }, [load]);

  const claim = async () => {
    setClaiming(true);
    const { data, error } = await supabase.rpc('claim_founding_spot', { p_business_id: businessId });
    setClaiming(false);
    if (error) {
      toast.error(/does not exist|schema cache/i.test(error.message)
        ? 'The founding programme needs its migration applied first.'
        : error.message);
      return;
    }
    setNumber(Number(data));
    toast.success(`You are ${foundingNumberLabel(Number(data))}`);
    void load();
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex items-center gap-2 text-sm text-gray-500">
        <Loader2 size={15} className="animate-spin" /> Checking founding status…
      </div>
    );
  }

  // Already in. Nothing to do, and nothing that can take it away.
  if (number) {
    const tier = tierOf(number);
    return (
      <div className="rounded-xl border border-amber-300 dark:border-amber-700 bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-900/25 dark:to-yellow-900/10 p-4">
        <div className="flex items-center gap-2.5">
          <span className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-400 to-yellow-500 text-amber-950 flex items-center justify-center shrink-0">
            <Award size={20} />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-extrabold text-gray-900 dark:text-white">
              {tierLabel(tier)} · {foundingNumberLabel(number)}
            </p>
            <p className="text-[11px] text-gray-600 dark:text-gray-300">
              Permanent. It shows on your public page and stays yours.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const requirements = foundingRequirements(business as never);
  const gaps = foundingGaps(business as never);
  const progress = foundingProgress(taken ?? 0);
  const done = requirements.length - gaps.length;

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
      <div className="flex items-start gap-2.5 mb-3">
        <Award size={18} className="mt-0.5 shrink-0 text-amber-500" />
        <div className="min-w-0">
          <p className="text-sm font-bold text-gray-900 dark:text-white">The Founding {FOUNDING_CAP.toLocaleString()}</p>
          <p className="text-[11px] text-gray-600 dark:text-gray-300">
            {/* Said plainly, because it is the thing that makes the badge worth
                anything: the reward is for a finished business, not a signup. */}
            A permanent numbered badge for the first {FOUNDING_CAP.toLocaleString()} verified, completed
            businesses. {progressLabel(progress)}.
          </p>
        </div>
      </div>

      <ul className="space-y-1.5 mb-3">
        {requirements.map((r) => (
          <li key={r.key} className="flex items-center gap-2 text-[12px]">
            {r.done
              ? <Check size={14} className="text-green-600 dark:text-green-400 shrink-0" />
              : <Circle size={14} className="text-gray-300 dark:text-gray-600 shrink-0" />}
            <span className={r.done ? 'text-gray-500 dark:text-gray-400 line-through' : 'font-semibold text-gray-900 dark:text-white'}>
              {r.label}
            </span>
          </li>
        ))}
      </ul>

      {gaps.length === 0 ? (
        <button
          onClick={claim}
          disabled={claiming || progress.full}
          className="w-full inline-flex items-center justify-center gap-2 min-h-[44px] rounded-lg bg-gradient-to-r from-amber-500 to-yellow-500 text-amber-950 text-sm font-extrabold hover:opacity-90 disabled:opacity-50"
        >
          {claiming ? <Loader2 size={15} className="animate-spin" /> : <Award size={15} />}
          {progress.full ? 'All spots claimed' : 'Claim your founding number'}
        </button>
      ) : (
        <p className="text-[11px] text-gray-600 dark:text-gray-300 border-t border-gray-100 dark:border-gray-700 pt-2.5">
          <span className="font-bold text-gray-900 dark:text-white">{done} of {requirements.length} done.</span>{' '}
          {gaps[0].key === 'verified'
            ? 'Verification is the last step — request it from the Trust panel.'
            : `Next: add your ${gaps[0].label.toLowerCase()}.`}
        </p>
      )}
    </div>
  );
}
