/**
 * NOWOPEN | INSTAGRAM — the door a business on Instagram can walk through.
 *
 * ── WHY THIS PAGE EXISTS ─────────────────────────────────────────────────
 *
 * MEASURED 2026-10-10: 4,108 listable businesses, 2 claimed, ZERO claims ever
 * submitted. The claim funnel is sound — RLS permits the insert, a logged-out
 * visitor is sent to /login?next=<listing>, and the admin panel renders what
 * arrives. Nobody has ever reached it, because a business on Instagram has no
 * way to learn that NowOpen already holds its listing. It would have to know
 * the platform exists, search for itself, and pick its own row out of four
 * thousand.
 *
 * One field fixes that: type the handle you already know, find your listing.
 *
 * ── IT SPENDS NO INSTAGRAM QUOTA ─────────────────────────────────────────
 *
 * This page never calls Meta. `extract-instagram` is staff-gated precisely
 * because it spends the app's hourly budget, MEASURED at 86% of the hour from
 * a single admin run — a public field anyone can type into would empty it in
 * minutes and take the admin tooling down with it.
 *
 * It does not need to. NowOpen already holds the handles, so this searches our
 * own directory: free, instant, and the answer to the only question the
 * visitor is asking, which is "am I already on here?"
 *
 * ── WHAT IT PROMISES ─────────────────────────────────────────────────────
 *
 * Nothing it cannot do. It does not claim a connection to Instagram, does not
 * show follower counts, and does not say a listing is verified. It finds a
 * listing or honestly reports that there is none, and hands over to the two
 * flows that already exist: claiming, and /add-business.
 */

import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Instagram, Search, Loader2, ArrowRight, Store, MapPin, ShieldCheck } from 'lucide-react';

import { supabase } from '../lib/supabase';
import { applySeo } from '../lib/seo';
import { readHandle } from '../lib/instagramBatch';
import {
  rankMatches, isOwned, listingPath, type ListingRow, type LookupOutcome,
} from '../lib/instagramLookup';

/**
 * Columns the match needs, named rather than `*`.
 *
 * A listing row is wide and this page renders five fields of it; sending the
 * rest to every visitor who types a handle is bandwidth nobody reads.
 */
const LOOKUP_COLUMNS = 'id,name,username,location,category,image_url,claim_status,social_links';

