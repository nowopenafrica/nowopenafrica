import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Radar, Loader2, Plus, ShieldCheck, ShieldAlert, ExternalLink } from 'lucide-react';

import { supabase } from '../../lib/supabase';
import { normalizeName, normalizePhone, normalizeDomain, normalizePlace } from '../../lib/radar/normalize';
import { sourcePermits, type SourcePolicy } from '../../lib/acquire/adapter';
import { WIKIDATA_SOURCE_KEY, type WikidataCandidate } from '../../lib/acquire/wikidata';
import { parseServices, parseServicesJson, parseFoundedYear, formatWeekHours } from '../../lib/imports/profileFields';
import SmartImg from '../SmartImg';

/**
 * Admin → Review Queue → Discovery.
 *
 * ASKING AN AUTHORISED SOURCE WHAT IT HAS.
 *
 * Until now every listing on NowOpen arrived because somebody typed it or
 * uploaded it. This is the first screen that goes and looks — and it can only
 * do so because `radar_sources` now holds a source whose licence permits it
 * (Wikidata, CC0). The rights are re-read here, live, before the button will
 * run: a licence that changes, or a source somebody deactivates, stops this
 * screen the same day.
 *
 * An operator chooses the source. `wikidata` is external and carries the full
 * rights verdict. The internal sources — the Digital Forms registrations and
 * the launch waitlist — are first-party: people typed this data into a NowOpen
 * form, so the platform owns it outright and no licence check applies. Google
 * Business Profile is offered and explicitly cannot run until a Places API key
 * is configured, because pretending otherwise would ship a silver-bullet
 * screen that silently did nothing.
 *
 * NOTHING PUBLISHES FROM HERE. Staging writes `radar_candidates` with status
 * `review`, which is the same queue a customer suggestion lands in, and a
 * person still approves each one. `radar_publish_candidate` then re-checks the
 * source's rights at the moment of publication, because discovery and
 * publishing can be days apart.
 *
 * WHAT AN OPERATOR NEEDS TO SEE, AND WHY THE DUPLICATE CHECK IS HERE
 *
 * The directory already holds 453 businesses. A discovery screen that offered
 * "Add" on a business NowOpen already lists would quietly build the duplicate
 * problem the importer spent effort solving — so each result is matched
 * against what is already listed, by phone, then domain, then name+place, and
 * says so before anybody clicks.
 */

interface WhereOption {
  label: string;
  place?: string;
  country?: string;
}

/**
 * The sources a Discovery run can ask.
 *
 * `wikidata` is the only external acquisition: it asks an authorised third
 * party (CC0) and goes through the radar_sources rights gate. The two internal
 * sources are first-party — people typed this into a NowOpen form — so the
 * rights registry has nothing to add, and publication still re-checks.
 * `google` is shown because an operator expects it, and deliberately cannot
 * run until a Google Places API key is configured — honesty over a shim.
 */
type DiscoverySourceKey = 'wikidata' | 'openstreetmap' | 'business_registration' | 'waitlist' | 'google' | 'businesslist_ng';

const SOURCE_OPTIONS: { key: DiscoverySourceKey; label: string }[] = [
  { key: 'wikidata', label: 'Wikidata (CC0)' },
  { key: 'openstreetmap', label: 'OpenStreetMap (ODbL)' },
  { key: 'business_registration', label: 'Digital Forms registrations' },
  { key: 'waitlist', label: 'Waitlist signups' },
  { key: 'google', label: 'Google Business Profile' },
  { key: 'businesslist_ng', label: 'BusinessList.com.ng' },
];

/**
 * Where to look. A `country` option searches an entire country (wdt:P17);
 * a `place` option searches directly inside a city or region (wdt:P131).
 * QIDs are resolved against Wikidata.
 */
