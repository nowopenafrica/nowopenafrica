import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

/**
 * Guards on the catalogue's SQL.
 *
 * These assert the STRUCTURE of the schema, not its behaviour — the behaviour
 * was exercised against the live database and is recorded in the migration's
 * own header. What a test can do from here is stop the guarantees being
 * quietly removed later by someone who did not know why they were there, and
 * every assertion below corresponds to a way this catalogue could start
 * charging money it should not.
 */

const migrations = join(process.cwd(), 'supabase', 'migrations');
const read = (name: string) => readFileSync(join(migrations, name), 'utf8');

const SCHEMA = read('20261107010000_service_catalogue.sql');
const ENGINE = read('20261107020000_service_pricing_engine.sql');
const SEED = read('20261107030000_service_catalogue_seed.sql');

/**
 * The SQL with its prose removed.
 *
 * Every negative assertion below has to run against this rather than the raw
 * file. These migrations explain themselves at length — the engine's header
 * says why it is NOT `SECURITY DEFINER`, and the seed's header quotes the
 * brief on why nothing is `'quoted'` — so a test searching the whole file for
 * those strings fails on the explanation of the very rule it is checking.
 *
 * Postgres block comments NEST, so the depth counter is not decoration: a
 * `/*` inside a comment really does open another level, and a stripper that
 * stops at the first `*\/` would leave the remainder of the file misread.
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

describe('a price nobody agreed to cannot be sold', () => {
  /*
   * is_orderable is GENERATED so every reader gets the same answer from one
   * place. The alternative — each component filtering for itself — is exactly
   * how eighteen invented creative studios with invented ratings reached the
   * public marketplace: the page's own comment said they were "gated to DEV",
   * which was true of the writer and never of the reader.
   */
  it('computes orderability in the database, not in a component', () => {
    expect(SCHEMA).toMatch(/is_orderable\s+boolean\s+GENERATED ALWAYS AS/i);
  });

  it('requires a real quote before anything is orderable', () => {
    const generated = SCHEMA.slice(SCHEMA.indexOf('is_orderable'), SCHEMA.indexOf('STORED'));
    expect(generated).toMatch(/price_basis\s*=\s*'quoted'/);
    expect(generated).toMatch(/publication_status\s*=\s*'published'/);
    expect(generated).toMatch(/quote_required\s*=\s*false/);
  });

  /*
   * The founder's brief states the prices are "a proposed launch catalogue
   * ... not verified market averages or existing NowOpen Africa rates". So
   * nothing may seed as a price anyone has stood behind.
   */
  it('seeds every service as a hypothesis, never as a confirmed price', () => {
    expect(code(SEED)).not.toMatch(/'quoted'/);
    expect(code(SEED)).toMatch(/'proposed'/);
    expect(code(SEED)).toMatch(/'indicative'/);
  });

  it('records where every unverified figure came from', () => {
    /* A benchmark with no source and no date is a benchmark nobody can
       challenge, which makes it indistinguishable from a guess. */
    expect(SEED).toMatch(/price_source/);
    expect(SEED).toMatch(/price_source_seen|DATE '/);
  });
});

describe('money is never a float', () => {
  it('stores prices as integers in minor units', () => {
    expect(SCHEMA).toMatch(/price_minor\s+bigint/);
    expect(SCHEMA).toMatch(/delta_minor\s+bigint/);
    /* Percentages as basis points, so a surcharge is integer arithmetic too. */
    expect(SCHEMA).toMatch(/delta_bp\s+integer/);
  });

  it('keeps no numeric, real or double column anywhere in the catalogue', () => {
    const money = code(SCHEMA).match(/^\s+\w*(price|amount|delta|total)\w*\s+(numeric|real|double|float)/gim);
    expect(money).toBeNull();
  });

  it('will not let one choice change the price two different ways', () => {
    expect(SCHEMA).toMatch(/service_option_choices_one_kind_of_delta/);
  });
});

describe('the pricing engine is the authority', () => {
  it('runs as the caller, not as the owner', () => {
    expect(code(ENGINE)).toMatch(/SECURITY INVOKER/);
    expect(code(ENGINE)).not.toMatch(/SECURITY DEFINER/);
  });

  /*
   * ── THE FAIL-OPEN TRAP ───────────────────────────────────────────────
   * A SECURITY INVOKER function called by a role that bypasses RLS —
   * service_role, or the table owner — sees DRAFT rows. So the published
   * test is written into the WHERE clause and is not left to the policy.
   */
  it('tests publication in the query rather than trusting row-level security', () => {
    const lookup = ENGINE.slice(ENGINE.indexOf('SELECT * INTO svc'), ENGINE.indexOf('IF NOT FOUND'));
    expect(lookup).toMatch(/publication_status\s*=\s*'published'/);
  });

  it('refuses rather than guessing, and names the rule each time', () => {
    for (const refusal of [
      'unknown_service', 'quote_required', 'quantity_required',
      'below_minimum', 'above_rate_card', 'option_required', 'invalid_option', 'no_price',
    ]) {
      expect(ENGINE, refusal).toMatch(new RegExp(`'refusal',\\s*'${refusal}'`));
    }
  });

  /*
   * Found by running it against the live catalogue: 250 business cards
   * returned the price of 100, because the only tier is 100 and "the largest
   * tier at or below the quantity" is still that one. Print does not scale
   * linearly, so past the top of the rate card is a quote, not a sum.
   */
  it('refuses a quantity past the top of the rate card', () => {
    expect(ENGINE).toMatch(/p_quantity\s*>\s*largest/);
    expect(ENGINE).toMatch(/above_rate_card/);
  });

  it('tells the caller whether this may be charged', () => {
    expect(ENGINE).toMatch(/'orderable',\s*svc\.is_orderable/);
  });
});

describe('who may change a price', () => {
  it('lets the public read only what is published', () => {
    expect(SCHEMA).toMatch(/services_public_read[\s\S]{0,200}publication_status = 'published'/);
  });

  it('restricts every write to staff', () => {
    expect(SCHEMA).toMatch(/is_admin\(\)/);
    for (const table of ['service_categories', 'services', 'service_price_tiers',
      'service_options', 'service_option_choices', 'service_synonyms']) {
      expect(SCHEMA, table).toMatch(new RegExp(`'${table}'`));
    }
  });

  it('turns row-level security on for every table it creates', () => {
    const created = [...SCHEMA.matchAll(/CREATE TABLE IF NOT EXISTS public\.(\w+)/g)].map((m) => m[1]);
    expect(created.length).toBeGreaterThanOrEqual(6);
    for (const table of created) {
      expect(SCHEMA, table).toMatch(new RegExp(`ALTER TABLE public\\.${table}\\s+ENABLE ROW LEVEL SECURITY`));
    }
  });
});

describe('the seed can be run twice', () => {
  it('never resets a price an admin has since corrected', () => {
    /* ON CONFLICT updates the descriptive fields only. Re-running this file
       must not turn a properly quoted service back into a hypothesis. */
    const updates = [...SEED.matchAll(/ON CONFLICT \(sku\) DO UPDATE SET([\s\S]*?);/g)].map((m) => m[1]);
    expect(updates.length).toBeGreaterThan(0);
    for (const block of updates) {
      expect(block).not.toMatch(/price_basis\s*=/);
      expect(block).not.toMatch(/quote_required\s*=/);
      expect(block).not.toMatch(/price_minor\s*=/);
    }
  });
});
