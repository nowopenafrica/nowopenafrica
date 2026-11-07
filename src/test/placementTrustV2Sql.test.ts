import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

/**
 * Guards on the placement trust view, v2
 * (supabase/migrations/20261109020000_placement_trust_v2.sql).
 *
 * Structure only, as in placementTrustSql.test.ts: behaviour is checked by
 * scripts/check-placement-trust.sql after the migration is applied. Each
 * assertion is a way a placement could start reading "available" or naming
 * someone who never confirmed anything.
 */

const FILE = '20261109020000_placement_trust_v2.sql';
const RAW = readFileSync(join(process.cwd(), 'supabase', 'migrations', FILE), 'utf8');
const V1 = readFileSync(join(process.cwd(), 'supabase', 'migrations', '20261109010000_placement_trust.sql'), 'utf8');

/** The SQL with comments removed (block comments nest in Postgres). Same walk as placementTrustSql.test.ts. */
function code(sql: string): string {
  let out = '';
  let depth = 0;
  let line = false;
  let quote: string | null = null;
  for (let i = 0; i < sql.length; i += 1) {
    const two = sql.slice(i, i + 2);
    if (quote) { out += sql[i]; if (sql[i] === quote) quote = null; continue; }
    if (line) { if (sql[i] === '\n') { line = false; out += '\n'; } continue; }
    if (depth > 0) {
      if (two === '/*') { depth += 1; i += 1; continue; }
      if (two === '*/') { depth -= 1; i += 1; continue; }
      continue;
    }
    if (two === '/*') { depth = 1; i += 1; continue; }
    if (two === '--') { line = true; i += 1; continue; }
    if (sql[i] === "'" || sql[i] === '"') { quote = sql[i]; out += sql[i]; continue; }
    out += sql[i];
  }
  return out;
}

const SQL = code(RAW);
const flat = (s: string) => s.replace(/\s+/g, ' ');
const FLAT = flat(SQL);

function view(sql: string, name: string): string {
  const m = new RegExp(`CREATE\\s+OR\\s+REPLACE\\s+VIEW\\s+public\\.${name}\\b[\\s\\S]*?;`, 'i').exec(sql);
  if (!m) throw new Error(`view public.${name} not found`);
  return m[0];
}
const V = flat(view(SQL, 'placement_trust'));

/** The output column names of a view, in order: every `AS name` at the select list's top level. */
function columns(v: string): string[] {
  const select = v.slice(v.search(/\bSELECT\b/i), v.search(/\bFROM public\.advertisements a\b/i));
  return [...select.matchAll(/\bAS (\w+)\s*(?:,|$)/gi)].map((m) => m[1]);
}

