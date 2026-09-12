/**
 * ClaimReach §26 — the dry run.
 *
 * Given a campaign and a set of candidate businesses, what WOULD happen? No
 * provider is called, nothing is written, and there is no code path from here
 * to a send: `plan()` returns a description.
 *
 * WHY THE DRY RUN IS THE FIRST THING BUILT, BEFORE ANY SENDER
 *
 * Measured against the live database on 2026-09-08, before writing a line of
 * this file:
 *
 *   271 businesses     269 unclaimed, 2 claimed
 *   data_confidence    unconfirmed for all 271
 *   phone              65 (63 in +234… form, 2 local)
 *   email              12
 *   source_url         0
 *   business_evidence  0 rows
 *
 * So NowOpen can currently justify the origin of NO contact detail it holds.
 * §7 requires a recorded source before a message may quote a business's
 * details, and §28 blocks a send without one — which means the honest output
 * of a dry run today is "nobody is contactable yet", together with the exact
 * list of what is missing. That is a far more useful thing to hand a founder
 * than a sender that would refuse every row at runtime with no explanation.
 *
 * ONE CHANNEL PER BUSINESS PER RUN
 *
 * The gate enforces a 72-hour gap before reaching the same business on a
 * second channel (§23), so a plan that queued WhatsApp AND SMS AND email for
 * the same business would be a plan the gate rejects on the next two rows —
 * and, if the gate were ever bypassed, exactly the pile-on §23 exists to
 * prevent. The plan therefore picks ONE channel per business, in the order the
 * operator listed the campaign's channels, and records what it considered.
 *
 * THE CAP IS CONSUMED, NOT JUST CHECKED
 *
 * `evaluateSend` blocks when the daily cap is already exhausted. It cannot
 * know that the plan has already allowed 200 messages this run, so the planner
 * accounts for that itself: allowed rows beyond the remaining cap are reported
 * as deferred rather than as sendable. A plan that promises 5,000 sends
 * against a 200/day cap is a plan that lies about tomorrow.
 */

import {
  evaluateSend,
  type BlockerCode,
  type Channel,
  type GateBusiness,
  type GateCampaign,
  type GateContact,
  type GateVerdict,
  type PriorAttempt,
} from './sendGate';

/**
 * There is no sender, and this says so in code rather than in a comment.
 *
 * The UI reads this string. An operator looking at a screen full of verdicts
 * will reasonably assume something is about to go out, and correcting that
 * assumption is worth more than the space it takes.
 */
export const SENDING_NOT_IMPLEMENTED =
  'ClaimReach can plan and explain outreach. It cannot send: no messaging provider is '
  + 'configured, and no code in this repository delivers a message.';

/** One business as the planner sees it. */
export interface Candidate {
  business: GateBusiness;
  /**
   * Every contact route known for this business, in any order.
   *
   * A channel absent from this list is a channel the business has no contact
   * for — reported as `contact_missing` if the campaign wanted it, never
   * silently skipped.
   */
  contacts: GateContact[];
  /** From `claimreach_outreach`, all channels. */
  priorAttempts: PriorAttempt[];
  /**
   * Suppression per channel, from `claimreach_is_suppressed`.
   *
   * `undefined` for a channel means NOT CHECKED, which the gate treats as a
   * blocker. The planner passes it through unchanged rather than defaulting to
   * false: a planner that assumes "probably fine" produces a plan that would
   * message people who opted out.
   */
  suppressed: Partial<Record<Channel, boolean>>;
  /** The business's local hour at the moment the plan is for. */
  localHour: number;
}

export interface PlanSettings {
  campaign: GateCampaign;
  killSwitch: { all: boolean; channels: Partial<Record<Channel, boolean>> };
  /** Which channels have provider credentials. Absent means not configured. */
  configuredChannels: Partial<Record<Channel, boolean>>;
  /**
   * The variables the campaign's template uses, and whether evidence backs
   * each. Campaign-wide because the template is.
   */
  messageVariables: { name: string; evidenceBacked: boolean }[];
}

export type RowOutcome = 'would_send' | 'deferred_by_cap' | 'blocked' | 'no_contact';

export interface ConsideredChannel {
  channel: Channel;
  verdict: GateVerdict;
}

