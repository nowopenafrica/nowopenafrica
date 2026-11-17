import { useEffect, useState } from 'react';

import HappeningRow from './HappeningRow';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

/**
 * "New today from places you keep", on /keeps.
 *
 * Filtered to the signed-in person's OWN keeps on purpose: the keeps table
 * also lets a business owner read who keeps their business, so leaning on RLS
 * alone would mix an owner's audience into their personal list.
 *
 * Nothing is shown when they keep nothing, when nothing they keep is live, or
 * when the read fails. A row saying "nothing new" would be noise on the one
 * page people visit for their own places.
 */
export default function KeptUpdates() {
  const { user } = useAuth();
  const [ids, setIds] = useState<string[] | null>(null);

  useEffect(() => {
    if (!user) { setIds(null); return undefined; }
    let live = true;
    void (async () => {
      const { data, error } = await supabase
        .from('business_keeps')
        .select('business_id')
        .eq('user_id', user.id)
        // The newest 150 keeps: every id goes into the next request's URL, and
        // a few hundred would overflow it and quietly lose the whole row.
        .order('created_at', { ascending: false })
        .limit(150);
      if (!live) return;
      setIds(error || !data ? [] : (data as { business_id: string }[]).map((r) => r.business_id));
    })();
    return () => { live = false; };
  }, [user]);

  if (!user || !ids || ids.length === 0) return null;
  return (
    <HappeningRow
      title="New today from places you keep"
      blurb="Live for 24 hours, newest first."
      businessIds={ids}
    />
  );
}
