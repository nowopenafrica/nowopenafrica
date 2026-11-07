import { useCallback, useEffect, useMemo, useState } from 'react';
import { riskSignals, needsCloserLook } from '../../../lib/radar/reviewRisk';
import toast from 'react-hot-toast';
import { Check, Eye, GitMerge, Image as ImageIcon, Loader2, Link2, Pause, X } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { isUnprovisionedError } from '../../../lib/enrichmentOps';
import { classifyCandidate, toRadarSource } from '../../../lib/discoveryEngine';
import { findDuplicates, type MatchResult } from '../../../lib/radar/entity';
import { normalizeBusiness, type NormalizedBusiness } from '../../../lib/radar/normalize';
import { Card, EmptyState, StatusChip, WarnBanner } from './shared';

interface CandidateRow {
  id: string;
  source_key: string;
  campaign_id: string | null;
  name: string;
  category: string | null;
  city: string | null;
  confidence: number;
  status: string;
  decision_reason: string | null;
  duplicate_of: string | null;
  published_business_id: string | null;
  source_url: string | null;
  address: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  website: string | null;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
  /*
   * Staged fields the publish whitelist projects onto the business. Already
   * fetched by select('*'), just never typed — which is why no reviewer could
   * see or act on the Instagram logo.
   */
  profile: Record<string, unknown> | null;
}

interface EvidenceRow {
  id: number;
  candidate_id: string;
  evidence_field: string;
  field_value: string;
  source_key: string | null;
  method: string;
  source_url: string | null;
  confidence: number;
  owner_confirmed: boolean;
  can_auto_update: boolean;
  collected_at: string;
}

interface SourceLite {
  key: string;
  name: string;
  active: boolean;
  automated_access: string;
  bulk_extraction: string;
  competing_dataset: string;
  redistribution: string;
  licence: string | null;
  authorised_by: string | null;
}

interface CampaignLite { id: string; name: string; }

/**
 * The columns `businesses` ACTUALLY has.
 *
 * MEASURED 2026-09-23: this asked for `city`, `latitude` and `longitude`, and
 * PostgREST answered
 *
 *   {"code":"42703","message":"column businesses.city does not exist"}
 *
 * One wrong name fails the WHOLE select, so the duplicate checker had no
 * existing businesses to compare against — every candidate looked new, on a
 * screen whose entire job is catching the ones that are not. The error was
 * swallowed by `if (!biz.error && biz.data)`, so the panel rendered normally.
 *
 * The place is `location`; there are no coordinate columns at all.
 */
interface BusinessLite {
  id: string;
  name: string | null;
  location: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
}

type MatchTarget =
  | { kind: 'candidate'; key: string; name: string; city: string | null; source_key: string; row: CandidateRow }
  | { kind: 'business'; key: string; name: string; city: string | null; source_key: null; row: BusinessLite };

function toNormalizedCandidate(r: CandidateRow): NormalizedBusiness | null {
  return normalizeBusiness({
    name: r.name,
    city: r.city,
    address: r.address,
    phone: r.phone,
    whatsapp: r.whatsapp,
    email: r.email,
    website: r.website,
    latitude: r.latitude,
    longitude: r.longitude,
  });
}

type Segment = 'queue' | 'drafts' | 'duplicates';

/**
 * A candidate, as the risk signals read it.
 *
 * Kept in one place so the filter count and the badges on the row can never
 * disagree — a count above a list that contradicts it is a bug this tab has
 * had before.
 */
const riskOf = (c: CandidateRow) => riskSignals({
  name: c.name,
  category: c.category,
  phone: c.phone,
  email: c.email,
  website: c.website,
  whatsapp: c.whatsapp,
  confidence: c.confidence,
  duplicateOf: c.duplicate_of,
});

const looksRisky = (c: CandidateRow) => needsCloserLook({
  name: c.name,
  category: c.category,
  phone: c.phone,
  email: c.email,
  website: c.website,
  whatsapp: c.whatsapp,
  confidence: c.confidence,
  duplicateOf: c.duplicate_of,
});

