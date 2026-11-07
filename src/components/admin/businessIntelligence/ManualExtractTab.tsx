import { useState } from 'react';
import toast from 'react-hot-toast';
import {
  AlertTriangle, Check, Clock, ExternalLink, Image, Info, Loader2, MapPin,
  Phone, Search, ShieldCheck, Sparkles,
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { Card, EmptyState, WarnBanner } from './shared';
import InstagramExtract from './InstagramExtract';
import InstagramBatchExtract from './InstagramBatchExtract';

/**
 * Admin → Business Intelligence → Manual extract.
 *
 * Read ONE page a person chose, see what the business publishes about itself,
 * and import it as a candidate for the normal review queue.
 *
 * WHY THIS IS NOT A SCRAPER, AND THE DIFFERENCE IS NOT A MATTER OF DEGREE
 *
 * One URL, typed by a person, per click. No link following, no queue, no
 * schedule, no "extract this whole site" button — and the server refuses to
 * provide one. The `extract-page` function checks the address against the SSRF
 * guard, refuses platforms whose terms prohibit automated access BEFORE opening
 * a connection, honours robots.txt (and refuses when robots.txt cannot be read,
 * because unknown is a refusal everywhere else here), caps size and time, and
 * writes every call to the audit log with the URL and who asked.
 *
 * This screen's job is to show the operator each of those decisions rather than
 * hide them behind a spinner. A refusal with a reason teaches; a silent failure
 * invites somebody to go looking for a tool without the limits.
 */

interface Candidate {
  name?: string | null;
  /*
   * The schema.org @type the page declared, prettified — Hotel, Dentist,
   * Restaurant. Absent from this interface until 2026-09-15, which is part of
   * why it was never displayed or imported: the index signature below caught it
   * as `unknown`, so nothing complained that it was going nowhere.
   */
  category?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  address?: string | null;
  city?: string | null;
  description?: string | null;
  social_links?: Record<string, string> | null;
  [k: string]: unknown;
}

/**
 * The rest of what the page published, split by who owns it.
 *
 * `facts` are facts — hours, coordinates, a WhatsApp number, the handle a
 * business posts under. Facts are not copyrightable and recording them is the
 * ordinary business of a directory.
 *
 * `owned` is authored work and marks: the About paragraph a copywriter wrote,
 * the logo, the photograph. Reading them is fine; republishing them is the
 * owner's decision, so they are shown but never imported by the same click.
 */
interface ExtractDetails {
  facts: {
    openingHours: string | null;
    latitude: number | null;
    longitude: number | null;
    phones: string[];
    whatsapp: string | null;
    socials: Record<string, string>;
  };
  owned: {
    services: string[];
    products: string[];
    about: string | null;
    slogan: string | null;
    logoUrl: string | null;
    coverImageUrl: string | null;
  };
}

/** What is already on file for a URL, if anything. */
interface ExistingRecord {
  id: string;
  status: string;
  published_business_id: string | null;
  /** Null when the candidate was never published. */
  business: { id: string; name: string; claim_status: string | null; user_id: string | null } | null;
}

interface ExtractResult {
  ok: boolean;
  stage?: string;
  reason?: string;
  guidance?: string;
  url?: string;
  host?: string;
  robots?: string;
  candidate?: Candidate | null;
  extracted?: string[];
  note?: string | null;
  rights?: string;
  details?: ExtractDetails;
}

/*
 * Which candidate fields the panel shows.
 *
 * `category` was missing, so the schema.org type a page declared — Hotel,
 * Restaurant, Dentist — was read by the parser, carried on the candidate, and
 * then shown to nobody and imported nowhere. An operator could not see what the
 * page said the business WAS, on a screen whose whole job is showing what the
 * page said.
 */
const FIELD_LABEL: Record<string, string> = {
  name: 'Business name', category: 'Category', phone: 'Phone', email: 'Email',
  website: 'Website', address: 'Address', city: 'City', description: 'Description',
};

export default function ManualExtractTab() {
  /*
   * ── TWO SOURCES, ONE TAB ───────────────────────────────────────────────
   *
   * Instagram is a second way IN to the same pipeline, not a second
   * extractor. Whatever either source produces is staged into
   * radar_candidates and decided in the Review queue — one staging path, one
   * duplicate check, one place a business is created.
   *
   * They are separate inputs because they take different things: a page
   * address versus a handle. They are on one tab because what an operator is
   * doing is identical.
   */
  const [source, setSource] = useState<'website' | 'instagram' | 'instagram_batch'>('website');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ExtractResult | null>(null);
  const [importing, setImporting] = useState(false);
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  /** Separate consent for the copyrighted material — see the owned panel. */
  const [ownedConfirmed, setOwnedConfirmed] = useState(false);
  /**
   * The record already on file for this URL, looked up as soon as a page is
   * read rather than at the moment of import.
   *
   * An operator who learns "this is already published" only after filling in
   * the form and pressing the button has been made to do the work twice. The
   * warning, and the choice about what to do, belong on screen beforehand.
   */
  const [existing, setExisting] = useState<ExistingRecord | null>(null);
  /** Overwrite the published profile with what the page says now. */
  const [forceReplace, setForceReplace] = useState(false);

  const run = async () => {
    const target = url.trim();
    if (!target) { toast.error('Paste a page address first.'); return; }
    setBusy(true);
    setResult(null);
    setRightsConfirmed(false);
    setOwnedConfirmed(false);
    setExisting(null);
    setForceReplace(false);

    const { data, error } = await supabase.functions.invoke('extract-page', { body: { url: target } });
    setBusy(false);

    if (error) {
      /*
       * A 403 from the function means the caller is not staff. Saying so beats
       * "something went wrong", which sends an operator hunting for a fault
       * that is actually a permission.
       */
      setResult({ ok: false, reason: error.message || 'The extractor could not be reached.' });
      return;
    }
    const parsed = data as ExtractResult;
    setResult(parsed);

    /*
     * Ask now, not at import time. Also fetches the linked business so the
     * panel can say whether an owner has since claimed it — which decides
     * whether replacing is even possible.
     */
    if (parsed.ok && parsed.url) {
      const { data: row } = await supabase
        .from('radar_candidates')
        .select('id,status,published_business_id')
        .eq('source_key', 'manual_extraction')
        .eq('source_record_id', parsed.url)
        .maybeSingle();

      if (!row) { setExisting(null); return; }

      let business: ExistingRecord['business'] = null;
      if (row.published_business_id) {
        const { data: b } = await supabase
          .from('businesses')
          .select('id,name,claim_status,user_id')
          .eq('id', row.published_business_id)
          .maybeSingle();
        business = (b as ExistingRecord['business']) ?? null;
      }
      setExisting({ ...row, business } as ExistingRecord);
    } else {
      setExisting(null);
    }
  };

  const importCandidate = async () => {
    if (!result?.candidate || !result.url) return;
    setImporting(true);
    const c = result.candidate;
    /*
     * Lands in `radar_candidates` at confidence 0, exactly like a public
     * suggestion. A person read one page; that is a lead, not a verified fact,
     * and it goes through the same review queue as everything else rather than
     * round it.
     */
    const facts = result.details?.facts;
    const owned = result.details?.owned;

    /*
     * WHERE EACH FIELD GOES, AND WHY THE KEY NAMES MATTER.
     *
     * radar_candidates has columns for name, phone, email, website, address,
     * city and coordinates. Everything else rides in `profile`, and
     * radar_publish_candidate() projects that jsonb onto the business through a
     * WHITELIST — `opening_hours`, `logo_url`, `cover_image_url`, `about`,
     * `mission`, `vision`, `tagline`, the six social networks, `services_json`.
     *
     * So these keys are not free-form labels: a key outside that whitelist is
     * staged, visible to a reviewer, and silently dropped at publication. Using
     * the real names is the difference between material that reaches the
     * profile on approval and material that quietly never does.
     *
     * FACTS ARE ALWAYS STAGED. Hours, coordinates, WhatsApp and social handles
     * are facts about a business, not authored work, and a directory recording
     * them is the ordinary business of directories.
     *
     * OWNED CONTENT ONLY WHEN THE SECOND BOX IS TICKED. The About paragraph,
     * the logo, the cover photograph and the service names are somebody's
     * writing, marks and pictures. Unticked, they are read, shown on screen,
     * and then simply not carried. Ticked, they are staged — and still publish
     * only when a human approves the candidate in the Review tab.
     */
    const staged: Record<string, unknown> = { ...(facts?.socials ?? {}) };
    // The single highest-value field on the platform: 3 of 3,118 listings have
    // any opening hours, on a product named after the question they answer.
    if (facts?.openingHours) staged.opening_hours = facts.openingHours;
    // The candidate row takes one phone; the others are facts too, so they are
    // recorded rather than discarded.
    if (facts?.phones && facts.phones.length > 1) staged.phones_seen = facts.phones.slice(1);

    if (ownedConfirmed && owned) {
      if (owned.logoUrl) staged.logo_url = owned.logoUrl;
      if (owned.coverImageUrl) staged.cover_image_url = owned.coverImageUrl;
      if (owned.about) staged.about = owned.about;
      if (owned.slogan) staged.tagline = owned.slogan;
      // Names only. No price and no description, because the page's price list
      // is a fact that goes stale and its copy is somebody's writing — and
      // inventing either is the failure this whole tool is built to avoid.
      if (owned.services.length) {
        staged.services_json = JSON.stringify(owned.services.map((name) => ({ name })));
      }
      /*
       * Products have no projection in radar_publish_candidate, so this key is
       * deliberately NOT a whitelist name: it reaches a reviewer's eye and goes
       * no further. Staging it under a name that looks publishable would imply
       * a path that does not exist.
       */
      if (owned.products.length) staged.products_seen = owned.products;
    }

    /*
     * FOUR FIELDS USED TO BE DROPPED HERE, and radar_candidates has a column
     * for every one of them. Found 2026-09-15 by comparing what the parser
     * returns against what this insert sends:
     *
     *   category    read from the page's schema.org @type, shown nowhere,
     *               imported nowhere. The reviewer had to guess the trade.
     *   description read AND displayed on this screen, then silently discarded
     *               at the moment of import.
     *   whatsapp    staged into `profile` when the table has its own column,
     *               so nothing that reads the column ever saw it.
     *   source_record_id  the parser sets it to the final URL precisely so a
     *               re-read updates rather than duplicates. Without it, reading
     *               the same page twice filed the business twice.
     *
     * The pattern is one to watch for: a field can be extracted, rendered, and
     * still never reach the database, because those are three separate lists
     * and only one of them is visible on screen.
     */
    /*
     * The fields that describe the page. Kept separate from the ones that
     * describe a DECISION, because a re-read must update the first and never
     * touch the second.
     */
    const fields = {
      source_key: 'manual_extraction',
      source_record_id: result.url,
      name: String(c.name ?? '').slice(0, 200),
      category: (c.category ?? '').trim() || null,
      description: (c.description ?? '').trim() || null,
      phone: c.phone ?? null,
      whatsapp: facts?.whatsapp ?? null,
      email: c.email ?? null,
      website: c.website ?? result.url,
      address: c.address ?? null,
      city: c.city ?? null,
      latitude: facts?.latitude ?? null,
      longitude: facts?.longitude ?? null,
      /*
       * `{}`, never null. The column is NOT NULL with a default of '{}'::jsonb,
       * and passing an explicit null overrides the default rather than falling
       * back to it — which is how "null value in column profile violates
       * not-null constraint" reached an operator who had simply read a page
       * with no extra facts on it.
       */
      profile: staged,
      source_url: result.url,
      decision_reason: `Extracted by an administrator from ${result.host}. Rights confirmed at import.`
        + (ownedConfirmed ? ' Owner-authored content staged for review.' : ' Facts only; authored content not carried.'),
    };

    /*
     * RE-READING A PAGE UPDATES IT. IT DOES NOT FILE IT TWICE, AND IT DOES NOT
     * OVERWRITE A DECISION SOMEBODY ALREADY MADE.
     *
     * There is a unique index on (source_key, source_record_id), so the plain
     * insert this used to be failed the second time with "duplicate key value
     * violates unique constraint idx_radar_candidates_source_record" — an
     * operator correcting a typo in a URL, or checking a site again a month
     * later, hit a database error with nothing to do about it.
     *
     * A blind upsert would have been worse than the error. It would have
     * rewritten `status` and `confidence` too, so re-reading a page whose
     * candidate had already been published or rejected would quietly drag it
     * back to 'pending' and undo a human judgement. So the decided states are
     * left alone and the operator is told why.
     */
    let error: { message: string } | null = null;
    let verb = 'Added to the review queue';

    if (existing) {
      const decided = existing.published_business_id
        || ['published', 'merged', 'rejected'].includes(String(existing.status));

      if (decided && !forceReplace) {
        setImporting(false);
        toast.error(
          `This page is already on file and has been ${existing.status}. `
          + 'Tick "Replace the published record" to overwrite it, or edit it in the Review tab.',
        );
        return;
      }

      if (decided && forceReplace) {
        /*
         * REPLACE THE PUBLISHED PROFILE WITH WHAT THE PAGE SAYS NOW.
         *
         * The refusal this overrides is the right default — re-reading a page
         * should not silently undo somebody's decision — but it left an
         * operator with no way to act on a business that had genuinely changed
         * its phone number or its hours. This is that way, and it is deliberate
         * rather than automatic.
         *
         * TWO THINGS IT WILL NOT DO.
         *
         * It never blanks a field. Only values the page actually published are
         * written, so a profile that has an address and a page that has stopped
         * publishing one keeps the address. An overwrite that erased good data
         * because a site was redesigned would be worse than no overwrite.
         *
         * It never overrules an owner. `guard_claimed_profile_edits` refuses
         * content changes to a claimed business from anyone but the person who
         * claimed it — admins included — so the database itself stops this, and
         * the check below exists to say so in words rather than leave an
         * operator staring at a Postgres error.
         */
        if (existing.business?.claim_status === 'claimed' || existing.business?.user_id) {
          setImporting(false);
          toast.error(
            `${existing.business?.name ?? 'This business'} has been claimed by its owner. `
            + 'They control the profile now — send them the correction instead.',
          );
          return;
        }

        // Only what the page published. Undefined keys are not sent at all.
        const live: Record<string, unknown> = {};
        const put = (k: string, v: unknown) => {
          if (typeof v === 'string' ? v.trim() : v != null) live[k] = v;
        };
        put('name', fields.name);
        put('category', fields.category);
        put('description', fields.description);
        put('phone', fields.phone);
        put('whatsapp', fields.whatsapp);
        put('email', fields.email);
        put('website', fields.website);
        put('address', fields.address);
        put('location', fields.city);
        put('opening_hours', facts?.openingHours);
        if (ownedConfirmed) {
          put('logo_url', owned?.logoUrl);
          put('image_url', owned?.coverImageUrl);
        }

        if (existing.published_business_id && Object.keys(live).length) {
          const { error: bizErr } = await supabase
            .from('businesses')
            .update(live)
            .eq('id', existing.published_business_id);
          if (bizErr) {
            setImporting(false);
            toast.error(`The published profile was not changed: ${bizErr.message}`);
            return;
          }
        }

        ({ error } = await supabase.from('radar_candidates').update({
          ...fields,
          decision_reason: `${fields.decision_reason} Published profile replaced from this page on `
            + `${new Date().toISOString().slice(0, 10)} by an administrator.`,
        }).eq('id', existing.id));
        verb = `Replaced the published profile (${Object.keys(live).length} fields)`;
      } else {
        // Still pending: refresh what the page says, keep its place in the queue.
        ({ error } = await supabase.from('radar_candidates').update(fields).eq('id', existing.id));
        verb = 'Updated the candidate already on file for this page';
      }
    } else {
      ({ error } = await supabase
        .from('radar_candidates')
        .insert({ ...fields, confidence: 0, status: 'pending' }));
    }

    setImporting(false);
    if (error) { toast.error(error.message); return; }
    /*
     * The old line always ended "nothing is published", which after a forced
     * replace would be exactly untrue — and the one place an operator looks to
     * confirm what just happened.
     */
    toast.success(
      forceReplace && existing?.published_business_id
        ? `${verb} — the live profile now shows what this page says.`
        : `${verb} at confidence 0 — nothing is published.`,
    );
    setResult(null);
    setRightsConfirmed(false);
    setOwnedConfirmed(false);
    setExisting(null);
    setForceReplace(false);
    setUrl('');
  };

  const found = (result?.extracted ?? []).length;
  const facts = result?.details?.facts;
  const owned = result?.details?.owned;
  /** How many facts are actually present, so an empty panel never renders. */
  const factsCount = facts
    ? [facts.openingHours, facts.whatsapp, facts.phones.length > 1 ? 'tel' : null,
      facts.latitude !== null ? 'geo' : null,
      Object.keys(facts.socials).length ? 'socials' : null].filter(Boolean).length
    : 0;
  const ownedCount = owned
    ? [owned.about, owned.slogan, owned.logoUrl, owned.coverImageUrl,
      owned.services.length ? 's' : null, owned.products.length ? 'p' : null].filter(Boolean).length
    : 0;

  return (
    <div className="space-y-5">
      {/* Source picker. Website first: it is the one that works today. */}
      <div className="flex items-center gap-2">
        {([
          ['website', 'Website'],
          ['instagram', 'Instagram'],
          /*
           * The batch is the same lookup over a list somebody already holds,
           * so it sits beside the single one rather than on a tab of its own:
           * an operator choosing between these is choosing how many accounts,
           * not which tool.
           */
          ['instagram_batch', 'Instagram batch'],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setSource(key)}
            aria-pressed={source === key}
            className={`px-4 min-h-[38px] rounded-xl text-[13px] font-semibold transition-colors
              ${source === key
                ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900'
                : 'border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {source === 'instagram_batch' ? <InstagramBatchExtract />
        : source === 'instagram' ? <InstagramExtract /> : (
      <div className="space-y-5">
      <div>
        <p className="max-w-3xl text-[13px] text-gray-500 dark:text-gray-400">
          Read one page and see what a business publishes about itself in structured form.
          Every check the server makes is shown below — including the ones that refuse.
        </p>
      </div>

      <Card title="Page to read">
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void run(); }}
            placeholder="https://example.com/about"
            className="flex-1 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 px-3.5 py-2.5 text-sm"
          />
          <button
            onClick={() => void run()}
            disabled={busy}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-nowopen-500 px-5 py-2.5 text-sm font-bold text-white hover:bg-nowopen-600 disabled:opacity-50"
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
            {busy ? 'Reading…' : 'Read this page'}
          </button>
        </div>

        {/*
          * Stated before anyone clicks, not after a refusal. An operator who
          * knows the boundary does not spend the afternoon testing it.
          */}
        <div className="mt-4 flex items-start gap-2 rounded-xl bg-gray-50 dark:bg-gray-900 px-3.5 py-3">
          <ShieldCheck size={15} className="mt-0.5 shrink-0 text-gray-400" aria-hidden="true" />
          <p className="text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">
            One page per click — no crawling and no link following.
            Instagram, Facebook, TikTok, X and LinkedIn are refused outright: their terms prohibit
            automated access. Sites that disallow reading in robots.txt are refused too, and so is a
            site whose robots.txt cannot be read at all. Every read is recorded in the audit log.
          </p>
        </div>
      </Card>

      {result && !result.ok && (
        <Card title="Refused">
          <div className="flex items-start gap-2.5">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-500" aria-hidden="true" />
            <div className="space-y-1.5">
              {result.stage && (
                <span className="inline-block rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                  {result.stage === 'terms' ? 'platform terms'
                    : result.stage === 'robots' ? 'robots.txt'
                    : result.stage === 'address' ? 'address check' : result.stage}
                </span>
              )}
              <p className="text-[13px] font-semibold text-gray-900 dark:text-white">{result.reason}</p>
              {result.guidance && (
                <p className="text-[12px] text-gray-600 dark:text-gray-300">{result.guidance}</p>
              )}
            </div>
          </div>
        </Card>
      )}

      {result?.ok && (
        <Card
          title={
            <span className="flex flex-wrap items-center gap-2">
              {result.host}
              <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                {result.robots}
              </span>
            </span>
          }
          action={
            <a href={result.url} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1 text-[12px] font-semibold text-nowopen-600 hover:underline">
              Open <ExternalLink size={12} />
            </a>
          }
        >
          {found === 0 || !result.candidate ? (
            <EmptyState>
              {result.note ?? 'The page published no structured business details. Nothing to import.'}
            </EmptyState>
          ) : (
            <div className="space-y-4">
              <p className="text-[12px] text-gray-500 dark:text-gray-400">
                {found} field{found === 1 ? '' : 's'} published by the page itself.
              </p>

              <dl className="divide-y divide-gray-100 dark:divide-gray-700 rounded-lg border border-gray-100 dark:border-gray-700">
                {Object.entries(result.candidate)
                  .filter(([k, v]) => FIELD_LABEL[k] && typeof v === 'string' && v.trim())
                  .map(([k, v]) => (
                    <div key={k} className="flex gap-3 px-3 py-2 text-[12px]">
                      <dt className="w-28 shrink-0 font-semibold text-gray-500 dark:text-gray-400">
                        {FIELD_LABEL[k]}
                      </dt>
                      <dd className="break-words text-gray-900 dark:text-white">{String(v)}</dd>
                    </div>
                  ))}
              </dl>

              {/*
                * FACTS THE PAGE PUBLISHED — hours, coordinates, WhatsApp,
                * socials. Not copyrightable, so these ride along with the
                * import without a second decision.
                */}
              {facts && (factsCount > 0) && (
                <div className="rounded-lg border border-emerald-200/70 dark:border-emerald-800/60 bg-emerald-50/50 dark:bg-emerald-900/10 p-3">
                  <p className="mb-2 inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                    <ShieldCheck size={13} aria-hidden="true" /> Facts &mdash; imported with the candidate
                  </p>
                  <dl className="space-y-1.5">
                    {facts.openingHours && (
                      <div className="flex gap-2 text-[12px]">
                        <dt className="inline-flex w-28 shrink-0 items-center gap-1 font-semibold text-gray-500 dark:text-gray-400">
                          <Clock size={11} aria-hidden="true" /> Opening hours
                        </dt>
                        <dd className="break-words font-semibold text-gray-900 dark:text-white">{facts.openingHours}</dd>
                      </div>
                    )}
                    {/*
                      * Only when there is MORE than one number.
                      *
                      * The candidate list directly above already shows the
                      * phone that will be imported, so repeating it here taught
                      * a reader nothing and made the panel look like it was
                      * padding itself. Extra numbers are the part the row above
                      * cannot show, so that is what this row is for.
                      */}
                    {facts.phones.length > 1 && (
                      <div className="flex gap-2 text-[12px]">
                        <dt className="inline-flex w-28 shrink-0 items-center gap-1 font-semibold text-gray-500 dark:text-gray-400">
                          <Phone size={11} aria-hidden="true" /> All numbers
                          <span className="text-gray-400">({facts.phones.length})</span>
                        </dt>
                        <dd className="flex flex-wrap gap-1.5">
                          {/*
                            * All of them. The candidate row keeps one, because
                            * businesses.phone is one column — but a business
                            * that published a switchboard, a sales line and a
                            * WhatsApp number published three facts, and the
                            * operator should see the set before one is chosen.
                            */}
                          {facts.phones.map((p, i) => (
                            <a
                              key={p}
                              href={`tel:${p}`}
                              className={`rounded px-1.5 py-0.5 tabular-nums ${i === 0
                                ? 'bg-white dark:bg-gray-800 border border-emerald-300 dark:border-emerald-700 font-semibold text-gray-900 dark:text-white'
                                : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200'}`}
                            >
                              {p}
                            </a>
                          ))}
                          <span className="w-full text-[10px] text-gray-400">
                            The first is imported as the candidate&rsquo;s phone; the rest are recorded for the reviewer.
                          </span>
                        </dd>
                      </div>
                    )}
                    {facts.whatsapp && (
                      <div className="flex gap-2 text-[12px]">
                        <dt className="w-28 shrink-0 font-semibold text-gray-500 dark:text-gray-400">WhatsApp</dt>
                        <dd className="text-gray-900 dark:text-white">{facts.whatsapp}</dd>
                      </div>
                    )}
                    {facts.latitude !== null && facts.longitude !== null && (
                      <div className="flex gap-2 text-[12px]">
                        <dt className="inline-flex w-28 shrink-0 items-center gap-1 font-semibold text-gray-500 dark:text-gray-400">
                          <MapPin size={11} aria-hidden="true" /> Coordinates
                        </dt>
                        <dd className="text-gray-900 dark:text-white tabular-nums">
                          {facts.latitude.toFixed(5)}, {facts.longitude.toFixed(5)}
                        </dd>
                      </div>
                    )}
                    {Object.keys(facts.socials).length > 0 && (
                      <div className="flex gap-2 text-[12px]">
                        <dt className="w-28 shrink-0 font-semibold text-gray-500 dark:text-gray-400">Socials</dt>
                        <dd className="flex flex-wrap gap-1.5">
                          {Object.entries(facts.socials).map(([net, href]) => (
                            <a
                              key={net}
                              href={href}
                              target="_blank"
                              rel="noreferrer"
                              className="rounded bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-1.5 py-0.5 font-medium text-gray-700 dark:text-gray-200 hover:underline"
                            >
                              {net}
                            </a>
                          ))}
                        </dd>
                      </div>
                    )}
                  </dl>
                </div>
              )}

              {/*
                * WHAT THE BUSINESS WROTE AND OWNS.
                *
                * Shown because an operator deciding whether to chase a listing
                * should know the business has a logo and an About paragraph —
                * and because it is what the owner will see appear when they
                * claim the profile.
                *
                * Carried only on the separate tick below. Reading a page is not
                * a licence to republish the writing and pictures on it, and
                * that decision should never be a side effect of the same click
                * that files a phone number.
                */}
              {owned && ownedCount > 0 && (
                <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
                  <p className="mb-2 inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    <Sparkles size={13} aria-hidden="true" /> The business&rsquo;s own words and images
                  </p>

                  {(owned.logoUrl || owned.coverImageUrl) && (
                    <div className="mb-2.5 flex flex-wrap items-start gap-3">
                      {owned.logoUrl && (
                        <figure className="text-center">
                          <img
                            src={owned.logoUrl}
                            alt="Logo published by the business"
                            className="h-12 w-12 rounded border border-gray-200 dark:border-gray-700 object-contain bg-white"
                            loading="lazy"
                          />
                          <figcaption className="mt-1 text-[10px] text-gray-400">Logo</figcaption>
                        </figure>
                      )}
                      {owned.coverImageUrl && (
                        <figure className="text-center">
                          <img
                            src={owned.coverImageUrl}
                            alt="Cover image published by the business"
                            className="h-12 w-24 rounded border border-gray-200 dark:border-gray-700 object-cover"
                            loading="lazy"
                          />
                          <figcaption className="mt-1 text-[10px] text-gray-400">Cover</figcaption>
                        </figure>
                      )}
                      {/*
                        * Displayed from the business's own server. NowOpen does
                        * not copy or host the bytes here — only the address is
                        * recorded, and only if the box below is ticked.
                        */}
                      <p className="flex-1 min-w-[12rem] inline-flex items-start gap-1 text-[10px] leading-relaxed text-gray-400">
                        <Image size={11} className="mt-0.5 shrink-0" aria-hidden="true" />
                        Shown from the business&rsquo;s own server. NowOpen records the address, never a copy.
                      </p>
                    </div>
                  )}

                  <dl className="space-y-1.5">
                    {owned.slogan && (
                      <div className="flex gap-2 text-[12px]">
                        <dt className="w-24 shrink-0 font-semibold text-gray-500 dark:text-gray-400">Tagline</dt>
                        <dd className="break-words text-gray-900 dark:text-white">{owned.slogan}</dd>
                      </div>
                    )}
                    {owned.about && (
                      <div className="flex gap-2 text-[12px]">
                        <dt className="w-24 shrink-0 font-semibold text-gray-500 dark:text-gray-400">About</dt>
                        <dd className="break-words text-gray-900 dark:text-white">{owned.about}</dd>
                      </div>
                    )}
                    {owned.services.length > 0 && (
                      <div className="flex gap-2 text-[12px]">
                        <dt className="w-24 shrink-0 font-semibold text-gray-500 dark:text-gray-400">Services</dt>
                        <dd className="flex flex-wrap gap-1">
                          {owned.services.map((x) => (
                            <span key={x} className="rounded bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 text-gray-700 dark:text-gray-200">{x}</span>
                          ))}
                        </dd>
                      </div>
                    )}
                    {owned.products.length > 0 && (
                      <div className="flex gap-2 text-[12px]">
                        <dt className="w-24 shrink-0 font-semibold text-gray-500 dark:text-gray-400">Products</dt>
                        <dd className="flex flex-wrap gap-1">
                          {owned.products.map((x) => (
                            <span key={x} className="rounded bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 text-gray-700 dark:text-gray-200">{x}</span>
                          ))}
                          <span className="w-full text-[10px] text-gray-400">
                            Recorded for the reviewer only &mdash; there is no product path on publication yet.
                          </span>
                        </dd>
                      </div>
                    )}
                  </dl>

                  <label className="mt-3 flex items-start gap-2.5 text-[12px] text-gray-700 dark:text-gray-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={ownedConfirmed}
                      onChange={(e) => setOwnedConfirmed(e.target.checked)}
                      className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-nowopen-500 focus:ring-nowopen-500"
                    />
                    <span>
                      Stage this material for review as well. It belongs to the business, so it is
                      published only if a reviewer approves the candidate &mdash; and a claiming owner
                      can replace or remove any of it.
                    </span>
                  </label>
                </div>
              )}

              {/*
                * The sentence that stops this becoming a copying machine.
                * Readability is not a licence, and the operator ticks a box
                * saying they know the difference.
                */}
              <div className="flex items-start gap-2 rounded-xl border border-amber-200/70 dark:border-amber-800/60 bg-amber-50/70 dark:bg-amber-900/15 px-3.5 py-3">
                <Info size={15} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                <p className="text-[12px] leading-relaxed text-amber-900 dark:text-amber-100">
                  {result.rights}
                </p>
              </div>

              {/*
                * ALREADY ON FILE.
                *
                * Shown as soon as the page is read rather than sprung as an
                * error after the operator has filled the form in — the choice
                * about what to do belongs here, before the work.
                */}
              {existing && (existing.published_business_id
                || ['published', 'merged', 'rejected'].includes(existing.status)) && (
                <div className="rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50/80 dark:bg-amber-900/20 p-3.5">
                  <p className="inline-flex items-center gap-1.5 text-[12px] font-bold text-amber-900 dark:text-amber-100">
                    <AlertTriangle size={14} aria-hidden="true" />
                    Already on file &mdash; {existing.status}
                  </p>
                  <p className="mt-1.5 text-[12px] text-amber-900/90 dark:text-amber-100/90">
                    {existing.business
                      ? <>This page is published as <strong>{existing.business.name}</strong>.</>
                      : <>A candidate for this page has already been {existing.status}.</>}
                    {' '}Importing again would normally be refused so a decision somebody made is
                    not quietly undone.
                  </p>

                  {existing.business?.claim_status === 'claimed' || existing.business?.user_id ? (
                    /*
                     * The owner has it. guard_claimed_profile_edits refuses
                     * content changes to a claimed business from anyone but the
                     * person who claimed it, admins included — so there is no
                     * toggle to offer here, and saying why beats showing a
                     * control that cannot work.
                     */
                    <p className="mt-2.5 inline-flex items-start gap-1.5 text-[11px] text-amber-900 dark:text-amber-100">
                      <ShieldCheck size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
                      The owner has claimed this profile, so they control what it says. Send them
                      the correction rather than overwriting it.
                    </p>
                  ) : (
                    <label className="mt-2.5 flex items-start gap-2.5 text-[12px] text-amber-900 dark:text-amber-100 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={forceReplace}
                        onChange={(e) => setForceReplace(e.target.checked)}
                        className="mt-0.5 h-4 w-4 shrink-0 rounded border-amber-400 text-amber-600 focus:ring-amber-500"
                      />
                      <span>
                        <strong>Replace the published record</strong> with what this page says now.
                        Only fields the page actually publishes are written &mdash; nothing is
                        blanked because a site stopped mentioning it.
                      </span>
                    </label>
                  )}
                </div>
              )}

              <label className="flex items-start gap-2.5 text-[12px] text-gray-700 dark:text-gray-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rightsConfirmed}
                  onChange={(e) => setRightsConfirmed(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-nowopen-500 focus:ring-nowopen-500"
                />
                <span>
                  I have checked that this information may be used on a NowOpen profile, and I am not
                  importing photographs, reviews or copied descriptions from this page.
                </span>
              </label>

              <button
                onClick={() => void importCandidate()}
                disabled={!rightsConfirmed || importing || !result.candidate?.name}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                title={!result.candidate?.name ? 'No business name was found, so there is nothing to file.' : undefined}
              >
                {importing ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                {forceReplace ? 'Replace the published profile' : 'Add to review queue'}
              </button>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">
                {forceReplace
                  ? 'Writes straight to the live profile. There is no review step on a replace — you are the review.'
                  : 'Files it at confidence 0, like any public suggestion. It is published only if a human approves it in the Review tab.'}
              </p>
            </div>
          )}
        </Card>
      )}

      {!result && !busy && (
        <WarnBanner>
          Nothing read yet. This tool exists for the case a person has already found a business and
          wants its own published details on the record — not for collecting lists.
        </WarnBanner>
      )}
    </div>
      )}
    </div>
  );
}
