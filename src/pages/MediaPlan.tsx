import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowLeft, Loader2, Plus, Send, Trash2 } from 'lucide-react';

import { applySeo } from '../lib/seo';
import { useAuth } from '../contexts/AuthContext';
import { useCurrency } from '../contexts/CurrencyContext';
import PlatformEnquiryModal from '../components/PlatformEnquiryModal';
import LineArtwork from '../components/promote/LineArtwork';
import {
  addPlacement, createCampaign, fetchCampaigns, fetchLocalPlanLines, fetchPlanLines, markEnquirySent,
  removePlacement, setLineDays, type AdCampaign,
} from '../lib/promote/campaigns';
import {
  BASIS_LABEL, describeCost, lineCost, readyToSend, summarise, type PlanLine,
} from '../lib/promote/campaignPlan';
import { describeDimensions, readAdDimensions } from '../lib/promote/adDimensions';
import { fetchPlacementTrustResult, type PlacementTrust } from '../lib/promote/trust';
import { onPlanChanged, readLocalPlan, removeLocalLine, setLocalDays } from '../lib/promote/localPlan';
import { signInLinkTo } from '../lib/safeNext';
import { AvailabilityLine, TrustChip, trustFor } from '../components/promote/PlacementLine';

const LOAD_FAILED = 'We could not load your plan just now';
const DEVICE_ONLY = 'This plan is on this device only. Sign in to keep it and send it.';
const localItemId = (lineId: string) => lineId.replace(/^local:/, '');

/**
 * A media plan: several placements taken to the media owners as one ask.
 *
 * ── THE GAP THIS FILLS ───────────────────────────────────────────────────
 *
 * A business could already book ONE placement through the payment flow, or
 * send ONE enquiry. What it could not do was assemble the thing it actually
 * wants — three billboards, a bus and a screen, across two cities, against
 * a budget — and put that in front of anybody.
 *
 * ── THE NUMBER IT WILL NOT SHOW ──────────────────────────────────────────
 *
 * MEASURED: all 97 placements are `unverified_import`, their rates taken
 * from published rate cards rather than from a quote a board's owner gave
 * NowOpen. So this page never prints one confident total under a list of
 * billboards. Costs are grouped by where the number came from and labelled,
 * and a group with any uncosted line shows no total at all.
 *
 * That is not pessimism about the product. It is the difference between a
 * plan a business can take to its board and a number it will be wrong by.
 *
 * ── SIGNED OUT ───────────────────────────────────────────────────────────
 *
 * A visitor's plan is held in the browser (localPlan). It shows here, with
 * remove and days, and says plainly that it lives on this device only.
 */
