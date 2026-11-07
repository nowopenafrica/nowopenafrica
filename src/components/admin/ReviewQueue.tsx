import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Check, Loader2, X, ExternalLink, RefreshCw, CheckSquare } from 'lucide-react';

import { supabase } from '../../lib/supabase';
import { websiteHref } from '../../lib/webLink';
import { scoreConfidence } from '../../lib/radar/confidence';
import { normalizeBusiness } from '../../lib/radar/normalize';
import { parseServicesJson, parseFaqsJson } from '../../lib/imports/profileFields';
import DiscoveryPanel from './DiscoveryPanel';
import SmartImg from '../SmartImg';

/**
 * Admin → Data Operations → Review Queue.
 *
 * The missing half. Suggestions could be received and imports staged, but
 * nothing could be acted on: an admin had no way to approve what the public
 * sent. This is that screen, and it deliberately serves every origin — a
 * customer suggestion, a bulk import row and a Radar discovery all arrive here
 * looking the same, because they are all the same thing: an assertion that a
 * business exists, waiting for a person to agree.
 *
 * Publishing creates an UNCLAIMED business. It never assigns an owner.
 */
/**
 * The jsonb staging bag. Keys a discovery or import wrote under the candidate
 * columns — services_json (the price list), raw display strings like pricing or
 * duration, and social handles spread onto their platform keys so a publish can
 * assemble social_links. Display only here: the publish projects its own whitelist.
 */
interface CandidateProfile {
  services_json?: string | null;
  pricing?: string | null;
  duration?: string | null;
  dimensions?: string | null;
  image_url?: string | null;
  logo_url?: string | null;
  service_details?: string | null;
  product_details?: string | null;
  instagram?: string | null;
  facebook?: string | null;
  twitter?: string | null;
  tiktok?: string | null;
  linkedin?: string | null;
  youtube?: string | null;
  about?: string | null;
  mission?: string | null;
  vision?: string | null;
  tagline?: string | null;
  opening_hours?: string | null;
  founded_year?: string | null;
  employees?: string | null;
  business_type?: string | null;
  languages?: string | null;
  payment_methods?: string | null;
  service_area?: string | null;
  faqs_json?: string | null;
}

interface Candidate {
  id: string;
  source_key: string;
  name: string;
  category: string | null;
  city: string | null;
  address: string | null;
  phone: string | null;
  whatsapp?: string | null;
  website: string | null;
  email: string | null;
  description: string | null;
  confidence: number;
  status: string;
  created_at: string;
  profile?: CandidateProfile | null;
}

const SOURCE_LABEL: Record<string, string> = {
  public_suggestion: 'Suggested by a customer',
  business_submission: 'Submitted by the business',
  admin_import: 'Bulk import',
  // The first origin nobody typed: found by asking an authorised source.
  wikidata: 'Found on Wikidata (CC0)',
  // First-party origins: the business typed this into a NowOpen form itself.
  business_registration: 'Registered on Digital Forms',
  waitlist: 'From the launch waitlist',
  // Third-party origins discovered through an authorised API.
  google: 'Found on Google Maps (Places)',
};

/**
 * Candidates fetched, and drawn, per page by default.
 *
 * 100 is about as many rows as an operator reads before acting on some of
 * them. The list can be widened deliberately — see PAGE_SIZES.
 */
const QUEUE_PAGE = 100;

/**
 * The page sizes an operator can choose.
 *
 * The queue reaches 10,000+ rows during a bulk discovery run, and reading it
 * 100 at a time means clicking "Load more" a hundred times. Any size is still
 * a deliberate choice: rendering 5,000 rows carrying a `profile` each is heavy,
 * so it is never the default.
 */
const PAGE_SIZES = [100, 500, 1000, 5000] as const;

/**
 * The most rows PostgREST will return in one response, silently.
 *
 * A `.range(0, 4999)` does not error — it returns 1,000 rows. Paging off that
 * reply would then start the next page at 5,000 and skip everything between,
 * so anything above this is fetched in contiguous chunks instead.
 */