const PLACE_GROUPS: { group: string; options: WhereOption[] }[] = [
  {
    group: 'Nigeria',
    options: [
      { label: 'All of Nigeria' },
      { label: 'Lagos', place: 'Q8673' },
      { label: 'Abuja', place: 'Q3787' },
      { label: 'Ibadan', place: 'Q331669' },
      { label: 'Kano', place: 'Q170688' },
      { label: 'Port Harcourt', place: 'Q506870' },
      { label: 'Benin City', place: 'Q189222' },
      { label: 'Enugu', place: 'Q1030817' },
      { label: 'Kaduna', place: 'Q459477' },
    ],
  },
  {
    group: 'West Africa',
    options: [
      { label: 'Ghana', country: 'Q117' },
      { label: 'Senegal', country: 'Q1041' },
      { label: "Côte d'Ivoire", country: 'Q1008' },
      { label: 'Benin', country: 'Q962' },
      { label: 'Togo', country: 'Q945' },
      { label: 'Niger', country: 'Q1032' },
      { label: 'Mali', country: 'Q912' },
      { label: 'Burkina Faso', country: 'Q965' },
      { label: 'Guinea', country: 'Q1006' },
      { label: 'Sierra Leone', country: 'Q1044' },
      { label: 'Liberia', country: 'Q1014' },
      { label: 'Gambia', country: 'Q1005' },
      { label: 'Mauritania', country: 'Q1025' },
      { label: 'Cape Verde', country: 'Q1011' },
    ],
  },
  {
    group: 'East Africa',
    options: [
      { label: 'Kenya', country: 'Q114' },
      { label: 'Ethiopia', country: 'Q115' },
      { label: 'Tanzania', country: 'Q924' },
      { label: 'Uganda', country: 'Q1036' },
      { label: 'Rwanda', country: 'Q1037' },
      { label: 'Sudan', country: 'Q1049' },
      { label: 'South Sudan', country: 'Q958' },
      { label: 'Somalia', country: 'Q1045' },
      { label: 'Djibouti', country: 'Q977' },
      { label: 'Eritrea', country: 'Q986' },
    ],
  },
  {
    group: 'Central Africa',
    options: [
      { label: 'Cameroon', country: 'Q1009' },
      { label: 'Chad', country: 'Q657' },
      { label: 'DR Congo', country: 'Q974' },
    ],
  },
  {
    group: 'Southern Africa',
    options: [
      { label: 'South Africa', country: 'Q258' },
      { label: 'Angola', country: 'Q916' },
      { label: 'Zambia', country: 'Q953' },
      { label: 'Zimbabwe', country: 'Q954' },
      { label: 'Mozambique', country: 'Q1029' },
      { label: 'Madagascar', country: 'Q1019' },
      { label: 'Mauritius', country: 'Q1027' },
      { label: 'Comoros', country: 'Q970' },
    ],
  },
  {
    group: 'North Africa',
    options: [
      { label: 'Egypt', country: 'Q79' },
      { label: 'Morocco', country: 'Q1028' },
      { label: 'Algeria', country: 'Q262' },
      { label: 'Tunisia', country: 'Q948' },
      { label: 'Libya', country: 'Q1016' },
    ],
  },
  {
    group: 'Major African cities',
    options: [
      { label: 'Nairobi, Kenya', place: 'Q3870' },
      { label: 'Accra, Ghana', place: 'Q3761' },
      { label: 'Addis Ababa, Ethiopia', place: 'Q3624' },
      { label: 'Cairo, Egypt', place: 'Q85' },
      { label: 'Johannesburg, South Africa', place: 'Q34647' },
      { label: 'Cape Town, South Africa', place: 'Q5465' },
      { label: 'Dar es Salaam, Tanzania', place: 'Q1960' },
      { label: 'Kampala, Uganda', place: 'Q3894' },
      { label: 'Kigali, Rwanda', place: 'Q3859' },
      { label: 'Abidjan, Côte d’Ivoire', place: 'Q1515' },
      { label: 'Dakar, Senegal', place: 'Q3718' },
      { label: 'Casablanca, Morocco', place: 'Q7903' },
      { label: 'Tunis, Tunisia', place: 'Q3572' },
      { label: 'Algiers, Algeria', place: 'Q3561' },
      { label: 'Tripoli, Libya', place: 'Q3579' },
      { label: 'Khartoum, Sudan', place: 'Q1963' },
      { label: 'Lusaka, Zambia', place: 'Q3881' },
      { label: 'Harare, Zimbabwe', place: 'Q3921' },
      { label: 'Maputo, Mozambique', place: 'Q3889' },
      { label: 'Antananarivo, Madagascar', place: 'Q3915' },
      { label: 'Kinshasa, DR Congo', place: 'Q3838' },
      { label: 'Yaoundé, Cameroon', place: 'Q3808' },
      { label: 'Douala, Cameroon', place: 'Q132830' },
      { label: 'Mogadishu, Somalia', place: 'Q2449' },
    ],
  },
];

const ALL_OPTIONS = PLACE_GROUPS.flatMap((g) => g.options);

/*
 * QIDs this browser has already been offered. Persisted per-browser because
 * Discovery is an admin console (localStorage convention: `nowopen_` prefix).
 * The real anti-repeat barrier is the server's FILTER NOT IN; this is the
 * memory that feeds it, plus the fallback if the server ever misses one.
 */
const SEEN_KEY = 'nowopen_wikidata_seen';

const readSeen = (): Set<string> => {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    const arr = raw ? (JSON.parse(raw) as unknown) : null;
    return new Set(Array.isArray(arr) ? (arr as string[]) : []);
  } catch {
    return new Set();
  }
};

const persistSeen = (ids: string[]) => {
  try { localStorage.setItem(SEEN_KEY, JSON.stringify(ids)); } catch { /* blocked or full */ }
};

interface ExistingKey {
  phones: Set<string>;
  domains: Set<string>;
  nameCity: Set<string>;
}

type Match = 'phone' | 'website' | 'name' | null;

