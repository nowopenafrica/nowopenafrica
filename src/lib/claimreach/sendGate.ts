/**
 * ClaimReach §28 — may this message be sent?
 *
 * One function, every rule, no provider attached.
 *
 * WHY A PURE FUNCTION AND NOT CHECKS SCATTERED THROUGH A WORKER
 *
 * §28 lists eleven conditions joined by AND. Written inline in a send loop
 * they become eleven early returns that nobody can test together, and the
 * first one somebody reorders or forgets is a message to a person who asked
 * not to be contacted. Composed here they are executable, falsifiable, and
 * one place to read when an operator asks "why did that send?".
 *
 * TWO RULES THAT SHAPE EVERYTHING BELOW
 *
 * 1. UNKNOWN IS A BLOCKER. Every optional input defaults to refusing. A gate
 *    whose default is "allow" fails open, and a system that fails open on
 *    outbound messaging fails onto real people's phones.
 *
 * 2. IT RETURNS EVERY BLOCKER, NOT THE FIRST. An operator fixing one reason
 *    at a time, discovering the next only after re-running, will conclude the
 *    tool is fighting them. The dry run (§26) shows the whole list.
 */

export type Channel = 'whatsapp' | 'sms' | 'email' | 'social';

export type BlockerCode =
  | 'kill_switch_all'
  | 'kill_switch_channel'
  | 'campaign_inactive'
  | 'channel_not_in_campaign'
  | 'channel_not_configured'
  | 'business_claimed'
  | 'business_not_unclaimed'
  | 'contact_missing'
  | 'contact_not_normalised'
  | 'contact_no_provenance'
  | 'suppressed'
  | 'daily_cap_reached'
  | 'max_attempts_reached'
  | 'contacted_too_recently'
  | 'other_channel_too_recently'
  | 'confidence_below_threshold'
  | 'unsupported_claim'
  | 'quiet_hours'
  | 'approval_required';

export interface Blocker {
  code: BlockerCode;
  /** What an operator reads in the dry run. */
  detail: string;
}

export interface GateBusiness {
  id: string;
  name: string;
  /** From `businesses.claim_status`. */
  claimStatus: string | null | undefined;
  /** From `businesses.data_confidence`. */
  dataConfidence: string | null | undefined;
}

export interface GateContact {
  channel: Channel;
  /**
   * The normalised value — E.164 for a phone, lowercased for an email.
   *
   * Normalised because suppression is stored that way, and a lookup in a
   * different shape silently fails to match: the person who asked to be left
   * alone is the one who finds out.
   */
  normalized: string | null | undefined;
  /**
   * Whether this contact has a recorded source (§7).
   *
   * Not decoration. A message that quotes a phone number nobody can trace is
   * a message NowOpen cannot defend when the recipient asks where it came
   * from — and "we found it online" is not an answer.
   */
  hasProvenance: boolean;
}

export interface GateCampaign {
  id: string;
  status: 'draft' | 'active' | 'paused' | 'complete' | string;
  channels: Channel[];
  /** §28: the minimum `data_confidence` a business must carry. */
  minDataConfidence: DataConfidence;
  /** §27: MANUAL and SEMI-AUTOMATIC require a human before sending. */
  approvalMode: 'manual' | 'semi_automatic' | 'automatic';
  /** True once a human has approved THIS message or its batch. */
  approved: boolean;
  /** §23. */
  maxAttempts: number;
  /** Remaining sends allowed today, from the campaign's daily limit. */
  dailyCapRemaining: number;
  /** §24, in the business's local hours. */
  quietHours: { fromHour: number; toHour: number };
}

export interface PriorAttempt {
  at: Date;
  channel: Channel;
}

export interface GateRequest {
  business: GateBusiness;
  contact: GateContact;
  campaign: GateCampaign;
  /** From `claimreach_is_suppressed`. Undefined means "not checked" — a blocker. */
  suppressed: boolean | undefined;
  /** From `claimreach_outreach`. */
  priorAttempts: PriorAttempt[];
  /** Whether the provider for this channel has credentials configured. */
  channelConfigured: boolean;
  killSwitch: { all: boolean; channels: Partial<Record<Channel, boolean>> };
  /**
   * Variables the rendered message uses, and whether each is evidence-backed.
   *
   * §7 and §10: a message may state only what evidence supports. Checking the
   * VARIABLES rather than scanning the prose is the difference between a rule
   * and a hope — a regex over generated text cannot prove the absence of an
   * invented claim, but an unbacked variable is a fact with no source, and
   * that is decidable.
   */
  messageVariables: { name: string; evidenceBacked: boolean }[];
  /** The moment of sending, and the business's local hour at that moment. */
  localHour: number;
}

