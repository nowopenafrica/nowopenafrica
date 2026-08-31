/**
 * Which sources Radar is allowed to pull from, and the gate that enforces it.
 *
 * THIS IS THE FILE THAT KEEPS THE ENGINE LEGAL. Everything else in Radar is
 * data plumbing; this decides whether the plumbing may run at all. It is
 * written as a default-deny gate rather than a policy document, because a
 * policy document cannot stop a background job at 3am.
 *
 * The rule: a source may be used for automated discovery only when its rights
 * are positively established. Silence is not permission. A source whose terms
 * nobody has read is `unknown`, and unknown is refused exactly as firmly as
 * prohibited — the realistic failure here is not somebody overriding a "no",
 * it is somebody switching on a source nobody ever checked.
 */

export type Permission = 'permitted' | 'prohibited' | 'unknown';

export type ProviderKind =
  | 'business_submission'   // the business tells us about itself
  | 'admin_import'          // a CSV a named human vouched for
  | 'authorized_api'        // a paid or partnered API
  | 'licensed_directory'    // a directory with a signed agreement
  | 'public_registry'       // CAC and equivalents, where terms allow
  | 'partner_feed'          // a negotiated feed
  | 'website_discovery';    // a business's own site, with its permission

/**
 * The rights that must be established before automation touches a source.
 *
 * Four separate questions, because they genuinely come apart: a site may allow
 * crawling but forbid bulk extraction, or allow both but forbid using the
 * result to build a competing directory — which is the clause that matters
 * most to NowOpen, being precisely what NowOpen is.
 */
export interface SourceRights {
  /** May software fetch it at all? robots.txt is evidence, not the answer. */
  automatedAccess: Permission;
  /** May many records be taken, rather than one being read? */
  bulkExtraction: Permission;
  /** May the result be used to build or improve a competing dataset? */
  competingDataset: Permission;
  /** May the content be stored and re-published? */
  redistribution: Permission;
  /** The agreement, licence name, or terms relied on. */
  licence: string | null;
  /** Who at NowOpen established this, and when. Null means nobody has. */
  authorisedBy: string | null;
  authorisedAt: string | null;
}

export interface RadarSource {
  key: string;
  name: string;
  kind: ProviderKind;
  /** Whether an operator switched it on. Never sufficient by itself. */
  enabled: boolean;
  rights: SourceRights;
  /** Standing note for operators — why this is blocked, or what it covers. */
  notes?: string;
}

/** A source that needs no external permission, because the data is given to us. */
const SELF_SUPPLIED: SourceRights = {
  automatedAccess: 'permitted',
  bulkExtraction: 'permitted',
  competingDataset: 'permitted',
  redistribution: 'permitted',
  licence: 'Supplied directly to NowOpen Africa by the submitter.',
  authorisedBy: 'NowOpen Africa',
  authorisedAt: '2026-08-31',
};

export type GateVerdict =
  | { allowed: true }
  | { allowed: false; reason: string; blockedBy: keyof SourceRights | 'enabled' };

/**
 * May Radar run against this source?
 *
 * Ordered so the reason returned is the most fundamental one. Telling an
 * operator "no licence recorded" when automated access is outright prohibited
 * invites them to go and record a licence, which is the wrong next step.
 */
export function sourceGate(source: RadarSource | null | undefined): GateVerdict {
  if (!source) return { allowed: false, reason: 'No such source.', blockedBy: 'enabled' };
  const r = source.rights;

  const checks: Array<[keyof SourceRights, string]> = [
    ['automatedAccess', 'automated access is not established as permitted'],
    ['bulkExtraction', 'bulk extraction is not established as permitted'],
    ['competingDataset', 'use in a competing dataset is not established as permitted'],
    ['redistribution', 'redistribution is not established as permitted'],
  ];

  for (const [field, phrase] of checks) {
    const value = r[field] as Permission;
    if (value !== 'permitted') {
      return {
        allowed: false,
        blockedBy: field,
        reason: `${source.name}: ${phrase}${value === 'unknown' ? ' (nobody has checked)' : ''}.`,
      };
    }
  }

  // Rights read "permitted" only because a person asserted it. Record which one.
  if (!r.licence?.trim()) {
    return { allowed: false, blockedBy: 'licence', reason: `${source.name}: no licence or agreement recorded.` };
  }
  if (!r.authorisedBy?.trim()) {
    return { allowed: false, blockedBy: 'authorisedBy', reason: `${source.name}: nobody at NowOpen has signed this source off.` };
  }
  if (!source.enabled) {
    return { allowed: false, blockedBy: 'enabled', reason: `${source.name} is switched off.` };
  }
  return { allowed: true };
}

/** The sources Radar ships knowing about. */
export const BUILT_IN_SOURCES: RadarSource[] = [
  {
    key: 'business_submission',
    name: 'Business submissions',
    kind: 'business_submission',
    enabled: true,
    rights: SELF_SUPPLIED,
  },
  {
    key: 'public_suggestion',
    name: 'Suggested by a customer',
    kind: 'business_submission',
    enabled: true,
    rights: {
      ...SELF_SUPPLIED,
      licence: 'Suggested to NowOpen Africa by a member of the public; treated as a lead, never published unreviewed.',
    },
  },
  {
    key: 'admin_import',
    name: 'Admin CSV import',
    kind: 'admin_import',
    enabled: true,
    rights: {
      ...SELF_SUPPLIED,
      licence: 'Imported by a NowOpen administrator who is accountable for the provenance of the file.',
    },
  },
  /*
   * Registered deliberately, and deliberately blocked.
   *
   * BusinessList's terms prohibit bots, crawlers, scrapers, bulk extraction,
   * and use of their data to create or enhance a competing dataset. NowOpen is
   * a competing dataset. Listing it here with prohibited rights is worth more
   * than leaving it out: it records the answer, so the question is not
   * re-asked in six months and quietly answered differently by whoever is next.
   *
   * If a licensing agreement is ever signed, the fix is to update these fields
   * and record who authorised it — never to add a bypass.
   */
  {
    key: 'businesslist_ng',
    name: 'BusinessList.com.ng',
    kind: 'licensed_directory',
    enabled: false,
    rights: {
      automatedAccess: 'prohibited',
      bulkExtraction: 'prohibited',
      competingDataset: 'prohibited',
      redistribution: 'prohibited',
      licence: null,
      authorisedBy: null,
      authorisedAt: null,
    },
    notes:
      'Their terms prohibit bots, crawlers, scrapers, bulk extraction and use in a competing dataset. '
      + 'Do not enable without a signed agreement. Their robots.txt permitting crawling is a bot-traffic '
      + 'rule, not a content licence.',
  },
];

export function findSource(key: string, sources: RadarSource[] = BUILT_IN_SOURCES): RadarSource | null {
  return sources.find((s) => s.key === key) ?? null;
}

/** The sources Radar may actually run right now. */
export function activeSources(sources: RadarSource[] = BUILT_IN_SOURCES): RadarSource[] {
  return sources.filter((s) => sourceGate(s).allowed);
}

/** Every source that is registered but cannot run, with the reason. */
export function blockedSources(
  sources: RadarSource[] = BUILT_IN_SOURCES,
): Array<{ source: RadarSource; reason: string }> {
  return sources
    .map((source) => ({ source, verdict: sourceGate(source) }))
    .filter((x) => !x.verdict.allowed)
    .map((x) => ({ source: x.source, reason: (x.verdict as { reason: string }).reason }));
}
