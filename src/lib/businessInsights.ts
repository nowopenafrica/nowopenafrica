/**
 * What a business owner gets to see about their own listing.
 *
 * WHY THIS EXISTS
 *
 * There was nothing. No component anywhere read `business_viewed` or
 * `business_contact_clicked` for an owner, so a business could complete a
 * profile, publish it, subscribe to a plan, and never learn whether a single
 * person had looked at it. The dashboard could tell them their profile was 86%
 * complete and not one thing about whether it worked.
 *
 * That is the gap that matters commercially. A business will pay for
 * customers, not for tools — Studio, brand kits and booking modules are all
 * value delivered before any demand exists. The only thing that converts a
 * free listing into a paid plan is a real number: somebody saw you, somebody
 * called you.
 *
 * The data was already there and already readable: the `analytics_owner_read`
 * RLS policy lets an owner select events for their own business. Nothing used
 * it.
 *
 * THE HONESTY RULES, which matter more here than anywhere else in the product
 *
 *  1. **Never inflate.** These numbers are currently tiny — the whole platform
 *     saw 114 sessions in a fortnight. A dashboard that renders "0 views" as a
 *     confident metric with a trend arrow is worse than one that says nothing,
 *     because it teaches the owner that the numbers are theatre.
 *  2. **No trend on thin data.** A change from 1 to 2 is not "+100% growth".
 *     `trend` is null below MIN_FOR_TREND and the UI must not draw one.
 *  3. **Count people, not hits.** Distinct sessions, so one person refreshing
 *     six times is one viewer. An owner deciding whether NowOpen works needs
 *     to know how many humans, and inflating that is the easiest lie to tell.
 *  4. **The owner's own visits do not count.** Excluded by user id, or an
 *     owner checking their page all day would see traffic that is themselves.
 */

export interface InsightEvent {
  name: string;
  props?: Record<string, unknown> | null;
  session_id?: string | null;
  user_id?: string | null;
  created_at: string;
}

/** Below this many events in a window, a percentage change is noise. */
export const MIN_FOR_TREND = 10;

export interface ContactBreakdown {
  channel: string;
  clicks: number;
}

export interface BusinessInsights {
  /** Distinct sessions that opened the profile. */
  viewers: number;
  /** Total profile opens, including repeats. */
  views: number;
  /** Distinct sessions that acted on a contact detail. */
  contacts: number;
  /** Per-channel clicks — phone, whatsapp, website. */
  byChannel: ContactBreakdown[];
  /**
   * Of the people who looked, how many reached out, as a whole percent.
   * Null when too few viewers for the number to mean anything.
   */
  contactRate: number | null;
  /**
   * Percent change in viewers against the preceding window of equal length.
   * Null unless both windows clear MIN_FOR_TREND — see honesty rule 2.
   */
  trend: number | null;
  /** Days the window covers, for labelling. */
  days: number;
  /** True when there is genuinely nothing yet, so the UI can say so plainly. */
  empty: boolean;
}

const startOf = (now: Date, daysAgo: number): number => now.getTime() - daysAgo * 86_400_000;

/**
 * Aggregate an owner's events.
 *
 * `ownerUserId` is excluded so an owner previewing their own page does not
 * appear as an audience.
 */
export function businessInsights(
  events: InsightEvent[],
  { days = 30, now = new Date(), ownerUserId = null as string | null } = {},
): BusinessInsights {
  const windowStart = startOf(now, days);
  const priorStart = startOf(now, days * 2);

  const mine = events.filter((e) => !ownerUserId || e.user_id !== ownerUserId);

  const viewSessions = new Set<string>();
  const priorViewSessions = new Set<string>();
  const contactSessions = new Set<string>();
  const channels = new Map<string, number>();
  let views = 0;

  for (const e of mine) {
    const t = new Date(e.created_at).getTime();
    if (Number.isNaN(t)) continue;
    // A session id is how a person is counted; without one we cannot tell a
    // viewer from a repeat, so it is counted as a view but not as a viewer.
    const sid = e.session_id ?? '';

    if (e.name === 'business_viewed') {
      if (t >= windowStart) {
        views += 1;
        if (sid) viewSessions.add(sid);
      } else if (t >= priorStart) {
        if (sid) priorViewSessions.add(sid);
      }
      continue;
    }

    if (e.name === 'business_contact_clicked' && t >= windowStart) {
      if (sid) contactSessions.add(sid);
      const channel = String(e.props?.channel ?? 'other');
      channels.set(channel, (channels.get(channel) ?? 0) + 1);
    }
  }

  const viewers = viewSessions.size;
  const priorViewers = priorViewSessions.size;
  const contacts = contactSessions.size;

  // Honesty rule 2: no trend unless both windows have enough to compare.
  const trend =
    viewers >= MIN_FOR_TREND && priorViewers >= MIN_FOR_TREND
      ? Math.round(((viewers - priorViewers) / priorViewers) * 100)
      : null;

  // Same principle: a rate off three viewers is not a rate.
  const contactRate = viewers >= MIN_FOR_TREND ? Math.round((contacts / viewers) * 100) : null;

  return {
    viewers,
    views,
    contacts,
    byChannel: [...channels.entries()]
      .map(([channel, clicks]) => ({ channel, clicks }))
      .sort((a, b) => b.clicks - a.clicks || a.channel.localeCompare(b.channel)),
    contactRate,
    trend,
    days,
    empty: views === 0 && contacts === 0,
  };
}

/** How a channel is named to the owner. */
export function channelLabel(channel: string): string {
  switch (channel) {
    case 'phone': return 'Called';
    case 'whatsapp': return 'WhatsApp';
    case 'website': return 'Visited website';
    case 'directions': return 'Directions';
    case 'email': return 'Emailed';
    default: return channel.charAt(0).toUpperCase() + channel.slice(1);
  }
}
