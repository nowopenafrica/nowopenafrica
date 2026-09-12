import { describe, it, expect } from "vitest";
import { buildDailyDigest, keyOf, AGENT_LABELS, type DigestRun } from "./digest.ts";

function run(over: Partial<DigestRun> = {}): DigestRun {
  return {
    agent_key: 'chief-of-staff',
    status: 'nothing-to-report',
    summary: null,
    reason: null,
    findings: [],
    ...over,
  };
}

describe('keyOf', () => {
  it('reads agent_key when present (workforce_latest shape)', () => {
    expect(keyOf({ agent_key: 'seo-manager', status: 'ok', summary: null, reason: null, findings: [] })).toBe('seo-manager');
  });

  it('reads agentKey when agent_key is absent (frontend shape)', () => {
    expect(keyOf({ agentKey: 'finance-analyst', status: 'ok', summary: null, reason: null, findings: [] })).toBe('finance-analyst');
  });

  it('returns empty for a row with neither field', () => {
    expect(keyOf({ status: 'ok', summary: null, reason: null, findings: [] })).toBe('');
  });
});

describe('AGENT_LABELS', () => {
  it('labels every rostered agent', () => {
    const roster = [
      'chief-of-staff', 'trust-safety', 'customer-success', 'growth-director',
      'strategy-director', 'research-analyst', 'seo-manager', 'social-director',
      'content-manager', 'comms-director', 'creative-director', 'copywriter',
      'production-manager', 'post-supervisor', 'sales-director',
      'operations-director', 'finance-analyst', 'product-manager',
    ];
    for (const key of roster) {
      expect(AGENT_LABELS[key], key).toBeTruthy();
    }
  });
});

describe('buildDailyDigest', () => {
  it('says nothing needed a decision when no run has findings', () => {
    const d = buildDailyDigest([
      run({ agent_key: 'chief-of-staff', status: 'nothing-to-report', summary: 'Nothing needs a decision.' }),
      run({ agent_key: 'seo-manager', status: 'nothing-to-report', summary: 'Ran, nothing to report.' }),
    ], 'Saturday 12 September');

    expect(d.subject).toContain('Saturday 12 September');
    expect(d.whatsappText).toContain('Nothing needed a decision.');
    expect(d.emailHtml).not.toContain('need a decision today');
  });

  it('counts critical findings from any run in the header line', () => {
    const d = buildDailyDigest([
      run({ status: 'ok', summary: '2 critical, 1 needing attention. 32 public listings.' }),
      run({
        agent_key: 'trust-safety',
        status: 'ok',
        summary: '1 critical. 3 open reports.',
        findings: [
          { title: 'Impersonation report open', severity: 'critical', detail: 'Looks like a fake of a real business.', basis: ['reports_open'] },
          { title: 'Report over 24h', severity: 'attention' },
        ],
      }),
    ], 'Saturday 12 September');

    expect(d.whatsappText).toContain('1 critical item need a decision today');
    expect(d.emailHtml).toContain('1 critical item need a decision today');
    expect(d.emailHtml).toContain('Impersonation report open');
    expect(d.emailHtml).toContain('Trust & Safety');
  });

  it('renders failed runs with their reason, never a summary', () => {
    const d = buildDailyDigest([
      run({ agent_key: 'operations-director', status: 'failed', reason: 'No facts returned; the agent has nothing to reason from.' }),
    ], 'Saturday 12 September');

    expect(d.emailHtml).toContain('✖ failed');
    expect(d.emailHtml).toContain('No facts returned');
    expect(d.whatsappText).toContain('Operations Director');
  });

  it('drops rows with no agent key at all', () => {
    const d = buildDailyDigest([
      { status: 'ok', summary: 'Should not appear.', reason: null, findings: [] },
      run({ agent_key: 'finance-analyst', status: 'nothing-to-report', summary: 'Ran.' }),
    ], 'Saturday 12 September');
    expect(d.emailHtml).not.toContain('Should not appear');
    expect(d.emailHtml).toContain('Finance Analyst');
  });

  it('sorts findings worst first within a section', () => {
    const d = buildDailyDigest([
      run({
        agent_key: 'product-manager',
        status: 'ok',
        summary: '2 needing attention.',
        findings: [
          { title: 'Watch item', severity: 'watch' },
          { title: 'Critical item', severity: 'critical' },
        ],
      }),
    ], 'Saturday 12 September');
    const crit = d.emailHtml.indexOf('Critical item');
    const watch = d.emailHtml.indexOf('Watch item');
    expect(crit).toBeGreaterThan(-1);
    expect(crit).toBeLessThan(watch);
  });
});