const SEGMENTS: Array<{ key: Segment; label: string; match: (c: CandidateRow) => boolean }> = [
  { key: 'queue', label: 'Discovery queue', match: (c) => c.status === 'pending' || c.status === 'review' },
  { key: 'drafts', label: 'Profile drafts', match: (c) => c.status === 'held' },
  { key: 'duplicates', label: 'Duplicates', match: (c) => c.status === 'merged' || !!c.duplicate_of },
];

/**
 * The statuses each segment fetches, in the DATABASE.
 *
 * Kept beside SEGMENTS above, whose `match` predicates must say the same
 * thing: the count is computed from these, the rows are fetched with these,
 * and the client-side `match` narrows what was already the right set. When the
 * two disagree, the tab shows a number above a list that contradicts it —
 * which is the bug this replaced.
 *
 * `duplicates` is null because it is not a pure status question: a row belongs
 * there if status = 'merged' OR duplicate_of is set, so it is fetched wide and
 * narrowed by `match`.
 */
const SEGMENT_STATUSES: Record<Segment, string[] | null> = {
  queue: ['pending', 'review'],
  drafts: ['held'],
  duplicates: null,
};

/**
 * How many candidates one page of a segment loads.
 *
 * Deliberately under PostgREST's 1,000-row ceiling, which truncates silently —
 * asking for more would not fail, it would quietly return 1,000 and look like
 * the whole queue.
 *
 * MEASURED 2026-09-23: a discovery run produced 1,326 new results, so a flat
 * cap of 200 would hide most of a real queue behind a number that said
 * otherwise. The reviewer now pages through it, and the tab counts state the
 * true total whatever is currently drawn.
 */
const ROWS_PER_SEGMENT = 200;

