import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

/**
 * Guards on the partner portal migration's SQL.
 *
 * Structure, not behaviour: the behaviour is checked against the database
 * when the controller applies the migration (Task 2, scripts/check-partner-
 * portal.sql). What a test can do from here is stop a guarantee being quietly
 * removed later: each assertion is a way a media owner could publish, verify
 * or edit something without the database having checked who they are.
 */

const FILE = '20261111010000_partner_portal.sql';
const PATH = join(process.cwd(), 'supabase', 'migrations', FILE);
const RAW = existsSync(PATH) ? readFileSync(PATH, 'utf8') : '';

/**
 * The SQL with its prose removed. Copied from placementTrustSql.test.ts.
 * Negative assertions run against this, so the migration may explain a rule
 * without failing the test of it. Postgres block comments NEST.
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
  return flat(found.body);
};

function view(name: string): string {
  const m = new RegExp(`CREATE\\s+OR\\s+REPLACE\\s+VIEW\\s+public\\.${name}\\b[\\s\\S]*?;`, 'i').exec(SQL);
  if (!m) throw new Error(`view public.${name} not found`);
  return flat(m[0]);
}

const OWNER_RPCS = [
  'enable_media_owner',
  'submit_owner_verification',
  'owner_create_placement',
  'owner_update_placement',
  'owner_record_availability',
  'owner_claim_placement',
  'owner_verification_reason',
  'get_my_media_owner',
];
const ADMIN_RPCS = ['admin_review_placement', 'admin_decide_claim', 'admin_reject_owner'];

const WEB_GUARD = /coalesce\(auth\.role\(\), ''\) IN \('anon', 'authenticated'\)/i;

describe('partner portal migration', () => {
  it('exists and sorts after the business update alerts', () => {
    expect(RAW.length).toBeGreaterThan(0);
    expect(FILE > '20261110020000_business_update_alerts_reports.sql').toBe(true);
    expect(RAW).not.toContain('\r');
  });

  it('creates the documents, claims and imports tables with their checks', () => {
    expect(FLAT).toMatch(/CREATE TABLE IF NOT EXISTS public\.media_owner_documents \(/i);
    expect(FLAT).toMatch(/owner_id uuid NOT NULL REFERENCES public\.media_owners\(id\)/i);
    expect(FLAT).toMatch(
      /kind text NOT NULL CHECK \(kind IN \('registration', 'signage_permit', 'rate_card', 'authorisation_letter'\)\)/i,
    );
    expect(FLAT).toMatch(/storage_path text NOT NULL/i);
    // A document row can only point inside its own owner's folder.
    expect(FLAT).toMatch(/CHECK \(storage_path LIKE 'media-owners\/' \|\| owner_id::text \|\| '\/%'\)/i);

    expect(FLAT).toMatch(/CREATE TABLE IF NOT EXISTS public\.placement_claims \(/i);
    expect(FLAT).toMatch(/advert_id uuid NOT NULL REFERENCES public\.advertisements\(id\)/i);
    expect(FLAT).toMatch(/role text NOT NULL CHECK \(role IN \('owner', 'authorised_representative'\)\)/i);
    expect(FLAT).toMatch(/statement text NOT NULL/i);
    expect(FLAT).toMatch(
      /status text NOT NULL DEFAULT 'pending' CHECK \(status IN \('pending', 'approved', 'rejected'\)\)/i,
    );
    expect(FLAT).toMatch(/CHECK \(status <> 'rejected' OR btrim\(coalesce\(reason, ''\)\) <> ''\)/i);

    expect(FLAT).toMatch(/CREATE TABLE IF NOT EXISTS public\.placement_imports \(/i);
    for (const col of ['rows_total', 'rows_created', 'rows_claimed', 'rows_failed']) {
      expect(FLAT).toMatch(new RegExp(`${col} integer NOT NULL DEFAULT 0 CHECK \\(${col} >= 0\\)`, 'i'));
    }
    expect(FLAT).toMatch(/error_report jsonb NOT NULL DEFAULT '\[\]'/i);

    for (const t of ['media_owner_documents', 'placement_claims', 'placement_imports']) {
      expect(FLAT).toMatch(new RegExp(`ALTER TABLE public\\.${t} ENABLE ROW LEVEL SECURITY`, 'i'));
    }
  });

  it('allows one pending claim per placement', () => {
    expect(FLAT).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS \w+ ON public\.placement_claims \(advert_id\) WHERE status = 'pending'/i,
    );
  });

  it('a representative claim needs a document', () => {
    expect(FLAT).toMatch(
      /CHECK \(role <> 'authorised_representative' OR btrim\(coalesce\(document_path, ''\)\) <> ''\)/i,
    );
  });

  it('lifecycle gains pending_review; size and rate columns added', () => {
    const lifecycle = /ADD CONSTRAINT advertisements_lifecycle_check CHECK \(lifecycle IN \(([^)]*)\)\)/i.exec(FLAT);
    expect(lifecycle).not.toBeNull();
    const values = lifecycle![1].split(',').map((v) => v.trim().replace(/'/g, ''));
    expect(values).toEqual([
      'discovered', 'imported', 'pending_review', 'partner_supplied', 'partner_verified', 'rejected', 'archived',
    ]);
    expect(FLAT).toMatch(/DROP CONSTRAINT IF EXISTS advertisements_lifecycle_check/i);
    for (const col of ['size_spec jsonb', 'rate_amount numeric', 'rate_period text']) {
      expect(FLAT).toMatch(new RegExp(`ADD COLUMN IF NOT EXISTS ${col}\\b`, 'i'));
    }
    // The rate's currency is the existing live currency column; no second one.
    expect(SQL).not.toMatch(/rate_currency/i);
    expect(FLAT).toMatch(/CHECK \(rate_amount IS NULL OR rate_period IS NOT NULL\)/i);
    expect(FLAT).toMatch(/CHECK \(rate_period IS NULL OR rate_period IN \('day', 'week', 'month'\)\)/i);
    expect(SQL).not.toMatch(/\bRENAME\b/i);
    expect(SQL).not.toMatch(/DROP\s+COLUMN/i);
  });

  it('one media owner per business; enabling is idempotent', () => {
    expect(FLAT).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS \w+ ON public\.media_owners \(business_id\) WHERE business_id IS NOT NULL/i,
    );
    const rpc = fn('enable_media_owner');
    expect(rpc).toMatch(/public\.enable_media_owner\(p_business_id uuid\) RETURNS uuid/i);
    expect(rpc).toMatch(/ON CONFLICT \(business_id\) WHERE business_id IS NOT NULL DO NOTHING/i);
  });

  it('every RPC is SECURITY DEFINER, sets search_path and guards on auth.role()', () => {
    for (const name of [...OWNER_RPCS, ...ADMIN_RPCS, 'dispatch_confirmation_expiry_notices']) {
      const body = fn(name);
      expect(body, name).toMatch(/SECURITY DEFINER/i);
      expect(body, name).toMatch(/SET search_path = public/i);
      expect(body, name).toMatch(/auth\.role\(\)/i);
      expect(body, name).not.toMatch(/current_user/i);
    }
    // And every definer function in the file, helpers and triggers included.
    const definers = functions().filter((f) => /SECURITY\s+DEFINER/i.test(f.body));
    expect(definers.length).toBeGreaterThanOrEqual(OWNER_RPCS.length + ADMIN_RPCS.length + 1);
    for (const f of definers) {
      expect(f.body, f.name).toMatch(/SET\s+search_path\s*=\s*public/i);
      expect(f.body, f.name).toMatch(/auth\.role\(\)/i);
      expect(f.body, f.name).not.toMatch(/current_user/i);
    }
  });

  it('owner RPCs check is_business_member before writing', () => {
    for (const name of OWNER_RPCS) {
      const body = fn(name);
      expect(body, name).toMatch(WEB_GUARD);
      expect(body, name).toMatch(/AND NOT public\.is_business_member\(/i);
      expect(body, name).toMatch(/RAISE EXCEPTION/i);
    }
  });

  it('admin RPCs check is_admin()', () => {
    for (const name of ADMIN_RPCS) {
      const body = fn(name);
      expect(body, name).toMatch(/IF coalesce\(auth\.role\(\), ''\) IN \('anon', 'authenticated'\) AND NOT public\.is_admin\(\) THEN RAISE EXCEPTION/i);
    }
    expect(fn('admin_review_placement')).toMatch(/public\.set_placement_lifecycle\(p_advert_id, 'rejected'/i);
    expect(fn('admin_review_placement')).toMatch(/public\.set_placement_lifecycle\(p_advert_id, 'partner_supplied'/i);
    expect(fn('admin_review_placement')).toMatch(/lifecycle IS DISTINCT FROM 'pending_review'/i);
  });

  it('RPC grants: never anon', () => {
    for (const name of [...OWNER_RPCS, ...ADMIN_RPCS]) {
      expect(FLAT).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${name}\\([^)]*\\) FROM PUBLIC, anon`, 'i'));
      expect(FLAT).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${name}\\([^)]*\\) TO authenticated`, 'i'));
    }
    expect(FLAT).toMatch(
      /REVOKE ALL ON FUNCTION public\.dispatch_confirmation_expiry_notices\(\) FROM PUBLIC, anon, authenticated/i,
    );
  });

  it('owner_create_placement: lifecycle from verification, owner role, pricing source, no stock', () => {
    const rpc = fn('owner_create_placement');
    expect(rpc).toMatch(/public\.owner_create_placement\(p_owner_id uuid, p jsonb\) RETURNS uuid/i);
    expect(rpc).toMatch(/CASE WHEN v_verification = 'verified' THEN 'partner_verified' ELSE 'pending_review' END/i);
    expect(rpc).toMatch(/'owner'/);
    expect(rpc).toMatch(/INSERT INTO public\.placement_field_source[^;]*'pricing', 'partner_supplied'/i);
    expect(rpc).toMatch(/public\.is_stock_image_url\(/i);
    // The trusted flag is set around the write and cleared after it.
    expect(rpc).toMatch(/set_config\('nowopen\.owner_write', 'on', true\)/i);
    expect(rpc).toMatch(/set_config\('nowopen\.owner_write', 'off', true\)/i);
  });

  it('owner_create_placement: user_id NULL, uuid business_id, plain required-field errors', () => {
    const rpc = fn('owner_create_placement');
    const cols = /INSERT INTO public\.advertisements \(([^)]*)\)/i.exec(rpc);
    expect(cols).not.toBeNull();
    const list = cols![1].split(',').map((c) => c.trim());
    // Ruling: owner-created placements store user_id = NULL.
    expect(list).not.toContain('user_id');
    expect(list).toContain('business_id');
    expect(list).toContain('currency');
    // advertisements.user_id / business_id are uuid on live: no text casts.
    expect(rpc).not.toMatch(/auth\.uid\(\)::text/i);
    expect(rpc).not.toMatch(/v_business::text/i);
    // Required: type/category, title, city, each with its own message.
    expect(rpc).toMatch(/IF v_category IS NULL THEN RAISE EXCEPTION 'Choose the type of placement'/i);
    expect(rpc).toMatch(/IF v_title IS NULL THEN RAISE EXCEPTION 'A site name is required'/i);
    expect(rpc).toMatch(/IF v_city IS NULL THEN RAISE EXCEPTION 'A city is required'/i);
    // A rejected owner cannot list.
    expect(rpc).toMatch(/IF v_verification = 'rejected' THEN RAISE EXCEPTION 'Your verification was not approved/i);
  });

  it('location stays "City, Country"; the landmark goes to site_address', () => {
    // Promote's city filter reads the first comma segment of location, and
    // every live row is "City, Country".
    expect(FLAT).toMatch(/ADD COLUMN IF NOT EXISTS site_address text/i);

    const create = fn('owner_create_placement');
    expect(create).toMatch(/v_city \|\| ', ' \|\| v_country_name/);
    expect(create).toMatch(/v_country_name := public\.placement_country_name\(v_country_code\)/i);
    expect(create).toMatch(/nullif\(btrim\(p ->> 'site_address'\), ''\)/i);
    const cols = /INSERT INTO public\.advertisements \(([^)]*)\)/i.exec(create)![1].split(',').map((c) => c.trim());
    expect(cols).toContain('site_address');
    // Never "landmark, City", and never the client's own location string.
    expect(create).not.toMatch(/concat_ws/i);
    expect(create).not.toMatch(/p ->> 'location'/i);

    const update = fn('owner_update_placement');
    expect(update).toMatch(/v_location := v_city \|\| ', ' \|\| public\.placement_country_name\(v_country\)/);
    expect(update).toMatch(/location = v_location/i);
    expect(update).toMatch(/site_address = CASE WHEN p \? 'site_address'/i);
    expect(update).not.toMatch(/p ->> 'location'/i);
    expect(update).not.toMatch(/concat_ws/i);
  });

  it('placement_country_name reverses the trust backfill', () => {
    const trust = readFileSync(join(process.cwd(), 'supabase', 'migrations', '20261109010000_placement_trust.sql'), 'utf8');
    const block = /FROM \(VALUES([\s\S]*?)\) AS m\(country, iso\)/.exec(trust);
    expect(block).not.toBeNull();
    const backfill = [...block![1].matchAll(/\('((?:[^']|'')+)', '([A-Z]{2})'\)/g)]
      .map((m) => [m[1].replace(/''/g, "'"), m[2]] as const);
    const helper = fn('placement_country_name');
    const whens = [...helper.matchAll(/WHEN '([A-Z]{2})' THEN '((?:[^']|'')+)'/g)]
      .map((m) => [m[1], m[2].replace(/''/g, "'")] as const);
    const isos = new Set(backfill.map(([, iso]) => iso));
    // Every backfilled code has a name, and that name maps back to the code.
    expect(new Set(whens.map(([iso]) => iso))).toEqual(isos);
    for (const [iso, name] of whens) {
      expect(backfill.some(([n, i]) => i === iso && n === name.toLowerCase()), `${iso} ${name}`).toBe(true);
    }
    expect(helper).toMatch(/ELSE NULL/i);
  });

  it('owner_update_placement: only the spec fields; a price change writes a source row', () => {
    const rpc = fn('owner_update_placement');
    const allowed = /v_allowed text\[\] := ARRAY\[([^\]]*)\]/i.exec(rpc);
    expect(allowed).not.toBeNull();
    const keys = allowed![1].split(',').map((k) => k.trim().replace(/'/g, '')).sort();
    expect(keys).toEqual([
      'city', 'country_code', 'description', 'dimensions', 'image_url', 'media_urls',
      'pricing', 'rate_amount', 'currency', 'rate_period', 'site_address', 'size_spec', 'title',
    ].sort());
    for (const forbidden of ['lifecycle', 'owner_id', 'owner_role', 'user_id', 'provenance']) {
      expect(keys).not.toContain(forbidden);
    }
    expect(rpc).toMatch(/jsonb_object_keys\(p\)/i);
    expect(rpc).toMatch(/ON CONFLICT \(advert_id, field\) DO UPDATE SET basis = 'partner_supplied'/i);
    expect(rpc).toMatch(/as_of = \(now\(\) AT TIME ZONE 'Africa\/Lagos'\)::date/i);
    expect(rpc).toMatch(/public\.is_stock_image_url\(/i);
    // Lifecycle is never written here: verified status is kept.
    expect(rpc).not.toMatch(/SET[^;]*\blifecycle\s*=/i);
  });

  it('owner_record_availability: portal, names the advert owner, needs a from-date', () => {
    const rpc = fn('owner_record_availability');
    expect(rpc).toMatch(/public\.owner_record_availability\(p_advert_id uuid, p_status text, p_from date, p_to date\)/i);
    expect(rpc).toMatch(/IF p_from IS NULL THEN RAISE EXCEPTION/i);
    expect(rpc).toMatch(/'portal'/);
    expect(rpc).toMatch(/INSERT INTO public\.placement_availability \(advert_id, status, period_from, period_to, confirmed_by_owner, method\) VALUES \(p_advert_id, p_status, p_from, p_to, v_owner, 'portal'\)/i);
  });

  it('owner_claim_placement: unowned only, document for representatives, audited', () => {
    const rpc = fn('owner_claim_placement');
    expect(rpc).toMatch(
      /public\.owner_claim_placement\(p_advert_id uuid, p_owner_id uuid, p_role text, p_statement text, p_document_path text\) RETURNS uuid/i,
    );
    expect(rpc).toMatch(/IF v_current_owner IS NOT NULL THEN RAISE EXCEPTION/i);
    expect(rpc).toMatch(/FOR UPDATE/i);
    expect(rpc).toMatch(/INSERT INTO public\.audit_log/i);
    expect(rpc).toContain("'placement.claim_submitted'");
    expect(rpc).toMatch(/IF v_verification = 'rejected' THEN RAISE EXCEPTION 'Your verification was not approved/i);
  });

  it('admin_decide_claim links the owner and sets lifecycle from verification', () => {
    const rpc = fn('admin_decide_claim');
    expect(rpc).toMatch(/SET owner_id = v_claim\.owner_id, owner_role = v_claim\.role/i);
    expect(rpc).toMatch(/CASE WHEN v_verification = 'verified' THEN 'partner_verified' ELSE 'partner_supplied' END/i);
    expect(rpc).toMatch(/IF NOT p_approve AND \(p_reason IS NULL OR btrim\(p_reason\) = ''\) THEN RAISE EXCEPTION/i);
    expect(rpc).toMatch(/INSERT INTO public\.audit_log/i);
    expect(rpc).toContain("'placement.claim_decision'");
    // Never re-lists a placement rejected or archived since the claim, and
    // never links an owner whose verification was rejected.
    expect(rpc).toMatch(/IF v_current_lifecycle IN \('rejected', 'archived'\) THEN RAISE EXCEPTION/i);
    expect(rpc).toMatch(/IF v_verification = 'rejected' THEN RAISE EXCEPTION/i);
  });

  it('owner_verification_reason answers only while the owner stands rejected', () => {
    const rpc = fn('owner_verification_reason');
    expect(rpc).toMatch(/IF v_verification IS DISTINCT FROM 'rejected' THEN RETURN NULL; END IF;/i);
  });

  it('members read their owner through get_my_media_owner, selected columns only', () => {
    const rpc = fn('get_my_media_owner');
    const cols = /RETURNS TABLE \(([^)]*)\)/i.exec(rpc);
    expect(cols).not.toBeNull();
    const names = cols![1].split(',').map((c) => c.trim().split(/\s+/)[0]);
    expect(names).toEqual(['id', 'name', 'website', 'country_codes', 'verification', 'verified_at', 'verification_note']);
    expect(rpc).toMatch(
      /SELECT o\.id, o\.name, o\.website, o\.country_codes, o\.verification, o\.verified_at, o\.verification_note FROM public\.media_owners o/i,
    );
    expect(rpc).not.toMatch(/relationship|verified_by/i);
    // No member policy on media_owners itself.
    expect(FLAT).not.toMatch(/CREATE POLICY "[^"]+" ON public\.media_owners\b/i);
    expect(FLAT).toMatch(/DROP POLICY IF EXISTS "Members read their media owner" ON public\.media_owners/i);
  });

  it('admin_reject_owner records the reason in audit_log', () => {
    const rpc = fn('admin_reject_owner');
    expect(rpc).toMatch(/SET verification = 'rejected'/i);
    expect(rpc).toMatch(/IF p_reason IS NULL OR btrim\(p_reason\) = '' THEN RAISE EXCEPTION/i);
    expect(rpc).toMatch(/INSERT INTO public\.audit_log/i);
    expect(rpc).toContain("'media_owner.rejected'");
    expect(rpc).toMatch(/'reason', btrim\(p_reason\)/i);
  });

  it('submit_owner_verification needs a registration and a site proof', () => {
    const rpc = fn('submit_owner_verification');
    expect(rpc).toMatch(/kind = 'registration'/i);
    expect(rpc).toMatch(/kind IN \('signage_permit', 'rate_card', 'authorisation_letter'\)/i);
    expect(rpc).toMatch(/SET verification = 'documents_submitted'/i);
  });

  it('verifying an owner promotes partner_supplied, never pending_review', () => {
    const t = fn('media_owner_after_write');
    expect(t).toMatch(
      /UPDATE public\.advertisements SET lifecycle = 'partner_verified' WHERE owner_id = NEW\.id AND lifecycle = 'partner_supplied'/i,
    );
    expect(t).not.toMatch(/lifecycle = 'pending_review'/i);
    // The un-verify downgrade from the trust migration is kept.
    expect(t).toMatch(
      /UPDATE public\.advertisements SET lifecycle = 'partner_supplied' WHERE owner_id = NEW\.id AND lifecycle = 'partner_verified'/i,
    );
    // An owner may only move themselves to documents_submitted.
    expect(t).toMatch(/NEW\.verification = 'documents_submitted'/i);
  });

  it('the trust guard lets only the owner path set owner and lifecycle', () => {
    const g = fn('placement_trust_guard');
    expect(g).toMatch(/v_trusted boolean := coalesce\(current_setting\('nowopen\.owner_write', true\), ''\) = 'on'/i);
    expect(g).toMatch(/NEW\.owner_id IS NULL OR NEW\.owner_role IS DISTINCT FROM 'owner' OR NEW\.lifecycle NOT IN \('pending_review', 'partner_verified'\)/i);
    expect(g).toMatch(/NEW\.lifecycle = 'partner_verified'/i);
    // Under the flag the guard re-checks membership itself.
    const trusted = /IF v_trusted THEN(.*?)ELSIF NEW\.owner_id IS NOT NULL/i.exec(g);
    expect(trusted).not.toBeNull();
    expect(trusted![1]).toMatch(/IF NOT public\.is_media_owner_member\(NEW\.owner_id\) THEN RAISE EXCEPTION/i);
    expect(fn('placement_trust_audit')).toMatch(/IF v_web_non_admin AND NOT v_trusted THEN RAISE EXCEPTION/i);
    expect(fn('placement_availability_audit')).toMatch(/AND NOT v_trusted THEN RAISE EXCEPTION/i);
  });

  it('user_id policies stop at owned placements; admin policy untouched', () => {
    // All four user_id policies: two from the repo, two that exist only on
    // live. Permissive policies OR together, so missing one undoes the rest.
    const narrowed: [string, string][] = [
      ['Owners can update advertisements', 'UPDATE'],
      ['Owners can delete advertisements', 'DELETE'],
      ['Users can update own advertisements', 'UPDATE'],
      ['Users can delete own advertisements', 'DELETE'],
    ];
    for (const [name, cmd] of narrowed) {
      expect(FLAT, name).toMatch(new RegExp(`DROP POLICY IF EXISTS "${name}" ON public\\.advertisements`, 'i'));
      const m = new RegExp(`CREATE POLICY "${name}" ON public\\.advertisements ([^;]*);`, 'i').exec(FLAT);
      expect(m, name).not.toBeNull();
      expect(m![1], name).toMatch(
        new RegExp(`FOR ${cmd} TO authenticated USING \\(auth\\.uid\\(\\)::text = user_id::text AND owner_id IS NULL\\)`, 'i'),
      );
    }
    // Any UPDATE/DELETE policy on advertisements this file creates that
    // mentions user_id must carry owner_id IS NULL.
    const created = [...FLAT.matchAll(/CREATE POLICY "([^"]+)" ON public\.advertisements ([^;]*);/gi)];
    for (const [, name, body] of created) {
      if (/FOR (UPDATE|DELETE|ALL)/i.test(body) && /user_id/i.test(body)) expect(body, name).toMatch(/owner_id IS NULL/i);
    }
    expect(FLAT).not.toMatch(/"Admins can manage advertisements"/i);
  });

  it('placement_trust excludes pending_review and re-asserts its grants', () => {
    const v = view('placement_trust');
    expect(v).toMatch(/WHERE a\.lifecycle NOT IN \('rejected', 'archived', 'pending_review'\)/i);
    // v2 body kept: who confirmed, the Lagos day.
    expect(v).toMatch(/AS confirmed_by_name/i);
    expect(v).toMatch(/\(now\(\) AT TIME ZONE 'Africa\/Lagos'\)::date AS today/i);
    const created = FLAT.search(/CREATE OR REPLACE VIEW public\.placement_trust\b/i);
    const revoke = FLAT.search(/REVOKE ALL ON public\.placement_trust FROM PUBLIC, anon, authenticated/i);
    const grant = FLAT.search(/GRANT SELECT ON public\.placement_trust TO anon, authenticated/i);
    expect(revoke).toBeGreaterThan(created);
    expect(grant).toBeGreaterThan(revoke);

    expect(view('media_owners_public')).toMatch(/a\.lifecycle NOT IN \('rejected', 'archived', 'pending_review'\)/i);
    expect(FLAT).toMatch(/REVOKE ALL ON public\.media_owners_public FROM PUBLIC, anon, authenticated/i);
  });

  it('storage: owner folders for members, placement photos for the placement owner', () => {
    const policies = [...FLAT.matchAll(/CREATE POLICY "([^"]+)" ON storage\.objects ([^;]*);/gi)];
    const docs = policies.filter((m) => /'verification-docs'/.test(m[2]));
    expect(docs.some((m) => /FOR SELECT/i.test(m[2]))).toBe(true);
    expect(docs.some((m) => /FOR INSERT/i.test(m[2]))).toBe(true);
    for (const m of docs) {
      expect(m[2]).toMatch(/\(storage\.foldername\(name\)\)\[1\] = 'media-owners'/i);
      expect(m[2]).toMatch(/public\.media_owner_folder_access\(\(storage\.foldername\(name\)\)\[2\]\)/i);
    }
    const photos = policies.filter((m) => /'business-images'/.test(m[2]));
    expect(photos.some((m) => /AS RESTRICTIVE FOR INSERT/i.test(m[2]))).toBe(true);
    for (const m of photos) expect(m[2]).toMatch(/public\.placement_folder_access\(\(storage\.foldername\(name\)\)\[2\]\)/i);
    expect(fn('media_owner_folder_access')).toMatch(/public\.is_media_owner_member\(/i);
    expect(fn('is_media_owner_member')).toMatch(/public\.is_business_member\(o\.business_id\)/i);
  });

  it('stock photos are refused, mirroring src/lib/stockImage.ts', () => {
    const ts = readFileSync(join(process.cwd(), 'src', 'lib', 'stockImage.ts'), 'utf8');
    const list = /STOCK_HOSTS: readonly string\[\] = \[([\s\S]*?)\];/.exec(ts);
    expect(list).not.toBeNull();
    const hosts = [...list![1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
    const helper = fn('is_stock_image_url');
    // Each host family is covered by a suffix the helper matches.
    for (const h of hosts) {
      const root = h.split('.').slice(-2).join('.');
      expect(helper, h).toContain(root.replace(/\./g, '\\.'));
    }
    expect(helper).toMatch(/IMMUTABLE/i);
  });

  it('expiry notices: SQL-only dispatcher, deduped by notified_at, every 15 minutes', () => {
    expect(FLAT).toMatch(/ALTER TABLE public\.placement_availability ADD COLUMN IF NOT EXISTS notified_at timestamptz/i);
    const d = fn('dispatch_confirmation_expiry_notices');
    expect(d).toMatch(/valid_until > now\(\)/i);
    expect(d).toMatch(/valid_until <= now\(\) \+ interval '3 days'/i);
    expect(d).toMatch(/notified_at IS NULL/i);
    expect(d).toMatch(/UPDATE public\.placement_availability SET notified_at = now\(\) WHERE id = r\.confirmation_id AND notified_at IS NULL/i);
    expect(d).toMatch(/INSERT INTO public\.notifications \(user_id, title, body, type, link\)/i);
    expect(d).toContain("'placement_confirmation_expiring'");
    expect(d).toContain("'/dashboard?tab=media-owner'");
    expect(FLAT).toMatch(
      /SELECT cron\.unschedule\('nowopen-confirmation-expiry'\) WHERE EXISTS \(SELECT 1 FROM cron\.job WHERE jobname = 'nowopen-confirmation-expiry'\)/i,
    );
    expect(FLAT).toMatch(/SELECT cron\.schedule\('nowopen-confirmation-expiry', '\*\/15 \* \* \* \*'/i);
  });

  it('members read their own documents, claims and imports; admins manage', () => {
    const policies = [...FLAT.matchAll(/CREATE POLICY "([^"]+)" ON public\.(\w+) ([^;]*);/gi)];
    for (const t of ['media_owner_documents', 'placement_claims', 'placement_imports']) {
      const mine = policies.filter((m) => m[2] === t);
      expect(mine.some((m) => /FOR SELECT/i.test(m[3]) && /public\.is_media_owner_member\(owner_id\)/i.test(m[3])), t).toBe(true);
      expect(mine.some((m) => /admin/i.test(m[1]) && /public\.is_admin\(\)/i.test(m[3])), t).toBe(true);
      // Nobody but an admin updates or deletes these rows.
      for (const m of mine) {
        if (/FOR (UPDATE|DELETE|ALL)/i.test(m[3])) expect(m[3], m[1]).toMatch(/public\.is_admin\(\)/i);
      }
    }
    // Claims are only ever filed through owner_claim_placement.
    expect(policies.some((m) => m[2] === 'placement_claims' && /FOR INSERT/i.test(m[3]))).toBe(false);
  });

  it('business dates are the local day, never the UTC date', () => {
    expect(SQL).not.toMatch(/now\(\)\s*::\s*date/i);
    expect(SQL).not.toMatch(/\bcurrent_date\b/i);
    expect(SQL).not.toMatch(/now\(\)\s+AT\s+TIME\s+ZONE\s+'UTC'/i);
  });

  it('no prose terminator', () => {
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
    // Prose is line comments only in this file.
    expect(RAW).not.toMatch(/\/\*/);
  });
});
