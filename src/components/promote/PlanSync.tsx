/**
 * Moves a signed-out visitor's browser-held plan into their account at sign-in.
 *
 * Renders nothing. Keyed on the user id, not on the user object: Supabase
 * raises SIGNED_IN again for a restored session and a refocused tab (see
 * AuthContext), and each of those hands back a fresh object for the same
 * person. The ref makes the run once per id while signed in; signing out
 * clears it, so signing back in (even as the same person) migrates again.
 */

import { useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import { migrateLocalPlan } from '../../lib/promote/campaigns';
import { readLocalPlan } from '../../lib/promote/localPlan';

export default function PlanSync() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const doneFor = useRef<string | null>(null);

  useEffect(() => {
    if (!userId) { doneFor.current = null; return; }
    if (doneFor.current === userId) return;
    if (readLocalPlan().length === 0) return;
    doneFor.current = userId;
    void migrateLocalPlan()
      .then((out) => {
        if (!out || out.moved === 0) return;
        const noun = out.moved === 1 ? 'line' : 'lines';
        const kept = out.kept > 0 ? ` · ${out.kept} kept on this device` : '';
        toast.success(`Moved ${out.moved} ${noun} into your plan.${kept}`);
      })
      .catch(() => { /* No toast. The lines stay on this device; the ref resets on a page load or a sign-out, so the retry happens then. */ });
  }, [userId]);

  return null;
}
