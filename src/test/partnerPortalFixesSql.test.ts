import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

/**
 * Guards on the partner portal's final-review follow-up migration
 * (20261111030000_partner_portal_fixes.sql). Structure, not behaviour: the
 * behaviour is checks 19 to 22 in scripts/check-partner-portal.sql, run after
 * the migration is applied.
 *
 * The file replaces four functions of 20261111010000_partner_portal.sql. Each
 * replacement must keep that function's guards exactly, and must keep every
 * other line of its body: a follow-up that drops a check while fixing
 * another would undo the original migration silently.
 */

const DIR = join(process.cwd(), 'supabase', 'migrations');
const FIXES = '20261111030000_partner_portal_fixes.sql';
const ORIGINAL = '20261111010000_partner_portal.sql';
const read = (f: string) => (existsSync(join(DIR, f)) ? readFileSync(join(DIR, f), 'utf8') : '');
const RAW = read(FIXES);
const RAW_ORIGINAL = read(ORIGINAL);

/** The SQL with line comments removed (this file has no block comments). */
const code = (sql: string) =>
  sql
    .split('\n')
    .map((l) => {
      // Strip a trailing -- comment that is not inside a string literal.
      let quote = false;
      for (let i = 0; i < l.length; i += 1) {
        if (l[i] === "'") quote = !quote;
        if (!quote && l.startsWith('--', i)) return l.slice(0, i);
      }
      return l;
    })
    .join('\n');
const flat = (s: string) => s.replace(/\s+/g, ' ').trim();

function functions(sql: string): Map<string, string> {
  const out = new Map<string, string>();
  const re = /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.(\w+)[\s\S]*?AS\s+(\$\w*\$)[\s\S]*?\2/gi;
  for (const m of code(sql).matchAll(re)) out.set(m[1], flat(m[0]));
  return out;
}
const FIXED = functions(RAW);
const ORIG = functions(RAW_ORIGINAL);
const fn = (name: string) => {
  const body = FIXED.get(name);
  if (!body) throw new Error(`function public.${name} not found in ${FIXES}`);
  return body;
};

const REPLACED = [
  'submit_owner_verification',
  'owner_update_placement',
  'owner_record_availability',
  'admin_review_placement',
];

const REJECTED_MESSAGE =
  "Your media-owner account was not approved, so placements can''t be changed. Contact NowOpen.";

