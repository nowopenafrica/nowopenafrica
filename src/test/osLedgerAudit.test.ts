import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { sectionById } from '../lib/adminCreator';
import { osHealthSnapshot, summarizeOsExtended, type OsExtendedInput } from '../lib/commandOs';

// OS-13 audit: the eight ledgers are the single source of truth, wired through
// both oversight views, backed by a real (idempotently-seeded) migration, and
// covered by a deterministic snapshot.

const EIGHT = [
  'os_workforce',
  'os_work_items',
  'os_approvals',
  'os_knowledge',
  'os_launches',
  'os_partners',
  'os_press',
  'os_campaigns',
] as const;

describe('os_* ledger audit', () => {
  it('the Command Center and Founder Dashboard both reuse all eight ledgers', () => {
    for (const section of ['command', 'founder'] as const) {
      const s = sectionById(section);
      expect(s).toBeDefined();
      for (const table of EIGHT) expect(s!.reuses).toContain(table);
    }
  });

  it('every os_* table is created and seeded in the combined migration script', () => {
    // import.meta.url is an http URL under jsdom, so resolve from cwd instead.
    const sql = readFileSync(resolve(process.cwd(), 'scripts/sql/apply_all_migrations.sql'), 'utf8');
    for (const table of EIGHT) {
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS ${table} (`);
    }
    expect(sql).toContain("INSERT INTO os_orgs (id, slug, name)");
    expect(sql).toContain("'00000000-0000-4000-8000-00000000a001'");
    expect(sql).toContain("'nowopen-africa'");
    // Seeds must be guarded by the org slug, so re-running never duplicates.
    expect(sql).toMatch(/INSERT INTO os_workforce \(/);
    expect(sql).toMatch(/JOIN os_orgs o ON o\.slug = 'nowopen-africa'/);
  });

  it('the health snapshot exposes exactly the eight ledger totals, derived only', () => {
    const org = '00000000-0000-4000-8000-00000000a001';
    const input: OsExtendedInput = {
      members: [{ id: 'm1', org_id: org, kind: 'ai', name: 'A', title: 'A', department: 'D', status: 'active' }],
      items: [{ id: 'w1', org_id: org, kind: 'task', title: 'T', status: 'in_progress', priority: 'medium', department: 'D', assignee_id: 'm1' }],
      approvals: [{ id: 'a1', org_id: org, work_item_id: 'w1', requested_by: 'm1', reason: 'R', status: 'pending' }],
      docs: [{ id: 'k1', org_id: org, category: 'Brand', title: 'Doc', summary: 'S', body: [], tags: [], source: 'sop' }],
      launches: [{ id: 'l1', org_id: org, name: 'L', area: 'P', target: 'Aug 2026', done: [true] }],
      partners: [{ id: 'p1', org_id: org, name: 'P', type: 'Media', note: '', stage: 'Proposal' }],
      press: [{ id: 'pr1', org_id: org, headline: 'H', outlet: 'NowOpen Africa', kind: 'release', status: 'draft', url: '', summary: '' }],
      campaigns: [{ id: 'c1', org_id: org, slug: 'c', name: 'C', focus: 'F', audience: '', channels: [], status: 'idea' }],
    };
    const snap = osHealthSnapshot(summarizeOsExtended(input));
    expect(Object.keys(snap.ledgers)).toEqual([
      'workforce', 'work_items', 'approvals', 'knowledge',
      'launches', 'partners', 'press', 'campaigns',
    ]);
    expect(snap.ledgers).toEqual({
      workforce: 1, work_items: 1, approvals: 1, knowledge: 1,
      launches: 1, partners: 1, press: 1, campaigns: 1,
    });
    expect(snap.health).toBeGreaterThanOrEqual(0);
    expect(snap.health).toBeLessThanOrEqual(100);
    expect(typeof snap.derivedAt).toBe('string');
    expect(Number.isNaN(Date.parse(snap.derivedAt))).toBe(false);
  });
});
