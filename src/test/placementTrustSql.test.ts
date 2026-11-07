import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { ADVERT_CATEGORY_GROUPS } from '../data/advertCategories';

/**
 * Guards on the placement trust model's SQL.
 *
 * These assert the STRUCTURE of the migration, not its behaviour. The
 * behaviour is checked against the database when the migration is applied
 * (Task 2 of the plan). What a test can do from here is stop the guarantees
 * being quietly removed later by someone who did not know why they were
 * there: each assertion is a way an advertising placement could start
 * reading "verified" or "available" without anybody having checked.
 */

const FILE = '20261109010000_placement_trust.sql';
const RAW = readFileSync(join(process.cwd(), 'supabase', 'migrations', FILE), 'utf8');

/**
 * The SQL with its prose removed. Copied from serviceCatalogueSql.test.ts.
 *
 * Every negative assertion runs against this rather than the raw file: the
 * migration explains at length why it never touches rights_holder, so a
 * search of the raw file would fail on the explanation of the rule it checks.
 * Postgres block comments NEST, hence the depth counter.
 */
function code(sql: string): string {
  let out = '';
  let depth = 0;
  let line = false;
  let quote: string | null = null;

  for (let i = 0; i < sql.length; i += 1) {
    const two = sql.slice(i, i + 2);

    if (quote) {
      out += sql[i];
      if (sql[i] === quote) quote = null;
      continue;
    }
    if (line) {
      if (sql[i] === '\n') { line = false; out += '\n'; }
      continue;
    }
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

/** Every CREATE FUNCTION statement, from its header to the closing dollar tag. */
function functions(): { name: string; body: string }[] {
  const out: { name: string; body: string }[] = [];
  const re = /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.(\w+)[\s\S]*?AS\s+(\$\w*\$)[\s\S]*?\2/gi;
  for (const m of SQL.matchAll(re)) out.push({ name: m[1], body: m[0] });
  return out;
}
const fn = (name: string) => {
  const found = functions().find((f) => f.name === name);
  if (!found) throw new Error(`function public.${name} not found`);
  return found.body;
};

/** The SELECT body of a view, up to the statement end. */
function view(name: string): string {
  const m = new RegExp(`CREATE\\s+OR\\s+REPLACE\\s+VIEW\\s+public\\.${name}\\b[\\s\\S]*?;`, 'i').exec(SQL);
  if (!m) throw new Error(`view public.${name} not found`);
  return m[0];
}

const TABLES = [
  'media_owners',
  'media_owner_contacts',
  'placement_availability',
  'placement_freshness',
  'placement_field_source',
];

describe('placement trust migration', () => {
  it('creates the owner tables', () => {
    expect(FLAT).toMatch(/CREATE TABLE IF NOT EXISTS public\.media_owners \(/i);
    expect(FLAT).toMatch(
      /verification text NOT NULL DEFAULT 'unverified'[^,]*CHECK \(verification IN \('unverified', ?'documents_submitted', ?'verified', ?'rejected'\)\)/i,
    );
    expect(FLAT).toMatch(
      /relationship text NOT NULL DEFAULT 'prospect'[^,]*CHECK \(relationship IN \('prospect', ?'contacted', ?'onboarding', ?'active', ?'paused', ?'declined'\)\)/i,
    );
    expect(FLAT).toMatch(/CHECK \(verification <> 'verified' OR verified_at IS NOT NULL\)/i);
    // verified_by stays ON DELETE SET NULL, so deleting an admin never fails.
    expect(FLAT).toMatch(/verified_by uuid REFERENCES public\.users\(id\) ON DELETE SET NULL/i);
  });

  it('stamps who verified and when, ignoring the client', () => {
    const stamp = flat(fn('media_owners_before_write'));
    expect(stamp).toMatch(/NEW\.verification = 'verified' AND \(TG_OP = 'INSERT' OR OLD\.verification IS DISTINCT FROM 'verified'\)/i);
    expect(stamp).toMatch(/NEW\.verified_by := auth\.uid\(\)/i);
    expect(stamp).toMatch(/NEW\.verified_at := now\(\)/i);
    expect(stamp).toMatch(/NEW\.verified_by := OLD\.verified_by/i);
    expect(stamp).toMatch(/NEW\.updated_at := now\(\)/i);
    expect(FLAT).toMatch(
      /CREATE TRIGGER \w+ BEFORE INSERT OR UPDATE ON public\.media_owners FOR EACH ROW EXECUTE FUNCTION public\.media_owners_before_write\(\)/i,
    );
  });

  it('contacts carry their source', () => {
    expect(FLAT).toMatch(/CREATE TABLE IF NOT EXISTS public\.media_owner_contacts \(/i);
    expect(FLAT).toMatch(/source_url text NOT NULL/i);
    expect(FLAT).toMatch(/found_at timestamptz NOT NULL/i);
  });

  it('extends advertisements without renaming', () => {
    for (const col of ['owner_id', 'owner_role', 'lifecycle', 'country_code']) {
      expect(FLAT).toMatch(new RegExp(`ADD COLUMN IF NOT EXISTS ${col}\\b`, 'i'));
    }
    const lifecycle = /CHECK \(lifecycle IN \(([^)]*)\)\)/i.exec(FLAT);
    expect(lifecycle).not.toBeNull();
    const values = lifecycle![1].split(',').map((v) => v.trim().replace(/'/g, ''));
    expect(values).toEqual([
      'discovered', 'imported', 'partner_supplied', 'partner_verified', 'rejected', 'archived',
    ]);
    expect(SQL).not.toMatch(/\bRENAME\b/i);
    expect(SQL).not.toMatch(/DROP\s+COLUMN/i);
  });

  it('only an admin changes lifecycle, owner_id or owner_role', () => {
    const guard = flat(fn('placement_trust_guard'));
    expect(guard).toMatch(
      /v_web_non_admin boolean := coalesce\(auth\.role\(\), ''\) IN \('anon', 'authenticated'\) AND NOT public\.is_admin\(\)/i,
    );
    const block = /IF v_web_non_admin THEN(.*?)END IF; END IF;/i.exec(guard);
    expect(block).not.toBeNull();
    expect(block![1]).toMatch(
      /IF NEW\.owner_id IS NOT NULL OR NEW\.owner_role IS NOT NULL OR NEW\.lifecycle <> 'imported' THEN RAISE EXCEPTION/i,
    );
    expect(block![1]).toMatch(
      /ELSIF \(NEW\.lifecycle, NEW\.owner_id, NEW\.owner_role\) IS DISTINCT FROM \(OLD\.lifecycle, OLD\.owner_id, OLD\.owner_role\) THEN RAISE EXCEPTION/i,
    );
  });

  it('partner_verified needs a verified owner', () => {
    const guard = fn('placement_trust_guard');
    expect(guard).toMatch(/NEW\.lifecycle\s*=\s*'partner_verified'/i);
    expect(guard).toMatch(/FROM public\.media_owners/i);
    expect(guard).toMatch(/verification/i);
    expect(guard).toMatch(/RAISE EXCEPTION/i);
    expect(FLAT).toMatch(
      /CREATE TRIGGER \w+ BEFORE INSERT OR UPDATE ON public\.advertisements FOR EACH ROW EXECUTE FUNCTION public\.placement_trust_guard\(\)/i,
    );

    const downgrade = fn('media_owner_after_write');
    expect(flat(downgrade)).toMatch(/OLD\.verification = 'verified' AND NEW\.verification <> 'verified'/i);
    expect(flat(downgrade)).toMatch(
      /UPDATE public\.advertisements SET lifecycle = 'partner_supplied' WHERE owner_id = NEW\.id AND lifecycle = 'partner_verified'/i,
    );
    expect(FLAT).toMatch(
      /CREATE TRIGGER \w+ AFTER INSERT OR UPDATE ON public\.media_owners FOR EACH ROW EXECUTE FUNCTION public\.media_owner_after_write\(\)/i,
    );
  });

  it('confirmations are append-only', () => {
    const policies = [...FLAT.matchAll(/CREATE POLICY "[^"]+" ON public\.placement_availability ([^;]*);/gi)]
      .map((m) => m[1]);
    expect(policies.length).toBeGreaterThan(0);
    for (const p of policies) {
      if (/FOR (UPDATE|DELETE|ALL)/i.test(p)) expect(p).toMatch(/public\.is_admin\(\)/i);
    }
    expect(policies.some((p) => /FOR (DELETE|ALL)/i.test(p))).toBe(false);

    const freeze = flat(fn('placement_availability_freeze'));
    for (const col of ['status', 'valid_until', 'id', 'advert_id', 'recorded_by', 'confirmed_at', 'created_at']) {
      expect(freeze).toMatch(new RegExp(`NEW\\.${col} IS DISTINCT FROM OLD\\.${col}\\b`, 'i'));
    }
    expect(freeze).toMatch(/RAISE EXCEPTION/i);
    expect(freeze).toMatch(
      /IF NEW\.note IS DISTINCT FROM OLD\.note AND coalesce\(auth\.role\(\), ''\) IN \('anon', 'authenticated'\) AND NOT public\.is_admin\(\) THEN RAISE EXCEPTION/i,
    );
    expect(FLAT).toMatch(
      /CREATE TRIGGER \w+ BEFORE UPDATE ON public\.placement_availability FOR EACH ROW EXECUTE FUNCTION public\.placement_availability_freeze\(\)/i,
    );
  });

  it('sets valid_until from the medium freshness window', () => {
    const stamp = flat(fn('placement_availability_stamp'));
    expect(stamp).toMatch(/NEW\.valid_until := NEW\.confirmed_at \+ make_interval\(days => coalesce\(v_days, 7\)\)/i);
    expect(stamp).toMatch(/public\.placement_medium_group\(/i);
    expect(FLAT).toMatch(
      /CREATE TRIGGER \w+ BEFORE INSERT ON public\.placement_availability FOR EACH ROW EXECUTE FUNCTION public\.placement_availability_stamp\(\)/i,
    );
  });

  it('mirrors ADVERT_CATEGORY_GROUPS in placement_medium_group', () => {
    // Imported, not copied: a category added in TS without the SQL fails here.
    const groups = flat(fn('placement_medium_group'));
    const whens = [...groups.matchAll(/WHEN category IN \(([^)]*)\) THEN '(\w+)'/gi)];
    const sqlMap = new Map<string, string>();
    for (const [, list, key] of whens) {
      for (const c of list.split(',')) sqlMap.set(c.trim().replace(/^'|'$/g, ''), key);
    }
    expect(ADVERT_CATEGORY_GROUPS.length).toBeGreaterThan(0);
    for (const g of ADVERT_CATEGORY_GROUPS) {
      for (const member of g.members) expect(sqlMap.get(member), member).toBe(g.key);
    }
    const tsCount = ADVERT_CATEGORY_GROUPS.reduce((n, g) => n + g.members.length, 0);
    expect(sqlMap.size).toBe(tsCount);
    expect(new Set(whens.map((w) => w[2]))).toEqual(new Set(ADVERT_CATEGORY_GROUPS.map((g) => g.key)));
    expect(groups).toMatch(/ELSE NULL/i);
  });

  it('freshness seeded', () => {
    expect(FLAT).toMatch(
      /\('outdoor', ?30\), ?\('transit', ?30\), ?\('digital', ?14\), ?\('broadcast', ?7\), ?\('print', ?7\), ?\('online', ?7\)/i,
    );
  });

  it('trust view hides the dead', () => {
    const v = flat(view('placement_trust'));
    expect(v).toMatch(/WHERE a\.lifecycle NOT IN \('rejected', ?'archived'\)/i);
    expect(v).toMatch(/valid_until > now\(\)/i);
    for (const col of [
      'advert_id', 'trust_label', 'availability', 'availability_confirmed_at',
      'availability_valid_until', 'period_to', 'owner_name', 'owner_website',
      'price_basis', 'price_as_of',
    ]) {
      expect(v).toMatch(new RegExp(`AS ${col}\\b`, 'i'));
    }
    expect(v).toContain("'requires_confirmation'");
    expect(v).toContain("'confirmed_available'");
  });

  it('public views expose no contacts', () => {
    for (const name of ['placement_trust', 'media_owners_public']) {
      const v = view(name);
      expect(v).not.toMatch(/media_owner_contacts/i);
      expect(v).not.toMatch(/\bnote\b/i);
      expect(v).not.toMatch(/verification_note/i);
      expect(v).not.toMatch(/source_url|\bvalue\b|found_at/i);
    }
  });

  it('public views revoke ALL before granting SELECT back', () => {
    // Supabase grants ALL on new relations to anon; media_owners_public is
    // auto-updatable, so without the REVOKE anon could write media_owners.
    for (const v of ['placement_trust', 'media_owners_public']) {
      const created = FLAT.search(new RegExp(`CREATE OR REPLACE VIEW public\\.${v}\\b`, 'i'));
      const revoke = FLAT.search(new RegExp(`REVOKE ALL ON public\\.${v} FROM PUBLIC, anon, authenticated`, 'i'));
      const grant = FLAT.search(new RegExp(`GRANT SELECT ON public\\.${v} TO anon, authenticated`, 'i'));
      expect(created, `${v} view`).toBeGreaterThanOrEqual(0);
      expect(revoke, `${v} REVOKE`).toBeGreaterThan(created);
      expect(grant, `${v} GRANT`).toBeGreaterThan(revoke);
      expect(FLAT).not.toMatch(new RegExp(`GRANT (ALL|INSERT|UPDATE|DELETE)[^;]* ON public\\.${v}\\b`, 'i'));
    }
  });

  it('media_owners_public lists only live, non-rejected owners', () => {
    const v = flat(view('media_owners_public'));
    expect(v).toMatch(/WHERE o\.verification <> 'rejected'/i);
    expect(v).toMatch(
      /AND EXISTS \( SELECT 1 FROM public\.advertisements a WHERE a\.owner_id = o\.id AND a\.lifecycle NOT IN \('rejected', ?'archived'\) \)/i,
    );
  });

  it('the expiring list is admin-only and computed at read', () => {
    const v = flat(view('placement_confirmations_expiring'));
    expect(v).toMatch(/valid_until > now\(\)/i);
    expect(v).toMatch(/valid_until <= now\(\) \+ interval '3 days'/i);
    expect(v).toMatch(/public\.is_admin\(\)/i);
    expect(FLAT).toMatch(/REVOKE ALL ON public\.placement_confirmations_expiring FROM PUBLIC, anon, authenticated/i);
    expect(FLAT).not.toMatch(/GRANT SELECT ON public\.placement_confirmations_expiring TO anon/i);
    expect(SQL).not.toMatch(/cron\.schedule/i);
  });

  it('RLS on every new table', () => {
    for (const t of TABLES) {
      expect(FLAT).toMatch(new RegExp(`ALTER TABLE public\\.${t} ENABLE ROW LEVEL SECURITY`, 'i'));
    }
    const policies = [...FLAT.matchAll(/CREATE POLICY "([^"]+)" ON public\.(\w+) ([^;]*);/gi)];
    const admin = policies.filter((m) => /admin/i.test(m[1]));
    expect(admin.length).toBeGreaterThanOrEqual(TABLES.length);
    for (const m of admin) expect(m[3]).toMatch(/public\.is_admin\(\)/i);
  });

  it('audited', () => {
    const audit = (name: string) => flat(fn(name));
    expect(audit('placement_trust_audit')).toMatch(/INSERT INTO public\.audit_log/i);
    expect(audit('placement_trust_audit')).toContain("'placement.lifecycle'");
    expect(audit('placement_trust_audit')).toContain("'placement.owner_link'");
    expect(audit('media_owner_after_write')).toMatch(/INSERT INTO public\.audit_log/i);
    expect(audit('media_owner_after_write')).toContain("'media_owner.verification'");
    expect(audit('placement_availability_audit')).toMatch(/INSERT INTO public\.audit_log/i);
    expect(audit('placement_availability_audit')).toContain("'placement.confirmation'");
    expect(FLAT).toMatch(/AFTER INSERT ON public\.placement_availability FOR EACH ROW EXECUTE FUNCTION public\.placement_availability_audit\(\)/i);
    expect(FLAT).toMatch(/AFTER INSERT OR UPDATE ON public\.advertisements FOR EACH ROW EXECUTE FUNCTION public\.placement_trust_audit\(\)/i);
  });

  it('a non-admin edit demotes a verified field source, audited', () => {
    const audit = flat(fn('placement_trust_audit'));
    const branch = /IF v_web_non_admin THEN(.*?)END IF; END IF;/i.exec(audit);
    expect(branch).not.toBeNull();
    for (const col of ['pricing', 'image_url', 'dimensions']) {
      expect(branch![1]).toContain(`IF NEW.${col} IS DISTINCT FROM OLD.${col} THEN v_fields := v_fields || '${col}'`);
    }
    expect(branch![1]).toMatch(/OLD\.audience_note, OLD\.estimated_daily_traffic\) THEN v_fields := v_fields \|\| 'audience'/i);
    expect(audit).toMatch(
      /UPDATE public\.placement_field_source s SET basis = 'partner_supplied', as_of = \(now\(\) AT TIME ZONE 'Africa\/Lagos'\)::date WHERE s\.advert_id = NEW\.id AND s\.basis = 'verified' AND s\.field = ANY \(v_fields\)/i,
    );
    expect(audit).toContain("'placement.field_source_downgrade'");
  });

  it('business dates are the local day, never the UTC date', () => {
    // Local-day rule: "today" is never the UTC date. Dates come from
    // (now() AT TIME ZONE 'Africa/Lagos')::date; timestamptz stays now().
    expect(SQL).not.toMatch(/now\(\)\s*::\s*date/i);
    expect(SQL).not.toMatch(/\bcurrent_date\b/i);
    expect(SQL).not.toMatch(/now\(\)\s+AT\s+TIME\s+ZONE\s+'UTC'/i);
    expect(FLAT).toMatch(/as_of = \(now\(\) AT TIME ZONE 'Africa\/Lagos'\)::date/i);
  });

  it('touches updated_at on field sources and freshness', () => {
    expect(flat(fn('placement_touch_updated_at'))).toMatch(/NEW\.updated_at := now\(\)/i);
    for (const t of ['placement_field_source', 'placement_freshness']) {
      expect(FLAT).toMatch(new RegExp(
        `BEFORE UPDATE ON public\\.${t} FOR EACH ROW EXECUTE FUNCTION public\\.placement_touch_updated_at\\(\\)`, 'i'));
    }
  });

  it('set_placement_lifecycle: admin-only, reason required, one audit row', () => {
    const rpc = flat(fn('set_placement_lifecycle'));
    expect(rpc).toMatch(/public\.set_placement_lifecycle\(p_advert_id uuid, p_lifecycle text, p_reason text\)/i);
    expect(rpc).toMatch(/SECURITY DEFINER SET search_path = public/i);
    expect(rpc).toMatch(
      /IF coalesce\(auth\.role\(\), ''\) IN \('anon', 'authenticated'\) AND NOT public\.is_admin\(\) THEN RAISE EXCEPTION/i,
    );
    expect(rpc).toMatch(/IF p_reason IS NULL OR btrim\(p_reason\) = '' THEN RAISE EXCEPTION/i);
    expect(rpc).toMatch(/set_config\('nowopen\.lifecycle_reason', btrim\(p_reason\), true\)/i);
    expect(rpc).toMatch(/UPDATE public\.advertisements SET lifecycle = p_lifecycle WHERE id = p_advert_id/i);
    // The audit row comes from placement_trust_audit, so there is exactly one,
    // and it carries the reason.
    expect(rpc).not.toMatch(/INSERT INTO public\.audit_log/i);
    expect(flat(fn('placement_trust_audit'))).toMatch(
      /'reason', nullif\(current_setting\('nowopen\.lifecycle_reason', true\), ''\)/i,
    );
    expect(FLAT).toMatch(/REVOKE ALL ON FUNCTION public\.set_placement_lifecycle\(uuid, text, text\) FROM PUBLIC, anon/i);
  });

  it('definer functions are guarded', () => {
    const definers = functions().filter((f) => /SECURITY\s+DEFINER/i.test(f.body));
    expect(definers.length).toBeGreaterThanOrEqual(4);
    for (const f of definers) {
      expect(f.body, f.name).toMatch(/SET\s+search_path\s*=\s*public/i);
      expect(f.body, f.name).toMatch(/auth\.role\(\)/i);
      expect(f.body, f.name).not.toMatch(/current_user/i);
    }
  });

  it('backfills the 97 honestly', () => {
    // Only rows that need a change: never rewrites the 97 on apply or re-run.
    expect(FLAT).toMatch(/UPDATE public\.advertisements SET lifecycle = 'imported' WHERE lifecycle IS NULL;/i);
    expect(FLAT).not.toMatch(/SET lifecycle = 'imported' WHERE[^;]*lifecycle = 'imported'/i);
    expect(FLAT).toMatch(/SET country_code = m\.iso FROM[^;]*WHERE a\.country_code IS NULL/i);

    // country_code: the text after the LAST comma, mapped by name.
    expect(FLAT).toMatch(/SET country_code = m\.iso/i);
    expect(FLAT).toMatch(/regexp_replace\(a\.location, '\^\.\*,', ''\)/i);
    const pairs: [string, string][] = [
      ['nigeria', 'NG'], ['ghana', 'GH'], ['kenya', 'KE'], ['south africa', 'ZA'],
      ['egypt', 'EG'], ['tanzania', 'TZ'], ['senegal', 'SN'], ['cameroon', 'CM'],
      ['mozambique', 'MZ'], ['zimbabwe', 'ZW'], ['botswana', 'BW'], ['algeria', 'DZ'],
      ['ethiopia', 'ET'], ['morocco', 'MA'], ['namibia', 'NA'], ['rwanda', 'RW'],
      ['tunisia', 'TN'], ['uganda', 'UG'], ['zambia', 'ZM'], ['dr congo', 'CD'],
      ['côte d\'\'ivoire', 'CI'], ['ivory coast', 'CI'],
    ];
    for (const [name, iso] of pairs) expect(SQL).toContain(`('${name}', '${iso}')`);

    expect(FLAT).toMatch(
      /INSERT INTO public\.placement_field_source \(advert_id, field, basis, source_label, as_of\) SELECT a\.id, 'pricing', 'source_listed', 'published rate card'/i,
    );
    // "Priced" = pricing > 0, as isPriced in src/lib/promote/mix.ts.
    expect(FLAT).toMatch(/WHERE a\.pricing > 0 ON CONFLICT \(advert_id, field\) DO NOTHING/i);

    expect(FLAT).not.toMatch(/UPDATE [^;]*rights_holder/i);
  });

  it('no prose terminator', () => {
    // The same walk as scripts/check-migrations.mjs auditCommentNesting:
    // a block comment must never nest and must end at whitespace.
    let depth = 0;
    for (let i = 0; i < RAW.length; i += 1) {
      if (depth === 0) {
        if (RAW.startsWith('--', i)) { const nl = RAW.indexOf('\n', i); i = nl < 0 ? RAW.length : nl; continue; }
        if (RAW[i] === "'") { let j = i + 1; while (j < RAW.length) { if (RAW[j] === "'" && RAW[j + 1] === "'") { j += 2; continue; } if (RAW[j] === "'") break; j += 1; } i = j; continue; }
        const dollar = /^\$[A-Za-z_]*\$/.exec(RAW.slice(i, i + 40));
        if (dollar) { const close = RAW.indexOf(dollar[0], i + dollar[0].length); i = close < 0 ? RAW.length : close + dollar[0].length - 1; continue; }
        if (RAW.startsWith('*/', i)) throw new Error(`stray comment terminator at ${i}`);
        if (RAW.startsWith('/*', i)) { depth = 1; i += 1; }
        continue;
      }
      expect(RAW.startsWith('/*', i), 'nested block comment').toBe(false);
      if (RAW.startsWith('*/', i)) {
        depth -= 1; i += 1;
        expect(/\s|$/.test(RAW[i + 1] ?? ''), 'comment ends mid-sentence').toBe(true);
      }
    }
    expect(depth).toBe(0);
  });
});
