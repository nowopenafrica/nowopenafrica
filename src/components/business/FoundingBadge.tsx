import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Award } from 'lucide-react';

import { supabase } from '../../lib/supabase';
import { tierOf, tierLabel, foundingNumberLabel, type FoundingTier } from '../../lib/founding';

/**
 * "Founding No. 00347" on a public profile.
 *
 * The badge is the point of the whole programme: the reward for finishing your
 * page early is a permanent mark customers can see, not a discount only the
 * owner ever knows about. So it lives in the header beside the name, and it
 * renders nothing at all unless the database has actually issued a number.
 *
 * Fetched rather than passed in, because the public profile query is a shared
 * literal (DISCOVER_SELECT and friends) that several pages depend on, and
 * widening it for a badge would change every one of them.
 */
export function useFoundingNumber(businessId: string | null | undefined) {
  const [number, setNumber] = useState<number | null>(null);

  useEffect(() => {
    if (!businessId) { setNumber(null); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('founding_members')
        .select('number')
        .eq('business_id', businessId)
        .maybeSingle();
      if (!cancelled) setNumber((data as { number: number } | null)?.number ?? null);
    })().catch(() => { /* no badge is the correct failure — never a fake one */ });
    return () => { cancelled = true; };
  }, [businessId]);

  return number;
}

const STYLE: Record<Exclude<FoundingTier, null>, string> = {
  // The first hundred get gold. The rest get a badge that still reads as an
  // achievement rather than a consolation — they are permanently founding too.
  'founding-100': 'bg-gradient-to-r from-amber-400 to-yellow-500 text-amber-950 border-amber-300',
  'founding-1000': 'bg-amber-50 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 border-amber-200 dark:border-amber-700',
};

export default function FoundingBadge({
  number,
  size = 'md',
}: {
  number: number | null | undefined;
  size?: 'sm' | 'md';
}) {
  const tier = tierOf(number);
  if (!tier || !number) return null;

  return (
    <Link
      to="/founding"
      title={`${tierLabel(tier)} — one of the first ${tier === 'founding-100' ? '100' : '1,000'} businesses on NowOpen Africa`}
      className={`inline-flex items-center gap-1 rounded-full border font-extrabold shrink-0 hover:opacity-90 transition ${STYLE[tier]} ${
        size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-[11px]'
      }`}
    >
      <Award size={size === 'sm' ? 10 : 12} />
      {tier === 'founding-100' ? 'Founding 100' : 'Founding'}
      <span className="font-mono opacity-80">#{number}</span>
      <span className="sr-only">{foundingNumberLabel(number)}</span>
    </Link>
  );
}