export interface PlanRow {
  businessId: string;
  businessName: string;
  outcome: RowOutcome;
  /** The channel the plan would use, when there is one. */
  channel?: Channel;
  /** The verdict for `channel`, or the best-explained refusal. */
  verdict: GateVerdict;
  /** Every channel tried, so an operator sees why the chosen one won. */
  considered: ConsideredChannel[];
}

export interface Plan {
  rows: PlanRow[];
  wouldSend: number;
  deferredByCap: number;
  blocked: number;
  /** How many candidates had no contact at all for the campaign's channels. */
  withoutContact: number;
  /** Blocker code → how many candidates it stopped. Counted once per candidate. */
  byBlocker: Partial<Record<BlockerCode, number>>;
  /** Always present, always the same, so no caller can forget to show it. */
  note: string;
}

/**
 * Build the plan.
 *
 * Deterministic: candidates are sorted by business id, so two runs over the
 * same input produce the same plan in the same order. A dry run an operator
 * cannot reproduce is not evidence of anything.
 */
export function plan(candidates: Candidate[], settings: PlanSettings): Plan {
  const ordered = [...candidates].sort((a, b) => a.business.id.localeCompare(b.business.id));
  const rows: PlanRow[] = [];

  let capRemaining = Math.max(0, settings.campaign.dailyCapRemaining);

  for (const c of ordered) {
    const considered: ConsideredChannel[] = [];

    /*
     * Try the campaign's channels IN THE ORDER THE OPERATOR LISTED THEM.
     * Preference is the operator's decision, not the planner's — inventing a
     * ranking here would silently override a campaign built around WhatsApp
     * because some default preferred email.
     */
    for (const channel of settings.campaign.channels) {
      const contact = c.contacts.find((x) => x.channel === channel)
        ?? { channel, normalized: null, hasProvenance: false };

      considered.push({
        channel,
        verdict: evaluateSend({
          business: c.business,
          contact,
          /*
           * The cap as it stands AT THIS POINT IN THE RUN, not as the campaign
           * started the day. This is the only value the planner overrides, and
           * it keeps the gate the sole holder of the rule: "cap exhausted
           * before the run" and "cap exhausted by the run" then produce the
           * same blocker, which is the same fact.
           */
          campaign: { ...settings.campaign, dailyCapRemaining: capRemaining },
          suppressed: c.suppressed[channel],
          priorAttempts: c.priorAttempts,
          channelConfigured: settings.configuredChannels[channel] === true,
          killSwitch: settings.killSwitch,
          messageVariables: settings.messageVariables,
          localHour: c.localHour,
        }),
      });
    }

    const winner = considered.find((x) => x.verdict.allowed);

    if (winner) {
      capRemaining -= 1;
      rows.push({
        businessId: c.business.id,
        businessName: c.business.name,
        outcome: 'would_send',
        channel: winner.channel,
        verdict: winner.verdict,
        considered,
      });
      continue;
    }

    /*
     * Nothing allowed. Report the channel with the FEWEST blockers, because
     * that is the one closest to working and therefore the one worth showing
     * an operator first. Ties keep the operator's own channel order.
     */
    const best = considered.reduce<ConsideredChannel | undefined>(
      (acc, x) => (acc && acc.verdict.blockers.length <= x.verdict.blockers.length ? acc : x),
      undefined,
    );

    const codes = new Set(best?.verdict.blockers.map((b) => b.code) ?? []);

    /*
     * The cap is the one refusal that is not a problem to fix. Separated so
     * the operator's next action is clear: raise the cap or wait, rather than
     * go hunting for missing data that is not missing.
     */
    const cappedOnly = codes.size === 1 && codes.has('daily_cap_reached');

    /*
     * PRECEDENCE, because a refused row usually has several reasons and the
     * operator needs the one that decides what to do next:
     *
     *   1. Claim status wins. "Already claimed" means never contact, and that
     *      must not be filed under "we lack a phone number" — it is not a gap
     *      to close.
     *   2. Then the contact. With no address, or no source for the address,
     *      nothing else about the campaign matters yet.
     *   3. Then the cap, which is a scheduling fact rather than a defect.
     *
     * Every blocker still appears in `byBlocker` and on the row, so nothing is
     * hidden by this ordering — it only decides which bucket the row counts in.
     */
    const claimDecided = codes.has('business_claimed') || codes.has('business_not_unclaimed');
    const noWayToReach = codes.has('contact_missing')
      || [...codes].every((code) => code === 'contact_no_provenance' || code === 'contact_not_normalised');

    let outcome: RowOutcome = 'blocked';
    if (considered.length === 0) outcome = 'no_contact';
    else if (claimDecided) outcome = 'blocked';
    else if (noWayToReach) outcome = 'no_contact';
    else if (cappedOnly) outcome = 'deferred_by_cap';

    rows.push({
      businessId: c.business.id,
      businessName: c.business.name,
      outcome,
      channel: best?.channel,
      verdict: best?.verdict ?? {
        allowed: false,
        blockers: [{ code: 'channel_not_in_campaign', detail: 'The campaign lists no channels.' }],
      },
      considered,
    });
  }

  const byBlocker: Partial<Record<BlockerCode, number>> = {};
  for (const row of rows) {
    if (row.outcome === 'would_send') continue;
    // Once per candidate per code: a business blocked on three channels for
    // the same reason is one problem, not three.
    for (const code of new Set(row.verdict.blockers.map((b) => b.code))) {
      byBlocker[code] = (byBlocker[code] ?? 0) + 1;
    }
  }

  return {
    rows,
    wouldSend: rows.filter((r) => r.outcome === 'would_send').length,
    deferredByCap: rows.filter((r) => r.outcome === 'deferred_by_cap').length,
    blocked: rows.filter((r) => r.outcome === 'blocked').length,
    withoutContact: rows.filter((r) => r.outcome === 'no_contact').length,
    byBlocker,
    note: SENDING_NOT_IMPLEMENTED,
  };
}

