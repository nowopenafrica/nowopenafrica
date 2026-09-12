import { readFileSync, readdirSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

import { INDUSTRIES, liveModulesFor } from '../data/industrySystems';
import { parseSchemaSql } from '../../scripts/lib/parseSchemaSql.mjs';

/**
 * Phase 3 — what the platform claims, and whether it can carry its own weight.
 *
 * Two themes that turn out to be the same discipline: say only what is true,
 * and build only what the data can honestly support.
 */

const stripComments = (src: string) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

const directory = stripComments(readFileSync('src/pages/Businesses.tsx', 'utf8'));
const sitemap = stripComments(readFileSync('api/sitemap.xml.ts', 'utf8'));

const migrations = readdirSync('supabase/migrations');

/*
 * SQL with its comments removed.
 *
 * Two assertions below failed on their first run against the notes that
 * EXPLAIN the choice — the migration says "OFFSET re-scans everything it
 * skips" and describes a response being "truncated", so a plain search finds
 * the documentation rather than the code. What is being asserted about is the
 * SQL.
 */
const stripSql = (sql: string) => sql
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*--.*$/gm, '');

const migrationFile = (fragment: string) => {
  const name = migrations.find((m) => m.includes(fragment));
  expect(name, `migration containing "${fragment}"`).toBeDefined();
  return readFileSync(`supabase/migrations/${name}`, 'utf8');
};

/** The SQL, for asserting about behaviour. */
const migration = (fragment: string) => stripSql(migrationFile(fragment));

/**
 * The whole file, for asserting about the documentation.
 *
 * Needed because `migration()` strips comments, and some properties worth
 * pinning live in them — a migration that must not be applied untested has to
 * SAY SO, and that warning is a comment by definition.
 */
const migrationRaw = (fragment: string) => migrationFile(fragment);

// ─────────────────────────────────────────────────────────────────────────────

