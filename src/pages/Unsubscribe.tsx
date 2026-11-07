import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Check, Loader2 } from 'lucide-react';

import { supabase } from '../lib/supabase';
import { applySeo } from '../lib/seo';

/**
 * Stopping the messages, without an account.
 *
 * ── IT RUNS ON ARRIVAL, NOT ON A BUTTON ──────────────────────────────────
 *
 * Somebody clicking "stop contacting me" has already made their decision. A
 * confirmation step here would be a dark pattern with extra steps, and worse,
 * it breaks the mail-client One-Click unsubscribe the message advertises —
 * that expects the link itself to be sufficient.
 *
 * ── IT ALWAYS SAYS IT WORKED ─────────────────────────────────────────────
 *
 * `claimreach_unsubscribe` returns true for a token it has never seen, and
 * this page reports success either way. Distinguishing a real token from a
 * fake one would turn the endpoint into an oracle for whether a given address
 * is on file — which is a privacy leak available to anyone who can guess.
 *
 * The one thing it will not do is claim success when the request itself
 * failed: a network error says so, because a recipient who is told they are
 * unsubscribed and then hears from us again has been lied to.
 */
export default function Unsubscribe() {
  const [params] = useSearchParams();
  const token = params.get('t') ?? '';
  const [state, setState] = useState<'working' | 'done' | 'failed'>('working');

  useEffect(() => {
    return applySeo({
      title: 'Unsubscribe — NowOpen Africa',
      description: 'Stop receiving messages from NowOpen Africa.',
      path: '/unsubscribe',
      robots: 'noindex, nofollow',
    });
  }, []);

  useEffect(() => {
    if (!token) { setState('done'); return; }
    let live = true;
    // `error`, not a rejection — supabase-js resolves with { data, error }.
    supabase.rpc('claimreach_unsubscribe', { p_token: token }).then(({ error }) => {
      if (!live) return;
      setState(error ? 'failed' : 'done');
    });
    return () => { live = false; };
  }, [token]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center px-4 py-16">
      <div className="max-w-md w-full rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-8 text-center">
        {state === 'working' && (
          <>
            <Loader2 className="mx-auto animate-spin text-gray-400" size={28} />
            <p className="mt-4 text-gray-600 dark:text-gray-400">Stopping these messages…</p>
          </>
        )}

        {state === 'done' && (
          <>
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/40">
              <Check className="text-green-700 dark:text-green-300" size={24} />
            </div>
            <h1 className="mt-4 text-xl font-bold text-gray-900 dark:text-white">
              You will not hear from us again
            </h1>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              We have recorded that this address should not be contacted. It takes effect
              immediately and does not expire.
            </p>
            <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">
              Your listing stays on NowOpen and you can still claim it whenever you want to —
              unsubscribing only stops the messages.
            </p>
            <Link
              to="/"
              className="mt-6 inline-flex min-h-[44px] items-center rounded-xl border border-gray-300 dark:border-gray-600 px-5 text-sm font-semibold text-gray-700 dark:text-gray-200"
            >
              Go to NowOpen
            </Link>
          </>
        )}

        {state === 'failed' && (
          <>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">
              That did not go through
            </h1>
            {/*
              * Deliberately NOT reported as success. Somebody told they are
              * unsubscribed who then hears from us again has been lied to.
              */}
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              We could not record your request just now, so we have not stopped anything yet.
              Please try again, or email{' '}
              <a className="font-semibold underline" href="mailto:hello@nowopenafrica.com">
                hello@nowopenafrica.com
              </a>{' '}
              and we will do it by hand.
            </p>
            <button
              type="button"
              onClick={() => { setState('working'); window.location.reload(); }}
              className="mt-6 inline-flex min-h-[44px] items-center rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white"
            >
              Try again
            </button>
          </>
        )}
      </div>
    </div>
  );
}
