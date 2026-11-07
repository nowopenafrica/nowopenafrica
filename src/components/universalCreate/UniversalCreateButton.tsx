import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Plus } from 'lucide-react';

import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { track } from '../../lib/telemetry';

/**
 * Universal Create — the button that is always there.
 *
 * NOT "NowOpen Create", which is the design/print marketplace on /media
 * (CreateMarketplace, src/lib/create/). Two different products: that one
 * sells printed cards and flyers, this one opens things on your profile.
 * They live in separate folders for exactly this reason.
 *
 * ── WHY THE HUB IS LAZY ──────────────────────────────────────────────────
 *
 * This component mounts on every page including the homepage, and the hub it
 * opens is markup nobody sees until they tap. Importing it eagerly would put
 * the whole sheet — and its ten icons — into the initial bundle for every
 * visitor who only ever searched for a barber. The button itself is a few
 * hundred bytes; the hub arrives when it is wanted.
 *
 * ── WHERE IT IS NOT SHOWN ────────────────────────────────────────────────
 *
 * Hidden on the routes where it would be noise or an obstruction: inside the
 * dashboard (which has its own creation surfaces, so a second entrance
 * competes with them), in admin, and on the auth pages, where a floating
 * "create" invitation next to a sign-in form is simply in the way.
 */

const CreateHub = lazy(() => import('./CreateHub'));

/*
 * Prefixes where the button stays out of the way. Matched as prefixes so
 * nested routes are covered without listing each one.
 */
const HIDDEN_ON = [
  '/dashboard', '/admin', '/admin-creator',
  '/login', '/register', '/forgot-password', '/reset-password',
  '/studio',           // its own full-screen creation surface
  '/order',            // mid-checkout; nothing should compete with paying
  '/add-business',     // already creating a business
];

export default function UniversalCreateButton() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  /*
   * null while unknown. The hub needs this to decide between "sign in" and
   * "you need a business first", and guessing either way gives somebody the
   * wrong instruction — so it waits rather than assumes.
   */
  const [hasBusiness, setHasBusiness] = useState<boolean | null>(null);

  useEffect(() => {
    if (!user) { setHasBusiness(false); return; }
    let alive = true;

    // head:true — this is a yes/no question and does not need a row.
    supabase
      .from('businesses')
      .select('id', { count: 'exact', head: true })
      /*
       * `user_id`, NOT `owner_id`.
       *
       * Shipped 2026-10-06 as owner_id, which does not exist on `businesses`.
       * PostgREST rejects the WHOLE select on one unknown column and returns an
       * error rather than rows — so every business owner was told "you need a
       * business on NowOpen first" before they could use any owner action.
       * It fails silently in the sense that matters: the UI had a sensible
       * story for the empty result, so nothing looked broken.
       */
      .eq('user_id', user.id)
      .then(({ count, error }) => {
        if (!alive) return;
        // supabase-js resolves with {data,error}; a .catch() here would never
        // fire and the failure would read as "no business".
        if (error) { setHasBusiness(false); return; }
        setHasBusiness((count ?? 0) > 0);
      });

    return () => { alive = false; };
  }, [user]);

  const openHub = useCallback(() => {
    track('create_hub_opened', { from: pathname });
    setOpen(true);
  }, [pathname]);

  if (HIDDEN_ON.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return null;

  return (
    <>
      <button
        type="button"
        onClick={openHub}
        aria-haspopup="dialog"
        aria-expanded={open}
        /*
         * Named for what it does, not what it looks like. "Plus button" tells a
         * screen-reader user nothing about where it goes.
         */
        aria-label="Open something on NowOpen"
        /*
         * ── WHY BOTTOM-LEFT AND NOT BOTTOM-RIGHT ─────────────────────────
         *
         * MEASURED 2026-10-06, with the thing actually on screen: bottom-right
         * already holds the chat panel (fixed bottom-6 right-6, 380x600, z-50)
         * and a 46px control at bottom-24 right-5. Placing a third control
         * there did not look crowded — it was unreachable. A click on the
         * button's centre landed on the chat composer, because the chat sits a
         * layer above it.
         *
         * The convention says bottom-right. The convention assumes the corner
         * is free. Here it is not, and the brief is explicit that this must
         * never overlap chat or other controls, so it takes the corner nobody
         * else is using.
         */
        className="fixed z-40 left-4 sm:left-6
                   bottom-[calc(1rem+env(safe-area-inset-bottom))] sm:bottom-6
                   inline-flex items-center gap-2
                   h-14 min-h-[56px] pl-4 pr-5
                   rounded-full
                   bg-gray-900 dark:bg-white text-white dark:text-gray-900
                   shadow-xl shadow-gray-900/20 dark:shadow-black/40
                   border border-white/10 dark:border-gray-900/10
                   transition-[transform,box-shadow] duration-200
                   motion-safe:hover:-translate-y-0.5 hover:shadow-2xl
                   active:translate-y-0 motion-safe:active:scale-[0.97]
                   focus:outline-none focus:ring-2 focus:ring-offset-2
                   focus:ring-gray-900 dark:focus:ring-white
                   dark:focus:ring-offset-gray-900"
      >
        <Plus size={20} className={open ? 'rotate-45 transition-transform duration-200' : 'transition-transform duration-200'} />
        {/*
          * "New", not "Create".
          *
          * MEASURED 2026-10-06 on the homepage: two visible controls carried
          * the label "Create" — the nav link to /media and this button. They
          * go to completely different places.
          *
          * "NowOpen Create" is the MARKETPLACE's name and has prior claim: it
          * is the public page title, the nav item and has its own audit doc.
          * This button is the newer arrival, so it yields. The sheet it opens
          * still asks the brand's question — "What do you want to open?" —
          * which is where the positioning lives; the button only has to be
          * unambiguous.
          */}
        <span className="text-sm font-bold">New</span>
      </button>

      {/*
        * Suspense falls back to nothing: the sheet appears when its chunk
        * lands, which on any normal connection is faster than the open
        * animation. A spinner here would flash for 80ms and look broken.
        */}
      {open && (
        <Suspense fallback={null}>
          <CreateHub
            open={open}
            onClose={() => setOpen(false)}
            signedIn={Boolean(user)}
            hasBusiness={hasBusiness === true}
          />
        </Suspense>
      )}
    </>
  );
}