export default function InstagramOnboarding() {
  const navigate = useNavigate();
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<LookupOutcome | null>(null);
  /*
   * The "add it from Instagram" step, which is the only thing on this page
   * that spends a Meta lookup. Kept separate from `busy` so the directory
   * search stays instant and this one can say what it is doing.
   */
  const [filing, setFiling] = useState(false);
  const [filed, setFiled] = useState<{ ok: boolean; message: string; name?: string } | null>(null);

  useEffect(() => {
    applySeo({
      title: 'Find your business from your Instagram handle — NowOpen Africa',
      description:
        'Already on Instagram? Enter your handle to see whether NowOpen Africa already lists your '
        + 'business, and claim it. Free, and no Instagram login required to look.',
      path: '/instagram',
    });
  }, []);

  const look = useCallback(async () => {
    const handle = readHandle(input);
    if (!handle) {
      setOutcome({ kind: 'invalid' });
      return;
    }

    setBusy(true);
    try {
      /*
       * Two cheap reads, both against our own directory.
       *
       * The handle search uses the jsonb TEXT accessor: `.ilike` on the whole
       * `social_links` column asks Postgres for `jsonb ~~* unknown`, which
       * does not exist, and the error arrives attached to the wrong thing.
       */
      const [byHandle, byName] = await Promise.all([
        supabase.from('businesses').select(LOOKUP_COLUMNS)
          .eq('is_listable', true)
          /*
           * profile_state too, ALWAYS beside is_listable. The generated column
           * does not include it, so filtering one without the other shows
           * every unreviewed /add-business submission to the public.
           */
          .eq('profile_state', 'published')
          .ilike('social_links->>instagram', `%${handle}%`)
          .limit(20),
        supabase.from('businesses').select(LOOKUP_COLUMNS)
          .eq('is_listable', true)
          .eq('profile_state', 'published')
          .ilike('name', `%${handle.replace(/[._]/g, ' ')}%`)
          .limit(20),
      ]);

      if (byHandle.error || byName.error) {
        /*
         * supabase-js RESOLVES with { data: null, error } — a `.catch` never
         * fires — so a failed read would otherwise render as "no listing
         * found", which is a different and much worse answer.
         */
        throw new Error(byHandle.error?.message ?? byName.error?.message ?? 'lookup failed');
      }

      const rows = [...(byHandle.data ?? []), ...(byName.data ?? [])] as unknown as ListingRow[];
      const matches = rankMatches(handle, rows);
      setOutcome(matches.length ? { kind: 'found', matches } : { kind: 'none', handle });
    } catch (e) {
      /*
       * Never silently report "no listing": a business told it is not on
       * NowOpen will go and create a second copy of its own page.
       */
      setOutcome(null);
      // eslint-disable-next-line no-console
      console.warn('[instagram-onboarding] lookup failed', e);
      alert(`We could not search just now (${(e as Error).message}). Please try again in a moment.`);
    } finally {
      setBusy(false);
    }
  }, [input]);

  /**
   * Ask Instagram for the account and file it for review.
   *
   * Anonymous on purpose — a business owner should not need a NowOpen account
   * to tell us they exist. The endpoint carries the guards (duplicate check
   * before any lookup, per-caller limit, and a ceiling on the share of Meta's
   * hour public traffic may spend) because this is the one path on the site
   * where a stranger can spend the app's quota.
   */
  const fileFromInstagram = useCallback(async (handle: string) => {
    setFiling(true);
    setFiled(null);
    try {
      const { data, error } = await supabase.functions.invoke('instagram-intake', { body: { handle } });
      if (error) throw new Error(error.message);
      setFiled({
        ok: !!data?.ok,
        message: String(data?.reason ?? (data?.ok ? 'Sent for review.' : 'That did not work.')),
        name: data?.name,
      });
    } catch (e) {
      setFiled({ ok: false, message: `We could not do that just now (${(e as Error).message}).` });
    } finally {
      setFiling(false);
    }
  }, []);

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <div className="flex items-center gap-2.5 mb-2">
        <Instagram size={22} className="text-pink-600" />
        <h1 className="text-2xl font-extrabold text-gray-900 dark:text-white">
          Find your business from your Instagram handle
        </h1>
      </div>
      <p className="text-sm text-gray-600 dark:text-gray-300 mb-6">
        NowOpen Africa lists businesses across the continent. Type the handle you already use and
        we will check whether yours is one of them.
      </p>

      <div className="flex gap-2 flex-wrap">
        <div className="flex-1 min-w-[220px] flex items-center rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3">
          <span className="text-gray-400 text-sm">@</span>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void look(); }}
            placeholder="yourbusiness"
            aria-label="Your Instagram handle"
            className="flex-1 bg-transparent px-2 py-3 text-sm outline-none"
          />
        </div>
        <button
          onClick={() => void look()}
          disabled={busy || !input.trim()}
          className="inline-flex items-center gap-2 rounded-xl bg-nowopen-500 px-5 py-3 text-sm font-bold text-white hover:bg-nowopen-600 disabled:opacity-40 disabled:cursor-not-allowed min-h-[44px]"
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
          {busy ? 'Looking…' : 'Find my business'}
        </button>
      </div>

      {/*
        * Said before they type, because it is the question a business asks
        * about anything that mentions Instagram.
        */}
      <p className="mt-2 text-[11px] text-gray-500">
        No Instagram login needed, and nothing is posted to your account. We only search the
        businesses already listed on NowOpen.
      </p>

      {outcome?.kind === 'invalid' && (
        <p className="mt-6 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4 text-sm text-amber-800 dark:text-amber-200">
          That does not look like an Instagram handle. Try the name after the @ — or paste your
          profile link.
        </p>
      )}

      {outcome?.kind === 'found' && (
        <div className="mt-6 space-y-3">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">
            {outcome.matches.length === 1 ? 'This looks like you' : 'These look like you'}
          </p>
          {outcome.matches.map(({ listing, via }) => (
            <div
              key={listing.id}
              className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 flex items-start gap-3 flex-wrap"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <Store size={15} className="text-gray-400 shrink-0" />
                  <span className="font-bold text-gray-900 dark:text-white">{listing.name}</span>
                  {/*
                    * The two kinds of match are shown differently on purpose.
                    * A handle match is a fact; a name match is a guess, and the
                    * next screen hands over a real company's page.
                    */}
                  {via === 'handle' ? (
                    <span className="rounded bg-emerald-50 dark:bg-emerald-900/30 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                      your handle is on this listing
                    </span>
                  ) : (
                    <span className="rounded bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 text-[10px] font-semibold text-gray-600 dark:text-gray-300">
                      similar name — check it is yours
                    </span>
                  )}
                </div>
                <p className="mt-1 text-[12px] text-gray-500 flex items-center gap-1.5 flex-wrap">
                  {listing.category && <span>{listing.category}</span>}
                  {listing.location && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin size={11} /> {listing.location}
                    </span>
                  )}
                </p>
                {isOwned(listing) && (
                  <p className="mt-1 text-[11px] text-gray-500 inline-flex items-center gap-1">
                    <ShieldCheck size={12} /> Someone has already claimed this listing.
                  </p>
                )}
              </div>
              <button
                onClick={() => navigate(listingPath(listing))}
                className="inline-flex items-center gap-2 rounded-xl border border-gray-300 dark:border-gray-600 px-4 py-2.5 text-[12px] font-semibold min-h-[44px]"
              >
                {/*
                  * Always "open", never "claim". The claim lives on the
                  * listing, behind sign-in and an admin review — promising it
                  * from here would skip both.
                  */}
                Open the listing <ArrowRight size={14} />
              </button>
            </div>
          ))}
          <p className="text-[11px] text-gray-500">
            Not yours? Open it and use “Something wrong with this listing?”, or{' '}
            <Link to="/add-business" className="underline">add your business</Link> instead.
          </p>
        </div>
      )}

      {outcome?.kind === 'none' && (
        <div className="mt-6 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">
            NowOpen does not list @{outcome.handle} yet.
          </p>
          <p className="mt-1 text-[12px] text-gray-600 dark:text-gray-300">
            {/*
              * No Meta call is made here, so this is honestly "we have no
              * listing", not "your account does not exist". Saying the latter
              * would be a claim about Instagram that was never checked.
              */}
            That means we have no listing for it — not that anything is wrong with your account.
            Adding it takes a minute and it is free.
          </p>
          {!filed && (
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={() => void fileFromInstagram(outcome.handle)}
                disabled={filing}
                className="inline-flex items-center gap-2 rounded-xl bg-nowopen-500 px-5 py-3 text-sm font-bold text-white hover:bg-nowopen-600 disabled:opacity-40 min-h-[44px]"
              >
                {filing ? <Loader2 size={15} className="animate-spin" /> : <Instagram size={15} />}
                {filing ? 'Reading your Instagram…' : 'Add it from my Instagram'}
              </button>
              <Link
                to="/add-business"
                className="inline-flex items-center gap-2 rounded-xl border border-gray-300 dark:border-gray-600 px-5 py-3 text-sm font-semibold min-h-[44px]"
              >
                Fill it in myself <ArrowRight size={15} />
              </Link>
            </div>
          )}

          {!filed && (
            <p className="mt-2 text-[11px] text-gray-500">
              {/*
                * Both halves said before the click. "Created immediately"
                * would be untrue — the record is created immediately, the
                * listing is not, and a person checks it first.
                */}
              We read your public Instagram business profile and send it for review. No account
              needed, and nothing is published until a person has checked it.
            </p>
          )}

          {filed && (
            <div
              className={`mt-3 rounded-xl border p-4 text-sm ${
                filed.ok
                  ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-200'
                  : 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200'
              }`}
            >
              {filed.ok && filed.name && (
                <p className="font-semibold">{filed.name} — sent for review</p>
              )}
              <p className={filed.ok && filed.name ? 'mt-1 text-[12px]' : ''}>{filed.message}</p>
              {!filed.ok && (
                <Link to="/add-business" className="mt-2 inline-flex items-center gap-1.5 underline text-[12px]">
                  Add my business directly <ArrowRight size={13} />
                </Link>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
