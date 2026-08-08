import { describe, it, expect } from 'vitest';
import {
  buildFounderBrief, greetingFor, type FounderBrief,
} from './founderBrief';
import { summarizeOsExtended, osHealthScore, type OsExtendedInput } from './commandOs';

const org = '00000000-0000-4000-8000-00000000a001';

function busyBrief(): FounderBrief {
  const input: OsExtendedInput = {
    members: [{ id: 'm1', org_id: org, kind: 'ai', name: 'A', title: 'A', department: 'D', status: 'active' }],
    items: [
      { id: 'w1', org_id: org, kind: 'task', title: 'T1', status: 'in_progress', priority: 'medium', department: 'D', assignee_id: 'm1' },
      { id: 'w2', org_id: org, kind: 'task', title: 'T2', status: 'blocked', priority: 'high', department: 'D', assignee_id: 'm1' },
    ],
    approvals: [{ id: 'a1', org_id: org, work_item_id: 'w1', requested_by: 'm1', reason: 'R', status: 'pending' }],
    docs: [{ id: 'k1', org_id: org, category: 'Brand', title: 'Doc', summary: 'S', body: [], tags: [], source: 'sop' }],
    launches: [
      { id: 'l1', org_id: org, name: 'L1', area: 'P', target: 'Aug 2026', done: [true, true, true, true, true, true, true] },
      { id: 'l2', org_id: org, name: 'L2', area: 'P', target: 'Aug 2026', done: [true, true, true, true, true, true, true] },
      { id: 'l3', org_id: org, name: 'L3', area: 'P', target: 'Sep 2026', done: [true, false, false, false, false, false, false] },
    ],
    partners: [
      { id: 'p1', org_id: org, name: 'P1', type: 'Media', note: '', stage: 'Active' },
      { id: 'p2', org_id: org, name: 'P2', type: 'Investor', note: '', stage: 'Negotiation' },
    ],
    press: [
      { id: 'pr1', org_id: org, headline: 'H1', outlet: 'NowOpen Africa', kind: 'release', status: 'published', url: '', summary: '' },
      { id: 'pr2', org_id: org, headline: 'H2', outlet: 'NowOpen Africa', kind: 'release', status: 'draft', url: '', summary: '' },
    ],
    campaigns: [
      { id: 'c1', org_id: org, slug: 'c1', name: 'C1', focus: 'F', audience: '', channels: [], status: 'live' },
      { id: 'c2', org_id: org, slug: 'c2', name: 'C2', focus: 'F', audience: '', channels: [], status: 'in_build' },
    ],
  };
  return buildFounderBrief(summarizeOsExtended(input), new Date('2026-08-08T09:00:00Z'), 'Ship the verified badge next.');
}

describe('founder morning brief', () => {
  it('greets by time of day', () => {
    expect(greetingFor(new Date('2026-08-08T09:00:00'))).toBe('Good morning');
    expect(greetingFor(new Date('2026-08-08T14:00:00'))).toBe('Good afternoon');
    expect(greetingFor(new Date('2026-08-08T19:00:00'))).toBe('Good evening');
  });

  it('dates the brief deterministically in UTC', () => {
    const b = busyBrief();
    expect(b.greeting).toBe('Good morning');
    expect(b.date).toBe('Saturday 8 August');
  });

  it('surfaces only the ledger signals that need the founder today', () => {
    const b = busyBrief();
    expect(b.attention).toEqual([
      { label: 'Sign-offs waiting', value: 1, module: 'approvals' },
      { label: 'Blocked work items', value: 1, module: 'work-board' },
      { label: 'Launches ready to ship', value: 2, module: 'launch' },
      { label: 'Press stories pending', value: 1, module: 'press-room' },
      { label: 'Campaigns in build', value: 1, module: 'campaign-factory' },
      { label: 'Partners in negotiation', value: 1, module: 'partners' },
    ]);
  });

  it('keeps the read-out derived from the ledgers', () => {
    const b = busyBrief();
    expect(b.lines).toContain('1 work item waiting for your sign-off in the Approvals Hub.');
    expect(b.lines).toContain('2 launches ready to ship.');
    expect(b.lines).toContain('1 active partner, 1 in negotiation.');
    expect(b.lines).toContain('1 press story published, 1 pending.');
    expect(b.lines).toContain('1 campaign live right now.');
    expect(b.lines[b.lines.length - 1]).toBe('Ship the verified badge next.');
    expect(b.summary).toContain(`at ${b.health}/100`);
  });

  it('reports a clean operating system with nothing to do', () => {
    const input: OsExtendedInput = {
      members: [{ id: 'm1', org_id: org, kind: 'ai', name: 'A', title: 'A', department: 'D', status: 'active' }],
      items: [{ id: 'w1', org_id: org, kind: 'task', title: 'T1', status: 'in_progress', priority: 'medium', department: 'D', assignee_id: 'm1' }],
      approvals: [{ id: 'a1', org_id: org, work_item_id: 'w1', requested_by: 'm1', reason: 'R', status: 'approved', decided_at: '2026-08-08T09:00:00Z' }],
      docs: [{ id: 'k1', org_id: org, category: 'Brand', title: 'Doc', summary: 'S', body: [], tags: [], source: 'sop' }],
      launches: [{ id: 'l1', org_id: org, name: 'L1', area: 'P', target: 'Aug 2026', done: [true, true, true] }],
      partners: [{ id: 'p1', org_id: org, name: 'P1', type: 'Media', note: '', stage: 'Active' }],
      press: [{ id: 'pr1', org_id: org, headline: 'H1', outlet: 'NowOpen Africa', kind: 'release', status: 'published', url: '', summary: '' }],
      campaigns: [{ id: 'c1', org_id: org, slug: 'c1', name: 'C1', focus: 'F', audience: '', channels: [], status: 'live' }],
    };
    const b = buildFounderBrief(summarizeOsExtended(input), new Date('2026-08-08T09:00:00Z'));
    expect(b.attention).toEqual([]);
    expect(b.lines).toContain('No sign-offs waiting — the approval queue is clear.');
    expect(b.summary).toContain('healthy');
    expect(b.health).toBe(osHealthScore(summarizeOsExtended(input)));
  });
});