describe('placement trust view v2', () => {
  it('only replaces the view and re-asserts its grants: nothing else', () => {
    const statements = SQL.split(';').map((s) => flat(s).trim()).filter(Boolean);
    expect(statements).toHaveLength(4);
    expect(statements[0]).toMatch(/^CREATE OR REPLACE VIEW public\.placement_trust AS SELECT/i);
    expect(statements[1]).toMatch(/^COMMENT ON VIEW public\.placement_trust IS/i);
    expect(statements[2]).toBe('REVOKE ALL ON public.placement_trust FROM PUBLIC, anon, authenticated');
    expect(statements[3]).toBe('GRANT SELECT ON public.placement_trust TO anon, authenticated');
    expect(SQL).not.toMatch(/\b(DROP|ALTER|INSERT|UPDATE|DELETE|TRUNCATE|CREATE\s+(TABLE|FUNCTION|TRIGGER|POLICY|INDEX))\b/i);
    expect(FLAT).not.toMatch(/GRANT (ALL|INSERT|UPDATE|DELETE)/i);
  });

  it('keeps every v1 column in v1 order, and only appends (CREATE OR REPLACE VIEW requires it)', () => {
    const v1 = columns(flat(view(code(V1), 'placement_trust')));
    const v2 = columns(V);
    expect(v1).toEqual([
      'advert_id', 'trust_label', 'availability', 'availability_confirmed_at',
      'availability_valid_until', 'period_to', 'owner_name', 'owner_website',
      'price_basis', 'price_as_of',
    ]);
    expect(v2.slice(0, v1.length)).toEqual(v1);
    expect(v2.slice(v1.length)).toEqual(['period_from', 'confirmed_by_name', 'confirmation_method']);
  });

  it('still hides rejected and archived placements', () => {
    expect(V).toMatch(/WHERE a\.lifecycle NOT IN \('rejected', ?'archived'\)\s*;?$/i);
  });

  it('I1: names only the owner the confirmation itself names', () => {
    // A second, separate join to media_owners, on the confirmation's owner.
    expect(V).toMatch(/LEFT JOIN public\.media_owners cb ON cb\.id = c\.confirmed_by_owner/i);
    expect(V).toMatch(/LEFT JOIN public\.media_owners o ON o\.id = a\.owner_id/i);
    expect(V).toMatch(/cb\.name END AS confirmed_by_name/i);
    expect(V).toMatch(/c\.method END AS confirmation_method/i);
    // The confirmation's owner is read in the lateral, latest first.
    expect(V).toMatch(/SELECT pa\.status, pa\.confirmed_at, pa\.valid_until, pa\.period_from, pa\.period_to, pa\.confirmed_by_owner, pa\.method FROM public\.placement_availability pa WHERE pa\.advert_id = a\.id ORDER BY pa\.confirmed_at DESC, pa\.created_at DESC LIMIT 1/i);
    // confirmed_by_name never comes from the linked owner.
    expect(V).not.toMatch(/o\.name[^,]*AS confirmed_by_name/i);
  });

  it('I2: today is the Lagos calendar day, never the UTC date', () => {
    expect(V).toMatch(/\(now\(\) AT TIME ZONE 'Africa\/Lagos'\)::date AS today/i);
    expect(SQL).not.toMatch(/now\(\)\s*::\s*date/i);
    expect(SQL).not.toMatch(/\bcurrent_date\b/i);
    expect(SQL).not.toMatch(/AT\s+TIME\s+ZONE\s+'UTC'/i);
  });

  it('I2: availability reads the period against today', () => {
    const state = /CROSS JOIN LATERAL \( SELECT CASE (.*?) END AS availability \) s/i.exec(V);
    expect(state, 'availability lateral').not.toBeNull();
    const body = state![1];
    // Lapsed confirmation, and a period that has ended, both require confirmation first.
    expect(body).toMatch(/^WHEN c\.valid_until IS NULL OR c\.valid_until <= now\(\) THEN 'requires_confirmation'/i);
    expect(body).toMatch(/WHEN c\.period_to IS NOT NULL AND c\.period_to < d\.today THEN 'requires_confirmation'/i);
    // Available now only once the period has started.
    expect(body).toMatch(/WHEN c\.status = 'available' AND c\.period_from <= d\.today THEN 'confirmed_available'/i);
    expect(body).toMatch(/WHEN c\.status = 'available' AND c\.period_from > d\.today THEN 'available_from'/i);
    expect(body).toMatch(/WHEN c\.status IN \('booked', 'unavailable', 'maintenance'\) THEN c\.status/i);
    expect(body).toMatch(/ELSE 'requires_confirmation'$/i);
    // The order matters: the lapse checks come before any status branch.
    expect(body.indexOf('c.period_to < d.today')).toBeLessThan(body.indexOf("'confirmed_available'"));
    expect(body.indexOf('c.valid_until <= now()')).toBeLessThan(body.indexOf('c.period_to < d.today'));
  });

  it('I2: confirmation detail is shown only while the statement stands', () => {
    for (const [expr, col] of [
      ['c.confirmed_at', 'availability_confirmed_at'],
      ['c.valid_until', 'availability_valid_until'],
      ['c.period_to', 'period_to'],
      ['c.period_from', 'period_from'],
      ['c.method', 'confirmation_method'],
    ]) {
      expect(V).toMatch(new RegExp(`CASE WHEN s\\.availability <> 'requires_confirmation' THEN ${expr.replace('.', '\\.')} END AS ${col}\\b`, 'i'));
    }
    expect(V).toMatch(/CASE WHEN s\.availability <> 'requires_confirmation' AND cb\.verification <> 'rejected' THEN cb\.name END AS confirmed_by_name/i);
  });

  it('M6: price_basis is NULL without a pricing source row (no coalesce to a rate card)', () => {
    expect(V).toMatch(/fs\.basis AS price_basis/i);
    expect(V).not.toMatch(/coalesce\(fs\.basis/i);
    expect(V).toMatch(/LEFT JOIN public\.placement_field_source fs ON fs\.advert_id = a\.id AND fs\.field = 'pricing'/i);
  });

  it("M7: a rejected owner's name and website are never public", () => {
    expect(V).toMatch(/CASE WHEN o\.verification <> 'rejected' THEN o\.name END AS owner_name/i);
    expect(V).toMatch(/CASE WHEN o\.verification <> 'rejected' THEN o\.website END AS owner_website/i);
  });

  it('exposes no contacts or notes', () => {
    const v = view(SQL, 'placement_trust');
    expect(v).not.toMatch(/media_owner_contacts/i);
    expect(v).not.toMatch(/\bnote\b/i);
    expect(v).not.toMatch(/verification_note/i);
    expect(v).not.toMatch(/source_url|\bvalue\b|found_at/i);
  });

  it('revokes ALL before granting SELECT back, after the view', () => {
    const created = FLAT.search(/CREATE OR REPLACE VIEW public\.placement_trust\b/i);
    const revoke = FLAT.search(/REVOKE ALL ON public\.placement_trust FROM PUBLIC, anon, authenticated/i);
    const grant = FLAT.search(/GRANT SELECT ON public\.placement_trust TO anon, authenticated/i);
    expect(created).toBeGreaterThanOrEqual(0);
    expect(revoke).toBeGreaterThan(created);
    expect(grant).toBeGreaterThan(revoke);
  });

  it('stays a definer view as v1 was (security_invoker would hide the private tables from anon)', () => {
    expect(V).not.toMatch(/security_invoker/i);
  });

  it('is written with line comments only and explains itself', () => {
    expect(RAW).not.toMatch(/\/\*|\*\//);
    const header = RAW.split('\n').slice(0, 40).join('\n');
    expect(header).toMatch(/^-- /);
    for (const word of [/WHAT CHANGED/, /WHY/, /I1/, /I2/, /M6/, /M7/, /idempotent/i]) expect(header).toMatch(word);
  });
});
