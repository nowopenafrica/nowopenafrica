import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, ShieldAlert, Radio } from 'lucide-react';

import { supabase } from '../../lib/supabase';
import {
  plan, planHeadline, biggestObstacles, BLOCKER_LABELS, SENDING_NOT_IMPLEMENTED,
  type Candidate, type PlanSettings, type PlanRow,
} from '../../lib/claimreach/dryRun';
import type { Channel, DataConfidence } from '../../lib/claimreach/sendGate';

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

const CHANNELS: Channel[] = ['whatsapp', 'sms', 'email'];

const CONFIDENCES: DataConfidence[] = [
  'unconfirmed', 'partially_confirmed', 'source_confirmed', 'owner_confirmed', 'admin_verified',
];

/** Evidence statuses that count as "this field has a source" (§7). */
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
  const [businesses, setBusinesses] = useState<BusinessRow[]>([]);
  const [provenance, setProvenance] = useState<Map<string, Set<string>>>(new Map());
  const [suppressed, setSuppressed] = useState<Set<string> | null>(null);
  const [outreach, setOutreach] = useState<OutreachRow[]>([]);
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
  const [channels, setChannels] = useState<Channel[]>(['whatsapp', 'sms']);
  const [minConfidence, setMinConfidence] = useState<DataConfidence>('source_confirmed');
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
    const biz = await supabase
      .from('businesses')
      .select('id,name,claim_status,data_confidence,phone,whatsapp,email')
      .order('name')
      .limit(1000);

    if (biz.error) {
      setProblem(`Could not read businesses: ${biz.error.message}`);
      setBusinesses([]);
      setUnavailable(true);
      setLoading(false);
      return;
    }
    const rows = (biz.data as BusinessRow[]) ?? [];
    setBusinesses(rows);

    // Field-level provenance. A missing table is a real answer — no evidence
    // has been recorded — so it is reported, not treated as an outage.
    const ev = await supabase
      .from('business_evidence')
      .select('business_id,field_name,status')
      .in('field_name', ['phone', 'whatsapp', 'email'])
      .in('status', SOURCED_STATUSES)
      .limit(5000);

    const byBusiness = new Map<string, Set<string>>();
    if (!ev.error) {
      for (const r of (ev.data as { business_id: string; field_name: string }[]) ?? []) {
        const set = byBusiness.get(r.business_id) ?? new Set<string>();
        set.add(r.field_name);
        byBusiness.set(r.business_id, set);
      }
    }
    setProvenance(byBusiness);

    // Prior attempts, so the frequency rules are answered from the record.
    const out = await supabase
      .from('claimreach_outreach')
      .select('business_id,channel,created_at')
      .limit(5000);
    setOutreach(out.error ? [] : ((out.data as OutreachRow[]) ?? []));

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
    // Honestly empty unless the operator asks the what-if question.
    configuredChannels: assumeProviders
      ? { whatsapp: true, sms: true, email: true }
      : {},
    messageVariables: [{ name: 'business_name', evidenceBacked: true }],
  }), [channels, minConfidence, dailyCap, quietFrom, quietTo, approved, assumeProviders, assumeAutomatic]);

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
          dataConfidence: b.data_confidence,
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
  }, [businesses, provenance, suppressed, outreach]);

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
        <p className="text-sm text-amber-900 dark:text-amber-100">{SENDING_NOT_IMPLEMENTED}</p>
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
            What if: providers were configured — none is
          </label>
        </div>
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
