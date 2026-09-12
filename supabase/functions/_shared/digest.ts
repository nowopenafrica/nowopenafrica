/**
 * The daily digest — the brief, delivered.
 *
 * The Chief of Staff's daily brief already exists inside the admin console
 * (DailyBrief). This is the same content pushed out once a day by email and
 * WhatsApp, so the founder gets "the number that would change today" without
 * opening the office.
 *
 * PURE AND TESTED: builds strings from an array of run rows; no Deno globals,
 * no imports, so vitest covers it and the edge function runs the same code.
 * Which agents ran, what they reported, and how urgently — nothing here is
 * invented, only rearranged.
 */

/** Minimal run row the digest cares about — what workforce_latest shapes. */
export interface DigestRun {
  agent_key?: string;
  agentKey?: string;
  status: string;
  summary: string | null;
  reason: string | null;
  findings: Array<{ title: string; severity: string; detail?: string }>;
}

export interface DigestContent {
  subject: string;
  emailHtml: string;
  whatsappText: string;
}

/** Presentation labels; matching the workforce panels so the two never clash. */
export const AGENT_LABELS: Record<string, string> = {
  'chief-of-staff': 'Chief of Staff',
  'trust-safety': 'Trust & Safety',
  'customer-success': 'Customer Success',
  'growth-director': 'Growth Director',
  'strategy-director': 'Strategy Director',
  'research-analyst': 'Research Analyst',
  'seo-manager': 'SEO Manager',
  'social-director': 'Social Director',
  'content-manager': 'Content Manager',
  'comms-director': 'Communications Director',
  'creative-director': 'Creative Director',
  'copywriter': 'Copywriter',
  'production-manager': 'Production Manager',
  'post-supervisor': 'Post-Production Supervisor',
  'sales-director': 'Sales Director',
  'operations-director': 'Operations Director',
  'finance-analyst': 'Finance Analyst',
  'product-manager': 'Product Manager',
};

const SEVERITY_ICON: Record<string, string> = {
  critical: '🔴',
  attention: '🟠',
  watch: '⚪',
  good: '🟢',
};

const SEVERITY_RANK: Record<string, number> = { critical: 0, attention: 1, watch: 2, good: 3 };

/** The agent key a run belongs to, from whichever field the row uses. */
export function keyOf(run: DigestRun): string {
  return run.agent_key ?? run.agentKey ?? '';
}

/** A line that lists how many items demanded attention, or says none did. */
function attentionLine(total: number, urgent: number): string {
  if (urgent > 0) return `${total} item${total === 1 ? '' : 's'} reported, ${urgent} critical.`;
  if (total > 0) return `${total} item${total === 1 ? '' : 's'} reported, none critical.`;
  return 'Nothing needed a decision.';
}

/**
 * Build the three deliverable formats from the day's runs.
 *
 * dateLabel is a plain string like "Saturday 12 September" — callers own the
 * timezone, so a UTC slice somewhere can never silently flip the date shown.
 */
export function buildDailyDigest(runs: DigestRun[], dateLabel: string): DigestContent {
  const present = runs.filter((r) => keyOf(r) !== '');
  const withFindings = present.filter((r) => (r.findings ?? []).length > 0);
  const urgent = present.flatMap((r) => (r.findings ?? []).filter((f) => f.severity === 'critical'));
  const labelFor = (r: DigestRun) => AGENT_LABELS[keyOf(r)] ?? keyOf(r);

  const sections = present.map((r) => {
    const f = (r.findings ?? [])
      .slice()
      .sort((a, b) => (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9));
    const items = f
      .map((x) => `${SEVERITY_ICON[x.severity] ?? ''} <strong>${x.title}</strong>${x.detail ? ` — ${x.detail}` : ''}`)
      .join('<br/>');
    const pills = f.map((x) => `${SEVERITY_ICON[x.severity] ?? ''} ${x.title}`).join('\n');
    const status = r.status === 'failed' || r.status === 'rejected'
      ? `✖ ${r.status}`
      : (r.findings?.length ?? 0) > 0
        ? `⚠ ${r.findings.length} item${r.findings.length === 1 ? '' : 's'}`
        : '✅';
    const blurb = r.status === 'failed' || r.status === 'rejected'
      ? (r.reason ?? 'unknown error')
      : (r.summary ?? '');
    return {
      status,
      email: `<strong>${labelFor(r)}</strong> — ${status}<br/>${blurb}${items ? `<br/>${items}` : ''}`,
      wa: `${status} ${labelFor(r)}${blurb ? `: ${blurb}` : ''}${pills ? `\n${pills}` : ''}`,
    };
  });

  const emailBody = sections.map((s) => `<p style="margin:0 0 10px">${s.email}</p>`).join('');
  const exec = urgent.length > 0
    ? `<p style="padding:10px 14px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;font-weight:700">${urgent.length} critical item${urgent.length === 1 ? '' : 's'} need a decision today.</p>`
    : '';

  const waLines = sections.map((s) => s.wa);
  const waHead = urgent.length > 0
    ? `${dateLabel} — ${urgent.length} critical item${urgent.length === 1 ? '' : 's'} need a decision today.\n`
    : `${dateLabel} — ${attentionLine(withFindings.length, urgent.length)}\n`;

  return {
    subject: `NowOpen daily brief — ${dateLabel}`,
    emailHtml: `<p>Here is today's brief — what every department measured, and what needs a decision.</p>${exec}${emailBody}<p style="margin-top:12px;color:#6b7280;font-size:12px">Full run details live in the admin console under OS &rarr; Workforce.</p>`,
    whatsappText: `${waHead}${waLines.join('\n')}`,
  };
}