export interface GateVerdict {
  allowed: boolean;
  blockers: Blocker[];
}

export type DataConfidence =
  | 'unconfirmed'
  | 'source_confirmed'
  | 'partially_confirmed'
  | 'owner_confirmed'
  | 'admin_verified';

/**
 * Confidence, ranked.
 *
 * `unconfirmed` is 0 and every business on NowOpen currently sits there, which
 * means a campaign demanding anything higher sends to nobody today. That is
 * the correct behaviour and it is worth stating plainly: the gate is not
 * broken when it refuses everything, it is reporting that no business has
 * confirmed data yet.
 */
const CONFIDENCE_RANK: Record<string, number> = {
  unconfirmed: 0,
  single_source: 1,
  partially_confirmed: 1,
  source_confirmed: 2,
  multiple_sources: 2,
  owner_confirmed: 3,
  admin_verified: 4,
};

/** Minimum gap before the same contact is messaged again, per channel. */
const MIN_HOURS_SAME_CHANNEL = 48;

/**
 * Minimum gap before reaching the same contact on a DIFFERENT channel.
 *
 * §23: "A business contacted through WhatsApp should not immediately receive
 * SMS + email + another WhatsApp campaign." Longer than the same-channel gap
 * on purpose — arriving on a second channel reads as pursuit, not as a
 * reminder.
 */
const MIN_HOURS_CROSS_CHANNEL = 72;

const hoursBetween = (a: Date, b: Date) => Math.abs(a.getTime() - b.getTime()) / 3_600_000;

/**
 * Is the local hour inside quiet hours?
 *
 * Handles the wrap, which is the whole difficulty: Nigeria's default is
 * 22:00–08:00, so the range crosses midnight and a naive `from <= h && h < to`
 * is false all night and true all day — precisely inverted.
 */
export function inQuietHours(localHour: number, fromHour: number, toHour: number): boolean {
  if (fromHour === toHour) return false;           // no quiet period
  if (fromHour < toHour) return localHour >= fromHour && localHour < toHour;
  return localHour >= fromHour || localHour < toHour;
}

/**
 * The gate.
 *
 * Deliberately does no I/O. Suppression, prior attempts and provider
 * configuration are passed in, so this can be exercised over every
 * combination in a test rather than only against a live database.
 */
