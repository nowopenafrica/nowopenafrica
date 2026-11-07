import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2, Video, X } from 'lucide-react';

import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { reelLimitForPlan, DEFAULT_BUSINESS_PLAN, TRIAL_TIER } from '../../data/pricingPlans';
import OpenReelCapture from '../dashboard/OpenReelCapture';
import { track } from '../../lib/telemetry';

/**
 * Record an OpenReel, from anywhere.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────
 *
 * "Record an OpenReel" used to navigate to /dashboard?tab=businesses and stop
 * there. From that list somebody still had to find their business, open the
 * content manager, find the gallery tab and press a camera button — four steps
 * after they had already said exactly what they wanted to do.
 *
 * This opens the camera. The only thing between the tap and the viewfinder is
 * the two lookups that have to happen first, and they run in parallel.
 *
 * ── WHY IT WAITS FOR THE PLAN ────────────────────────────────────────────
 *
 * Recording length is a paid feature — 60s on Free Launch, up to ten minutes
 * on Business Pro (reelLimitForPlan). The camera takes its limit as a prop at
 * mount, so opening before the plan is known would either cap a paying
 * customer at the free allowance or, worse, hand the free tier ten minutes.
 * One quick query, run alongside the business lookup, is the honest price of
 * getting that right.
 */

interface OwnedBusiness { id: string; name: string }

export default function CreateReelFlow({ onDone }: { onDone: () => void }) {
  const { user } = useAuth();
  const [businesses, setBusinesses] = useState<OwnedBusiness[] | null>(null);
  const [chosen, setChosen] = useState<OwnedBusiness | null>(null);
  /** Starts at the free allowance so a slow lookup can never grant more. */
  const [reelSeconds, setReelSeconds] = useState(() => reelLimitForPlan(DEFAULT_BUSINESS_PLAN));
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) { onDone(); return; }
    let alive = true;

    (async () => {
      const [bizRes, planRes] = await Promise.all([
        // `user_id`, not owner_id — `businesses` has no owner_id, and PostgREST
        // rejects the whole select on one unknown column.
        supabase.from('businesses').select('id,name').eq('user_id', user.id)
          .order('created_at', { ascending: true }).range(0, 49),
        supabase.from('users').select('plan, plan_status').eq('id', user.id).maybeSingle(),
      ]);
      if (!alive) return;

      if (!planRes.error && planRes.data) {
        const p = planRes.data as { plan: string | null; plan_status: string | null };
        // A trial counts as Business Pro, matching the module gate elsewhere.
        const effective = p.plan_status === 'trialing' ? TRIAL_TIER : (p.plan ?? DEFAULT_BUSINESS_PLAN);
        setReelSeconds(reelLimitForPlan(effective));
      }

      if (bizRes.error) {
        toast.error('Could not load your businesses just now.');
        onDone();
        return;
      }
      const list = (bizRes.data ?? []) as OwnedBusiness[];
      setBusinesses(list);
      // One business means there is nothing to ask. Open the camera.
      if (list.length === 1) setChosen(list[0]);
      setReady(true);
    })();

    return () => { alive = false; };
  }, [user, onDone]);

  /**
   * A finished recording goes into the gallery immediately.
   *
   * Anything else means somebody records a reel, is told it worked, and finds
   * an empty gallery — the exact bug galleryCaptureInsert.smoke.test.tsx was
   * written for. The upload already happened inside the camera; this is the
   * row that makes it visible.
   */
  const handleCaptured = async (url: string, type: 'photo' | 'video') => {
    if (!chosen) return;
    setSaving(true);
    const { error } = await supabase.from('business_gallery').insert([{
      business_id: chosen.id,
      image_url: url,
      caption: null,
    }]);
    setSaving(false);

    if (error) {
      // The file is uploaded and safe; only the row failed. Say which, because
      // "something went wrong" would suggest the recording was lost.
      toast.error(`Recorded and uploaded, but could not add it to your gallery: ${error.message}`);
      onDone();
      return;
    }

    track('creation_completed', { type: 'reel', source: 'universal_create' });
    toast.success(type === 'video' ? 'Reel added to your gallery' : 'Photo added to your gallery');
    onDone();
  };

  if (!user) return null;

  // Both lookups still running. The camera is a permission prompt, so it must
  // not appear before we know it is the right one to ask for.
  if (!ready) {
    return (
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-gray-900/60 backdrop-blur-sm">
        <p className="flex items-center gap-2 text-sm text-white">
          <Loader2 size={16} className="animate-spin" /> Opening the camera…
        </p>
      </div>
    );
  }

  /*
   * No business, so there is nowhere for a reel to live.
   *
   * The hub already hides owner actions from people with no business, so this
   * is the race where somebody's last business was removed in another tab. It
   * says so rather than opening a camera whose recording has no home.
   */
  if (businesses && businesses.length === 0) {
    return (
      <Shell onClose={onDone} title="Nowhere to put a reel yet">
        <p className="text-sm text-gray-600 dark:text-gray-300">
          An OpenReel belongs to one of your businesses, and you do not have one on NowOpen yet.
        </p>
      </Shell>
    );
  }

  // More than one business: a reel has to belong somewhere, and guessing would
  // put it on the wrong profile.
  if (!chosen && businesses) {
    return (
      <Shell onClose={onDone} title="Which business is this reel for?">
        <ul className="space-y-2">
          {businesses.map((b) => (
            <li key={b.id}>
              <button
                type="button"
                onClick={() => setChosen(b)}
                className="w-full text-left px-4 min-h-[48px] rounded-xl border
                           border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800
                           hover:border-gray-900 dark:hover:border-white
                           text-sm font-semibold text-gray-900 dark:text-white
                           focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {b.name}
              </button>
            </li>
          ))}
        </ul>
      </Shell>
    );
  }

  if (saving) {
    return (
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-gray-900/60 backdrop-blur-sm">
        <p className="flex items-center gap-2 text-sm text-white">
          <Loader2 size={16} className="animate-spin" /> Adding it to your gallery…
        </p>
      </div>
    );
  }

  return (
    <OpenReelCapture
      userId={user.id}
      maxSeconds={reelSeconds}
      // The whole point: somebody who tapped "Record an OpenReel" lands on the
      // video viewfinder, not the photo one.
      initialMode="video"
      onCaptured={handleCaptured}
      onClose={onDone}
    />
  );
}

/** A small sheet for the two cases where the camera cannot open yet. */
function Shell({
  title, children, onClose,
}: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center"
         role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" aria-label="Close" tabIndex={-1} onClick={onClose}
              className="absolute inset-0 bg-gray-900/50 backdrop-blur-sm" />
      <div className="relative w-full sm:max-w-md bg-white dark:bg-gray-900
                      rounded-t-3xl sm:rounded-3xl border border-gray-200 dark:border-gray-700
                      shadow-2xl p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3 mb-3">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Video size={18} /> {title}
          </h2>
          <button type="button" onClick={onClose} aria-label="Close"
                  className="shrink-0 w-10 h-10 min-w-[44px] min-h-[44px] -mr-1 -mt-1
                             flex items-center justify-center rounded-full
                             text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800
                             focus:outline-none focus:ring-2 focus:ring-blue-500">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
