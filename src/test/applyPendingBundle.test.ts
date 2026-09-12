import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

/**
 * `audits/APPLY_ALL_PENDING.sql` is the one thing a founder pastes into a
 * production SQL editor. It has to be exactly what it claims.
 *
 * It exists because this session cannot apply migrations itself — the
 * environment refuses DDL against production — and because the obvious
 * alternative, `supabase db push`, would seed fabricated rows. So the manual
 * step was made as small as possible: one paste, one transaction.
 *
 * The risk that follows is drift between the bundle and the migration files
 * it was built from: someone edits a migration, the bundle silently no longer
 * matches, and what gets pasted is not what was reviewed.
 */

/**
 * Line endings are not what any of this is asserting, and this repo has a
 * mixture of them — so normalise both sides. Without it the "verbatim" checks
 * fail on CRLF alone, which says nothing about whether the bundle is correct.
 */
const lf = (s: string) => s.replace(/\r\n/g, '\n');

const BUNDLE = 'audits/APPLY_ALL_PENDING.sql';
const bundle = lf(readFileSync(BUNDLE, 'utf8'));

/**
 * The bundle's prose lives in SQL comments, so a sentence wraps mid-phrase
 * with a `--` prefix on the next line. Assertions about MEANING therefore run
 * against a version with those prefixes folded away; assertions about SQL run
 * against the real text.
 */
const prose = bundle.replace(/\n--\s*/g, ' ');

const INCLUDED = [
  '20260908120000_analytics_event_integrity.sql',
  '20260907180000_open_status_expiry_and_holidays.sql',
  '20260907181000_advert_inventory_provenance.sql',
  '20260907182000_business_search_index.sql',
  '20260908140000_business_evidence.sql',
];

describe('the bundle contains exactly the safe pending migrations', () => {
  for (const file of INCLUDED) {
    it(`carries ${file} verbatim`, () => {
      const sql = lf(readFileSync(`supabase/migrations/${file}`, 'utf8')).trim();
      expect(bundle).toContain(sql);
    });
  }

  it('excludes the users policy migration, which must not be applied untested', () => {
    /*
     * That one REPLACES a live policy on the authentication table. A wrong
     * WITH CHECK locks every user out of their own profile, and there is no
     * staging database to rehearse it on. Including it in a paste-and-run
     * bundle would be the single most dangerous thing in this repo.
     */
    const risky = lf(readFileSync(
      'supabase/migrations/20260907190000_users_column_guard_policy.sql',
      'utf8',
    ));
    const marker = risky.split('\n').find((l) => /create\s+policy/i.test(l));
    expect(marker, 'the policy migration has a CREATE POLICY to look for').toBeTruthy();
    expect(bundle).not.toContain(marker!.trim());
    /*
     * Assert the EXCLUSION IS EXPLAINED, not one exact phrase. The first
     * version matched a sentence that no longer exists after the header was
     * rewritten — which failed for a wording change while the safety
     * property it cares about was intact the whole time.
     */
    expect(prose).toMatch(/users_column_guard_policy/);
    expect(prose).toMatch(/locks every user out of their own profile/i);
    expect(prose).toMatch(/no staging database/i);
  });
});

describe('the bundle is safe to paste', () => {
  it('is one transaction, not several', () => {
    const tx = bundle
      .split('\n')
      .map((l) => l.trim().toLowerCase())
      .filter((l) => l === 'begin;' || l === 'commit;' || l === 'rollback;');
    expect(tx).toEqual(['begin;', 'commit;']);
  });

  it('contains nothing that cannot run inside a transaction', () => {
    /*
     * CREATE INDEX CONCURRENTLY, VACUUM and REINDEX all abort inside a
     * transaction block. Wrapping the bundle is only safe while none appear.
     */
    expect(bundle).not.toMatch(/concurrently/i);
    expect(bundle).not.toMatch(/^\s*(vacuum|reindex)\b/im);
  });

  it('writes no business data', () => {
    // The whole point. Strip comments and function bodies first — an INSERT
    // inside a plpgsql body is a definition, not an execution.
    const executed = bundle
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*--.*$/gm, '')
      .replace(/\$([a-z_]*)\$[\s\S]*?\$\1\$/gi, '');
    expect(executed).not.toMatch(/insert\s+into\s+(public\.)?(businesses|media_services|advertisements|users)\b/i);
  });

  it('marks nothing as rights-verified', () => {
    /*
     * Verification is a human act with a counterparty. The advertising
     * migration adds the columns to record it; asserting it in SQL would be
     * exactly the invented data this platform has removed.
     */
    expect(bundle).not.toMatch(/set\s+rights_verified_at/i);
    expect(bundle).toMatch(/claimed_verified/);
  });

  it('ships verification queries, so applying it can be proven', () => {
    expect(bundle).toContain('information_schema.columns');
    expect(bundle).toContain('search_businesses(');
  });
});

describe('the bundle says not to use db push', () => {
  it('carries the warning where someone pasting will see it', () => {
    // Case-insensitive: the header shouts it, and shouting is fine.
    expect(prose).toMatch(/do not run\s+`?supabase db push/i);
    expect(prose).toMatch(/seed invented creative services|write rows/i);
  });

  it('is the only paste-able bundle the runbook points at', () => {
    /*
     * Two paste-able files is one too many: the second to be written is the
     * one that gets forgotten, and an operator who pastes the stale one
     * silently skips whatever was added after it. So the runbook must name
     * this file and must NOT still name the retired one.
     */
    const runbook = readFileSync('audits/NOWOPEN_APPLY_RUNBOOK.md', 'utf8');
    expect(runbook).toContain('APPLY_ALL_PENDING.sql');
    expect(runbook).not.toContain('APPLY_THESE_THREE');
  });
});