export function evaluateSend(req: GateRequest): GateVerdict {
  const blockers: Blocker[] = [];
  const add = (code: BlockerCode, detail: string) => blockers.push({ code, detail });

  // ── Kill switches first: an emergency stop must not be reasoned past ────
  if (req.killSwitch.all) {
    add('kill_switch_all', 'All outbound messaging is stopped.');
  }
  if (req.killSwitch.channels[req.contact.channel]) {
    add('kill_switch_channel', `${req.contact.channel} sending is stopped.`);
  }

  // ── Campaign ───────────────────────────────────────────────────────────
  if (req.campaign.status !== 'active') {
    add('campaign_inactive', `Campaign is ${req.campaign.status}, not active.`);
  }
  if (!req.campaign.channels.includes(req.contact.channel)) {
    add('channel_not_in_campaign', `This campaign does not use ${req.contact.channel}.`);
  }
  if (!req.channelConfigured) {
    /*
     * Not an error, and not a silent skip either. The provider having no
     * credentials is the normal state of a channel nobody has set up, and an
     * operator needs to see that as the reason rather than wondering why the
     * queue is not moving.
     */
    add('channel_not_configured', `No ${req.contact.channel} provider is configured.`);
  }

  // ── §27 approval mode ──────────────────────────────────────────────────
  if (req.campaign.approvalMode !== 'automatic' && !req.campaign.approved) {
    add(
      'approval_required',
      req.campaign.approvalMode === 'manual'
        ? 'Every message in this campaign needs approval, and this one has none.'
        : 'This campaign is semi-automatic; the batch has not been approved.',
    );
  }

  // ── The business ───────────────────────────────────────────────────────
  const claim = req.business.claimStatus;
  if (claim === 'claimed') {
    /*
     * The point of the whole system is to get a profile claimed. Messaging a
     * business that already did is not merely wasted — it tells an owner who
     * acted that we did not notice.
     */
    add('business_claimed', `${req.business.name} has already claimed its profile.`);
  } else if (claim !== 'unclaimed') {
    // claim_pending, claim_rejected, claim_suspended — each needs a human,
    // not a reminder.
    add('business_not_unclaimed', `Claim status is ${claim ?? 'unknown'}; only unclaimed businesses are contacted.`);
  }

  const rank = CONFIDENCE_RANK[req.business.dataConfidence ?? 'unconfirmed'] ?? 0;
  const required = CONFIDENCE_RANK[req.campaign.minDataConfidence] ?? 0;
  if (rank < required) {
    add(
      'confidence_below_threshold',
      `Data confidence is ${req.business.dataConfidence ?? 'unconfirmed'}; this campaign requires ${req.campaign.minDataConfidence}.`,
    );
  }

  // ── The contact ────────────────────────────────────────────────────────
  const contact = (req.contact.normalized ?? '').trim();
  if (!contact) {
    add('contact_missing', 'No contact for this channel.');
  } else if (req.contact.channel === 'email') {
    if (contact !== contact.toLowerCase() || !contact.includes('@')) {
      add('contact_not_normalised', `"${contact}" is not a normalised email address.`);
    }
  } else if (req.contact.channel !== 'social' && !contact.startsWith('+')) {
    /*
     * Suppression is stored in E.164. A send that checked `08030000001` while
     * the opt-out reads `+2348030000001` would pass the suppression check and
     * message somebody who said stop — so an un-normalised number is refused
     * outright rather than normalised here, where the mismatch would be
     * invisible.
     */
    add('contact_not_normalised', `"${contact}" is not in +234… form; suppression would not match it.`);
  }

  if (!req.contact.hasProvenance) {
    add('contact_no_provenance', 'This contact has no recorded source, so the message could not be justified if questioned.');
  }

  // ── §22 suppression ────────────────────────────────────────────────────
  if (req.suppressed === undefined) {
    /*
     * Not checked is not the same as not suppressed, and treating them alike
     * is how the first message to somebody who opted out gets sent.
     */
    add('suppressed', 'Suppression was not checked for this contact.');
  } else if (req.suppressed) {
    add('suppressed', 'This contact is suppressed and must not be messaged.');
  }

  // ── §23 frequency ──────────────────────────────────────────────────────
  if (req.campaign.dailyCapRemaining <= 0) {
    add('daily_cap_reached', "This campaign's daily limit is used up.");
  }

  const attempts = req.priorAttempts.length;
  if (attempts >= req.campaign.maxAttempts) {
    /*
     * §14: after the last message in the sequence, STOP. A business that has
     * not responded to four messages is not persuaded by a fifth; it is being
     * harassed by a system that cannot count.
     */
    add('max_attempts_reached', `${attempts} of ${req.campaign.maxAttempts} attempts already made.`);
  }

  const now = new Date();
  const sameChannel = req.priorAttempts.filter((a) => a.channel === req.contact.channel);
  const recentSame = sameChannel.find((a) => hoursBetween(now, a.at) < MIN_HOURS_SAME_CHANNEL);
  if (recentSame) {
    add(
      'contacted_too_recently',
      `Last ${req.contact.channel} message was ${Math.round(hoursBetween(now, recentSame.at))}h ago; the minimum gap is ${MIN_HOURS_SAME_CHANNEL}h.`,
    );
  }

  const otherChannel = req.priorAttempts.filter((a) => a.channel !== req.contact.channel);
  const recentOther = otherChannel.find((a) => hoursBetween(now, a.at) < MIN_HOURS_CROSS_CHANNEL);
  if (recentOther) {
    add(
      'other_channel_too_recently',
      `Contacted by ${recentOther.channel} ${Math.round(hoursBetween(now, recentOther.at))}h ago; arriving on a second channel needs ${MIN_HOURS_CROSS_CHANNEL}h.`,
    );
  }

  // ── §7 / §10 no unsupported claims ─────────────────────────────────────
  const unbacked = req.messageVariables.filter((v) => !v.evidenceBacked).map((v) => v.name);
  if (unbacked.length) {
    add(
      'unsupported_claim',
      `The message uses ${unbacked.join(', ')} with no evidence behind it. A message may state only what a source supports.`,
    );
  }

  // ── §24 quiet hours ────────────────────────────────────────────────────
  if (inQuietHours(req.localHour, req.campaign.quietHours.fromHour, req.campaign.quietHours.toHour)) {
    add(
      'quiet_hours',
      `Local time is ${String(req.localHour).padStart(2, '0')}:00, inside quiet hours ${req.campaign.quietHours.fromHour}:00–${req.campaign.quietHours.toHour}:00.`,
    );
  }

  return { allowed: blockers.length === 0, blockers };
}

/** One line for a dry-run row. */
export function verdictSummary(v: GateVerdict): string {
  if (v.allowed) return 'Ready to send';
  if (v.blockers.length === 1) return v.blockers[0].detail;
  return `${v.blockers.length} reasons: ${v.blockers.map((b) => b.code).join(', ')}`;
}
