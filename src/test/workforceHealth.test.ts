import { readFileSync, readdirSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

/**
 * Guards for the outage of 2026-09-01 to 2026-09-06.
 *
 * The AI workforce failed every fifteen minutes for five days — 481 ticks — and
 * nothing reported it. Two separate faults had to line up:
 *
 *   1. A second tick_workforce() was created by a CREATE OR REPLACE that
 *      changed the argument list, making the scheduled zero-argument call
 *      ambiguous.
 *   2. The admin panel showed `last_run` and not `last_status`, so a failing
 *      tick looked exactly like a working one.
 *
 * These assert both are closed. They read source rather than render, because
 * what failed was not behaviour under test — it was behaviour nobody looked at.
 */

const MIGRATIONS = 'supabase/migrations';
const panel = readFileSync('src/components/admin/WorkforcePanel.tsx', 'utf8');

describe('the workforce console reports working, not merely ticking', () => {
  it('shows when it last SUCCEEDED, not just when it last ticked', () => {
    expect(panel).toContain('last_success');
    expect(panel).toContain('healthy');
  });

  it('says out loud that it is broken, with the failure count and the reason', () => {
    expect(panel).toMatch(/The workforce is not running/);
    expect(panel).toContain('consecutive_failures');
    expect(panel).toContain('last_error');
  });

  it('takes the health verdict from the database rather than re-deciding it', () => {
    // "Is the workforce fine" is a definition. Two copies of it drift.
    expect(panel).toMatch(/cron\?\.healthy === true/);
  });
});

describe('workforce_cron_status supplies what the console needs', () => {
  const sql = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .map((f) => readFileSync(`${MIGRATIONS}/${f}`, 'utf8'))
    .join('\n');

  it('returns the health fields', () => {
    for (const field of ['last_success', 'last_failure', 'consecutive_failures', 'last_error', 'healthy']) {
      expect(sql, field).toContain(`'${field}'`);
    }
  });

  it('keeps the status function admin-only', () => {
    const fn = sql.slice(sql.lastIndexOf('CREATE OR REPLACE FUNCTION public.workforce_cron_status()'));
    expect(fn).toMatch(/IF NOT public\.is_admin\(\) THEN RAISE EXCEPTION/);
  });
});

describe('tick_workforce is callable with no arguments', () => {
  const sql = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .map((f) => readFileSync(`${MIGRATIONS}/${f}`, 'utf8'))
    .join('\n');

  it('drops the old zero-argument overload', () => {
    // Without this the scheduled `SELECT public.tick_workforce();` matches two
    // functions and fails as "not unique" — silently, forever.
    expect(sql).toMatch(/DROP FUNCTION IF EXISTS public\.tick_workforce\(\)/);
  });

  it('leaves exactly one definition with a defaulted argument', () => {
    expect(sql).toMatch(/FUNCTION public\.tick_workforce\(p_force boolean DEFAULT false\)/);
  });

  it('is still scheduled with a plain call', () => {
    expect(sql).toMatch(/SELECT public\.tick_workforce\(\);/);
  });
});

describe('the migration checker catches the overload trap', () => {
  it('knows how to explain it', () => {
    const checker = readFileSync('scripts/check-migrations.mjs', 'utf8');
    expect(checker).toContain('auditFunctionOverloads');
    expect(checker).toMatch(/not unique/);
    // An escape hatch has to exist, or the check gets deleted the first time
    // somebody wants a real overload.
    expect(checker).toMatch(/overload-ok/);
  });
});