/** Blockers ranked by how many candidates they stop — the operator's to-do list. */
export function biggestObstacles(p: Plan): { code: BlockerCode; count: number }[] {
  return (Object.entries(p.byBlocker) as [BlockerCode, number][])
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([code, count]) => ({ code, count }));
}

/**
 * What a founder should read first: is this campaign able to do anything?
 *
 * Deliberately blunt. A dashboard that reports "0 would send" beside a green
 * tick has told the operator nothing; the useful sentence names the single
 * reason blocking the most businesses.
 */
export function planHeadline(p: Plan): string {
  if (!p.rows.length) return 'No candidates matched this campaign.';
  if (p.wouldSend > 0) {
    return `${p.wouldSend} of ${p.rows.length} would be contacted`
      + (p.deferredByCap ? `, ${p.deferredByCap} more wait for tomorrow's cap.` : '.')
      + ' Nothing is sent: ClaimReach has no messaging provider.';
  }
  const worst = biggestObstacles(p)[0];
  return worst
    ? `Nothing can be sent. The largest obstacle is ${worst.code}, affecting ${worst.count} of ${p.rows.length} businesses.`
    : 'Nothing can be sent.';
}

/** Human wording for a blocker code, for the console's summary table. */
export const BLOCKER_LABELS: Record<BlockerCode, string> = {
  kill_switch_all: 'All outbound messaging is switched off',
  kill_switch_channel: 'This channel is switched off',
  campaign_inactive: 'Campaign is not active',
  channel_not_in_campaign: 'Channel is not part of this campaign',
  channel_not_configured: 'No provider configured for this channel',
  business_claimed: 'Already claimed — nothing to invite',
  business_not_unclaimed: 'Claim is pending or refused; needs a person',
  contact_missing: 'No contact detail for this channel',
  contact_not_normalised: 'Contact is not stored in a form suppression can match',
  contact_no_provenance: 'No recorded source for this contact',
  suppressed: 'Suppressed, or suppression not checked',
  daily_cap_reached: "Campaign's daily allowance is used up",
  max_attempts_reached: 'Already contacted the maximum number of times',
  contacted_too_recently: 'Contacted too recently on this channel',
  other_channel_too_recently: 'Contacted too recently on another channel',
  confidence_below_threshold: 'Data confidence below what the campaign requires',
  unsupported_claim: 'The message would state something no source supports',
  quiet_hours: 'Inside quiet hours where the business is',
  approval_required: 'Waiting for a human to approve',
};
