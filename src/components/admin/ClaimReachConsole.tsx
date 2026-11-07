import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, ShieldAlert, Radio } from 'lucide-react';

import { supabase } from '../../lib/supabase';
import {
  plan, planHeadline, biggestObstacles, BLOCKER_LABELS,
  SENDING_STATUS_UNKNOWN, senderStatusNote, type SenderStatus,
  type Candidate, type PlanSettings, type PlanRow,
} from '../../lib/claimreach/dryRun';
import { effectiveDataConfidence, type Channel, type DataConfidence } from '../../lib/claimreach/sendGate';

/**
 * ClaimReach §26 — the dry run, as a screen.
 *
 * WHAT THIS IS, AND WHAT IT IS NOT
 *
 * It plans outreach and explains every refusal. It cannot send: there is no
 * messaging provider configured and no code in this repository that delivers a
 * message. There is deliberately no button here that could be mistaken for
 * one.
 *
 * WHY IT EXISTS BEFORE ANY SENDER
 *
 * Every number on this screen is counted from a table — the same discipline
 * the acquisition panel states. Run against the live database it currently
 * reports that NOBODY is contactable, because no contact detail on the
 * platform has a recorded source (§7) and no provider exists. That is the
 * useful answer: it names the work that has to happen before ClaimReach can
 * do anything at all, instead of presenting a queue that would fail silently
 * at send time.
 *
 * THE SETTINGS ARE A SANDBOX, NOT A SAVED CAMPAIGN
 *
 * No campaign table exists yet. The controls below describe a hypothetical
 * campaign so an operator can ask "what would this configuration do?" —
 * nothing here is stored, and the two what-if toggles are labelled as such.
 * A dry run that quietly assumed a working provider would be the one lie this
 * screen cannot afford.
 */

const CHANNELS: Exclude<Channel, 'social'>[] = ['whatsapp', 'sms', 'email'];

/** The feature_flags key that says a channel is set up (operator-controlled). */
const CHANNEL_FLAGS: Record<Exclude<Channel, 'social'>, string> = {
  whatsapp: 'outbound_whatsapp',
  sms: 'outbound_sms',
  email: 'outbound_email',
};

const CONFIDENCES: DataConfidence[] = [
  'unconfirmed', 'partially_confirmed', 'source_confirmed', 'owner_confirmed', 'admin_verified',
];

/** Evidence statuses that count as "this field has a source" (§7). */
/**
 * PostgREST returns at most 1,000 rows per request, silently.
 *
 * Every read below therefore pages with `.range()` rather than trusting a
 * `.limit()` — a larger limit does not raise the ceiling, it just hides it.
 */
const PAGE = 1000;
/** Safety stops, so a runaway loop cannot walk a table for ever. */
const MAX_BUSINESSES = 20000;
const MAX_EVIDENCE = 60000;
const MAX_OUTREACH = 20000;

const SOURCED_STATUSES = [
  'owner_confirmed', 'admin_verified', 'source_confirmed', 'multiple_sources', 'single_source',
];

interface BusinessRow {
  id: string;
  name: string;
  claim_status: string | null;
  data_confidence: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
}

interface OutreachRow {
  business_id: string;
  channel: string;
  created_at: string;
}

const OUTCOME_TONE: Record<PlanRow['outcome'], string> = {
  would_send: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200',
  deferred_by_cap: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  blocked: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200',
  no_contact: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
};

const OUTCOME_LABEL: Record<PlanRow['outcome'], string> = {
  would_send: 'Would contact',
  deferred_by_cap: 'Waits for cap',
  blocked: 'Blocked',
  no_contact: 'No usable contact',
};