/**
 * One row in the results table, whatever source produced it.
 *
 * Internal sources have no QID and no source page: `sourceKey` marks them
 * (Wikidata rows leave it undefined) and `sourceRecordId` — already on
 * `WikidataCandidate` — carries their identity, the same unique key
 * `radar_candidates` enforces. The Wikidata external-link affordance is
 * rendered only when `qid` is present.
 */
interface DiscoveryCandidate extends WikidataCandidate {
  sourceKey?: string;
  confidence?: number;
  whatsapp?: string | null;
}

/** Stable identity across every source. */
const cid = (c: DiscoveryCandidate): string =>
  c.qid || `${c.sourceKey}:${c.sourceRecordId}`;

export default function DiscoveryPanel({ onStaged }: { onStaged?: () => void }) {
  const [policy, setPolicy] = useState<SourcePolicy | null>(null);
  const [policyProblem, setPolicyProblem] = useState<string | null>(null);
  const [source, setSource] = useState<DiscoverySourceKey>('wikidata');
  const [place, setPlace] = useState(ALL_OPTIONS[1]);
  const [contactOnly, setContactOnly] = useState(true);
  const [limit, setLimit] = useState(50);
  const [running, setRunning] = useState(false);
  const [retryMessage, setRetryMessage] = useState('');
  const [results, setResults] = useState<DiscoveryCandidate[]>([]);
  const [staged, setStaged] = useState<Set<string>>(new Set());
  const [existing, setExisting] = useState<ExistingKey | null>(null);
  const [stagedBySource, setStagedBySource] = useState<Record<string, Set<string>>>({});
  const [existingWikidata, setExistingWikidata] = useState<Set<string>>(new Set());
  const [seen, setSeen] = useState<Set<string>>(readSeen);
  const [skipped, setSkipped] = useState(0);

  /*
   * The rights, read from the registry rather than assumed.
   *
   * `sourcePermits` refuses on UNKNOWN and on a blank `authorised_by`, so a
   * half-filled row cannot turn this screen on. The same function guards a
   * future adapter, which is the point of putting the rule in one place.
   */
  const loadPolicy = useCallback(async () => {
    const { data, error } = await supabase
      .from('radar_sources')
      .select('key,name,active,automated_access,bulk_extraction,redistribution,competing_dataset,licence,authorised_by')
      .eq('key', WIKIDATA_SOURCE_KEY)
      .maybeSingle();

    if (error) { setPolicyProblem(error.message); return; }
    if (!data) { setPolicyProblem('No wikidata row in radar_sources — the source is not registered.'); return; }

    const row = data as unknown as Record<string, unknown>;
    setPolicy({
      key: String(row.key),
      name: String(row.name),
      active: Boolean(row.active),
      automatedAccess: String(row.automated_access ?? 'unknown'),
      bulkExtraction: String(row.bulk_extraction ?? 'unknown'),
      redistribution: String(row.redistribution ?? 'unknown'),
      competingDataset: (row.competing_dataset as string) ?? null,
      licence: (row.licence as string) ?? null,
      authorisedBy: (row.authorised_by as string) ?? null,
    });
    setPolicyProblem(null);
  }, []);

  /** What NowOpen already lists, so nothing is offered twice. */
  const loadExisting = useCallback(async () => {
    const { data, error } = await supabase
      .from('businesses')
      .select('name,location,phone,website,external_id')
      .limit(50000);
    if (error || !data) return;

    const phones = new Set<string>();
    const domains = new Set<string>();
    const nameCity = new Set<string>();
    const wikidata = new Set<string>();
    for (const b of data as unknown as Record<string, string | null>[]) {
      const p = normalizePhone(b.phone ?? '');
      if (p) phones.add(p);
      const d = normalizeDomain(b.website ?? '');
      if (d) domains.add(d);
      const n = normalizeName(b.name ?? '');
      if (n) nameCity.add(`${n}|${normalizePlace(b.location ?? '')}`);
      // Published candidates carry their origin as external_id, e.g.
      // "wikidata:Q8674" — a business derived from this source must never be
      // offered as a candidate again.
      const ext = b.external_id ?? '';
      if (ext.startsWith('wikidata:')) {
        const q = ext.slice('wikidata:'.length);
        if (/^Q\d{1,12}$/.test(q)) wikidata.add(q);
      }
    }
    setExisting({ phones, domains, nameCity });
    setExistingWikidata(wikidata);
  }, []);

  /** Candidates already waiting in the queue, by source record id. */
  const loadStaged = useCallback(async () => {
    const { data } = await supabase
      .from('radar_candidates')
      .select('source_key,source_record_id')
      .in('source_key', ['wikidata', 'business_registration', 'waitlist', 'openstreetmap'])
      .limit(50000);
    const map: Record<string, Set<string>> = {};
    for (const r of (data as { source_key: string; source_record_id: string }[]) ?? []) {
      if (!r.source_record_id) continue;
      (map[r.source_key] ??= new Set()).add(r.source_record_id);
    }
    setStagedBySource(map);
  }, []);

  useEffect(() => {
    void loadPolicy();
    void loadExisting();
    void loadStaged();
  }, [loadPolicy, loadExisting, loadStaged]);

  const verdict = policy ? sourcePermits(policy, 'discover') : null;

  const matchOf = useMemo(() => (c: DiscoveryCandidate): Match => {
    if (!existing) return null;
    const p = normalizePhone(c.phone ?? '');
    if (p && existing.phones.has(p)) return 'phone';
    const d = normalizeDomain(c.website ?? '');
    if (d && existing.domains.has(d)) return 'website';
    const n = normalizeName(c.name);
    if (n && existing.nameCity.has(`${n}|${normalizePlace(c.city ?? '')}`)) return 'name';
    return null;
  }, [existing]);

  /*
   * Everything that must never be offered again: already staged (any status),
   * published from this source, remembered as previously shown, and the
   * directory's own existing businesses. Both sent to the server as an
   * exclusion list and enforced again on whatever comes back.
   */
  const skipQids = useMemo(() => {
    const s = new Set(stagedBySource['wikidata'] ?? []);
    for (const q of seen) s.add(q);
    for (const q of existingWikidata) s.add(q);
    return s;
  }, [stagedBySource, seen, existingWikidata]);

  const isStaged = (c: DiscoveryCandidate): boolean =>
    staged.has(cid(c)) ||
    Boolean(c.sourceKey && c.sourceRecordId && stagedBySource[c.sourceKey]?.has(c.sourceRecordId));

  const run = async () => {
    setRunning(true);
    setResults([]);
    setSkipped(0);
    try {
      if (source === 'google') {
        await runGoogle();
      } else if (source === 'wikidata') {
        if (!verdict?.permitted) return;
        await runExternal();
      } else if (source === 'openstreetmap') {
        await runOpenStreetMap();
      } else if (source === 'businesslist_ng') {
        await runBusinessList();
      } else {
        await runInternal(source);
      }
    } finally {
      setRunning(false);
      setRetryMessage('');
    }
  };

  /** Ask an authorised external source (the server does the asking: Wikidata
   *  needs a User-Agent a browser cannot set, and the fetch must not be a
   *  cross-origin call from the console). */
  const runExternal = async () => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (place.place) params.set('place', place.place);
    else if (place.country) params.set('country', place.country);
    if (contactOnly) params.set('contact', '1');
    if (skipQids.size > 0) params.set('exclude', [...skipQids].slice(0, 900).join(','));

    // Wikidata can be slow or briefly refuse connections. A run gets three
    // attempts: a single dip in the source should not fail the whole search.
    const TRANSIENT = new Set([502, 503, 504]);
    let lastError = '';
    for (let attempt = 0; attempt < 3; attempt++) {
      setRetryMessage(attempt > 0 ? `Wikidata is slow — retrying (${attempt}/2)…` : '');
      try {
        const res = await fetch(`/api/acquire/wikidata?${params.toString()}`);
        const body = await res.json().catch(() => null);
        if (res.ok) {
          const returned = (body?.candidates as DiscoveryCandidate[] | undefined) ?? [];
          const fresh = returned.filter((c) => !skipQids.has(c.qid) && !matchOf(c));
          setResults(fresh);
          setSkipped(returned.length - fresh.length);
          // Remember every returned QID now, so the next search asks the source
          // for something else instead of re-serving these rows.
          if (returned.length > 0) {
            setSeen((prev) => {
              const next = new Set(prev);
              for (const c of returned) next.add(c.qid);
              persistSeen([...next]);
              return next;
            });
          }
          if (fresh.length === 0) {
            toast(returned.length
              ? 'Nothing new — everything returned was already shown.'
              : 'Nothing matched that search.');
          }
          return;
        }
        lastError = String(body?.error ?? `The search failed (HTTP ${res.status}).`);
        if (!TRANSIENT.has(res.status)) break;
      } catch {
        lastError = 'Could not reach the discovery endpoint.';
      }
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
    toast.error(lastError);
  };

  /** Google Places (New), via the guarded server endpoint. */
  const runGoogle = async () => {
    const params = new URLSearchParams({ limit: String(limit) });
    params.set('place', place.label === 'All of Nigeria' ? 'Nigeria' : place.label);
    if (contactOnly) params.set('contact', '1');

    // Same transient-retry shape as the Wikidata runs, with one difference: a
    // missing key is configuration, not bad luck, so it is never retried.
    const TRANSIENT = new Set([502, 503, 504]);
    let lastError = '';
    for (let attempt = 0; attempt < 3; attempt++) {
      setRetryMessage(attempt > 0 ? 'Google Places is slow — retrying…' : '');
      try {
        const res = await fetch(`/api/acquire/google?${params.toString()}`);
        const body = await res.json().catch(() => null);
        if (res.ok) {
          const returned = (body?.candidates as DiscoveryCandidate[] | undefined) ?? [];
          const fresh = returned.filter((c) => !matchOf(c) && !isStaged(c));
          setResults(fresh);
          setSkipped(returned.length - fresh.length);
          if (fresh.length === 0) {
            toast(returned.length
              ? 'Nothing new — everything returned was already shown.'
              : 'Nothing matched that search.');
          }
          return;
        }
        lastError = String(body?.error ?? `The search failed (HTTP ${res.status}).`);
        if (/key is not configured/i.test(lastError)) break;
        if (!TRANSIENT.has(res.status)) break;
      } catch {
        lastError = 'Could not reach the discovery endpoint.';
      }
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
    toast.error(lastError);
  };

  /** OpenStreetMap Overpass — fully open, pan-African, ODbL-licensed. */
  const runOpenStreetMap = async () => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (place.place) params.set('place', place.label === 'All of Nigeria' ? 'Nigeria' : place.label);
    else if (place.country) params.set('country', place.label);
    if (contactOnly) params.set('contact', '1');

    const TRANSIENT = new Set([502, 503, 504]);
    let lastError = '';
    for (let attempt = 0; attempt < 3; attempt++) {
      setRetryMessage(attempt > 0 ? `OpenStreetMap is slow — retrying (${attempt}/2)…` : '');
      try {
        const res = await fetch(`/api/acquire/openstreetmap?${params.toString()}`);
        const body = await res.json().catch(() => null);
        if (res.ok) {
          const returned = (body?.candidates as DiscoveryCandidate[] | undefined) ?? [];
          const fresh = returned.filter((c) => !matchOf(c) && !isStaged(c));
          setResults(fresh);
          setSkipped(returned.length - fresh.length);
          if (fresh.length === 0) {
            toast(returned.length
              ? 'Nothing new — everything returned was already shown.'
              : 'Nothing matched that search.');
          }
          return;
        }
        lastError = String(body?.error ?? `The search failed (HTTP ${res.status}).`);
        if (!TRANSIENT.has(res.status)) break;
      } catch {
        lastError = 'Could not reach the OpenStreetMap endpoint.';
      }
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
    toast.error(lastError);
  };

  /** BusinessList.com.ng — real scraper, but the source is prohibited by default. */
  const runBusinessList = async () => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (place.label) params.set('location', place.label === 'All of Nigeria' ? 'Nigeria' : place.label);

    const TRANSIENT = new Set([502, 503, 504]);
    let lastError = '';
    for (let attempt = 0; attempt < 2; attempt++) {
      setRetryMessage(attempt > 0 ? 'Retrying…' : '');
      try {
        const res = await fetch(`/api/acquire/businesslist?${params.toString()}`);
        const body = await res.json().catch(() => null);
        if (res.ok) {
          const returned = (body?.candidates as DiscoveryCandidate[] | undefined) ?? [];
          const fresh = returned.filter((c) => !matchOf(c) && !isStaged(c));
          setResults(fresh);
          setSkipped(returned.length - fresh.length);
          if (fresh.length === 0) {
            toast(returned.length
              ? 'Nothing new — everything returned was already shown.'
              : 'Nothing matched that search.');
          }
          return;
        }
        lastError = String(body?.error ?? `The search failed (HTTP ${res.status}).`);
        if (!TRANSIENT.has(res.status)) break;
      } catch {
        lastError = 'Could not reach the BusinessList endpoint.';
      }
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
    toast.error(lastError);
  };

  /** First-party sources: rows people submitted through NowOpen's own forms.
   *  No third-party licence to check — the same review queue still decides. */
  const runInternal = async (key: 'business_registration' | 'waitlist') => {
    const table = key === 'business_registration' ? 'business_registrations' : 'waitlist';
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) { toast.error(error.message); return; }

    const rows = (data as unknown as Record<string, unknown>[]) ?? [];
    const mapped = rows.map((r): DiscoveryCandidate => {
      const base = {
        qid: '',
        sourceKey: key,
        sourceRecordId: String(r.id ?? ''),
        sourceUrl: '',
        profile: {},
        evidence: {},
        latitude: null,
        longitude: null,
      };
      /*
       * Fields these first-party forms do not carry, or that no single column
       * maps cleanly to. Kept so both branches land in one object and the
       * extractor below reads each column unconditionally.
       */
      const about = (r.about ?? r.business_description ?? r.why_us) as unknown;
      const mission = r.mission as unknown;
      const vision = r.vision as unknown;

      if (key === 'business_registration') {
        const name = String(r.business_name ?? r.name ?? '').trim();
        const city = String(r.location ?? '').trim();
        /*
         * The WHOLE registration rides into the review queue, not just the
         * core dozen. Everything the public profile page shows is staged
         * under `profile` so the publish projects it by whitelist: tagline,
         * about, mission, vision (from any onboarding story columns), the
         * logo and cover images, hours, and the list/json fields — services
         * and products become the price-list JSON the publish turns into
         * business_services rows, languages/payment_methods/whatsapp come
         * through, social_media is spread onto its platform keys so a
         * {instagram: "x"} registration lands in the published social_links
         * like a CSV import would, and the description text stays for the
         * reviewer to see.
         */
        const raw = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
        const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

        const profile: Record<string, string> = {};
        const services = [
          ...parseServices(raw(r.services)),
          ...parseServices(raw(r.products)),
        ];
        if (services.length) profile.services_json = JSON.stringify(services);
        const socials = r.social_media;
        if (socials && typeof socials === 'object' && !Array.isArray(socials)) {
          for (const [platform, handle] of Object.entries(socials as Record<string, unknown>)) {
            const s = raw(handle);
            if (s) profile[platform] = s;
          }
        }
        for (const [k, v] of Object.entries({
          pricing: r.pricing, duration: r.duration, dimensions: r.dimensions,
          image_url: r.image_url, service_details: r.service_details,
          product_details: r.product_details, logo_url: r.logo_url,
          about: about, mission, vision,
          what_area: r.service_area,
          registration_number: r.registration_number, tax_id: r.tax_id,
        })) {
          const s = text(v);
          if (s) profile[k] = s;
        }
        const langs = r.languages;
        if (Array.isArray(langs)) {
          const clean = langs.map((x) => text(x)).filter(Boolean);
          if (clean.length) profile.languages = clean.join('|');
        }
        const pay = r.payment_methods;
        if (Array.isArray(pay)) {
          const clean = pay.map((x) => text(x)).filter(Boolean);
          if (clean.length) profile.payment_methods = clean.join('|');
        }
        const hours = formatWeekHours(r.business_hours);
        if (hours) profile.opening_hours = hours;
        const founded = parseFoundedYear(r.year_established === null || r.year_established === undefined
          ? '' : String(r.year_established));
        if (founded) profile.founded_year = String(founded);
        const employees = text(r.employee_count);
        if (employees) profile.employees = employees;

        return {
          ...base,
          name,
          category: String(r.category ?? 'Business'),
          city: city || null,
          address: city || null,
          phone: r.phone ? String(r.phone) : null,
          whatsapp: r.whatsapp ? String(r.whatsapp) : null,
          email: r.email ? String(r.email) : null,
          website: r.website ? String(r.website) : null,
          description: r.description ? String(r.description) : null,
          confidence: 85,
          profile,
        };
      }
      /* Waitlist rows are sparse — name, email, business_type, country. All we
       * can honestly stage is what was typed. */
      const name = String(r.name ?? r.full_name ?? '').trim();
      const businessType = String(r.business_type ?? r.user_type ?? '').trim();
      const profile: Record<string, string> = {
        about: about ? String(about) : '',
      };
      if (businessType) profile.business_type = businessType;
      return {
        ...base,
        name,
        category: businessType || 'Business',
        city: String(r.country ?? '').trim() || null,
        address: null,
        phone: null,
        email: r.email ? String(r.email) : null,
        website: null,
        description: null,
        confidence: 60,
        profile,
      };
    });

    const fresh = mapped.filter((c) => !matchOf(c) && !isStaged(c));
    setResults(fresh);
    setSkipped(mapped.length - fresh.length);
    if (fresh.length === 0) {
      toast(mapped.length
        ? 'Nothing new — every row was already sent.'
        : key === 'business_registration'
          ? 'No business registrations right now.'
          : 'No waitlist signups right now.');
    }
  };

  /**
   * Stage one candidate for review.
   *
   * Written with the admin's own session, so RLS applies exactly as it does to
   * every other write in the console. `source_record_id` is the Wikidata QID
   * and the table's unique index on (source_key, source_record_id) makes a
   * second click harmless.
   */
  const stage = async (c: DiscoveryCandidate) => {
    const key = c.sourceKey ?? WIKIDATA_SOURCE_KEY;
    const recordId = c.qid || c.sourceRecordId || cid(c);
    const { error } = await supabase.from('radar_candidates').insert({
      source_key: key,
      source_record_id: recordId,
      source_url: c.sourceUrl || null,
      name: c.name,
      category: c.category,
      city: c.city,
      address: c.address,
      phone: c.phone,
      whatsapp: c.whatsapp ?? null,
      email: c.email,
      website: c.website,
      description: c.description,
      latitude: c.latitude ?? null,
      longitude: c.longitude ?? null,
      name_key: normalizeName(c.name),
      city_key: normalizePlace(c.city ?? ''),
      phone_e164: normalizePhone(c.phone ?? ''),
      domain: normalizeDomain(c.website ?? ''),
      status: 'review',
      confidence: c.confidence ?? 70,
      profile: c.profile,
    });

    if (error) {
      toast.error(error.message);
      return;
    }
    setStaged((prev) => new Set(prev).add(cid(c)));
    setStagedBySource((prev) => {
      const next = { ...prev, [key]: new Set(prev[key] ?? []) };
      next[key].add(recordId);
      return next;
    });
    onStaged?.();
  };

  const stageAllNew = async () => {
    const fresh = results.filter((c) => !isStaged(c) && !matchOf(c));
    if (!fresh.length) { toast('Nothing new to add.'); return; }
    setRunning(true);
    for (const c of fresh) await stage(c);
    setRunning(false);
    toast.success(`${fresh.length} sent to the review queue`);
  };

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 mb-6 space-y-3">
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex-1 min-w-[15rem]">
          <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Radar size={17} /> Discovery
          </h3>
          <p className="text-xs text-gray-600 dark:text-gray-400">
            Ask an authorised source what it has. Results come here for review — nothing is published.
          </p>
        </div>
      </div>

      {/* The rights, stated rather than assumed. External sources carry the
          full radar_sources verdict; internal sources are first-party data, so
          there is no third-party licence to check — the queue still decides. */}
      {policyProblem && (
        <p className="text-sm rounded-lg border border-rose-300 bg-rose-50 dark:bg-rose-900/20 dark:border-rose-700 p-3 text-rose-900 dark:text-rose-100">
          {policyProblem}
        </p>
      )}

      {source === 'wikidata' && verdict && (
        <div className={`flex items-start gap-2 rounded-lg border p-3 ${
          verdict.permitted
            ? 'border-emerald-300 bg-emerald-50 dark:bg-emerald-900/20 dark:border-emerald-700'
            : 'border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700'
        }`}>
          {verdict.permitted
            ? <ShieldCheck size={17} className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            : <ShieldAlert size={17} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />}
          <div className="text-xs">
            <p className={verdict.permitted ? 'text-emerald-900 dark:text-emerald-100' : 'text-amber-900 dark:text-amber-100'}>
              {verdict.reason}
            </p>
            {policy?.licence && (
              <p className="text-gray-600 dark:text-gray-400 mt-0.5">Licence: {policy.licence}</p>
            )}
          </div>
        </div>
      )}

      {source === 'google' && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700 p-3">
          <ShieldAlert size={17} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="text-xs">
            <p className="text-amber-900 dark:text-amber-100">
              Google Business Profile needs a Google Places API key made available to the server. Set
              GOOGLE_PLACES_API_KEY (Vercel env for this function — and .env for local dev) and this source
              turns on with no code change. Until then Search will say it plainly rather than pretend.
            </p>
            <p className="text-gray-600 dark:text-gray-400 mt-0.5">
              Google Maps content — attribution required; the Google place URL is kept on every candidate.
            </p>
          </div>
        </div>
      )}

      {source === 'openstreetmap' && (
        <div className="flex items-start gap-2 rounded-lg border border-emerald-300 bg-emerald-50 dark:bg-emerald-900/20 dark:border-emerald-700 p-3">
          <ShieldCheck size={17} className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
          <div className="text-xs">
            <p className="text-emerald-900 dark:text-emerald-100">
              OpenStreetMap data is licensed under the Open Database Licence (ODbL) — automated access, bulk
              extraction and redistribution are all permitted. The Overpass API is a free public endpoint. Attribution
              travels with every published candidate.
            </p>
          </div>
        </div>
      )}

      {source === 'businesslist_ng' && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700 p-3">
          <ShieldAlert size={17} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="text-xs">
            <p className="text-amber-900 dark:text-amber-100">
              BusinessList.com.ng terms prohibit automated access, bots, crawlers, bulk extraction and competing
              datasets. A real adapter exists but the source gate refuses all operations until a signed agreement
              changes this. Contact BusinessList for partnership opportunities.
            </p>
          </div>
        </div>
      )}

      {source !== 'wikidata' && source !== 'google' && source !== 'openstreetmap' && source !== 'businesslist_ng' && (
        <div className="flex items-start gap-2 rounded-lg border border-emerald-300 bg-emerald-50 dark:bg-emerald-900/20 dark:border-emerald-700 p-3">
          <ShieldCheck size={17} className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
          <div className="text-xs">
            <p className="text-emerald-900 dark:text-emerald-100">
              {source === 'business_registration'
                ? 'First-party data — businesses that registered themselves through the Digital Forms Hub. Credible, but every one is still reviewed before anything is listed.'
                : 'First-party data — people who signed up on the launch waitlist. Reviewed one by one before anything is listed.'}
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3 text-sm">
        <label>
          <span className="block text-xs text-gray-500 mb-1">Source</span>
          <select
            value={source}
            onChange={(e) => setSource(e.target.value as DiscoverySourceKey)}
            className="rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-2 min-h-[40px]"
          >
            {SOURCE_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        </label>

        {(source === 'wikidata' || source === 'google' || source === 'openstreetmap' || source === 'businesslist_ng') ? (
          <label>
            <span className="block text-xs text-gray-500 mb-1">Where</span>
            <select
              value={ALL_OPTIONS.indexOf(place)}
              onChange={(e) => setPlace(ALL_OPTIONS[Number(e.target.value)] ?? ALL_OPTIONS[0])}
              className="rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-2 min-h-[40px]"
            >
              {PLACE_GROUPS.map((g) => (
                <optgroup key={g.group} label={g.group}>
                  {g.options.map((o) => <option key={o.label} value={ALL_OPTIONS.indexOf(o)}>{o.label}</option>)}
                </optgroup>
              ))}
            </select>
          </label>
        ) : null}

        <label>
          <span className="block text-xs text-gray-500 mb-1">How many</span>
          <input
            type="number" min={1} max={50000} value={limit}
            onChange={(e) => setLimit(Math.max(1, Math.min(50000, Number(e.target.value) || 50)))}
            className="w-24 rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-2 min-h-[40px]"
          />
        </label>

        {(source === 'wikidata' || source === 'google' || source === 'openstreetmap') && (
          <label className="inline-flex items-center gap-2 min-h-[40px]">
            <input type="checkbox" checked={contactOnly} onChange={(e) => setContactOnly(e.target.checked)} />
            Only ones with a phone number
          </label>
        )}

        <button
          onClick={() => void run()}
          disabled={running || (source === 'wikidata' && !verdict?.permitted) || source === 'businesslist_ng'}
          className="inline-flex items-center gap-2 px-4 min-h-[40px] rounded-lg bg-blue-600 text-white text-sm font-semibold disabled:opacity-50"
        >
          {running ? <Loader2 size={15} className="animate-spin" /> : <Radar size={15} />}
          Search
        </button>

        {retryMessage && (
          <span className="text-xs font-medium text-amber-600 dark:text-amber-400">{retryMessage}</span>
        )}

        {results.length > 0 && (
          <button
            onClick={() => void stageAllNew()}
            disabled={running}
            className="inline-flex items-center gap-2 px-4 min-h-[40px] rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-semibold disabled:opacity-50"
          >
            <Plus size={15} /> Send all new to review
          </button>
        )}
      </div>

      {results.length > 0 && (
        <div className="overflow-x-auto">
          <p className="text-[12px] text-gray-500 mb-1">
            {results.length} new result{results.length === 1 ? '' : 's'}
            {skipped > 0 && <> — {skipped} already seen, skipped</>}
          </p>
          <table className="min-w-full text-sm">
            <thead className="text-xs uppercase text-gray-500 border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className="text-left py-2 pr-2 w-[44px]"></th>
                <th className="text-left py-2 pr-3">Business</th>
                <th className="text-left py-2 pr-3">Category</th>
                <th className="text-left py-2 pr-3">Contact</th>
                <th className="text-left py-2"></th>
              </tr>
            </thead>
            <tbody>
              {results.map((c) => {
                const done = isStaged(c);
                const thumb = c.profile?.logo_url ?? c.profile?.image_url;
                const isInternal = Boolean(c.sourceKey);
                const servicesNote = c.sourceKey === 'business_registration'
                  ? (() => {
                      const n = parseServicesJson(c.profile.services_json).length;
                      const parts: string[] = [];
                      if (n) parts.push(`${n} service${n === 1 ? '' : 's'}`);
                      if (c.profile.pricing) parts.push(c.profile.pricing);
                      return parts.join(' · ');
                    })()
                  : '';
                return (
                  <tr key={cid(c)} className="border-b border-gray-100 dark:border-gray-800 align-top">
                    {isInternal ? (
                      <td className="py-2 pr-2">
                        {thumb ? (
                          <SmartImg
                            src={thumb}
                            alt={`${c.name} thumbnail`}
                            className="w-10 h-10 rounded-lg object-cover bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-[10px] text-gray-400 border border-gray-200 dark:border-gray-700">
                            {c.name.slice(0, 2).toUpperCase()}
                          </div>
                        )}
                      </td>
                    ) : null}
                    <td className="py-2 pr-3">
                      <span className="text-gray-900 dark:text-white">{c.name}</span>
                      {c.qid && c.sourceUrl && (
                        <a
                          href={c.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ml-1.5 text-blue-600 dark:text-blue-400 inline-flex"
                          title="Open on Wikidata"
                        >
                          <ExternalLink size={12} />
                        </a>
                      )}
                      <span className="block text-xs text-gray-500">{c.city ?? '—'}</span>
                      {c.description && (
                        <span className="block text-xs text-gray-500 line-clamp-1">{c.description}</span>
                      )}
                      {servicesNote && (
                        <span className="block text-xs text-emerald-600 dark:text-emerald-400">{servicesNote}</span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-gray-600 dark:text-gray-400">{c.category}</td>
                    <td className="py-2 pr-3 text-gray-600 dark:text-gray-400">
                      {c.phone ?? c.email ?? (c.website ? 'website only' : '—')}
                    </td>
                    <td className="py-2">
                      <button
                        onClick={() => void stage(c)}
                        disabled={done}
                        className="inline-flex items-center gap-1 px-3 min-h-[36px] rounded-lg border border-gray-300 dark:border-gray-600 text-xs font-semibold disabled:opacity-40"
                      >
                        {done ? 'In queue' : <><Plus size={13} /> Review</>}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