describe('industry taglines describe what ships', () => {
  /*
   * These render on the HOME PAGE beside a "LIVE PAGE" badge, which makes each
   * one a claim about what a business gets today. Six were untrue.
   */
  it('claims no integration that does not exist', () => {
    // "Portfolios that plug into Behance, Dribbble and Figma."
    for (const tagline of INDUSTRIES.map((i) => i.tagline)) {
      expect(tagline).not.toMatch(/behance|dribbble|figma/i);
    }
  });

  it('claims nothing real-time, because nothing is', () => {
    // "queue status and walk-in availability in real time" — the queue module
    // is a form. Live streaming exists, but no status is real-time.
    for (const tagline of INDUSTRIES.map((i) => i.tagline)) {
      expect(tagline, tagline).not.toMatch(/in real time|real-time/i);
    }
  });

  it('promises no fulfilment the platform does not perform', () => {
    for (const tagline of INDUSTRIES.map((i) => i.tagline)) {
      expect(tagline, tagline).not.toMatch(/same-day delivery|live runway|telemedicine built in/i);
    }
  });

  it('leaves the roadmap in groups, where it is labelled as such', () => {
    // The vision is not the problem and is not being censored — /platform
    // renders `groups` under "The full system we are building".
    const allFeatures = INDUSTRIES.flatMap((i) => i.groups.flatMap((g) => g.features));
    expect(allFeatures.length).toBeGreaterThan(200);
  });

  it('documents the rule for whoever writes the next tagline', () => {
    expect(readFileSync('src/data/industrySystems.ts', 'utf8'))
      .toMatch(/a tagline must be checkable against the shipped module map/i);
  });

  it('keeps every industry describable by its live modules', () => {
    // The check that keeps this honest as supply changes: an industry with no
    // shipped module has nothing truthful to put in a tagline.
    for (const industry of INDUSTRIES) {
      expect(liveModulesFor(industry).length, industry.name).toBeGreaterThan(0);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('the directory describes itself from its own data', () => {
  it('no longer hardcodes a breadth it does not have', () => {
    /*
     * It read "N businesses across food, retail, tech, health, professional
     * services and more" — a fixed sentence, and false: production holds two
     * businesses and both are Media & Publishing.
     */
    expect(directory).not.toContain('across food, retail, tech');
    expect(directory).toContain('const categoriesRepresented');
  });

  it('stops promising verification it has not granted', () => {
    // The page title read "Find Verified Businesses Across Africa". Exactly one
    // business is verified, and it is the founder's own.
    expect(directory).not.toContain('Find Verified Businesses Across Africa');
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('the directory cannot silently show a partial answer', () => {
  /*
   * The dangerous failure was never slowness. An unbounded select is truncated
   * by PostgREST's own cap with no error, so the page shows part of the
   * directory and then reports "no results" for businesses that exist.
   *
   * The later `.limit(50000)` in the admin panel hit the SAME cap — a single
   * request is truncated at 1000 rows whatever its `.limit()`, which is why
   * the Businesses panel got stuck at "1–100 of 1000". The answer is not a
   * bigger limit but `.range()` paging, which fetchAllBusinesses does: the
   * ceiling DIRECTORY_FETCH_LIMIT is the whole-walk cap, still explicit and
   * still detectable.
   */
  it('bounds the fetch explicitly', () => {
    expect(directory).toContain('const DIRECTORY_FETCH_LIMIT');
    expect(directory).toMatch(/fetchAllBusinesses\(\{\s*isListable: true,\s*cap: DIRECTORY_FETCH_LIMIT\s*\}\)/);
  });

  it('detects when it has hit its own ceiling', () => {
    expect(directory).toMatch(/setTruncated\(truncated\)/);
  });

  it('tells the visitor instead of pretending', () => {
    expect(directory).toContain('Showing the first ');
    expect(directory).toContain('search or filter to narrow it down');
  });
});

describe('the search index migration is real and honest', () => {
  const sql = () => migration('business_search_index');

  it('adds full text and trigram, not just one', () => {
    // Full text handles words; trigram is what makes "resturant" still work.
    expect(sql()).toMatch(/CREATE EXTENSION IF NOT EXISTS pg_trgm/);
    expect(sql()).toMatch(/USING gin \(search_vector\)/);
    expect(sql()).toMatch(/gin_trgm_ops/);
  });

  it("uses 'simple', not an English stemmer", () => {
    // Buka, Suya, Aso-Oke, Okrika, Keke — an English stemmer mangles them.
    expect(sql()).toMatch(/to_tsvector\(\s*'simple'/);
    expect(sql()).not.toMatch(/to_tsvector\(\s*'english'/);
  });

  it('keeps RLS as the visibility authority', () => {
    // A SECURITY DEFINER search function would quietly become a second
    // visibility rule, and the two would drift.
    expect(sql()).toMatch(/SECURITY INVOKER/);
    expect(sql()).not.toMatch(/SECURITY DEFINER/);
  });

  it('pages by keyset rather than OFFSET', () => {
    expect(sql()).toMatch(/after_id/);
    /*
     * An OFFSET *clause*, not the word. This first read `/OFFSET/i`, which
     * matched the COMMENT ON FUNCTION text explaining why OFFSET was avoided —
     * a string literal, so stripping comments does not remove it. Tightened
     * rather than deleted: the property is worth asserting.
     */
    expect(sql()).not.toMatch(/\boffset\s+[\d$]/i);
  });

  it('is additive, so applying it changes no behaviour by itself', () => {
    expect(sql()).toMatch(/ADD COLUMN IF NOT EXISTS/);
    expect(sql()).toMatch(/CREATE INDEX IF NOT EXISTS/);
    expect(sql()).not.toMatch(/DROP TABLE|DELETE FROM|TRUNCATE/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('advertising inventory is held to the accountability rule', () => {
  it('is no longer submitted for indexing without an owner', () => {
    /*
     * 97 rows, 89 `status = 'active'`, `user_id` NULL on every one, naming
     * real third-party sites with day rates — and all 97 were in the sitemap,
     * every one of them canonicalising to the home page.
     */
    expect(sitemap).toContain('const accountableAdverts = adverts.filter((a) => !!a.user_id)');
    expect(sitemap).toMatch(/for \(const a of accountableAdverts\)/);
  });

  it('applies the same rule the business listings already followed', () => {
    /*
     * Businesses required claim_status/data_status accountability; ad inventory
     * required nothing. That inconsistency was the defect.
     *
     * This used to assert the rule appeared INLINE in the sitemap
     * (`/claim_status === 'claimed'/`) — which broke the moment the sitemap
     * stopped restating the rule and started calling `isIndexableProfile`.
     * That was an improvement, not a regression: two copies of one rule is
     * how the sitemap kept indexing profiles the renderer would have
     * noindexed. So assert the rule is APPLIED, not that it is duplicated.
     */
    expect(sitemap).toMatch(/isIndexableProfile/);
    expect(sitemap).toMatch(/from '\.\.\/src\/lib\/businessPageRender\.js'/);
    // And the one place the rule now lives still carries it.
    const render = readFileSync('src/lib/businessPageRender.ts', 'utf8');
    expect(render).toMatch(/claim_status === 'claimed'/);
  });

  it('fabricates no verification in the provenance migration', () => {
    const sql = migration('advert_inventory_provenance');
    // The single most important assertion here. Verification is a human act
    // with a counterparty; asserting it in SQL would be invented data.
    expect(sql).toMatch(/DEFAULT 'unverified_import'/);
    expect(sql).not.toMatch(/UPDATE public\.advertisements SET rights_verified_at/i);
    expect(sql).not.toMatch(/rights_verified_at\s*=\s*now\(\)/i);
  });

  it('deletes nothing and reclassifies no status', () => {
    const sql = migration('advert_inventory_provenance');
    expect(sql).not.toMatch(/DELETE FROM|DROP TABLE|TRUNCATE/i);
    expect(sql).not.toMatch(/SET status\s*=/i);
  });

  it('records the currency a rate is quoted in', () => {
    // `14` could be ₦14, $14 or ₦14,000 — a 1000x mispricing.
    expect(migration('advert_inventory_provenance')).toMatch(/currency text NOT NULL DEFAULT 'NGN'/);
  });

  it('requires an accountable party, not merely status = active', () => {
    const sql = migration('advert_inventory_provenance');
    expect(sql).toMatch(/advert_is_sellable/);
    expect(sql).toMatch(/user_id IS NOT NULL OR a\.rights_verified_at IS NOT NULL/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('the Open Now migration is safe to apply or not apply', () => {
  const sql = () => migration('open_status_expiry_and_holidays');

  it('is additive only', () => {
    expect(sql()).toMatch(/ADD COLUMN IF NOT EXISTS open_status_set_at/);
    expect(sql()).not.toMatch(/DROP COLUMN|DELETE FROM|TRUNCATE/i);
  });

  it('stamps the timestamp in the database, not from the client', () => {
    // A client-supplied timestamp is a client-controlled expiry.
    expect(sql()).toMatch(/NEW\.open_status_set_at := now\(\)/);
  });

  it('defaults a business to closed on a holiday', () => {
    // A customer wrongly told "open" travels to a locked door and blames the
    // platform; the reverse is a mild annoyance.
    expect(sql()).toMatch(/opens_on_holidays boolean NOT NULL DEFAULT false/);
  });

  it('seeds no lunar holiday dates', () => {
    // Eid follows observation and is announced, not calculated. The table is
    // deliberately empty.
    expect(sql()).not.toMatch(/INSERT INTO public\.public_holidays/i);
  });

  it('lets only staff change a calendar that closes a whole country', () => {
    expect(sql()).toMatch(/USING \(public\.is_staff\(\)\)/);
    expect(sql()).toMatch(/ENABLE ROW LEVEL SECURITY/);
  });
});

describe('the static shell asserts no canonical of its own', () => {
  /*
   * The shell is served for every route the middleware does not render, so a
   * canonical baked into it is asserted on all of them — and it pointed at
   * `/`. Eight of the fourteen URLs in the sitemap therefore told Google they
   * were duplicates of the home page while the sitemap asked for them to be
   * indexed. With no tag a crawler self-canonicalises to the URL it fetched,
   * which is right for every one of those pages.
   */
  const shell = readFileSync('index.html', 'utf8');

  it('has no rel=canonical link element', () => {
    expect(shell).not.toMatch(/<link[^>]+rel="canonical"/);
  });

  it('explains why, so nobody helpfully adds one back', () => {
    expect(shell).toMatch(/NO CANONICAL HERE, DELIBERATELY/);
  });

  it('still lets the real canonical be set per route', () => {
    // Server-rendered pages emit their own; everything else gets one from
    // applySeo. Removing the blanket tag loses nothing.
    expect(readFileSync('src/lib/seo.ts', 'utf8')).toMatch(/upsertLink\('canonical', url\)/);
  });
});

describe('the schema-drift detector', () => {
  /*
   * 106 migrations and nothing verified that any had been applied. The
   * symptom is always the same and always quiet: a feature works locally and
   * silently does nothing in production, because the column it needs is not
   * there. "Delete doesn't work", "the plan change doesn't save" and "the
   * module never appears" were all this.
   */
  const src = readFileSync('scripts/check-schema-drift.mjs', 'utf8');

  it('reads what the migrations claim, and what the database has', () => {
    expect(src).toMatch(/expectedFromMigrations/);
    expect(src).toMatch(/information_schema\.columns/);
  });

  it('strips SQL comments before believing them', () => {
    /*
     * A comment mentioning a table is not a promise to create one; without
     * this every explanatory note becomes a false drift report.
     *
     * Asserted on the parser's BEHAVIOUR, not on the script's text. The
     * earlier version matched the regex literal, so it passed or failed on
     * where that regex happened to live — it broke when the parsing moved
     * into scripts/lib/parseSchemaSql.mjs, though nothing about the stripping
     * had changed. schemaDriftParser.test.ts covers the rest of that parser.
     */
    const t = parseSchemaSql([
      '-- create table imaginary (id uuid);',
      '/* create table also_imaginary (id uuid); */',
      'create table real_one (id uuid primary key);',
    ].join('\n'));
    expect([...t.keys()]).toEqual(['real_one']);
  });

  it('changes nothing — applying a migration is a decision', () => {
    /*
     * Assert on what it EXECUTES, not on what it mentions. The first
     * version looked for /alter table/ and matched the script's own
     * PARSER regex — the code that finds ALTER TABLE inside migrations.
     * What matters is that the only statement it sends is a read.
     */
    const executed = [...src.matchAll(/execSync\(`([^`]*)`/g)].map((m) => m[1]);
    expect(executed, 'exactly one command').toHaveLength(1);
    expect(executed[0]).toMatch(/^supabase db query --linked/);
    // The SQL itself is a const interpolated into that command, so assert
    // on the statement where it is actually written.
    expect(executed[0]).toContain('${sql');
    expect(src).toContain('select table_name, column_name from information_schema.columns');
    expect(src, 'only a read').not.toMatch(/execSync\([^)]*(insert|update|delete|drop)/i);

    /*
     * This used to scan the whole FILE for 'db push' and the rest. It broke
     * the moment the script gained the check that WARNS about `db push` —
     * the same trap as the /alter table/ version above, one layer out: the
     * string is present because the script defends against the command, not
     * because it runs it.
     *
     * So assert on the subprocess call, which is where the danger would
     * actually live.
     */
    for (const dangerous of ['db push', 'db reset', 'migration up', 'db dump']) {
      expect(executed[0], dangerous).not.toContain(dangerous);
    }
    expect(src).toMatch(/deliberately changes nothing/);
  });

  it('reports rather than gates', () => {
    // Failing the build on drift would block a developer on a condition they
    // may not be able to fix from where they are.
    expect(src).toMatch(/process\.exit\(0\)/);
  });

  it('is wired up as a script', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    expect(pkg.scripts['check:drift']).toBe('node scripts/check-schema-drift.mjs');
  });
});

describe('the users policy migration refuses to be rushed', () => {
  const sql = () => migration('users_column_guard_policy');

  it('says plainly that it must not be applied untested', () => {
    /*
     * It replaces a live policy on the authentication table. A wrong WITH
     * CHECK locks every user out of their own profile, and there is nowhere to
     * rehearse it because dev and production share one database.
     */
    expect(migrationRaw('users_column_guard_policy')).toMatch(/DO NOT APPLY THIS UNTESTED/);
  });

  it('pins the privileged columns without touching the rest', () => {
    expect(sql()).toMatch(/WITH CHECK/);
    expect(sql()).toMatch(/IS NOT DISTINCT FROM/);
    expect(sql()).toMatch(/public\.is_admin\(\)/);
  });

  it('is depth, not a claim that escalation is currently open', () => {
    expect(migrationRaw('users_column_guard_policy')).toMatch(/NOT currently exploitable/);
  });
});

describe('the vendor split earns its place', () => {
  const cfg = readFileSync('vite.config.ts', 'utf8');

  it('separates the framework from app code', () => {
    /*
     * The homepage's initial JS was one 194 KB gzip chunk holding React,
     * React DOM, React Router and Supabase alongside every app file — so any
     * app change invalidated all of it, and a returning visitor re-downloaded
     * React because a caption changed. Measured after: 104 KB re-downloaded
     * per deploy instead of 194 KB.
     */
    expect(cfg).toMatch(/manualChunks/);
    expect(cfg).toMatch(/'vendor-react': \['react', 'react-dom', 'react-router-dom'\]/);
    expect(cfg).toMatch(/'vendor-supabase'/);
  });

  it('raises the size warning with a reason, not to silence it', () => {
    expect(cfg).toMatch(/chunkSizeWarningLimit: 700/);
    expect(cfg).toMatch(/trains everyone to ignore build output/);
  });
});