export default function MediaPlan() {
  const { id } = useParams<{ id?: string }>();
  const { user, loading: authLoading } = useAuth();
  const here = useLocation();
  const signedIn = Boolean(user);

  const [campaigns, setCampaigns] = useState<AdCampaign[]>([]);
  const [lines, setLines] = useState<PlanLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [problem, setProblem] = useState<string | null>(null);
  const [enquiryOpen, setEnquiryOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    applySeo({
      title: 'Your media plan — NowOpen Promote',
      description: 'Assemble billboards, screens, transit and social into one advertising plan, and take it to the media owners together.',
      /* A private working document: what a business is considering and
         what it can spend has no business in a search index. */
      robots: 'noindex, nofollow',
    });
  }, []);

  const load = useCallback(async () => {
    const read = await fetchCampaigns();
    if (read.state === 'unavailable') { setProblem(read.reason); setCampaigns([]); }
    else { setProblem(null); setCampaigns(read.campaigns); }
    setLoading(false);
  }, []);

  /** A slow older read must not overwrite a newer one. */
  const localSeq = useRef(0);
  const loadLocal = useCallback(async () => {
    const mine = ++localSeq.current;
    try {
      const local = readLocalPlan();
      const next = local.length ? await fetchLocalPlanLines(local) : [];
      if (mine !== localSeq.current) return;
      setLines(next);
      setProblem(null);
    } catch {
      /* A failed read is not an empty plan. */
      if (mine !== localSeq.current) return;
      setProblem(LOAD_FAILED);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (authLoading) return undefined;
    if (user) { void load(); return undefined; }
    setCampaigns([]);
    void loadLocal();
    return onPlanChanged(() => { void loadLocal(); });
  }, [authLoading, user, load, loadLocal]);

  const current = useMemo(
    () => (signedIn ? campaigns.find((c) => c.id === id) ?? campaigns[0] ?? null : null),
    [signedIn, campaigns, id],
  );

  useEffect(() => {
    if (!signedIn) return;
    if (!current) { setLines([]); return; }
    void fetchPlanLines(current.id).then(setLines);
  }, [signedIn, current]);

  const { format: money, ngnPerUsd } = useCurrency();

  /*
   * Which lines are still listed. placement_trust leaves out archived and
   * rejected placements, so after a read that worked, a line missing from it
   * is no longer on offer — even when that is every line.
   *
   * A read that failed says nothing about any placement, so it never tells
   * somebody their placements were withdrawn: one quiet note says the check
   * did not happen, and every line reads as the imported default.
   *
   * Keyed on the ids, not the lines, so editing a duration does not re-read.
   * Null while reading; lines then read as the imported default too.
   */
  const lineIds = useMemo(() => [...new Set(lines.flatMap((l) => (l.advertId ? [l.advertId] : [])))].join(','), [lines]);
  const [trust, setTrust] = useState<{ map: Map<string, PlacementTrust>; failed: boolean } | null>(null);
  useEffect(() => {
    setTrust(null);
    if (!lineIds) return undefined;
    let live = true;
    void fetchPlacementTrustResult(lineIds.split(',')).then((r) => { if (live) setTrust(r); });
    return () => { live = false; };
  }, [lineIds]);
  const delisted = useCallback(
    (advertId: string | null) => advertId != null && trust != null && !trust.failed && !trust.map.has(advertId),
    [trust],
  );

  /* A delisted placement leaves the totals: feed it into `offered` before summarising. */
  const shown = useMemo(
    () => lines.map((l) => (l.kind === 'placement' && l.offered && delisted(l.advertId) ? { ...l, offered: false } : l)),
    [lines, delisted],
  );
  const summary = useMemo(() => summarise(shown, ngnPerUsd), [shown, ngnPerUsd]);

  /*
   * The SAME formatter the rest of the product uses.
   *
   * MEASURED, and the reason this is not an `Intl.NumberFormat` of its own:
   * `advertisements.pricing` is stored in USD and converted for display.
   * Formatting the raw number as naira turned an ₦18,680 billboard into
   * "₦14 / day" — a plausible-looking number that is wrong by three orders
   * of magnitude, on the one page whose job is to be careful about money.
   */
  const start = async () => {
    setBusy(true);
    const made = await createCampaign('My advertising plan');
    setBusy(false);
    if ('error' in made) { toast.error(made.error); return; }
    toast.success('Plan started. Add placements from any listing.');
    void load();
  };

  const drop = async (lineId: string) => {
    if (!signedIn) {
      removeLocalLine(localItemId(lineId));
      setLines((l) => l.filter((x) => x.id !== lineId));
      return;
    }
    if (!(await removePlacement(lineId))) { toast.error('Could not remove that.'); return; }
    setLines((l) => l.filter((x) => x.id !== lineId));
  };

  const changeDays = async (line: PlanLine, days: number | null) => {
    setLines((l) => l.map((x) => (x.id === line.id ? { ...x, days } : x)));
    if (!signedIn) {
      if (line.advertId) setLocalDays(line.advertId, days);
      return;
    }
    if (!(await setLineDays(line.id, days))) toast.error('Could not save that duration.');
  };

  const send = async () => {
    const check = readyToSend(summary);
    if (!check.ok) { toast.error(check.why); return; }
    setEnquiryOpen(true);
  };

  if (authLoading || loading) {
    return <Shell><Loader2 className="mx-auto animate-spin text-gray-400" size={22} /></Shell>;
  }

  if (problem) {
    return (
      <Shell>
        {/* A failed read is not an empty shelf. Said plainly so nobody
            rebuilds a plan they already have. */}
        <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">{problem}</p>
        <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
          This is a failed read, not an empty plan — nothing of yours has been lost.
        </p>
        <button onClick={() => void (signedIn ? load() : loadLocal())} className="mt-3 text-xs font-bold text-amber-900 underline dark:text-amber-200">
          Try again
        </button>
      </Shell>
    );
  }

  if (signedIn && !current) {
    return (
      <Shell>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          A media plan holds several placements together — billboards, screens, transit, social —
          so you can compare them and take them to the media owners as one enquiry.
        </p>
        <button
          onClick={() => void start()}
          disabled={busy}
          className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-blue-600 px-5 font-semibold text-white disabled:opacity-50"
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Start a plan
        </button>
      </Shell>
    );
  }

  const signIn = signInLinkTo(here.pathname);

  return (
    <Shell>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">{current?.name ?? 'Your plan'}</h1>
          <p className="mt-0.5 text-sm text-gray-600 dark:text-gray-400">
            {summary.lines} line{summary.lines === 1 ? '' : 's'} · {describeCost(summary, money)}
          </p>
        </div>
        <Link
          to="/adverts"
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-gray-300 px-4 text-sm font-semibold text-gray-700 dark:border-gray-600 dark:text-gray-200"
        >
          <Plus size={15} /> Add placements
        </Link>
      </div>

      {!signedIn && (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-blue-200 bg-blue-50 p-3 dark:border-blue-900 dark:bg-blue-950/40">
          <p className="text-xs text-blue-900 dark:text-blue-200">{DEVICE_ONLY}</p>
          <Link to={signIn} className="inline-flex min-h-[44px] items-center text-xs font-bold text-blue-700 underline dark:text-blue-300">
            Sign in
          </Link>
        </div>
      )}

      {trust?.failed && (
        <p role="status" className="mt-3 text-[11px] text-gray-500 dark:text-gray-400">
          Listing status could not be checked just now
        </p>
      )}

      {summary.lines === 0 ? (
        <p className="mt-6 rounded-2xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500 dark:border-gray-700">
          Nothing in this plan yet. Open any placement and choose <b>Save to my plan</b>.
        </p>
      ) : (
        <div className="mt-5 grid gap-5 lg:grid-cols-[1fr,300px]">
          <ul className="space-y-2">
            {shown.map((l) => (
              <PlanRow
                key={l.id}
                line={l}
                money={money}
                ngnPerUsd={ngnPerUsd}
                trust={trust}
                isDelisted={delisted(l.advertId)}
                signedIn={signedIn}
                campaignId={current?.id ?? null}
                onDrop={() => void drop(l.id)}
                onDays={(days) => void changeDays(l, days)}
                onArtwork={(art) => setLines((all) => all.map((x) => (x.id === l.id
                  ? { ...x, artworkUrl: art.path, artworkWidth: art.width, artworkHeight: art.height, artworkDesignId: art.designId }
                  : x)))}
              />
            ))}
          </ul>

          <aside className="space-y-3">
            <div className="rounded-xl bg-gray-50 p-3 dark:bg-gray-800/60">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-gray-500">What this adds up to</p>
              {/*
                Grouped by where the number came from, never summed across.
                A rate card and a quote are different claims about the same
                board, and merging them makes the weaker one look like the
                stronger.
              */}
              <ul className="space-y-2">
                {summary.totals.map((t) => (
                  <li key={t.basis}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-[11px] text-gray-500">{BASIS_LABEL[t.basis]}</span>
                      <span className="text-sm font-bold text-gray-900 dark:text-white">
                        {t.total != null ? money(t.total) : '—'}
                      </span>
                    </div>
                    {t.incomplete.length > 0 && (
                      <p className="mt-0.5 text-[10px] text-gray-500">
                        No total yet: {t.incomplete.map((i) => `${i.title} (${i.why})`).join(', ')}.
                      </p>
                    )}
                  </li>
                ))}
              </ul>
              {!summary.hasConfirmedTotal && (
                <p className="mt-2 border-t border-gray-200 pt-2 text-[11px] text-gray-500 dark:border-gray-700">
                  These are indicative rates from published rate cards, not quotes for your dates.
                  The media owners confirm the price.
                </p>
              )}
            </div>

            <div className="rounded-xl bg-gray-50 p-3 dark:bg-gray-800/60">
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-500">Mix</p>
              <ul className="space-y-0.5 text-[11px]">
                {summary.byMedium.map((m) => (
                  <li key={m.medium} className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-300">{m.medium}</span>
                    <span className="font-semibold text-gray-900 dark:text-white">{m.count}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[11px] text-gray-500">
                {summary.creativeReady} of {summary.artworkNeeded} lines have artwork
              </p>
            </div>

            {summary.missing.length > 0 && (
              <ul className="space-y-1 rounded-xl bg-amber-50 p-3 dark:bg-amber-900/20">
                <li className="text-[10px] font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300">
                  Before you send
                </li>
                {summary.missing.map((m) => (
                  <li key={m} className="text-[11px] text-amber-800 dark:text-amber-200">{m}</li>
                ))}
              </ul>
            )}

            {signedIn ? (
              <button
                type="button"
                onClick={() => void send()}
                className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-gray-900 px-4 font-semibold text-white dark:bg-white dark:text-gray-900"
              >
                <Send size={16} /> Send this plan as an enquiry
              </button>
            ) : (
              <Link
                to={signIn}
                className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-gray-900 px-4 font-semibold text-white dark:bg-white dark:text-gray-900"
              >
                Sign in to send this plan
              </Link>
            )}
            {/* Said before the button is pressed, not after. */}
            <p className="text-[11px] text-gray-500">
              Sends your plan to our team, who take it to the media owners. Nothing is booked and
              nothing is charged until a media owner confirms and you pay.
            </p>
          </aside>
        </div>
      )}

      {enquiryOpen && current && (
        <PlatformEnquiryModal
          kind="advert"
          itemId={current.id}
          itemTitle={`${current.name} — ${summary.lines} line${summary.lines === 1 ? '' : 's'}`}
          subjectPrefix="Media plan enquiry"
          onClose={() => {
            setEnquiryOpen(false);
            void markEnquirySent(current.id).then(() => load());
          }}
        />
      )}
    </Shell>
  );
}

/** One line of the plan: a placement, a NowOpen product, or a line no longer on offer. */
function PlanRow({
  line: l, money, ngnPerUsd, trust, isDelisted, signedIn, campaignId, onDrop, onDays, onArtwork,
}: {
  line: PlanLine;
  money: (n: number) => string;
  ngnPerUsd: number;
  trust: { map: Map<string, PlacementTrust>; failed: boolean } | null;
  isDelisted: boolean;
  signedIn: boolean;
  campaignId: string | null;
  onDrop: () => void;
  onDays: (days: number | null) => void;
  onArtwork: (art: { path: string; width: number; height: number; designId: string | null }) => void;
}) {
  const cost = lineCost(l, ngnPerUsd);
  const remove = (
    <button
      type="button"
      onClick={onDrop}
      aria-label={`Remove ${l.title} from this plan`}
      className="grid h-[44px] w-[44px] shrink-0 place-items-center rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
    >
      <Trash2 size={14} />
    </button>
  );
  const box = 'rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800';

  if (!l.offered) {
    return (
      <li className={box}>
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">{l.title}</p>
            <p className="mt-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
              {isDelisted ? 'No longer listed' : 'No longer on offer'}
            </p>
          </div>
          {remove}
        </div>
      </li>
    );
  }

  if (l.kind === 'product') {
    return (
      <li className={box}>
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">{l.title}</p>
            {l.days != null && <p className="text-[11px] text-gray-500">{l.days} day{l.days === 1 ? '' : 's'}</p>}
          </div>
          <div className="text-right text-[11px]">
            <p className="font-semibold text-gray-900 dark:text-white">{cost != null ? money(cost) : 'No price set'}</p>
            <p className="text-gray-500">NowOpen price</p>
          </div>
          {remove}
        </div>
      </li>
    );
  }

  return (
    <li className={box}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          {l.advertId ? (
            <Link to={`/adverts/${l.advertId}`} className="truncate text-sm font-semibold text-gray-900 hover:underline dark:text-white">
              {l.title}
            </Link>
          ) : (
            <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">{l.title}</p>
          )}
          <p className="truncate text-[11px] text-gray-500">
            {l.type}{l.location ? ` · ${l.location}` : ''} · {describeDimensions(readAdDimensions(l.dimensions))}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <TrustChip trust={trustFor(trust?.map, l.advertId ?? '')} />
            <AvailabilityLine trust={trustFor(trust?.map, l.advertId ?? '')} className="text-[11px]" />
          </div>
        </div>
        {remove}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px]">
        <label className="flex items-center gap-1.5">
          <span className="text-gray-500">Days</span>
          <input
            type="number"
            min={1}
            value={l.days ?? ''}
            placeholder="—"
            onChange={(e) => {
              const v = e.target.value.trim();
              onDays(v ? Math.max(1, Math.round(Number(v))) : null);
            }}
            aria-label={`Days for ${l.title}`}
            className="min-h-[44px] w-16 rounded border border-gray-300 bg-white px-1.5 py-1 dark:border-gray-600 dark:bg-gray-900"
          />
        </label>
        <span className="text-gray-500">
          {l.ratePerDay != null ? `${money(l.ratePerDay)} / day` : 'No published rate'}
        </span>
        <span className="ml-auto font-semibold text-gray-900 dark:text-white">
          {cost != null ? money(cost) : 'To be quoted'}
        </span>
      </div>

      <div className="mt-2 border-t border-gray-100 pt-2 dark:border-gray-700">
        <LineArtwork
          line={l}
          campaignId={campaignId}
          placementDimensions={l.dimensions}
          signedIn={signedIn}
          onChanged={onArtwork}
        />
      </div>
    </li>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="site-container py-8">
        <Link to="/adverts" className="mb-4 inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400">
          <ArrowLeft size={15} /> Back to Promote
        </Link>
        {children}
      </div>
    </div>
  );
}

/** Re-exported so a listing can add to a plan without importing the page. */
export { addPlacement };
