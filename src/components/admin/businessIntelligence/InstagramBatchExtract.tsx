import { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Upload, Loader2, Play, Square, CheckCircle2, AlertTriangle, Download } from 'lucide-react';

import { supabase } from '../../../lib/supabase';
import { SERVER_ROW_CAP } from '../../../lib/fetchAllBusinesses';
import {
  shouldSkipLookup, skipExplanation, checkRow,
  type HandleCheck, type CheckOutcome,
} from '../../../lib/instagramHandleChecks';
import { isWriteThrottled, throttleExplanation } from '../../../lib/writeThrottle';
import { parseCsv } from '../ImportCenter';
import { buildInstagramCandidate } from '../../../lib/instagramCandidate';
import { readCaptions } from '../../../lib/instagramCaptions';
import { planBatch, readHandle, BATCH_LIMIT, BATCH_DELAY_MS, type BatchPlan } from '../../../lib/instagramBatch';
import { readUsage, pace, resumeAt, pauseExplanation } from '../../../lib/instagramQuota';
import {
  classifyHandles, preflightSummary, EMPTY_KNOWN,
  type Preflight, type KnownHandles,
} from '../../../lib/instagramPreflight';

/**
 * Looking up a list of Instagram handles, one after another.
 *
 * ── WHAT THIS IS ─────────────────────────────────────────────────────────
 *
 * The single extractor, repeated over a list somebody already holds. Each
 * lookup is the same authorised business_discovery call; the only new thing
 * is that a person is not typing them one at a time.
 *
 * `radar_sources.instagram_graph` records `bulk_extraction = 'prohibited'`
 * and that record stands: this does not harvest Instagram to FIND businesses.
 * What makes a list legitimate is where it came from, which is why the screen
 * asks and records the answer on every row it files.
 *
 * ── FACTS ONLY, AND THAT IS PERMANENT ────────────────────────────────────
 *
 * In single mode an operator ticks services, products and the logo per
 * account, having looked at it. Here nobody is looking, so none of those are
 * carried — only the name, website, bio, account link and post permalinks.
 * A service confirmed by nobody is a service nobody confirmed, whatever
 * route it took into the database.
 *
 * ── SEQUENTIAL, SLOWLY, AND STOPPABLE ────────────────────────────────────
 *
 * business_discovery is rate-limited per app and that budget is shared with
 * every other feature. A burst spends it; a pause between calls is the only
 * version that reaches the end of a long list. The run stops on the first
 * rate-limit answer rather than hammering through it, and the operator can
 * stop it at any point without losing what has already been filed.
 */

type RowState = 'waiting' | 'running' | 'filed' | 'updated' | 'skipped' | 'failed';

/**
 * Handles per request when reading what we already know about them.
 *
 * `.in()` becomes a query string, so a 1,000-handle batch in one URL is a
 * request no proxy will thank us for. 200 keeps each URL short.
 */
const KNOWN_CHUNK = 200;

/**
 * Meta's quota headers out of the edge function's JSON, shaped like Headers.
 *
 * `readUsage` takes anything with a `get`, so the same parser works on a real
 * Response and on the plain object that comes back over the wire.
 */
const usageOf = (data: unknown): { get(name: string): string | null } => {
  const u = (data as { usage?: Record<string, string> } | null)?.usage ?? {};
  return { get: (name: string) => u[name.toLowerCase()] ?? null };
};

interface Outcome {
  handle: string;
  state: RowState;
  detail?: string;
}

/**
 * Everything NowOpen already holds about the handles in a file.
 *
 * Three sources, three stored shapes, all normalised through `readHandle`:
 *
 *   businesses.social_links->>'instagram'  bare handle OR full URL, and
 *                                          sometimes a /profilecard/ suffix
 *   radar_candidates.source_record_id      always a full profile URL
 *   instagram_handle_checks.handle         bare, lowercase
 *
 * Throws on a failed read rather than returning a half-answer. A partial
 * result here is indistinguishable from "these accounts are new", and the
 * caller would spend the hour proving otherwise.
 */