export default function ReviewTab() {
  const [rows, setRows] = useState<CandidateRow[]>([]);
  const [evidence, setEvidence] = useState<Record<string, EvidenceRow[]>>({});
  const [openEvidence, setOpenEvidence] = useState<Record<string, boolean>>({});
  const [openDupes, setOpenDupes] = useState<Record<string, boolean>>({});
  const [dupeFindings, setDupeFindings] = useState<Record<string, Array<{ target: MatchTarget; result: MatchResult }>>>({});
  const [businesses, setBusinesses] = useState<BusinessLite[]>([]);
  const [sources, setSources] = useState<Record<string, SourceLite>>({});
  const [campaigns, setCampaigns] = useState<CampaignLite[]>([]);
  const [campaignFilter, setCampaignFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [countryFilter, setCountryFilter] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [segment, setSegment] = useState<Segment>('queue');
  /**
   * Segment totals counted in the DATABASE, not in the loaded page.
   *
   * The tabs used to count the 100 rows that happened to be fetched, so
   * "Discovery queue · 12" meant "12 of the most recent 100", not 12 in total.
   * With 3,609 candidates on file that is not a rounding error, it is a wrong
   * number shown as a fact — and the one number a reviewer uses to decide
   * whether there is work to do.
   */
  const [totals, setTotals] = useState<Record<Segment, number | null>>(
    { queue: null, drafts: null, duplicates: null },
  );
  /** How many pages of the current segment are loaded. Reset on segment change. */
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    /*
     * Counted with `head: true`, so these are totals over the whole table and
     * cost no rows. `pending`/`review` are the two statuses the queue segment
     * matches, kept in step with SEGMENTS above.
     */
    const countFor = (apply: (q: ReturnType<typeof supabase.from>) => unknown) => apply(
      supabase.from('radar_candidates').select('id', { count: 'exact', head: true }) as never,
    ) as unknown as Promise<{ count: number | null; error: unknown }>;

    /*
     * ── THE ROWS ARE FILTERED IN THE DATABASE ────────────────────────────
     *
     * This used to fetch the newest 100 candidates by created_at and then
     * filter them by status in the browser. With 3,668 candidates on file that
     * is a window, not a queue: anything outside the most recent hundred was
     * invisible however long it had been waiting.
     *
     * It was worse than merely incomplete. Staging UPSERTS a candidate, so
     * re-seeing a business updates the existing row and leaves created_at
     * alone — a freshly sourced record could therefore sort near the BOTTOM of
     * the table and never enter the window at all. Meanwhile the tab counts
     * (already computed server-side) reported the true total, so the screen
     * said "Discovery queue · 28" above an empty list. That is the reported
     * symptom exactly: sourcing runs, and the queue does not show what it found.
     *
     * Filtering by the segment's own statuses means the queue shows queue
     * items, oldest work included, and the count matches what is rendered.
     */
    const statuses = SEGMENT_STATUSES[segment];
    /*
     * `.range()` rather than `.limit()`, so "show more" fetches the NEXT page
     * instead of re-reading the first one with a bigger ceiling. A unique
     * tiebreaker goes with created_at: rows staged in the same bulk insert
     * share a timestamp to the millisecond, and without `id` the same record
     * can appear on two pages while another appears on none.
     */
    let rowQuery = supabase
      .from('radar_candidates')
      .select('*')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(0, (page + 1) * ROWS_PER_SEGMENT - 1);
    if (statuses) rowQuery = rowQuery.in('status', statuses);

    const [c, s, campaignsR, qCount, dCount, mCount] = await Promise.all([
      rowQuery,
      supabase.from('radar_sources').select('key,name,active,automated_access,bulk_extraction,competing_dataset,redistribution,licence,authorised_by'),
      supabase.from('business_discovery_campaigns').select('id,name'),
      countFor((q) => (q as never as { in: (c: string, v: string[]) => unknown }).in('status', ['pending', 'review'])),
      countFor((q) => (q as never as { eq: (c: string, v: string) => unknown }).eq('status', 'held')),
      countFor((q) => (q as never as { eq: (c: string, v: string) => unknown }).eq('status', 'merged')),
    ]);

    setTotals({
      queue: qCount?.count ?? null,
      drafts: dCount?.count ?? null,
      duplicates: mCount?.count ?? null,
    });
    const loaded = (c.data ?? []) as unknown as CandidateRow[];
    if (c.error) setError(isUnprovisionedError(c.error.message) ? 'Candidates table not provisioned.' : c.error.message);
    else { setError(null); setRows(loaded); }

    /*
     * Evidence for THESE candidates, not the first 500 rows of the table.
     *
     * The old query took 500 evidence rows with no relation to what was on
     * screen, so a candidate's evidence was present or missing depending on
     * where it happened to fall — and the panel showed nothing rather than
     * saying it had not looked.
     */
    const ids = loaded.map((r) => r.id);
    if (ids.length) {
      const ev = await supabase.from('radar_candidate_evidence').select('*').in('candidate_id', ids);
      if (!ev.error && ev.data) {
        const grouped: Record<string, EvidenceRow[]> = {};
        for (const row of ev.data as unknown as EvidenceRow[]) (grouped[row.candidate_id] ??= []).push(row);
        setEvidence(grouped);
      } else {
        setEvidence({});
      }
    } else {
      setEvidence({});
    }
    if (!s.error && s.data) setSources(Object.fromEntries((s.data as SourceLite[]).map((x) => [x.key, x])));
    if (!campaignsR.error && campaignsR.data) setCampaigns(campaignsR.data as unknown as CampaignLite[]);
    setLoading(false);

    /*
     * ── THE DUPLICATE-CHECK DATA LOADS AFTER THE QUEUE IS ON SCREEN ──────
     *
     * This list exists only to compare candidates against businesses already
     * on file. It is the largest thing the screen fetches — 600 rows, ~106KB,
     * about a second — and holding the whole queue behind it meant a reviewer
     * waited on data they could not yet act on.
     *
     * Deliberately not awaited: rows render as soon as the candidates arrive,
     * and the duplicate panels fill in a moment later. `location`, not `city` —
     * see BusinessLite.
     */
    void supabase
      .from('businesses')
      .select('id,name,location,phone,email,website')
      .order('created_at', { ascending: false })
      .limit(600)
      .then(({ data, error: bizError }) => {
        if (bizError) {
          /*
           * Said out loud. Without the existing businesses the duplicate
           * checker compares against nothing and EVERY candidate reads as new
           * — which is how a broken column name survived unnoticed on the one
           * screen whose job is catching duplicates.
           */
          setBusinesses([]);
          setError((prev) => prev ?? `Existing businesses could not be loaded, so duplicate checks are incomplete: ${bizError.message}`);
        } else if (data) {
          setBusinesses(data as unknown as BusinessLite[]);
        }
      });
  }, [segment, page]);

  useEffect(() => { void load(); }, [load]);

  /** Countries present in what was loaded — a filter that offers only real options. */
  const countries = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      // `city` here carries whatever the adapter put in it; the last comma
      // segment is the country for the Wikidata and CSV shapes both.
      const tail = (r.city ?? '').split(',').map((x) => x.trim()).filter(Boolean).pop();
      if (tail) set.add(tail);
    }
    return [...set].sort();
  }, [rows]);

  /**
   * Show only the rows with a per-row reason to be read.
   *
   * Measured 2026-10-09: 4,477 candidates, 100% published, 0 rejected. The
   * logic to refuse already existed; what was missing was any way to find the
   * rows worth refusing among thousands. This narrows the queue to roughly a
   * quarter of it, each for a stated reason.
   */
  const [riskyOnly, setRiskyOnly] = useState(false);

  const visible = useMemo(() => {
    const seg = SEGMENTS.find((x) => x.key === segment);
    const needle = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (seg && !seg.match(r)) return false;
      if (riskyOnly && !looksRisky(r)) return false;
      if (campaignFilter !== 'all' && r.campaign_id !== campaignFilter) return false;
      if (sourceFilter !== 'all' && r.source_key !== sourceFilter) return false;
      if (countryFilter !== 'all' && !(r.city ?? '').toLowerCase().includes(countryFilter.toLowerCase())) return false;
      if (needle) {
        const hay = `${r.name} ${r.city ?? ''} ${r.category ?? ''} ${r.address ?? ''}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [rows, segment, campaignFilter, sourceFilter, countryFilter, query, riskyOnly]);

  const verdict = (r: CandidateRow) => {
    if (r.published_business_id) return { action: 'hold', reason: 'Already published.' };
    return classifyCandidate({
      candidate: r,
      source: sources[r.source_key] ? toRadarSource(sources[r.source_key]) : null,
      mode: 'manual',
    });
  };

  /*
   * Copy an Instagram profile picture into our own storage and stage it as
   * this candidate's logo.
   *
   * ── WHY A BUTTON AND NOT A STEP IN THE PIPELINE ──────────────────────
   *
   * `radar_sources.image_reuse_allowed` is 'prohibited' for Instagram, so
   * nothing carries imagery automatically. `instagram-logo` is the one
   * documented exception and it is written for exactly this: a staff member
   * who has seen the picture and the account decides that this business's own
   * mark belongs on this business's own listing. A pipeline cannot make that
   * judgement, and the public intake is anonymous — an unbounded stranger
   * must not be able to make us copy arbitrary images.
   *
   * It copies the BYTES, never Meta's URL: `profile_picture_url` is signed and
   * expires within days, so a stored link is a broken logo on a live listing
   * inside a week.
   */
  const instagramHandleOf = (r: CandidateRow): string | null => {
    const p = r.profile ?? {};
    const named = typeof p.instagram_username === 'string' ? p.instagram_username : null;
    if (named) return named.replace(/^@/, '');
    const url = typeof p.instagram === 'string' ? p.instagram : (r.source_url ?? '');
    const m = /instagram\.com\/([A-Za-z0-9._]+)/.exec(url);
    return m ? m[1] : null;
  };

  const fetchLogo = async (r: CandidateRow) => {
    const handle = instagramHandleOf(r);
    if (!handle) { toast.error('No Instagram handle on this candidate.'); return; }
    setBusy(r.id);
    try {
      const { data, error } = await supabase.functions.invoke('instagram-logo', { body: { handle } });
      if (error) throw new Error(error.message);
      const logoUrl = (data as { ok?: boolean; logoUrl?: string } | null)?.logoUrl;
      if (!data || !(data as { ok?: boolean }).ok || !logoUrl) {
        throw new Error((data as { reason?: string } | null)?.reason ?? 'Instagram did not return a picture.');
      }
      /*
       * Merge, never replace: the profile also carries the staged posts and
       * provenance, and overwriting it would silently drop the gallery.
       */
      const nextProfile = { ...(r.profile ?? {}), logo_url: logoUrl };
      const { error: upErr } = await supabase
        .from('radar_candidates').update({ profile: nextProfile }).eq('id', r.id);
      if (upErr) throw new Error(upErr.message);
      toast.success(`Logo copied for @${handle}.`);
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not copy the logo.');
    } finally {
      setBusy(null);
    }
  };

  const publish = async (r: CandidateRow) => {
    setBusy(r.id);
    const { data, error: e } = await supabase.rpc('radar_publish_candidate', { p_candidate: r.id });
    if (e) toast.error(e.message);
    else {
      toast.success(`Published ${r.name} as an unclaimed profile${data ? ' — anyone may claim it.' : '.'}`);
      void load();
    }
    setBusy(null);
  };

  const setStatus = async (r: CandidateRow, status: 'rejected' | 'held', reason: string) => {
    setBusy(r.id);
    const { error: e } = await supabase
      .from('radar_candidates')
      .update({ status, decision_reason: reason })
      .eq('id', r.id);
    if (e) toast.error(e.message);
    else { toast.success(status === 'rejected' ? 'Rejected.' : 'Moved to profile drafts.'); void load(); }
    setBusy(null);
  };

  const matchesFor = (r: CandidateRow): Array<{ target: MatchTarget; result: MatchResult }> => {
    const norm = toNormalizedCandidate(r);
    if (!norm) return [];
    const existing: Array<{ record: MatchTarget; normalized: NormalizedBusiness }> = [
      ...rows
        .filter((o) => o.id !== r.id && !o.published_business_id)
        .flatMap((o) => {
          const n = toNormalizedCandidate(o);
          if (!n) return [];
          const record: MatchTarget = { kind: 'candidate', key: o.id, name: o.name, city: o.city, source_key: o.source_key, row: o };
          return [{ record, normalized: n }];
        }),
      ...businesses
        .flatMap((b) => {
          // `location` is the place column; there are no coordinates to pass.
          const n = normalizeBusiness({
            name: b.name, city: b.location, phone: b.phone, email: b.email, website: b.website,
            latitude: null, longitude: null,
          });
          if (!n) return [];
          const record: MatchTarget = { kind: 'business', key: b.id, name: b.name ?? b.id, city: b.location, source_key: null, row: b };
          return [{ record, normalized: n }];
        }),
    ];
    const report = findDuplicates(norm, existing);
    const results: Array<{ target: MatchTarget; result: MatchResult }> = [];
    if (report.best) results.push({ target: report.best.record, result: report.best.result });
    for (const p of report.possibles) results.push({ target: p.record, result: p.result });
    return results;
  };

  const toggleDupes = (r: CandidateRow) => {
    if (!openDupes[r.id]) {
      setDupeFindings((f) => (f[r.id] ? f : { ...f, [r.id]: matchesFor(r) }));
    }
    setOpenDupes((p) => ({ ...p, [r.id]: !p[r.id] }));
  };

  const markDuplicate = async (r: CandidateRow, target: MatchTarget) => {
    setBusy(r.id);
    const label = target.kind === 'candidate'
      ? `Duplicate of candidate "${target.name}" from ${sources[target.source_key]?.name ?? target.source_key}.`
      : `Duplicate of listed business "${target.name}".`;
    const patch: Record<string, unknown> = { status: 'rejected', decision_reason: label };
    if (target.kind === 'business') patch.duplicate_of = target.key;
    const { error: e } = await supabase.from('radar_candidates').update(patch).eq('id', r.id);
    if (e) toast.error(e.message);
    else {
      toast.success(`Rejected ${r.name} — logged as a duplicate.`);
      void load();
    }
    setBusy(null);
  };

  /** How many of the LOADED rows sit in each segment — used only as a fallback. */
  const loadedCounts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const s of SEGMENTS) out[s.key] = rows.filter(s.match).length;
    return out;
  }, [rows]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        {SEGMENTS.map((s) => (
          <button
            key={s.key}
            onClick={() => { setSegment(s.key); setPage(0); }}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
              segment === s.key
                ? 'bg-nowopen-500 text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            {/*
              * The database total when it is known, the loaded count only as a
              * fallback — and never a number presented as a total when it is
              * not one.
              */}
            {s.label} · {totals[s.key] ?? loadedCounts[s.key] ?? 0}
          </button>
        ))}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, city, category"
            aria-label="Search candidates"
            className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2.5 py-1 text-xs w-48"
          />
          {/*
            * Source matters now that the registry holds eighteen of them across
            * open data, first-party and manual extraction. "Where did this come
            * from" is the first question a reviewer asks about a candidate.
            */}
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            aria-label="Filter by source"
            className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1 text-xs"
          >
            <option value="all">All sources</option>
            {Object.values(sources)
              .filter((x) => rows.some((r) => r.source_key === x.key))
              .map((x) => <option key={x.key} value={x.key}>{x.name}</option>)}
          </select>
          {countries.length > 1 && (
            <select
              value={countryFilter}
              onChange={(e) => setCountryFilter(e.target.value)}
              aria-label="Filter by country"
              className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1 text-xs"
            >
              <option value="all">Everywhere</option>
              {countries.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
          <select
            value={campaignFilter}
            onChange={(e) => setCampaignFilter(e.target.value)}
            aria-label="Filter by campaign"
            className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1 text-xs"
          >
            <option value="all">All campaigns</option>
            <option value="__none">No campaign</option>
            {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>

          {/*
            * The filter this tab existed without.
            *
            * Counted from what is loaded, so the number and the list cannot
            * disagree — and labelled with that number, because "47 need a
            * closer look" is a thing a person will click and "Risky" is not.
            */}
          <button
            onClick={() => setRiskyOnly((v) => !v)}
            aria-pressed={riskyOnly}
            className={`rounded-lg px-2.5 py-1 text-xs font-semibold border ${
              riskyOnly
                ? 'bg-amber-500 text-white border-amber-500'
                : 'bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300'
            }`}
          >
            {rows.filter(looksRisky).length} need a closer look
          </button>
        </div>
      </div>

      {error && <WarnBanner>{error}</WarnBanner>}

      {loading ? (
        <div className="py-10 text-center text-sm text-gray-400">Loading candidates…</div>
      ) : visible.length === 0 ? (
        <Card>
          <EmptyState>
            {rows.length === 0
              ? 'Nothing here. The queue fills as discovery runs.'
              : query || sourceFilter !== 'all' || countryFilter !== 'all' || campaignFilter !== 'all'
                ? 'No candidate matches these filters. Clear one to widen the search.'
                : `Nothing in this segment. ${rows.length} candidate(s) loaded in the others.`}
          </EmptyState>
        </Card>
      ) : (
        visible.map((r) => {
          const v = verdict(r);
          const canPublish = !r.published_business_id && (v.action === 'review' || v.action === 'auto-publish') && r.status !== 'merged';
          const src = sources[r.source_key];
          return (
            <Card
              key={r.id}
              title={
                <span className="flex flex-wrap items-center gap-2">
                  {r.name}
                  <StatusChip status={r.status}>{r.status}</StatusChip>
                  <span className="text-xs font-bold text-nowopen-600 dark:text-nowopen-300">{r.confidence}</span>
                  {/*
                    * What was observed about THIS row, each with its reason on
                    * hover. Amber for a reason to look, grey for context that
                    * is true of thousands of rows and should not shout.
                    */}
                  {riskOf(r).map((sig) => (
                    <span
                      key={sig.code}
                      title={sig.label}
                      className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${
                        sig.severity === 'look'
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200'
                          : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                      }`}
                    >
                      {sig.code.replace(/_/g, ' ')}
                    </span>
                  ))}
                </span>
              }
              action={
                <div className="flex items-center gap-1.5">
                  <button
                    disabled={!canPublish || busy === r.id}
                    onClick={() => void publish(r)}
                    className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[12px] font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                    title={canPublish ? v.reason : v.reason}
                  >
                    {busy === r.id ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                    Publish
                  </button>
                  {instagramHandleOf(r) && !(r.profile?.logo_url) && (
                    <button
                      disabled={busy === r.id}
                      onClick={() => void fetchLogo(r)}
                      className="rounded-lg border border-gray-200 dark:border-gray-600 p-1.5 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40"
                      title="Copy this account's Instagram picture into our storage and use it as the logo"
                    >
                      <ImageIcon size={13} />
                    </button>
                  )}
                  {typeof r.profile?.logo_url === 'string' && (
                    <img
                      src={r.profile.logo_url as string}
                      alt=""
                      className="h-7 w-7 rounded-md object-cover border border-gray-200 dark:border-gray-600"
                      title="Logo staged — publishing carries it to the listing"
                    />
                  )}
                  {r.status !== 'held' && (
                    <button
                      disabled={busy === r.id}
                      onClick={() => void setStatus(r, 'held', 'Withheld in Business Intelligence review.')}
                      className="rounded-lg border border-gray-200 dark:border-gray-600 p-1.5 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40"
                      title="Move to profile drafts"
                    >
                      <Pause size={13} />
                    </button>
                  )}
                  {r.status !== 'rejected' && (
                    <button
                      disabled={busy === r.id}
                      onClick={() => void setStatus(r, 'rejected', 'Rejected in Business Intelligence review.')}
                      className="rounded-lg border border-gray-200 dark:border-gray-600 p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-gray-700 disabled:opacity-40"
                      title="Reject"
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>
              }
            >
              <div className="space-y-2 text-[12px]">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-gray-500 dark:text-gray-400">
                  <span>{src ? src.name : r.source_key}</span>
                  {campaigns.find((x) => x.id === r.campaign_id) && (
                    <span>{campaigns.find((x) => x.id === r.campaign_id)?.name}</span>
                  )}
                  {r.city && <span>{r.city}</span>}
                  {r.category && <span>{r.category}</span>}
                  {r.source_url && <a className="text-nowopen-600 hover:underline" href={r.source_url} target="_blank" rel="noreferrer">source</a>}
                </div>
                {r.duplicate_of && (
                  <p className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                    <Link2 size={12} /> Duplicate merge target: {r.duplicate_of}
                  </p>
                )}
                <p className="text-gray-500 dark:text-gray-400">{v.reason}</p>
                <div className="flex flex-wrap items-center gap-3 border-t border-gray-100 dark:border-gray-700 pt-2">
                  {(evidence[r.id]?.length ?? 0) > 0 && (
                    <button
                      onClick={() => setOpenEvidence((p) => ({ ...p, [r.id]: !p[r.id] }))}
                      className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-nowopen-600 dark:text-nowopen-300 hover:underline"
                    >
                      <Eye size={12} /> Provenance · {evidence[r.id]?.length ?? 0}
                    </button>
                  )}
                  {r.status !== 'rejected' && r.status !== 'merged' && (
                    <button
                      onClick={() => toggleDupes(r)}
                      className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-nowopen-600 dark:text-nowopen-300 hover:underline"
                    >
                      <GitMerge size={12} /> Check duplicates
                    </button>
                  )}
                </div>
                {openEvidence[r.id] && (
                  <ul className="rounded-lg border border-gray-100 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700">
                    {evidence[r.id]?.map((e) => (
                      <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-2.5 py-1.5">
                        <span className="font-semibold">{e.evidence_field}</span>
                        <span className="max-w-[220px] truncate text-gray-600 dark:text-gray-300" title={e.field_value}>{e.field_value}</span>
                        <span className="rounded bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 text-[10px] font-semibold text-gray-600 dark:text-gray-300">{e.method}</span>
                        <span className="tabular-nums text-gray-500 dark:text-gray-400">{e.confidence}</span>
                        {e.source_key && <span className="text-gray-400 dark:text-gray-500">{sources[e.source_key]?.name ?? e.source_key}</span>}
                        {e.source_url && <a className="text-nowopen-600 hover:underline" href={e.source_url} target="_blank" rel="noreferrer">source</a>}
                        {e.owner_confirmed && <span className="rounded bg-emerald-50 dark:bg-emerald-900/30 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">owner confirmed</span>}
                      </li>
                    ))}
                  </ul>
                )}
                {openDupes[r.id] && (
                  <div className="rounded-lg border border-gray-100 dark:border-gray-700 p-2.5">
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      Possible duplicates · {dupeFindings[r.id]?.length ?? 0}
                    </p>
                    {(dupeFindings[r.id]?.length ?? 0) === 0 ? (
                      <p className="text-[12px] text-gray-500 dark:text-gray-400">
                        Nothing in the candidate queue or the directory looks like this one.
                      </p>
                    ) : (
                      <ul className="space-y-2">
                        {dupeFindings[r.id]?.map((f, i) => (
                          <li key={`${f.target.kind}-${f.target.key}-${i}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
                            <StatusChip status={f.result.verdict}>{f.result.verdict}</StatusChip>
                            <span className="font-semibold">{f.target.name}</span>
                            <span className="text-gray-400 dark:text-gray-500">
                              {f.target.kind === 'candidate' ? sources[f.target.source_key]?.name ?? f.target.source_key : 'listed business'}
                            </span>
                            {f.target.city && <span className="text-gray-500 dark:text-gray-400">{f.target.city}</span>}
                            <span className="tabular-nums text-gray-500 dark:text-gray-400">{f.result.score}</span>
                            {f.result.signals.length > 0 && (
                              <span
                                className="text-gray-400 dark:text-gray-500"
                                title={f.result.signals.map((s) => s.label).join(' · ')}
                              >
                                {f.result.signals.slice(0, 2).map((s) => s.label).join(' · ')}
                              </span>
                            )}
                            <button
                              disabled={busy === r.id}
                              onClick={() => void markDuplicate(r, f.target)}
                              className="ml-auto rounded-lg bg-rose-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-rose-700 disabled:opacity-40"
                            >
                              Reject as duplicate
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    <p className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">
                      Rejecting drops this row to the rejected segment with the reason recorded; the kept record keeps its provenance.
                    </p>
                  </div>
                )}
              </div>
            </Card>
          );
        })
      )}

      {/*
        * More of the queue.
        *
        * MEASURED 2026-09-23: a run produced 1,326 candidates. The tab count is
        * computed over the whole table, so without this the header states a
        * total the list cannot reach — the same contradiction, one page down.
        */}
      {totals[segment] !== null && rows.length < (totals[segment] ?? 0) && (
        <button
          type="button"
          onClick={() => setPage((n) => n + 1)}
          disabled={loading}
          className="w-full mt-2 inline-flex items-center justify-center gap-2 px-4 min-h-[44px] rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-semibold disabled:opacity-50"
        >
          {loading ? 'Loading…' : `Show more — ${rows.length} of ${totals[segment]} loaded`}
        </button>
      )}
    </div>
  );
}