/** Every statement of the original body (split on ;) that the fix must still contain. */
function statements(body: string): string[] {
  return body
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

describe('partner portal fixes migration', () => {
  it('exists, sorts after both applied partner portal migrations, and is LF', () => {
    expect(RAW.length).toBeGreaterThan(0);
    const files = [ORIGINAL, '20261111020000_fix_trust_audit_array.sql', FIXES];
    expect([...files].sort()).toEqual(files);
    expect(RAW.includes('\r')).toBe(false);
  });

  it('replaces exactly the four functions, and nothing else', () => {
    expect([...FIXED.keys()].sort()).toEqual([...REPLACED].sort());
    const c = code(RAW);
    expect(c).not.toMatch(/\bCREATE\s+(TABLE|VIEW|POLICY|TRIGGER|INDEX)\b/i);
    expect(c).not.toMatch(/\b(ALTER|DROP)\s+(TABLE|VIEW|POLICY|TRIGGER|INDEX|FUNCTION)\b/i);
    expect(c).not.toMatch(/\bCREATE\s+FUNCTION\b/i);
    // Prose is line comments only.
    expect(RAW).not.toMatch(/\/\*/);
  });

  it('keeps each function header and guard exactly as the original', () => {
    for (const name of REPLACED) {
      const fixed = fn(name);
      const orig = ORIG.get(name)!;
      expect(orig, name).toBeTruthy();
      const header = (b: string) => b.slice(0, b.indexOf(' AS $'));
      expect(header(fixed), name).toBe(header(orig));
      expect(fixed, name).toMatch(/SECURITY DEFINER SET search_path = public AS/);
      expect(fixed, name).toMatch(/IF coalesce\(auth\.role\(\), ''\) IN \('anon', 'authenticated'\) AND NOT public\.(is_business_member|is_admin)\(/);
      expect(fixed, name).not.toMatch(/current_user/i);
    }
  });

  it('keeps every statement of the original bodies (only additions, bar the named changes)', () => {
    // The statements a fix deliberately rewrites, by function.
    const rewritten: Record<string, RegExp[]> = {
      submit_owner_verification: [],
      owner_update_placement: [
        /^DECLARE/, // v_verification added
        /^SELECT o\.business_id INTO v_business/, // now reads verification too
        /^RETURNING a\.\* INTO v_new/, // the price block follows, now with a cleared-price branch
        /^INSERT INTO public\.placement_field_source/,
        /^IF \(v_new\.rate_amount/,
      ],
      owner_record_availability: [/^DECLARE/, /^SELECT o\.business_id INTO v_business/],
      admin_review_placement: [/^DECLARE/, /^SELECT a\.lifecycle INTO v_lifecycle/, /^IF p_approve THEN/],
    };
    for (const name of REPLACED) {
      const fixed = fn(name);
      for (const stmt of statements(ORIG.get(name)!)) {
        if (rewritten[name].some((re) => re.test(stmt))) continue;
        expect(fixed.includes(stmt), `${name} lost: ${stmt.slice(0, 120)}`).toBe(true);
      }
    }
  });

  it('I1: approval follows the owner\'s current verification', () => {
    const body = fn('admin_review_placement');
    expect(body).toMatch(/SELECT a\.lifecycle, a\.owner_id INTO v_lifecycle, v_owner FROM public\.advertisements a WHERE a\.id = p_advert_id FOR UPDATE/);
    expect(body).toMatch(/SELECT o\.verification INTO v_verification FROM public\.media_owners o WHERE o\.id = v_owner/);
    expect(body).toMatch(/IF v_verification = 'verified' THEN PERFORM public\.set_placement_lifecycle\(p_advert_id, 'partner_verified'/);
    expect(body).toMatch(/ELSE PERFORM public\.set_placement_lifecycle\(p_advert_id, 'partner_supplied'/);
    expect(body).toMatch(/PERFORM public\.set_placement_lifecycle\(p_advert_id, 'rejected', p_reason\)/);
    expect(body).toMatch(/lifecycle IS DISTINCT FROM 'pending_review'/);
  });

  it('I1 ruling: approval is refused for a rejected owner; rejecting still works', () => {
    const body = fn('admin_review_placement');
    const refusal = body.indexOf("IF v_verification = 'rejected' THEN RAISE EXCEPTION 'This owner was not approved. Reject the placement instead.' USING errcode = '22023'");
    expect(refusal).toBeGreaterThan(body.indexOf('IF p_approve THEN'));
    expect(refusal).toBeLessThan(body.indexOf("set_placement_lifecycle(p_advert_id, 'partner_verified'"));
    // The refusal sits inside the approve branch: the reject branch is untouched.
    expect(refusal).toBeLessThan(body.indexOf("set_placement_lifecycle(p_advert_id, 'rejected', p_reason)"));
    expect(body).toMatch(/ELSE IF p_reason IS NULL OR btrim\(p_reason\) = '' THEN/);
  });

  it('I3: a rejected owner can neither edit nor confirm availability', () => {
    for (const name of ['owner_update_placement', 'owner_record_availability']) {
      const body = fn(name);
      expect(body, name).toMatch(/SELECT o\.business_id, o\.verification INTO v_business, v_verification FROM public\.media_owners o/);
      const guard = body.indexOf('AND NOT public.is_business_member(');
      const refusal = body.indexOf("IF v_verification = 'rejected' THEN RAISE EXCEPTION '" + REJECTED_MESSAGE + "'");
      expect(refusal, name).toBeGreaterThan(guard);
      expect(guard, name).toBeGreaterThan(0);
      // Refused before anything is written.
      const write = name === 'owner_update_placement'
        ? body.indexOf('UPDATE public.advertisements')
        : body.indexOf('INSERT INTO public.placement_availability');
      expect(refusal, name).toBeLessThan(write);
      expect(body.slice(refusal, refusal + 300), name).toMatch(/errcode = '42501'/);
    }
  });

  it('M4: resubmitting after a rejection needs a document uploaded after it', () => {
    const body = fn('submit_owner_verification');
    expect(body).toMatch(/IF v_verification = 'rejected' THEN SELECT max\(l\.created_at\) INTO v_rejected_at FROM public\.audit_log l/);
    expect(body).toMatch(/l\.action = 'media_owner\.rejected'/);
    expect(body).toMatch(/l\.action = 'media_owner\.verification' AND l\.detail ->> 'to' = 'rejected'/);
    expect(body).toMatch(/d\.uploaded_at > v_rejected_at/);
    expect(body).toContain("RAISE EXCEPTION 'Upload a new document before resubmitting.' USING errcode = '22023'");
    // Checked before the status moves.
    expect(body.indexOf('Upload a new document')).toBeLessThan(body.indexOf("SET verification = 'documents_submitted'"));
  });

  it('M16: a cleared price writes no pricing source and removes the old one', () => {
    const body = fn('owner_update_placement');
    expect(body).toMatch(
      /IF v_new\.rate_amount IS NULL AND v_new\.pricing IS NULL THEN DELETE FROM public\.placement_field_source s WHERE s\.advert_id = p_advert_id AND s\.field = 'pricing'; ELSE INSERT INTO public\.placement_field_source/,
    );
    // The change is still audited, outside the branch.
    expect(body).toMatch(/END IF; INSERT INTO public\.audit_log .*'placement\.owner_price'/);
    expect(body).toContain("(now() AT TIME ZONE 'Africa/Lagos')::date");
  });

  it('re-asserts the grants, never to anon', () => {
    const c = flat(code(RAW));
    for (const sig of [
      'submit_owner_verification(uuid)',
      'owner_update_placement(uuid, jsonb)',
      'owner_record_availability(uuid, text, date, date)',
      'admin_review_placement(uuid, boolean, text)',
    ]) {
      expect(c).toContain(`REVOKE ALL ON FUNCTION public.${sig} FROM PUBLIC, anon;`);
      expect(c).toContain(`GRANT EXECUTE ON FUNCTION public.${sig} TO authenticated, service_role;`);
    }
    expect(c).not.toMatch(/GRANT [^;]* TO [^;]*\banon\b/i);
  });

  it('business dates are the local day, never the UTC date', () => {
    expect(RAW).not.toMatch(/now\(\)\s*::\s*date/i);
    expect(RAW).not.toMatch(/\bcurrent_date\b/i);
  });
});