const FETCH_CHUNK = 1000;

export default function ReviewQueue() {
  const [rows, setRows] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  /**
   * Has the queue ever finished loading? Only the FIRST load may take the
   * whole screen; every refresh after that happens in place. See the loader.
   */
  const [everLoaded, setEverLoaded] = useState(false);
  /** Which page is loaded, and how many candidates exist in total. */
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState<number | null>(null);
  /** Rows per page, chosen by the operator. */
  const [pageSize, setPageSize] = useState<number>(QUEUE_PAGE);
  /**
   * Which load is current. A page-size change or a refresh while a large page
   * is still arriving starts a newer load; without this, the older one lands
   * last and paints rows for a size that is no longer selected.
   */
  const loadSeq = useRef(0);
  const [working, setWorking] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkWorking, setBulkWorking] = useState(false);

  /*
   * ── WHY THIS PAGES, AND WHY IT USED TO HANG ──────────────────────
   *
   * REPORTED 2026-09-24: "after generating new data discovery manually, it
   * doesn't seem to send all new to review queue, just keeps loading for long
   * then stops."
   *
   * Staging was not the slow part. Staging calls `onStaged`, `onStaged` calls
   * this loader, and this loader asked for `.limit(50000)` — which PostgREST
   * silently caps at 1,000 — carrying `profile` (a jsonb of services, FAQs and
   * socials) on every row, and then rendered all thousand at once. A run that
   * staged 1,326 candidates therefore ended in a long freeze resolving to a
   * list that could never have shown more than 1,000 of them anyway.
   *
   * Both halves were wrong in the same direction: it fetched far more than it
   * could show, and showed far more than anyone reads. It now takes one page at
   * a time, and states the total by counting in the database rather than
   * inferring it from however many rows happened to arrive.
   */
  const loadPage = useCallback(async (pageIndex: number, append: boolean) => {
    const seq = ++loadSeq.current;
    setLoading(true);

    /*
     * The real total, with head:true so it costs no rows. Without it the header
     * can only describe what was fetched — which is exactly how a capped query
     * reads as a complete queue.
     */
    const counted = await supabase
      .from('radar_candidates')
      .select('id', { count: 'exact', head: true })
      .in('status', ['pending', 'review']);
    if (seq !== loadSeq.current) return;
    if (!counted.error) setTotal(counted.count ?? null);

    const from = pageIndex * pageSize;
    const to = from + pageSize - 1;

    /*
     * Fetched in chunks, contiguous from `from`, so a 5,000-row page is five
     * requests rather than one silently truncated to 1,000. A short chunk
     * means the queue ended, so there is nothing after it to ask for.
     */
    const batch: Candidate[] = [];
    for (let start = from; start <= to; start += FETCH_CHUNK) {
      const end = Math.min(start + FETCH_CHUNK - 1, to);
      const { data, error } = await supabase
        .from('radar_candidates')
        .select('id,source_key,name,category,city,address,phone,whatsapp,website,email,description,confidence,status,created_at,profile')
        .in('status', ['pending', 'review'])
        .order('confidence', { ascending: false })
        .order('created_at', { ascending: false })
        /*
         * `id` breaks ties. Candidates staged in one bulk insert share a
         * created_at to the millisecond and very often a confidence too, so
         * without a unique tiebreaker Postgres is free to order them differently
         * between pages — and a row can appear twice while another never appears.
         */
        .order('id', { ascending: false })
        .range(start, end);

      if (seq !== loadSeq.current) return;
      if (error) {
        setLoading(false);
        setEverLoaded(true);
        toast.error(error.message);
        return;
      }

      const rows = (data as Candidate[]) ?? [];
      batch.push(...rows);
      if (rows.length < end - start + 1) break;
    }

    setLoading(false);
    setEverLoaded(true);
    setRows((prev) => (append ? [...prev, ...batch] : batch));
    setPage(pageIndex);
  }, [pageSize]);

  /** Reload from the top. This is what `onStaged` calls after a bulk stage. */
  const load = useCallback(async () => { await loadPage(0, false); }, [loadPage]);

  useEffect(() => { void load(); }, [load]);

  const publish = async (c: Candidate) => {
    setWorking(c.id);
    const { error } = await supabase.rpc('radar_publish_candidate', { p_candidate: c.id });
    setWorking(null);
    if (error) { toast.error(error.message); return; }
    toast.success(`${c.name} published as an unclaimed listing`);
    setRows((r) => r.filter((x) => x.id !== c.id));
  };

  const reject = async (c: Candidate) => {
    setWorking(c.id);
    const { error } = await supabase
      .from('radar_candidates')
      .update({ status: 'rejected', reviewed_at: new Date().toISOString(), decision_reason: 'Rejected in review' })
      .eq('id', c.id);
    setWorking(null);
    if (error) { toast.error(error.message); return; }
    setRows((r) => r.filter((x) => x.id !== c.id));
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  };

  const allSelected = rows.length > 0 && selected.size === rows.length;

  const toggleSelectAll = () => {
    setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)));
  };

  /** Publish every selected candidate; each runs its own atomic RPC. */
  const publishSelected = async () => {
    const targets = rows.filter((r) => selected.has(r.id));
    if (targets.length === 0) return;
    setBulkWorking(true);
    let ok = 0;
    let failed = 0;
    let firstError = '';
    const published = new Set<string>();
    for (const c of targets) {
      const { error } = await supabase.rpc('radar_publish_candidate', { p_candidate: c.id });
      if (error) {
        failed += 1;
        if (!firstError) firstError = error.message;
      } else {
        ok += 1;
        published.add(c.id);
      }
    }
    setBulkWorking(false);
    setRows((r) => r.filter((x) => !published.has(x.id)));
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of published) next.delete(id);
      return next;
    });
    if (failed === 0) toast.success(`Published ${ok} as unclaimed`);
    else if (ok === 0) toast.error(`Nothing published — ${firstError}`);
    else toast.error(`Published ${ok}, ${failed} failed — ${firstError}`);
  };

  /*
   * Only the very first load may replace the screen.
   *
   * This early return used to fire on EVERY load — including the reload that
   * `onStaged` triggers when a bulk stage finishes. So the moment staging
   * completed, the whole panel unmounted: the discovery results, the progress
   * line and the staging summary all vanished behind "Loading the queue…",
   * which is precisely what "keeps loading for long then stops" looks like from
   * the outside. Nothing had failed — the screen had thrown away the evidence
   * that it worked.
   *
   * After the first load, refreshes are shown inline (see the header) and the
   * list stays where it is.
   */
  if (loading && !everLoaded) {
    return (
      <p className="flex items-center gap-2 text-sm text-gray-500 py-8">
        <Loader2 size={16} className="animate-spin" /> Loading the queue…
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {/* Discovery sits above the queue it feeds: find, then review, then
          publish — in the order an operator actually works. */}
      <DiscoveryPanel onStaged={() => { void load(); }} />

      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Review Queue</h2>
          <p className="text-[12px] text-gray-500 dark:text-gray-400">
            Suggestions, imports and discoveries, strongest first. Publishing creates an unclaimed
            listing — it never gives anyone an account.
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Reading 10,000 candidates 100 at a time is a hundred clicks.
              Widening the page is deliberate, so it is a choice and not the
              default; the loader above chunks anything over PostgREST's cap. */}
          <label htmlFor="review-page-size" className="inline-flex items-center gap-1.5 text-[12px] text-gray-600 dark:text-gray-300">
            Show
            <select
              id="review-page-size"
              value={pageSize}
              onChange={(e) => {
                setSelected(new Set());
                setPageSize(Number(e.target.value));
              }}
              className="min-h-[34px] rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 text-[12px] font-semibold text-gray-800 dark:text-gray-200"
            >
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>{n.toLocaleString('en-NG')}</option>
              ))}
            </select>
            per page
          </label>
          <button onClick={() => { setSelected(new Set()); void load(); }} disabled={loading}
            className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-gray-600 dark:text-gray-300 disabled:opacity-60">
            {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </header>

      {rows.length === 0 && loading ? (
        <p className="flex items-center gap-2 text-sm text-gray-500 py-6">
          <Loader2 size={16} className="animate-spin" /> Loading the queue…
        </p>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 dark:border-gray-700 p-10 text-center">
          <p className="text-sm text-gray-600 dark:text-gray-300">Nothing waiting. The queue is clear.</p>
        </div>
      ) : (
        <>
          {selected.size > 0 && (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-900 dark:border-white bg-gray-900 dark:bg-white px-4 py-2.5">
              <p className="text-[12px] font-bold text-white dark:text-gray-900">{selected.size} selected</p>
              <div className="flex items-center gap-2">
                <button onClick={() => void publishSelected()} disabled={bulkWorking || rows.filter((r) => selected.has(r.id)).length === 0}
                  className="inline-flex items-center gap-1.5 px-3 min-h-[34px] rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-[12px] font-bold disabled:opacity-60">
                  {bulkWorking ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                  {bulkWorking ? 'Publishing…' : 'Publish as unclaimed'}
                </button>
                <button onClick={() => setSelected(new Set())} disabled={bulkWorking}
                  className="text-[12px] font-semibold text-white/80 dark:text-gray-900/80 hover:text-white dark:hover:text-gray-900 disabled:opacity-60">
                  Clear
                </button>
              </div>
            </div>
          )}

          <p className="text-[12px] text-gray-500 flex items-center gap-3 flex-wrap">
            {/* The total is counted in the database, so it stays true beyond
                whichever page happens to be loaded. */}
            {total !== null && total > rows.length
              ? <span>Showing {rows.length} of {total} waiting</span>
              : <span>{total ?? rows.length} waiting</span>}
            <button onClick={toggleSelectAll} disabled={bulkWorking}
              className="inline-flex items-center gap-1 font-semibold text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white disabled:opacity-50">
              <CheckSquare size={13} />
              {/* Names the number it actually reaches. A button saying "select
                  all" while selecting 100 of 1,300 is simply untrue. */}
              {allSelected ? 'Clear selection' : 'Select these ' + rows.length}
            </button>
            {selected.size > 0 && <span className="text-gray-400">{selected.size} selected</span>}
          </p>
          <ul className="space-y-2">
            {rows.map((c) => {
              const n = normalizeBusiness(c);
              const live = n ? scoreConfidence({ normalized: n }) : null;
              const p = c.profile ?? {};
              const thumb = p.logo_url ?? p.image_url;
              return (
                <li key={c.id} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleSelect(c.id)} disabled={bulkWorking}
                      className="mt-0.5 h-4 w-4 shrink-0 accent-gray-900 dark:accent-white disabled:opacity-50" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start gap-2.5">
                        {thumb ? (
                          <SmartImg src={thumb} alt={`${c.name} logo`} className="w-10 h-10 rounded-lg object-cover bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 shrink-0" />
                        ) : null}
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-gray-900 dark:text-white">{c.name}</p>
                          {p.tagline && (
                            <p className="text-[11px] text-gray-500 dark:text-gray-400 italic mt-px">{p.tagline}</p>
                          )}
                          <p className="text-[11px] text-gray-500 dark:text-gray-400">
                            {[c.category, c.city].filter(Boolean).join(' · ') || 'No category or city'}
                          </p>
                          <p className="text-[10px] text-gray-400 mt-0.5">
                            {SOURCE_LABEL[c.source_key] ?? c.source_key}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-lg font-bold tabular-nums text-gray-900 dark:text-white">
                        {live?.score ?? c.confidence}%
                      </span>
                      <span className="block text-[10px] text-gray-500">confidence</span>
                    </div>
                  </div>

                  {c.description && (
                    <p className="mt-2 text-[11px] text-gray-600 dark:text-gray-300 line-clamp-2">{c.description}</p>
                  )}

                  <dl className="mt-2 grid sm:grid-cols-2 gap-x-4 gap-y-0.5 text-[11px]">
                    {([['Phone', c.phone], ['WhatsApp', c.whatsapp], ['Website', c.website], ['Email', c.email], ['Address', c.address]] as const)
                      .filter(([, v]) => v)
                      .map(([k, v]) => (
                        <div key={k} className="flex gap-1.5 min-w-0">
                          <dt className="text-gray-400 shrink-0">{k}</dt>
                          <dd className="text-gray-700 dark:text-gray-200 truncate">{v}</dd>
                        </div>
                      ))}
                  </dl>

                  {(() => {
                    const services = parseServicesJson(p.services_json ?? null);
                    const socials = ([p.instagram, p.facebook, p.twitter, p.tiktok, p.linkedin, p.youtube] as (string | null | undefined)[])
                      .filter((s): s is string => !!s)
                      .map((s) => s.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''));
                    const extras = ([['Pricing', p.pricing], ['Duration', p.duration], ['Dimensions', p.dimensions]] as const)
                      .filter(([, v]) => v) as [string, string][];
                    const faqs = parseFaqsJson(p.faqs_json ?? null);
                    const listFields = ([['Languages', p.languages], ['Payment', p.payment_methods], ['Service area', p.service_area], ['Employees', p.employees], ['Business type', p.business_type]] as const)
                      .filter(([, v]) => v) as [string, string][];
                    const narrative = ([['About', p.about], ['Mission', p.mission], ['Vision', p.vision]] as const)
                      .filter(([, v]) => v) as [string, string][];
                    const hours = p.opening_hours;
                    const founded = p.founded_year;
                    const hasContent = services.length || socials.length || extras.length || faqs.length || listFields.length || narrative.length || hours || founded;
                    if (!hasContent) return null;
                    return (
                      <div className="mt-2 space-y-1.5">
                        {narrative.length > 0 && (
                          <div className="space-y-1">
                            {narrative.map(([k, v]) => (
                              <p key={k} className="text-[11px]">
                                <span className="text-gray-400 font-semibold">{k}</span>{' '}
                                <span className="text-gray-700 dark:text-gray-200">{v}</span>
                              </p>
                            ))}
                          </div>
                        )}
                        {(hours || founded) && (
                          <dl className="grid sm:grid-cols-2 gap-x-4 gap-y-0.5 text-[11px]">
                            {hours && (
                              <div className="flex gap-1.5 min-w-0">
                                <dt className="text-gray-400 shrink-0">Hours</dt>
                                <dd className="text-gray-700 dark:text-gray-200 truncate">{hours}</dd>
                              </div>
                            )}
                            {founded && (
                              <div className="flex gap-1.5 min-w-0">
                                <dt className="text-gray-400 shrink-0">Founded</dt>
                                <dd className="text-gray-700 dark:text-gray-200 truncate">{founded}</dd>
                              </div>
                            )}
                          </dl>
                        )}
                        {extras.length > 0 && (
                          <dl className="grid sm:grid-cols-2 gap-x-4 gap-y-0.5 text-[11px]">
                            {extras.map(([k, v]) => (
                              <div key={k} className="flex gap-1.5 min-w-0">
                                <dt className="text-gray-400 shrink-0">{k}</dt>
                                <dd className="text-gray-700 dark:text-gray-200 truncate">{v}</dd>
                              </div>
                            ))}
                          </dl>
                        )}
                        {listFields.length > 0 && (
                          <dl className="grid sm:grid-cols-2 gap-x-4 gap-y-0.5 text-[11px]">
                            {listFields.map(([k, v]) => (
                              <div key={k} className="flex gap-1.5 min-w-0">
                                <dt className="text-gray-400 shrink-0">{k}</dt>
                                <dd className="text-gray-700 dark:text-gray-200 truncate">{v}</dd>
                              </div>
                            ))}
                          </dl>
                        )}
                        {services.length > 0 && (
                          <div>
                            <p className="text-[11px] text-gray-400">
                              {services.length > 8 ? `${services.length} services` : 'Services'}
                            </p>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {services.slice(0, 8).map((s) => (
                                <span key={s.name} title={s.description}
                                  className="rounded-full bg-gray-100 dark:bg-gray-700 px-2 py-0.5 text-[11px] text-gray-700 dark:text-gray-200">
                                  {s.name}{s.price ? ` · ${s.price}` : ''}
                                </span>
                              ))}
                              {services.length > 8 && (
                                <span className="text-[11px] text-gray-400 self-center">+{services.length - 8} more</span>
                              )}
                            </div>
                          </div>
                        )}
                        {socials.length > 0 && (
                          <p className="text-[11px] text-gray-500">
                            <span className="text-gray-400">Socials</span> {socials.join(' · ')}
                          </p>
                        )}
                        {faqs.length > 0 && (
                          <div>
                            <p className="text-[11px] text-gray-400">
                              {faqs.length > 2 ? `${faqs.length} FAQs (showing 2)` : `${faqs.length} FAQ${faqs.length === 1 ? '' : 's'}`}
                            </p>
                            <div className="mt-1 space-y-1">
                              {faqs.slice(0, 2).map((f) => (
                                <p key={f.q} className="text-[11px]">
                                  <span className="font-semibold text-gray-700 dark:text-gray-200">{f.q}</span>{' '}
                                  <span className="text-gray-500 dark:text-gray-400">{f.a.length > 80 ? f.a.slice(0, 80) + '…' : f.a}</span>
                                </p>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {live && live.missing.length > 0 && (
                    <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-300">
                      Missing: {live.missing.join(', ')}
                    </p>
                  )}

                  <div className="flex flex-wrap gap-2 mt-3">
                    <button onClick={() => void publish(c)} disabled={working === c.id || bulkWorking}
                      className="inline-flex items-center gap-1.5 px-4 min-h-[38px] rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-[13px] font-bold disabled:opacity-50">
                      {working === c.id ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                      Publish as unclaimed
                    </button>
                    <button onClick={() => void reject(c)} disabled={working === c.id || bulkWorking}
                      className="inline-flex items-center gap-1.5 px-4 min-h-[38px] rounded-lg border border-gray-300 dark:border-gray-600 text-[13px] font-semibold text-gray-700 dark:text-gray-200 disabled:opacity-50">
                      <X size={14} /> Reject
                    </button>
                    {websiteHref(c.website) && (
                      <a href={websiteHref(c.website)!} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 min-h-[38px] text-[13px] font-semibold text-blue-600 dark:text-blue-400">
                        <ExternalLink size={13} /> Check the site
                      </a>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          {/* More exist than are drawn. Fetching them is a decision, not a
              default — that default is what used to freeze the screen. */}
          {total !== null && rows.length < total && (
            <div className="pt-1 text-center">
              <button onClick={() => void loadPage(page + 1, true)} disabled={loading}
                className="inline-flex items-center gap-2 px-4 min-h-[38px] rounded-lg border border-gray-300 dark:border-gray-600 text-[12px] font-semibold text-gray-700 dark:text-gray-200 disabled:opacity-60">
                {loading && <Loader2 size={13} className="animate-spin" />}
                {loading ? 'Loading…' : 'Load ' + Math.min(pageSize, total - rows.length) + ' more'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
