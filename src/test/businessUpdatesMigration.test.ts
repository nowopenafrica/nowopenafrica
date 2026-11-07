import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

import { UPDATE_TOPIC } from '../lib/businessUpdates';

/**
 * Structural guards on the Business Updates migrations. They run against
 * production by hand, so what keeps them safe is shape: re-runnable, no
 * comment that closes early, every SECURITY DEFINER function pinned to a
 * search_path, and the 24-hour gate written where nobody can edit it.
 */

const DIR = join(process.cwd(), 'supabase', 'migrations');
const A = join(DIR, '20261110010000_business_updates.sql');
const B = join(DIR, '20261110020000_business_update_alerts_reports.sql');
const files = [A, B].filter((f) => existsSync(f));
const read = (f: string) => readFileSync(f, 'utf8');

/** Block comments with their contents, honouring Postgres nesting. */
function blockComments(sql: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < sql.length) {
    if (sql.startsWith('--', i)) { i = sql.indexOf('\n', i); if (i < 0) break; continue; }
    if (sql.startsWith('$', i)) {
      const tag = /^\$[A-Za-z_]*\$/.exec(sql.slice(i))?.[0];
      if (tag) { const end = sql.indexOf(tag, i + tag.length); i = end < 0 ? sql.length : end + tag.length; continue; }
    }
    if (sql.startsWith("'", i)) { i = sql.indexOf("'", i + 1) + 1 || sql.length; continue; }
    if (sql.startsWith('/*', i)) {
      let depth = 0; const start = i;
      do {
        if (sql.startsWith('/*', i)) { depth++; i += 2; }
        else if (sql.startsWith('*/', i)) { depth--; i += 2; }
        else i++;
      } while (depth > 0 && i < sql.length);
      out.push(sql.slice(start, i));
      continue;
    }
    i++;
  }
  return out;
}

describe.each(files.map((f) => [f.split(/[\\/]/).pop()!, f]))('%s', (_name, file) => {
  const sql = read(file);

  it('has no nested comment markers in prose', () => {
    for (const c of blockComments(sql)) {
      const inner = c.slice(2, -2);
      expect(inner.includes('/*') || inner.includes('*/'), c.slice(0, 80)).toBe(false);
    }
  });

  it('pins search_path on every SECURITY DEFINER function', () => {
    const fns = sql.split(/CREATE OR REPLACE FUNCTION/i).slice(1);
    for (const fn of fns) {
      const head = fn.slice(0, fn.search(/AS \$/));
      if (/SECURITY DEFINER/i.test(head)) expect(head, head.slice(0, 60)).toMatch(/SET search_path = public/);
    }
  });

  it('drops every policy and trigger before creating it', () => {
    for (const m of sql.matchAll(/CREATE POLICY "([^"]+)"/g)) {
      expect(sql).toContain(`DROP POLICY IF EXISTS "${m[1]}"`);
    }
    for (const m of sql.matchAll(/CREATE TRIGGER (\w+)/g)) {
      expect(sql).toMatch(new RegExp(`DROP TRIGGER IF EXISTS ${m[1]}\\b`));
    }
  });

  it('guards on auth.role(), never current_user', () => {
    expect(sql).not.toMatch(/current_user/i);
  });
});

describe('migration A — the 24-hour gate', () => {
  it.skipIf(!existsSync(A))('makes expires_at a generated column', () => {
    const sql = read(A);
    expect(sql).toContain('GENERATED ALWAYS AS (public.business_update_expiry(published_at)) STORED');
    expect(sql).toMatch(/business_update_expiry\(p_published timestamptz\)[\s\S]*?IMMUTABLE[\s\S]*?p_published \+ interval '24 hours'/);
  });

  it.skipIf(!existsSync(A))('filters public reads strictly on expiry and moderation', () => {
    const sql = read(A);
    const policy = sql.slice(sql.indexOf('CREATE POLICY "Public reads active updates"'));
    const body = policy.slice(0, policy.indexOf(';'));
    expect(body).toContain('expires_at > now()');
    expect(body).toContain("moderation_status = 'ok'");
    expect(body).toContain('ended_at IS NULL');
  });

  it.skipIf(!existsSync(A))('keeps the bucket private', () => {
    expect(read(A)).toMatch(/'business-updates',\s*'business-updates',\s*false/);
  });
});

describe('migration B — alerts, dispatch, reports', () => {
  it.skipIf(!existsSync(B))('maps types to the same keep topics as the app', () => {
    const sql = read(B);
    const fn = sql.slice(sql.indexOf('FUNCTION public.business_update_topic'));
    const pairs = Object.fromEntries(
      [...fn.slice(0, fn.indexOf('$$;')).matchAll(/WHEN '(\w+)' THEN '(\w+)'/g)].map((m) => [m[1], m[2]]),
    );
    expect(pairs).toEqual(UPDATE_TOPIC);
  });

  it.skipIf(!existsSync(B))('schedules the alert job every 15 minutes', () => {
    expect(read(B)).toContain("cron.schedule('nowopen-update-alerts', '*/15 * * * *'");
  });

  it.skipIf(!existsSync(B))('keeps the sending functions away from web callers', () => {
    const sql = read(B);
    for (const fn of ['send_business_update_alert', 'dispatch_scheduled_update_alerts']) {
      expect(sql).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\([^)]*\\) FROM public, anon, authenticated`));
    }
  });
});

describe('the migrations exist', () => {
  it('has migration A', () => expect(existsSync(A)).toBe(true));
});