async function loadKnownHandles(handles: string[]): Promise<KnownHandles> {
  const wanted = new Set(handles.map((h) => h.toLowerCase()));
  const out: KnownHandles = { listed: new Set(), filed: new Set(), unreadable: new Set() };

  /*
   * Published listings.
   *
   * Paged, because PostgREST truncates a response at 1000 rows with no error
   * and a silently short list would report held accounts as new. Filtered
   * server-side to rows that actually carry a handle.
   */
  for (let from = 0; ; from += KNOWN_CHUNK) {
    const { data, error } = await supabase
      .from('businesses')
      .select('social_links')
      .not('social_links->>instagram', 'is', null)
      .order('id')
      .range(from, from + KNOWN_CHUNK - 1);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      const h = readHandle((row.social_links as Record<string, string> | null)?.instagram);
      if (h && wanted.has(h)) out.listed.add(h);
    }
    if ((data?.length ?? 0) < KNOWN_CHUNK) break;
  }

  /*
   * Candidates already in the review queue, and handles the ledger has
   * already been told are not readable. Both are exact-match lookups
   * restricted to the file's own handles, so they are chunked by the URL
   * length a query string can carry rather than by the row cap.
   */
  const list = [...wanted];
  for (let i = 0; i < list.length; i += KNOWN_CHUNK) {
    const slice = list.slice(i, i + KNOWN_CHUNK);

    const { data: cands, error: cErr } = await supabase
      .from('radar_candidates')
      .select('source_record_id')
      .eq('source_key', 'manual_extraction')
      .in('source_record_id', slice.map((h) => `https://www.instagram.com/${h}/`));
    if (cErr) throw new Error(cErr.message);
    for (const c of cands ?? []) {
      const h = readHandle(c.source_record_id as string);
      if (h) out.filed.add(h);
    }

    const { data: checks, error: kErr } = await supabase
      .from('instagram_handle_checks')
      .select('handle')
      .eq('outcome', 'not_business')
      .in('handle', slice);
    if (kErr) throw new Error(kErr.message);
    for (const c of checks ?? []) out.unreadable.add(String(c.handle).toLowerCase());
  }

  return out;
}