export default function ClaimReachConsole() {
  /*
   * ── ASK THE SENDER WHETHER IT CAN SEND ─────────────────────────────────
   *
   * This banner used to be a constant ending "...and no email provider key is
   * configured". A key was set and the sentence kept asserting the opposite,
   * because nothing could notice: a browser cannot read an edge-function
   * secret.
   *
   * So the function that holds the secret reports on itself. `?status=1` is
   * admin-authenticated, returns booleans only, and has no path to sending.
   * `null` means the answer has not arrived — the banner then says it is
   * checking rather than guessing.
   */
  const [senderStatus, setSenderStatus] = useState<SenderStatus | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      /*
       * The WHOLE body is guarded, not just the fetch.
       *
       * The first version wrapped only the network call, so a failure in
       * getSession() escaped as an unhandled rejection — caught by the test
       * run, and in production it would be an auth hiccup taking out a
       * console that was merely trying to read a status line. A status check
       * must never be able to break the screen it annotates.
       */
      try {
        const { data } = await supabase.auth.getSession();
        const session = data?.session;
        if (!session?.access_token) return;
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/claimreach-send?status=1`,
          { headers: { Authorization: `Bearer ${session.access_token}` } },
        );
        const body = await res.json();
        if (!alive || !body?.ok) return;
        setSenderStatus({
          providerConfigured: Boolean(body.providerConfigured),
          claimOutreach: Boolean(body.flags?.claim_outreach),
          emailOutreachEnabled: Boolean(body.flags?.email_outreach_enabled),
        });
      } catch {
        /* Leave it unknown — the banner says so rather than inventing a state. */
      }
    })();
    return () => { alive = false; };
  }, []);

  const [businesses, setBusinesses] = useState<BusinessRow[]>([]);
  const [provenance, setProvenance] = useState<Map<string, Set<string>>>(new Map());
  const [evidenceStatuses, setEvidenceStatuses] = useState<Map<string, Set<string>>>(new Map());
  const [suppressed, setSuppressed] = useState<Set<string> | null>(null);
  const [outreach, setOutreach] = useState<OutreachRow[]>([]);
  const [configuredFlags, setConfiguredFlags] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [problem, setProblem] = useState<string | null>(null);
  /*
   * The candidate list could not be read at all.
   *
   * Separate from `problem` because the two need different screens. A
   * failed suppression check still has a plan to show (everybody blocked,
   * which is the correct plan). A failed read of `businesses` has nothing —
   * and "No candidates matched this campaign" would then be a statement
   * about the platform that we have no grounds to make.
   */
  const [unavailable, setUnavailable] = useState(false);

  // The hypothetical campaign.
  /*
   * ── DEFAULTS THAT DESCRIBE THIS PLATFORM, NOT A HYPOTHETICAL ONE ───────
   *
   * MEASURED 2026-09-23. Opening this console produced:
   *
   *   "Nothing can be sent. The largest obstacle is confidence_below_threshold,
   *    affecting 3168 of 3168 businesses."
   *
   * Nothing was broken. The defaults were simply wrong for the data:
   *
   *   · `email` was NOT preselected — the one channel with both a configured
   *     provider and real reach (436 businesses hold a sourced address).
   *   · `sms` WAS preselected, and has no provider at all, so every business
   *     whose best channel resolved to sms was refused.
   *   · minimum confidence defaulted to `source_confirmed`, while the evidence
   *     ledger holds `single_source` rows — which support `partially_confirmed`
   *     and nothing higher. So every business on file failed the threshold.
   *
   * Correcting only those three, the same data reports 200 contactable now and
   * 273 more waiting on the daily cap. The tool worked; it opened describing a
   * platform we do not have, and read as broken.
   *
   * These remain defaults, not decisions — every one is still adjustable above.
   */
  const [channels, setChannels] = useState<Channel[]>(['whatsapp', 'email']);
  /*
   * `partially_confirmed` is the highest tier `single_source` evidence honestly
   * supports (see EVIDENCE_TO_CONFIDENCE in sendGate). Defaulting above it
   * refuses everything and blames the data rather than the setting.
   */
  const [minConfidence, setMinConfidence] = useState<DataConfidence>('partially_confirmed');
  const [dailyCap, setDailyCap] = useState(200);
  const [quietFrom, setQuietFrom] = useState(20);
  const [quietTo, setQuietTo] = useState(8);
  const [approved, setApproved] = useState(false);

  // What-ifs, both off by default and both labelled on screen.
  const [assumeProviders, setAssumeProviders] = useState(false);
  const [assumeAutomatic, setAssumeAutomatic] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setProblem(null);
    setUnavailable(false);

    /*
     * supabase-js RESOLVES on failure — `{ data: null, error }` — so every
     * read is checked. A .catch() here would never fire and the screen would
     * render an empty plan as though the platform had no businesses.
     */
    /*
     * ── PAGED, AND UNCLAIMED ONLY ────────────────────────────────────────
     *
     * MEASURED 2026-09-23: 3,168 unclaimed businesses. This read `.limit(1000)`
     * — and PostgREST caps every response at 1,000 rows ANYWAY, silently, so
     * even raising the number would have changed nothing. Two thirds of the
     * directory was invisible to the console that decides who gets contacted.
     *
     * Filtered to unclaimed in the query too: ClaimReach exists to reach
     * businesses that have not claimed their profile, and a claimed one is
     * blocked by the gate a moment later regardless. Fetching them was work
     * done to throw away.
     */
    const rows: BusinessRow[] = [];
    let bizFailed: string | null = null;
    for (let from = 0; from < MAX_BUSINESSES; from += PAGE) {
      const biz = await supabase
        .from('businesses')
        .select('id,name,claim_status,data_confidence,phone,whatsapp,email')
        .neq('claim_status', 'claimed')
        .order('id')
        .range(from, from + PAGE - 1);
      if (biz.error) { bizFailed = biz.error.message; break; }
      const batch = (biz.data as BusinessRow[]) ?? [];
      rows.push(...batch);
      // A short page is the last page.
      if (batch.length < PAGE) break;
    }

    if (bizFailed) {
      setProblem(`Could not read businesses: ${bizFailed}`);
      setBusinesses([]);
      setUnavailable(true);
      setLoading(false);
      return;
    }
    setBusinesses(rows);

    // Field-level provenance. A missing table is a real answer — no evidence
    // has been recorded — so it is reported, not treated as an outage.
    /*
     * ── THE READ THAT BLOCKED EVERYBODY ──────────────────────────────────
     *
     * MEASURED 2026-09-23: 3,487 evidence rows match this filter. The query
     * asked for `.limit(20000)` and received 1,000 — PostgREST's ceiling,
     * applied silently and with no error. So ~2,500 businesses that DO have a
     * sourced phone number looked to the gate as though they had none, and
     * were refused with `contact_no_provenance`.
     *
     * The gate was right; the data it was given was wrong. That is the worst
     * shape this can take, because the refusal reads as careful compliance.
     */
    const evidenceRows: { business_id: string; field_name: string; status: string }[] = [];
    let evFailed = false;
    for (let from = 0; from < MAX_EVIDENCE; from += PAGE) {
      const ev = await supabase
        .from('business_evidence')
        .select('business_id,field_name,status')
        .in('field_name', ['phone', 'whatsapp', 'email'])
        .in('status', SOURCED_STATUSES)
        .order('id')
        .range(from, from + PAGE - 1);
      if (ev.error) { evFailed = true; break; }
      const batch = (ev.data as { business_id: string; field_name: string; status: string }[]) ?? [];
      evidenceRows.push(...batch);
      if (batch.length < PAGE) break;
    }

    const byBusiness = new Map<string, Set<string>>();
    const statusesByBusiness = new Map<string, Set<string>>();
    if (!evFailed) {
      for (const r of evidenceRows) {
        const set = byBusiness.get(r.business_id) ?? new Set<string>();
        set.add(r.field_name);
        byBusiness.set(r.business_id, set);
        const st = statusesByBusiness.get(r.business_id) ?? new Set<string>();
        st.add(r.status);
        statusesByBusiness.set(r.business_id, st);
      }
    }
    setProvenance(byBusiness);
    setEvidenceStatuses(statusesByBusiness);

    // Prior attempts, so the frequency rules are answered from the record.
    /*
     * Prior attempts, paged for the same reason. Under-reading these is the
     * dangerous direction: an unseen attempt means the frequency rules pass
     * and somebody is contacted twice.
     */
    const attempts: OutreachRow[] = [];
    for (let from = 0; from < MAX_OUTREACH; from += PAGE) {
      const out = await supabase
        .from('claimreach_outreach')
        .select('business_id,channel,created_at')
        .order('created_at', { ascending: false })
        .range(from, from + PAGE - 1);
      if (out.error) break;
      const batch = (out.data as OutreachRow[]) ?? [];
      attempts.push(...batch);
      if (batch.length < PAGE) break;
    }
    setOutreach(attempts);

    /*
     * Which channels the platform says are set up. Absent means NOT configured,
     * deliberately unlike the platform-wide isEnabled() default (unknown → on):
     * an outbound channel must fail silent, not read as ready.
     */
    const fl = await supabase
      .from('feature_flags')
      .select('key')
      .eq('enabled', true);
    setConfiguredFlags(new Set((fl.data as { key: string }[] ?? []).map((r) => r.key)));

    /*
     * Suppression, batched, asked of the database.
     *
     * If this call fails the answer stays NULL rather than becoming an empty
     * set. Null flows into the gate as "not checked", which blocks — an empty
     * set would read as "nobody has opted out", and that is the one wrong
     * answer this screen must never give.
     */
    const contacts = [
      ...new Set(rows.flatMap((r) => [r.phone, r.whatsapp, r.email]
        .filter((v): v is string => !!v && v.trim().length > 0)
        .map((v) => v.trim()))),
    ];

    if (contacts.length) {
      const sup = await supabase.rpc('claimreach_suppressed_contacts', {
        p_contacts: contacts,
        p_channel: 'any',
      });
      if (sup.error) {
        setSuppressed(null);
        setProblem(`Suppression could not be checked, so nothing is treated as contactable: ${sup.error.message}`);
      } else {
        const list = (sup.data as { contact: string }[] | string[] | null) ?? [];
        setSuppressed(new Set(list.map((x) => (typeof x === 'string' ? x : x.contact))));
      }
    } else {
      setSuppressed(new Set());
    }

    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const settings: PlanSettings = useMemo(() => ({
    campaign: {
      id: 'sandbox',
      status: 'active',
      channels,
      minDataConfidence: minConfidence,
      approvalMode: assumeAutomatic ? 'automatic' : 'manual',
      approved,
      maxAttempts: 4,
      dailyCapRemaining: dailyCap,
      quietHours: { fromHour: quietFrom, toHour: quietTo },
    },
    killSwitch: { all: false, channels: {} },
    // The truth unless the operator asks the what-if question. Read from
    // feature_flags, so "no provider is configured" is a statement about the
    // platform's actual configuration, not a hardcoded empty map.
    configuredChannels: assumeProviders
      ? { whatsapp: true, sms: true, email: true }
      : {
          whatsapp: configuredFlags.has(CHANNEL_FLAGS.whatsapp),
          sms: configuredFlags.has(CHANNEL_FLAGS.sms),
          email: configuredFlags.has(CHANNEL_FLAGS.email),
        },
    messageVariables: [{ name: 'business_name', evidenceBacked: true }],
  }), [channels, minConfidence, dailyCap, quietFrom, quietTo, approved, assumeProviders, assumeAutomatic, configuredFlags]);

  const candidates: Candidate[] = useMemo(() => {
    const localHour = new Date().getHours();
    const attemptsBy = new Map<string, { at: Date; channel: Channel }[]>();
    for (const o of outreach) {
      const list = attemptsBy.get(o.business_id) ?? [];
      list.push({ at: new Date(o.created_at), channel: o.channel as Channel });
      attemptsBy.set(o.business_id, list);
    }

    return businesses.map((b) => {
      const sourced = provenance.get(b.id) ?? new Set<string>();
      const statuses = [...(evidenceStatuses.get(b.id) ?? [])];
      const contactFor = (channel: Channel, raw: string | null, field: string) => ({
        channel,
        normalized: raw?.trim() || null,
        hasProvenance: sourced.has(field),
      });

      const suppressedFor = (raw: string | null): boolean | undefined => {
        if (suppressed === null) return undefined;   // not checked — a blocker
        const v = raw?.trim();
        if (!v) return false;
        return suppressed.has(v);
      };

      return {
        business: {
          id: b.id,
          name: b.name,
          claimStatus: b.claim_status,
          dataConfidence: effectiveDataConfidence(b.data_confidence, statuses),
        },
        contacts: [
          /*
           * WhatsApp uses the whatsapp column ONLY. Treating the phone number
           * as a WhatsApp number is a guess, and a wrong guess here messages
           * a landline through a channel it does not have — or worse, reaches
           * a different person who happens to hold that number on WhatsApp.
           */
          contactFor('whatsapp', b.whatsapp, 'whatsapp'),
          contactFor('sms', b.phone, 'phone'),
          contactFor('email', b.email, 'email'),
        ].filter((c) => c.normalized !== null),
        priorAttempts: attemptsBy.get(b.id) ?? [],
        suppressed: {
          whatsapp: suppressedFor(b.whatsapp),
          sms: suppressedFor(b.phone),
          email: suppressedFor(b.email),
        },
        localHour,
      };
    });
  }, [businesses, provenance, evidenceStatuses, suppressed, outreach]);

  const result = useMemo(() => plan(candidates, settings), [candidates, settings]);
  const obstacles = useMemo(() => biggestObstacles(result), [result]);

  if (loading) return <p className="text-sm text-gray-500">Reading businesses, evidence and suppression…</p>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex-1 min-w-[16rem]">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Radio size={18} /> ClaimReach dry run
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            What outreach WOULD do, and why each business is refused. Every figure is counted
            from a table.
          </p>
        </div>
        <button
          onClick={() => void load()}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm"
        >
          <RefreshCw size={15} /> Refresh
        </button>
      </div>

      {/* Said first, and unmissable. */}
      <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700 p-3">
        <ShieldAlert size={18} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        <p className="text-sm text-amber-900 dark:text-amber-100">
          {senderStatus ? senderStatusNote(senderStatus) : SENDING_STATUS_UNKNOWN}
        </p>
      </div>

      {problem && (
        <p className="text-sm rounded-lg border border-rose-300 bg-rose-50 dark:bg-rose-900/20 dark:border-rose-700 p-3 text-rose-900 dark:text-rose-100">
          {problem}
        </p>
      )}

      {/* The hypothetical campaign */}
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 space-y-3">
        <p className="text-sm font-semibold text-gray-900 dark:text-white">
          Hypothetical campaign <span className="font-normal text-gray-500">— nothing here is saved</span>
        </p>

        <div className="flex flex-wrap gap-4 text-sm">
          <div>
            <span className="block text-xs text-gray-500 mb-1">Channels, in order of preference</span>
            <div className="flex gap-2">
              {CHANNELS.map((c) => (
                <label key={c} className="inline-flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={channels.includes(c)}
                    onChange={(e) => setChannels((prev) => (
                      e.target.checked ? [...prev, c] : prev.filter((x) => x !== c)
                    ))}
                  />
                  {c}
                </label>
              ))}
            </div>
          </div>

          <label className="block">
            <span className="block text-xs text-gray-500 mb-1">Minimum data confidence</span>
            <select
              value={minConfidence}
              onChange={(e) => setMinConfidence(e.target.value as DataConfidence)}
              className="rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-2 py-1"
            >
              {CONFIDENCES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>

          <label className="block">
            <span className="block text-xs text-gray-500 mb-1">Daily cap</span>
            <input
              type="number" min={0} max={10000} value={dailyCap}
              onChange={(e) => setDailyCap(Math.max(0, Number(e.target.value) || 0))}
              className="w-24 rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-2 py-1"
            />
          </label>

          <label className="block">
            <span className="block text-xs text-gray-500 mb-1">Quiet from</span>
            <input
              type="number" min={0} max={23} value={quietFrom}
              onChange={(e) => setQuietFrom(Number(e.target.value) || 0)}
              className="w-20 rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-2 py-1"
            />
          </label>

          <label className="block">
            <span className="block text-xs text-gray-500 mb-1">Quiet until</span>
            <input
              type="number" min={0} max={23} value={quietTo}
              onChange={(e) => setQuietTo(Number(e.target.value) || 0)}
              className="w-20 rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-2 py-1"
            />
          </label>
        </div>

        <div className="flex flex-wrap gap-4 text-sm pt-1 border-t border-gray-100 dark:border-gray-700">
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" checked={approved} onChange={(e) => setApproved(e.target.checked)} />
            This batch has been approved by a person
          </label>
          <label className="inline-flex items-center gap-2 text-amber-800 dark:text-amber-200">
            <input type="checkbox" checked={assumeAutomatic} onChange={(e) => setAssumeAutomatic(e.target.checked)} />
            What if: the campaign were fully automatic (no approval)
          </label>
          <label className="inline-flex items-center gap-2 text-amber-800 dark:text-amber-200">
            <input type="checkbox" checked={assumeProviders} onChange={(e) => setAssumeProviders(e.target.checked)} />
            What if: providers were configured for every channel (currently read from feature_flags)
          </label>
        </div>

        {!assumeProviders && (
          <p className="text-[12px] text-gray-500 dark:text-gray-400 pt-1">
            Channels counted as configured, from feature_flags:{' '}
            {CHANNELS.filter((c) => configuredFlags.has(CHANNEL_FLAGS[c])).join(', ') || 'none'}
          </p>
        )}
      </div>

      {unavailable ? (
        <p className="text-sm text-gray-600 dark:text-gray-400">
          No plan is shown, because the candidate list could not be read. An empty plan here
          would look like an answer.
        </p>
      ) : (
        <>
      <p className="text-sm font-medium text-gray-900 dark:text-white">{planHeadline(result)}</p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        {([
          ['Would contact', result.wouldSend, 'passes every rule'],
          ['Waits for cap', result.deferredByCap, 'allowed, over the daily limit'],
          ['Blocked', result.blocked, 'a rule refuses them'],
          ['No usable contact', result.withoutContact, 'no address, or no source for it'],
        ] as [string, number, string][]).map(([label, value, hint]) => (
          <div key={label} className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
            <p className="text-xs font-medium text-gray-700 dark:text-gray-300">{label}</p>
            <p className="text-xs text-gray-500">{hint}</p>
          </div>
        ))}
      </div>

      {obstacles.length > 0 && (
        <div>
          <p className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
            What is in the way, largest first
          </p>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-xs uppercase text-gray-500 border-b border-gray-200 dark:border-gray-700">
                <tr>
                  <th className="text-left py-2 pr-4">Reason</th>
                  <th className="text-left py-2 pr-4">Businesses</th>
                  <th className="text-left py-2">Code</th>
                </tr>
              </thead>
              <tbody>
                {obstacles.map((o) => (
                  <tr key={o.code} className="border-b border-gray-100 dark:border-gray-800">
                    <td className="py-2 pr-4 text-gray-900 dark:text-white">{BLOCKER_LABELS[o.code]}</td>
                    <td className="py-2 pr-4 tabular-nums">{o.count}</td>
                    <td className="py-2 font-mono text-xs text-gray-500">{o.code}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {result.rows.length > 0 && (
        <div>
          <p className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
            First 50 of {result.rows.length} candidates
          </p>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-xs uppercase text-gray-500 border-b border-gray-200 dark:border-gray-700">
                <tr>
                  <th className="text-left py-2 pr-4">Business</th>
                  <th className="text-left py-2 pr-4">Outcome</th>
                  <th className="text-left py-2 pr-4">Channel</th>
                  <th className="text-left py-2">Why</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.slice(0, 50).map((r) => (
                  <tr key={r.businessId} className="border-b border-gray-100 dark:border-gray-800 align-top">
                    <td className="py-2 pr-4 text-gray-900 dark:text-white">{r.businessName}</td>
                    <td className="py-2 pr-4">
                      <span className={`text-xs px-2 py-1 rounded-full ${OUTCOME_TONE[r.outcome]}`}>
                        {OUTCOME_LABEL[r.outcome]}
                      </span>
                    </td>
                    <td className="py-2 pr-4">{r.channel ?? '—'}</td>
                    <td className="py-2 text-gray-600 dark:text-gray-400">
                      {r.verdict.blockers.length === 0
                        ? 'Passes every rule.'
                        : r.verdict.blockers.map((b) => b.detail).join(' ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
}
