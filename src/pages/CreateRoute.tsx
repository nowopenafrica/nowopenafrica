import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import CreateHub from '../components/universalCreate/CreateHub';
import CreateReelFlow from '../components/universalCreate/CreateReelFlow';
import { ACTIONS_BY_TYPE, permissionFor } from '../lib/universalCreate/intents';
import { rememberIntent } from '../lib/universalCreate/pendingIntent';
import { track } from '../lib/telemetry';
import { applySeo } from '../lib/seo';

/**
 * /create and /create/:type — the hub, deep-linkable.
 *
 * ── WHY A ROUTE AND NOT ONLY A BUTTON ────────────────────────────────────
 *
 * So the hub can be linked to. "Open your business on NowOpen —
 * nowopenafrica.com/create/business" is a thing somebody can put in a WhatsApp
 * message, and it lands on the actual workflow rather than a homepage with an
 * instruction to find a button.
 *
 * /create/:type does not render a second copy of anything: it resolves the
 * type to the same destination the hub would use and forwards. One source of
 * truth for where each action goes (intents.ts), two ways in.
 */
export default function CreateRoute() {
  const { type } = useParams<{ type?: string }>();
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [hasBusiness, setHasBusiness] = useState<boolean | null>(null);

  useEffect(() => {
    applySeo({
      title: 'Create — NowOpen Africa',
      description: 'Open a business, a service, an offer or an advert on NowOpen Africa.',
      // Nothing here is content for a search engine, and /create/:type only
      // forwards — indexing it would put a redirect in the results.
      robots: 'noindex, nofollow',
    });
  }, []);

  useEffect(() => {
    if (!user) { setHasBusiness(false); return; }
    let alive = true;
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
        if (alive) setHasBusiness(!error && (count ?? 0) > 0);
      });
    return () => { alive = false; };
  }, [user]);

  /*
   * A typed deep link forwards to the real workflow.
   *
   * It waits for auth to settle first: deciding "you must sign in" while the
   * session is still loading would bounce a signed-in person to the login
   * page, which is the most annoying possible bug in a link somebody shared.
   */
  useEffect(() => {
    if (!type || loading || hasBusiness === null) return;

    const action = ACTIONS_BY_TYPE[type];
    if (!action) { navigate('/create', { replace: true }); return; }

    const permission = permissionFor(action, {
      signedIn: Boolean(user),
      hasBusiness: hasBusiness === true,
    });

    track('create_deep_link', { type, permission });

    if (permission === 'allowed') {
      /*
       * An in-place action's destination is THIS route, so navigating to it
       * would be an infinite redirect. It renders below instead.
       */
      if (action.opensInPlace) return;
      navigate(action.destination!, { replace: true });
      return;
    }
    if (permission === 'needs_auth') {
      rememberIntent({ type: action.type, source: 'deep_link' }, action.destination ?? '/dashboard');
      navigate('/login', { replace: true });
      return;
    }
    // not_built, or no business yet: fall through to the hub, which explains
    // why in words rather than leaving somebody on a blank page.
    navigate('/create', { replace: true });
  }, [type, loading, user, hasBusiness, navigate]);

  /*
   * /create/reel — the camera, straight away. Deep-linkable on purpose: it is
   * the one creation action somebody might want to reach from a shortcut on a
   * phone home screen.
   */
  if (type === 'reel' && !loading && hasBusiness === true) {
    return <CreateReelFlow onDone={() => navigate('/dashboard?tab=businesses')} />;
  }

  return (
    <div className="min-h-[60vh]">
      <CreateHub
        open
        onClose={() => navigate('/')}
        signedIn={Boolean(user)}
        hasBusiness={hasBusiness === true}
      />
    </div>
  );
}