export default function InstagramBatchExtract() {
  const [plan, setPlan] = useState<BatchPlan | null>(null);
  const [filename, setFilename] = useState('');
  /** Where the list came from. Recorded on every row this files. */
  const [listSource, setListSource] = useState('');
  /*
   * Copying each account's profile picture into our own storage.
   *
   * A separate choice from the rest because it is the only one that puts a
   * copy of somebody's image on our servers rather than a link to it. The
   * logo identifies the business in a directory it has not claimed, so it is
   * defensible — but it is a decision an operator should be able to decline,
   * and it costs an extra request per account.
   */
  const [carryLogos, setCarryLogos] = useState(true);
  /*
   * How much of Meta's hour is spent, once it starts telling us. null while
   * there is room, or while Meta has reported nothing -- which is NOT zero.
   */
  const [quotaSpent, setQuotaSpent] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const [done, setDone] = useState(0);
  /** Set when the operator presses stop; the loop checks it between lookups. */
  const abort = useRef(false);
  /** So a refusal can put the cursor in the field that caused it. */
  const sourceRef = useRef<HTMLInputElement | null>(null);
  /**
   * What the uploaded file already contains, worked out before any lookup.
   *
   * null while it is being read; a Preflight once known. Quota is the scarce
   * thing here, and asking Instagram about an account the database already
   * holds spends it to learn nothing.
   */
  const [preflight, setPreflight] = useState<Preflight | null>(null);
  const [checking, setChecking] = useState(false);
  /**
   * Leave out the accounts NowOpen already holds.
   *
   * On by default, because quota is the scarce thing: MEASURED 2026-10-09, a
   * single lookup took the app to 86% of its hourly time budget, so asking
   * again about an account already in the database spends the hour to learn
   * nothing.
   *
   * It is a CHOICE rather than a rule because re-reading an account is the
   * only way a listing's bio, services, products or category are refreshed —
   * the gallery sync brings in new posts, nothing else re-reads the profile.
   * An operator deliberately refreshing a list needs to be able to say so.
   */
  const [skipExisting, setSkipExisting] = useState(true);

  const onFile = async (file: File) => {
    if (!/\.csv$/i.test(file.name)) {
      /*
       * The same answer ImportCenter gives, for the same reason: parsing xlsx
       * in the browser means a megabyte of dependency to read one column.
       */
      toast.error(
        'Upload a CSV. In Excel or Sheets choose File → Save as / Download → CSV, then upload that.',
        { duration: 8000 },
      );
      return;
    }
    const text = await file.text();
    const { headers, rows } = parseCsv(text);
    if (!headers.length) {
      toast.error('That file has no readable rows.');
      return;
    }
    const p = planBatch(headers, rows);
    if (!p.column) {
      /*
       * Refusing to guess. Taking the first column would look up two hundred
       * business names and report every one missing — indistinguishable from
       * a list of accounts that have genuinely gone.
       */
      toast.error(
        `No handle column found. Name one of the columns "instagram", "handle" or "username". `
        + `Found: ${headers.join(', ')}`,
        { duration: 9000 },
      );
      return;
    }
    setFilename(file.name);
    setPlan(p);
    setOutcomes([]);
    setDone(0);

    // Look up what we already hold before offering to spend anything.
    setChecking(true);
    setPreflight(null);
    try {
      setPreflight(classifyHandles(p.handles, await loadKnownHandles(p.handles)));
    } catch (e) {
      /*
       * A preflight that cannot run must not block the batch: it is an
       * optimisation, not a gate. Say so and let the operator decide, rather
       * than silently classifying every handle as new -- which would look
       * identical to a file of genuinely new accounts.
       */
      toast.error(`Could not check which accounts are already on NowOpen (${(e as Error).message}). Everything will be looked up.`);
      setPreflight(classifyHandles(p.handles, EMPTY_KNOWN));
    } finally {
      setChecking(false);
    }
  };

  const run = async (only?: string[]) => {
    if (!plan) return;
    if (!listSource.trim()) {
      /*
       * Belt and braces: the button is disabled without this, so reaching
       * here means a keyboard or a stale render. Put the cursor where the
       * answer goes rather than only saying no.
       */
      sourceRef.current?.focus();
      toast.error('Say where this list came from first — it is recorded against every listing filed.');
      return;
    }
    /*
     * `only` is what Continue passes: the handles a paused run never got to.
     * Re-running the whole list would spend the quota again on accounts
     * already filed, which is the opposite of the point.
     */
    const handles = (only ?? plan.handles).slice(0, BATCH_LIMIT);
    abort.current = false;
    setRunning(true);
    /*
     * A resume keeps the board: the rows already filed stay filed, and only
     * the ones never attempted are retried.
     */
    if (!only) setOutcomes(handles.map((handle) => ({ handle, state: 'waiting' as RowState })));
    setDone(0);

    /*
     * Addressed by HANDLE, not by index. On a resume the loop walks only the
     * handles that were never attempted, so its index no longer lines up with
     * the board — and writing a result onto the wrong row is the kind of bug
     * that reads as data loss.
     */
    const mark = (h: string, state: RowState, detail?: string) =>
      setOutcomes((prev) => prev.map((o) => (o.handle === h ? { ...o, state, detail } : o)));

    /*
     * What we already know about these handles.
     *
     * Read in chunks because `.in()` becomes a query string, and a thousand
     * handles in one URL is a request no proxy will thank us for.
     */
    const known = new Map<string, HandleCheck>();
    for (let i = 0; i < handles.length; i += KNOWN_CHUNK) {
      const slice = handles.slice(i, i + KNOWN_CHUNK);
      const { data: rows, error: knownErr } = await supabase
        .from('instagram_handle_checks')
        .select('handle,outcome,last_checked_at,check_count,reason')
        .in('handle', slice);
      /*
       * A failure here must not silently become "nothing is known", which
       * would re-spend the API budget on handles already known to be
       * unreadable. Say so and carry on looking them up — the run still
       * works, it just costs what it used to.
       */
      if (knownErr) toast.error(`Could not read previous checks (${knownErr.message}); every handle will be looked up again.`);
      for (const r of (rows ?? []) as HandleCheck[]) known.set(r.handle, r);
    }

    /** File the outcome against the handle, so it is not announced and lost. */
    const recordCheck = async (handle: string, outcome: CheckOutcome, reason: string | null) => {
      const row = checkRow(handle, outcome, reason, known.get(handle.toLowerCase()), {
        listSource: listSource.trim(), sourceFile: filename,
      });
      // No .select() after the write: RLS would evaluate a read the writer
      // may not have and kill the write itself.
      const { error: upErr } = await supabase
        .from('instagram_handle_checks').upsert(row, { onConflict: 'handle' });
      if (upErr) console.warn('[instagram-batch] could not record check', handle, upErr.message);
    };

    /*
     * Tracked locally rather than read back from `outcomes`: that is React
     * state, and inside this loop it is a render behind.
     */
    let throttled = false;
    /*
     * Meta reports how much of the hour is spent on EVERY response, and
     * nothing was reading it. Tracked here so the run can stretch its
     * remaining calls and stop while they still work, rather than sprinting
     * into a refusal.
     */
    let paused = false;
    let pausedFor = 0;
    let delayMs = BATCH_DELAY_MS;
    let filedCount = 0;
    let stoppedAt = handles.length;

    for (let i = 0; i < handles.length; i += 1) {
      if (abort.current) break;
      stoppedAt = i;
      const handle = handles[i];

      /*
       * Already known to be unreadable, and recently enough to trust.
       *
       * This is the whole point of the ledger: Meta told us once that this
       * account cannot be read through the official API, so we do not spend
       * a call asking again. The answer still expires — see
       * RECHECK_AFTER_DAYS — because a personal account can be switched to a
       * Business account at any time.
       */
      const prior = known.get(handle.toLowerCase());
      if (prior && shouldSkipLookup(prior)) {
        mark(handle, 'skipped', skipExplanation(prior));
        setDone(i + 1);
        // No API call was made, so there is nothing to be polite about.
        continue;
      }

      mark(handle, 'running');

      const { data, error } = await supabase.functions.invoke('extract-instagram', { body: { handle } });

      if (error) {
        mark(handle, 'failed', error.message);
        await recordCheck(handle, 'error', error.message);
      } else if (!data?.ok) {
        /*
         * A rate limit stops the run. Continuing would spend the app's budget
         * on calls that cannot succeed and leave the rest of the list looking
         * like accounts that do not exist.
         */
        if (/rate limit/i.test(String(data?.reason ?? ''))) {
          /*
           * PAUSED, not failed.
           *
           * The run kept everything it filed and knows exactly where to pick
           * up, and Meta tells us when access returns
           * (estimated_time_to_regain_access, in minutes). Calling that a
           * failure is what sends somebody looking for a way around the
           * limit — there isn't one, and the honest answer is a clock time.
           */
          const p = pace(readUsage(usageOf(data)), BATCH_DELAY_MS);
          pausedFor = p.action === 'pause' ? p.resumeInMinutes : 60;
          mark(handle, 'waiting', `Not attempted — paused until about ${resumeAt(pausedFor)}.`);
          /*
           * Recorded as 'rate_limited' — which never suppresses a later
           * lookup. This says Instagram was busy, not that the account is
           * unreadable, and confusing the two would lock a real business out
           * of the directory on the strength of one bad afternoon.
           */
          await recordCheck(handle, 'rate_limited', 'Instagram rate limit reached');
          paused = true;
          break;
        }
        const reason = String(data?.reason ?? 'Not a public business account');
        mark(handle, 'skipped', reason);
        /*
         * The finding this whole ledger exists for. It used to be printed
         * here and forgotten; now the handle carries it, so the next run
         * skips it and somebody can pull the list of handles worth asking to
         * switch to a Business account.
         */
        await recordCheck(handle, 'not_business', reason);
      } else {
        /*
         * ── WHAT THE BATCH NOW CARRIES, AND WHY IT IS NOT INVENTION ──────
         *
         * Everything below is a literal substring of something the business
         * itself published, or a fact about its own account. `readCaptions`
         * only returns lines introduced by a marker the business wrote
         * ("Services:", "Menu:", a bullet it typed) — it never infers a trade
         * or completes a thought, and a caption that lists nothing yields
         * nothing. Prices are deliberately not carried at all.
         *
         * Services and products are split on the business's own word: "Menu:"
         * and "Products:" name stock, everything else names work. An
         * unlabelled item counts as a service, because calling something a
         * product asserts there is a thing to buy.
         *
         * And none of it is published by this step. Every row lands in the
         * review queue for a person to approve, exactly as before — what has
         * changed is that a reviewer now sees what the account actually says,
         * rather than a bare name they must go and research by hand.
         */
        const findings = readCaptions(data.profile.media ?? []);
        const products = findings.productOfferings;
        const services = findings.offerings.filter((o) => !products.includes(o));

        /*
         * The logo, copied into our own storage by `instagram-logo`.
         *
         * Never Meta's `profile_picture_url`: it is signed and expires within
         * days, so a stored link is a broken logo on a real listing inside a
         * week. A failure here is reported and the filing continues — losing
         * every other field because one image fetch timed out would be worse.
         */
        let logoUrl: string | null = null;
        if (carryLogos) {
          const { data: logo, error: logoErr } = await supabase.functions
            .invoke('instagram-logo', { body: { handle } });
          if (!logoErr && logo?.ok) logoUrl = logo.logoUrl as string;
        }

        const row = buildInstagramCandidate(handle, data.profile, {
          /*
           * Still false. It governs carrying the owner's own PROSE, and it
           * means "the operator has confirmed there is a right to". Nobody
           * can make that confirmation for a thousand strangers at once, so
           * the biography is read and shown but not staged.
           */
          authoredConfirmed: false,
          confirmedOfferings: services,
          confirmedProducts: products,
          phone: findings.phones[0] ?? null,
          email: findings.emails[0] ?? null,
          whatsapp: findings.whatsapp[0] ?? null,
          logoUrl,
          permalinks: (data.profile.media ?? [])
            .map((m: { permalink?: string }) => m.permalink ?? '')
            .filter(Boolean),
        });
        if (!row) {
          mark(handle, 'skipped', 'No business name on the profile');
          // Recorded, but re-checked next run: a profile can gain a name.
          await recordCheck(handle, 'no_name', 'No business name on the profile');
        } else {
          row.decision_reason += ` Filed in a batch from ${filename}; list source: ${listSource.trim()}.`;

          const { data: existing } = await supabase
            .from('radar_candidates')
            .select('id,status')
            .eq('source_key', 'manual_extraction')
            .eq('source_record_id', row.source_record_id)
            .maybeSingle();

          if (existing && ['published', 'merged', 'rejected'].includes(String(existing.status))) {
            // A decision somebody already made is not a batch's to undo.
            mark(handle, 'skipped', `Already ${existing.status}`);
            // Still a successful read — recorded so the handle has a history.
            await recordCheck(handle, 'extracted', `Already ${existing.status}`);
          } else if (existing) {
            const { error: upErr } = await supabase
              .from('radar_candidates').update(row).eq('id', existing.id);
            mark(handle, upErr ? 'failed' : 'updated', upErr?.message);
            if (!upErr) filedCount += 1;
            await recordCheck(handle, upErr ? 'error' : 'extracted', upErr?.message ?? null);
          } else {
            // No .select() after .insert(): RLS would evaluate a read the
            // writer may not have and kill the write.
            const { error: insErr } = await supabase.from('radar_candidates').insert(row);
            mark(handle, insErr ? 'failed' : 'filed', insErr?.message);
            if (!insErr) filedCount += 1;
            await recordCheck(handle, insErr ? 'error' : 'extracted', insErr?.message ?? null);

            /*
             * The database's hourly ceiling for new candidates.
             *
             * Carrying on would spend an Instagram lookup on every remaining
             * handle only to meet the same ceiling on the way back in —
             * MEASURED 2026-10-09, a 1,000-handle run would have burned 960
             * calls producing 960 identical failures. Stop, keep what is
             * filed, and say so once.
             */
            if (isWriteThrottled(insErr)) {
              throttled = true;
              break;
            }
          }
        }
      }

      setDone(i + 1);

      /*
       * What Meta just said about the hour, and what to do next.
       *
       * 'slow' stretches the remaining calls across the window; 'pause' stops
       * BEFORE a refusal, because a refused call is still counted and would
       * spend the next hour too. Either way nothing is lost: the handles not
       * attempted stay 'waiting' and Continue picks them up.
       */
      const next = pace(readUsage(usageOf(data)), BATCH_DELAY_MS);
      if (next.action === 'pause') {
        paused = true;
        pausedFor = next.resumeInMinutes;
        break;
      }
      delayMs = next.action === 'slow' ? next.delayMs : BATCH_DELAY_MS;
      setQuotaSpent(next.action === 'slow' ? next.spent : null);

      // Wait between calls, except after the last one.
      if (i < handles.length - 1 && !abort.current) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }

    setRunning(false);

    if (paused) {
      /*
       * Deliberately not an error toast. The run stopped inside the limit
       * with everything filed and a known place to continue from -- the one
       * outcome that must not read as a failure, because that is what sends
       * an operator looking for a way around the limit.
       */
      const remaining = handles.length - stoppedAt;
      toast(pauseExplanation(filedCount, remaining, pausedFor), { duration: 12_000, icon: '⏸️' });
      return;
    }

    if (throttled) {
      /*
       * Not a success, and not the database's own sentence either — that one
       * ends "contact us if you need to add several at once", which is
       * addressed to a stranger using a public form. The person reading this
       * runs the platform.
       */
      toast.error(throttleExplanation(filedCount, handles.length - stoppedAt - 1), { duration: 10_000 });
      return;
    }

    toast.success(
      abort.current
        ? 'Stopped. Everything already filed is waiting in the Review queue.'
        : 'Batch finished. Everything filed is waiting in the Review queue.',
    );
  };

  /*
   * What a run would actually look up: the new accounts when the preflight
   * has answered, the whole file when it could not. Never "every row",
   * because that is the number that wastes the hour.
   */
  const toLookUp = (preflight && skipExisting) ? preflight.newHandles : (plan?.handles ?? []);

  const counts = outcomes.reduce<Record<string, number>>((acc, o) => {
    acc[o.state] = (acc[o.state] ?? 0) + 1;
    return acc;
  }, {});

  const downloadResults = () => {
    const lines = [
      'handle,outcome,detail',
      ...outcomes.map((o) => `${o.handle},${o.state},"${(o.detail ?? '').replace(/"/g, '""')}"`),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `instagram-batch-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /*
   * Every handle on file as unreadable, across every batch ever run.
   *
   * This is what the ledger is FOR. Recording that an account cannot be read
   * through the official API only pays off if somebody can pull the list and
   * ask those businesses to switch to a Business or Creator account — which
   * is the one legitimate way any of them ever becomes extractable.
   */
  const downloadUnreachable = async () => {
    const { data, error } = await supabase
      .from('instagram_handle_checks')
      .select('handle,reason,first_checked_at,last_checked_at,check_count,list_source,source_file')
      .eq('outcome', 'not_business')
      .order('last_checked_at', { ascending: false })
      .limit(SERVER_ROW_CAP);

    if (error) { toast.error(`Could not read the handle ledger: ${error.message}`); return; }
    if (!data?.length) { toast('No handles are on file as unreadable yet.'); return; }

    const cell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [
      'handle,reason,first_checked_at,last_checked_at,times_checked,list_source,source_file',
      ...data.map((r) => [
        r.handle, r.reason, r.first_checked_at, r.last_checked_at,
        r.check_count, r.list_source, r.source_file,
      ].map(cell).join(',')),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `instagram-handles-not-reachable-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    if (data.length === SERVER_ROW_CAP) {
      // One request cannot return more. Say so rather than imply a full list.
      toast(`Showing the ${SERVER_ROW_CAP} most recently checked — there may be more.`);
    }
  };

  return (
    <div className="space-y-5">
      <p className="max-w-3xl text-[13px] text-gray-500 dark:text-gray-400">
        Look up a list of handles you already hold — one CSV column of usernames. Each row is the
        same official lookup the single extractor makes, run one at a time, and everything found is
        filed into the Review queue for a person to approve.
      </p>

      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">The list</h3>

        <label className="flex items-center gap-3 cursor-pointer">
          <span className="inline-flex items-center gap-2 rounded-xl bg-nowopen-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-nowopen-600 min-h-[44px]">
            <Upload size={15} /> Choose a CSV
          </span>
          <input
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); }}
          />
          <span className="text-[12px] text-gray-500">
            {filename || 'One column named instagram, handle or username'}
          </span>
        </label>

        {plan && (
          <div className="mt-4 space-y-2 text-[12px]">
            <p className="text-gray-700 dark:text-gray-300">
              Reading <strong>{plan.column}</strong> — {plan.handles.length} account
              {plan.handles.length === 1 ? '' : 's'} to look up
              {plan.handles.length > BATCH_LIMIT && (
                <span className="text-amber-700 dark:text-amber-300">
                  {' '}(only the first {BATCH_LIMIT} will run)
                </span>
              )}
            </p>
            {plan.duplicates.length > 0 && (
              <p className="text-gray-500">
                {plan.duplicates.length} repeated row{plan.duplicates.length === 1 ? '' : 's'} ignored.
              </p>
            )}
            {plan.rejected.length > 0 && (
              <details className="text-amber-700 dark:text-amber-300">
                <summary className="cursor-pointer">
                  {plan.rejected.length} cell{plan.rejected.length === 1 ? '' : 's'} not a handle
                </summary>
                {/* Row number and the text, so an operator can find and fix it. */}
                <ul className="mt-1 space-y-0.5 max-h-40 overflow-y-auto">
                  {plan.rejected.slice(0, 50).map((r) => (
                    <li key={`${r.line}-${r.raw}`}>Row {r.line}: &ldquo;{r.raw}&rdquo;</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </div>

      {plan && plan.handles.length > 0 && (
        <div className="rounded-2xl border-2 border-nowopen-500/30 bg-nowopen-50/50 dark:bg-nowopen-900/10 p-5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">
            Run the batch
          </h3>

          {/*
            * Provenance is the thing that separates a list somebody holds from
            * a harvested one, so it is required rather than optional, and it
            * is written onto every row this files.
            */}
          {/*
            * What the file already contains, before anything is spent.
            *
            * Shown above the provenance field because it changes what the
            * operator is agreeing to: "look up 500" and "look up the 40 of
            * these 500 we do not already have" are different decisions.
            */}
          {checking && (
            <p className="mb-3 inline-flex items-center gap-2 text-[12px] text-gray-600 dark:text-gray-300">
              <Loader2 size={14} className="animate-spin" />
              Checking which of these NowOpen already has…
            </p>
          )}
          {!checking && preflight && (
            <div className="mb-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 p-3">
              <p className="text-[12px] text-gray-700 dark:text-gray-300">
                {preflightSummary(preflight)}
              </p>

              {(preflight.counts.listed + preflight.counts.filed + preflight.counts.unreadable) > 0 && (
                <label className="mt-2 flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={skipExisting}
                    onChange={(e) => setSkipExisting(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-gray-300 dark:border-gray-600"
                  />
                  <span className="text-[11px] text-gray-600 dark:text-gray-400">
                    <span className="font-semibold text-gray-700 dark:text-gray-300">
                      Skip the {preflight.counts.listed + preflight.counts.filed + preflight.counts.unreadable} NowOpen already has.
                    </span>{' '}
                    {/*
                      * Both sides of the choice stated, because the cost is
                      * not obvious: a lookup is quota, and the hour runs out
                      * long before the list does.
                      */}
                    {skipExisting
                      ? 'Untick to look them up again — the only way a listing’s bio, services, products or category are refreshed.'
                      : `All ${preflight.rows.length} will be looked up, refreshing the ones already held. Costs ${preflight.rows.length} lookups against Instagram’s hourly limit.`}
                  </span>
                </label>
              )}

              {preflight.counts.new === 0 && skipExisting && (
                <p className="mt-1 text-[11px] text-gray-500">
                  {/* Not an error: a list of businesses already held is a good outcome. */}
                  Nothing to do — every account in this file is already on NowOpen.
                </p>
              )}
            </div>
          )}

          <label className="block">
            <span className="text-[12px] font-semibold text-gray-700 dark:text-gray-300">
              Where did this list come from? <span className="text-rose-600">*</span>
            </span>
            <input
              ref={sourceRef}
              value={listSource}
              onChange={(e) => setListSource(e.target.value)}
              placeholder="e.g. Lagos Fashion Week 2026 exhibitor directory"
              className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 px-3.5 py-2.5 text-sm"
            />
            <span className="block text-[11px] text-gray-500 mt-1">
              Recorded against every listing this files. A batch is lookups of a list you hold —
              not a way to discover accounts, which no permitted API offers.
            </span>
          </label>

          <label className="mt-3 flex items-start gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={carryLogos}
              onChange={(e) => setCarryLogos(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 dark:border-gray-600"
            />
            <span className="text-[11px] text-gray-600 dark:text-gray-400">
              <span className="font-semibold text-gray-700 dark:text-gray-300">Copy each profile picture as the listing logo.</span>{' '}
              {/*
                * Said plainly because it is the one option that puts a copy of
                * somebody's image on our servers rather than a link to it.
                */}
              The image is fetched and stored by us — Instagram&rsquo;s own address expires within days.
              Adds a request per account.
            </span>
          </label>

          <p className="mt-3 text-[11px] text-gray-500">
            {/* Said before the click, because it is the surprising part. */}
            Carries what the account itself published: name, website, the account link, recent post
            links, and any services, products, phone or email the business wrote out in its own
            captions. Nothing is guessed, no prices are copied, and the biography is shown but not
            filed. Everything lands in the review queue for approval.
          </p>

          <div className="mt-4 flex items-center gap-3 flex-wrap">
            {!running ? (
              <button
                onClick={() => void run(toLookUp)}
                /*
                 * Disabled rather than clickable-then-refused.
                 *
                 * The guard is right — provenance is what separates a list
                 * somebody holds from a harvested one — but enforcing it with
                 * a toast AFTER the click reads as a bug: the operator has
                 * chosen a file, seen a plan, pressed the button and been told
                 * no, with the cause above the fold and easy to miss.
                 */
                disabled={!listSource.trim() || checking || toLookUp.length === 0}
                title={
                  checking ? 'Checking which accounts NowOpen already holds'
                    : toLookUp.length === 0 ? 'Every account in this file is already on NowOpen'
                      : listSource.trim() ? undefined : 'Say where the list came from first'
                }
                className="inline-flex items-center gap-2 rounded-xl bg-nowopen-500 px-5 py-3 text-sm font-bold text-white hover:bg-nowopen-600 disabled:opacity-40 disabled:cursor-not-allowed min-h-[44px]"
              >
                <Play size={16} />{' '}
                {checking
                  ? 'Checking what we already have…'
                  /*
                   * The count is of what will ACTUALLY be looked up, not of
                   * rows in the file. "Look up 500" on a file where 460 are
                   * already listed misleads about both the cost and the result.
                   */
                  : `Look up ${Math.min(toLookUp.length, BATCH_LIMIT)}${
                    // "new" only when the already-held ones are being left out.
                    preflight && skipExisting && preflight.counts.new < preflight.rows.length ? ' new' : ''
                  } account${Math.min(toLookUp.length, BATCH_LIMIT) === 1 ? '' : 's'}`}
              </button>
            ) : (
              <button
                onClick={() => { abort.current = true; }}
                className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-5 py-3 text-sm font-bold text-white hover:bg-rose-700 min-h-[44px]"
              >
                <Square size={16} /> Stop
              </button>
            )}
            {running && (
              <span className="inline-flex items-center gap-2 text-[12px] text-gray-600 dark:text-gray-300">
                <Loader2 size={14} className="animate-spin" />
                {done} of {Math.min(plan.handles.length, BATCH_LIMIT)} — about{' '}
                {Math.max(1, Math.round(((Math.min(plan.handles.length, BATCH_LIMIT) - done) * BATCH_DELAY_MS) / 60000))} min left
                {quotaSpent !== null && (
                  /*
                   * Shown only once Meta is reporting AND the run has begun
                   * easing off. Silence means there is room, or that Meta has
                   * said nothing — which is not the same as zero, so this
                   * claims neither.
                   */
                  <span className="ml-1 rounded bg-amber-50 dark:bg-amber-900/30 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                    easing off — {Math.round(quotaSpent)}% of Instagram&rsquo;s hour used
                  </span>
                )}
              </span>
            )}
            {!running && outcomes.some((o) => o.state === 'waiting') && (
              /*
               * Continue, not "run again": it retries ONLY the handles the
               * paused run never attempted, so the quota is not spent twice
               * on accounts already filed.
               */
              <button
                onClick={() => { void run(outcomes.filter((o) => o.state === 'waiting').map((o) => o.handle)); }}
                className="inline-flex items-center gap-2 rounded-xl bg-nowopen-500 px-5 py-3 text-sm font-bold text-white hover:bg-nowopen-600 min-h-[44px]"
              >
                <Play size={16} /> Continue with the remaining{' '}
                {outcomes.filter((o) => o.state === 'waiting').length}
              </button>
            )}
            {outcomes.length > 0 && !running && (
              <button
                onClick={downloadResults}
                className="inline-flex items-center gap-2 rounded-xl border border-gray-300 dark:border-gray-600 px-4 py-2.5 text-[12px] font-semibold min-h-[44px]"
              >
                <Download size={14} /> Download results
              </button>
            )}
            {!running && (
              /*
               * Available without running a batch: the ledger spans every run,
               * and the reason to open it is usually to go and talk to the
               * businesses on it, not to look at today's results.
               */
              <button
                onClick={() => { void downloadUnreachable(); }}
                title="Every handle on file as not a Business or Creator account, across all batches"
                className="inline-flex items-center gap-2 rounded-xl border border-gray-300 dark:border-gray-600 px-4 py-2.5 text-[12px] font-semibold min-h-[44px]"
              >
                <Download size={14} /> Handles that cannot be read
              </button>
            )}
          </div>
        </div>
      )}

      {outcomes.length > 0 && (
        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">Results</h3>
            <p className="text-[11px] text-gray-500">
              {/* Every outcome named, because "47 processed" hides the failures. */}
              {counts.filed ?? 0} filed · {counts.updated ?? 0} updated · {counts.skipped ?? 0} skipped
              · {counts.failed ?? 0} failed
            </p>
          </div>
          <ul className="space-y-1 max-h-96 overflow-y-auto">
            {outcomes.map((o) => (
              <li key={o.handle} className="flex items-start justify-between gap-3 text-[12px] border-b border-gray-100 dark:border-gray-700 pb-1.5 last:border-0">
                <span className="font-mono text-gray-700 dark:text-gray-300">@{o.handle}</span>
                <span className="flex items-center gap-1.5 shrink-0 text-right">
                  {o.state === 'running' && <Loader2 size={12} className="animate-spin text-gray-400" />}
                  {(o.state === 'filed' || o.state === 'updated') && <CheckCircle2 size={12} className="text-green-600" />}
                  {(o.state === 'skipped' || o.state === 'failed') && <AlertTriangle size={12} className="text-amber-600" />}
                  <span className={o.state === 'failed' ? 'text-rose-700 dark:text-rose-300' : 'text-gray-500'}>
                    {o.state}{o.detail ? ` — ${o.detail}` : ''}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
