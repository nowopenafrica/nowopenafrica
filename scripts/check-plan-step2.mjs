#!/usr/bin/env node
// Behaviour checks for the Promote step 2 migration
// (supabase/migrations/20261113010000_plan_products_and_artwork.sql).
//
// Usage:  node scripts/check-plan-step2.mjs                  (migration applied)
//         node scripts/check-plan-step2.mjs --with-migration (dry run: applies
//                                  the migration INSIDE the rolled-back
//                                  transaction first, so nothing persists)
//
// SAFE TO RUN: the generated SQL is one transaction that ends in ROLLBACK, so
// its throwaway rows are never persisted. It borrows an existing user,
// advertisement and product rather than inventing them. The CLI returns only
// the last result set, so the file ends in ONE summary SELECT.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// fileURLToPath, not URL.pathname: this project's path contains spaces.
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const withMigration = process.argv.includes('--with-migration');

const migration = withMigration
  ? readFileSync(
      join(ROOT, 'supabase/migrations/20261113010000_plan_products_and_artwork.sql'),
      'utf8',
    )
  : '';

const checks = `
SELECT set_config('chk.passed', '', false);

CREATE FUNCTION pg_temp.chk_pass(p text) RETURNS void LANGUAGE sql AS $f$
  SELECT set_config('chk.passed', current_setting('chk.passed') || p || ',', false);
$f$;

-- True when the statement fails with exactly the expected SQLSTATE. The
-- implicit sub-transaction undoes the failed statement only.
CREATE FUNCTION pg_temp.chk_refused(p_sql text, p_state text) RETURNS boolean
LANGUAGE plpgsql AS $f$
BEGIN
  EXECUTE p_sql;
  RETURN false;
EXCEPTION WHEN OTHERS THEN
  RETURN SQLSTATE = p_state;
END $f$;

DO $$
DECLARE
  v_user uuid; v_advert uuid; v_product uuid; v_campaign uuid;
BEGIN
  SELECT id INTO v_user FROM auth.users LIMIT 1;
  SELECT id INTO v_advert FROM public.advertisements LIMIT 1;
  SELECT id INTO v_product FROM public.revenue_products LIMIT 1;
  ASSERT v_user IS NOT NULL AND v_advert IS NOT NULL AND v_product IS NOT NULL,
    'fixtures: needs one existing user, advertisement and revenue product';
  INSERT INTO public.ad_campaigns (owner_id, name) VALUES (v_user, 'zz-plan-check')
    RETURNING id INTO v_campaign;
  PERFORM set_config('chk.campaign', v_campaign::text, false);
  PERFORM set_config('chk.advert', v_advert::text, false);
  PERFORM set_config('chk.product', v_product::text, false);
  PERFORM pg_temp.chk_pass('fixtures');
END $$;

DO $$
BEGIN
  ASSERT pg_temp.chk_refused(format(
    'INSERT INTO public.ad_campaign_placements (campaign_id, advert_id, product_id) VALUES (%L,%L,%L)',
    current_setting('chk.campaign'), current_setting('chk.advert'), current_setting('chk.product')), '23514'),
    'both_refused: a line with advert_id and product_id was accepted';
  PERFORM pg_temp.chk_pass('both_refused');
END $$;

DO $$
BEGIN
  ASSERT pg_temp.chk_refused(format(
    'INSERT INTO public.ad_campaign_placements (campaign_id) VALUES (%L)',
    current_setting('chk.campaign')), '23514'),
    'neither_refused: a line with no item was accepted';
  PERFORM pg_temp.chk_pass('neither_refused');
END $$;

DO $$
BEGIN
  INSERT INTO public.ad_campaign_placements (campaign_id, product_id, price_basis, price_minor)
  VALUES (current_setting('chk.campaign')::uuid, current_setting('chk.product')::uuid, 'fixed', 500000);
  PERFORM pg_temp.chk_pass('fixed_accepted');
  ASSERT pg_temp.chk_refused(format(
    'INSERT INTO public.ad_campaign_placements (campaign_id, product_id) VALUES (%L,%L)',
    current_setting('chk.campaign'), current_setting('chk.product')), '23505'),
    'product_twice_refused: the same product twice in one plan was accepted';
  PERFORM pg_temp.chk_pass('product_twice_refused');
END $$;

DO $$
BEGIN
  INSERT INTO public.ad_campaign_placements (campaign_id, advert_id)
  VALUES (current_setting('chk.campaign')::uuid, current_setting('chk.advert')::uuid);
  ASSERT pg_temp.chk_refused(format(
    'INSERT INTO public.ad_campaign_placements (campaign_id, advert_id) VALUES (%L,%L)',
    current_setting('chk.campaign'), current_setting('chk.advert')), '23505'),
    'placement_twice_refused: the same placement twice in one plan was accepted';
  PERFORM pg_temp.chk_pass('placement_twice_refused');
END $$;

DO $$
DECLARE v_other uuid;
BEGIN
  -- A second, empty plan so the unique constraints cannot fire first.
  INSERT INTO public.ad_campaigns (owner_id, name)
  SELECT owner_id, 'zz-plan-check 2' FROM public.ad_campaigns
   WHERE id = current_setting('chk.campaign')::uuid
  RETURNING id INTO v_other;

  ASSERT pg_temp.chk_refused(format(
    'INSERT INTO public.ad_campaign_placements (campaign_id, advert_id, price_basis) VALUES (%L,%L,%L)',
    v_other, current_setting('chk.advert'), 'confirmed'), '23514'),
    'basis_confirmed_refused: price_basis confirmed was accepted';
  PERFORM pg_temp.chk_pass('basis_confirmed_refused');

  ASSERT pg_temp.chk_refused(format(
    'INSERT INTO public.ad_campaign_placements (campaign_id, product_id, price_minor) VALUES (%L,%L,-1)',
    v_other, current_setting('chk.product')), '23514'),
    'negative_price_refused: a negative price_minor was accepted';
  PERFORM pg_temp.chk_pass('negative_price_refused');

  ASSERT pg_temp.chk_refused(format(
    'INSERT INTO public.ad_campaign_placements (campaign_id, advert_id, artwork_width) VALUES (%L,%L,0)',
    v_other, current_setting('chk.advert')), '23514'),
    'artwork_size_refused: a zero artwork_width was accepted';
  PERFORM pg_temp.chk_pass('artwork_size_refused');
END $$;

DO $$
BEGIN
  ASSERT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'plan-artwork'),
    'bucket_private: bucket plan-artwork does not exist';
  ASSERT (SELECT public FROM storage.buckets WHERE id = 'plan-artwork') = false,
    'bucket_private: bucket plan-artwork is public';
  ASSERT (SELECT count(*) FROM pg_policies
           WHERE schemaname = 'storage' AND tablename = 'objects'
             AND policyname LIKE 'plan\\_artwork\\_%') = 4,
    'bucket_policies: expected 4 plan_artwork_* policies';
  PERFORM pg_temp.chk_pass('bucket_private');
  PERFORM pg_temp.chk_pass('bucket_policies');
END $$;

SELECT string_agg(name, ', ') AS checks_passed, count(*) AS n_passed
  FROM unnest(string_to_array(rtrim(current_setting('chk.passed'), ','), ',')) AS name;
`;

const sql = `BEGIN;\n${migration}\n${checks}\nROLLBACK;\n`;
const dir = mkdtempSync(join(tmpdir(), 'plan-step2-'));
const file = join(dir, 'check.sql');
writeFileSync(file, sql);

let result;
try {
  // Through a shell: on Windows the CLI is a .cmd shim spawn cannot resolve.
  result = spawnSync(`npx supabase db query --linked -f "${file}"`, {
    cwd: ROOT, shell: true, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
  });
} finally {
  rmSync(dir, { recursive: true, force: true });
}

const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
if (/ERROR|assert/i.test(output) || result.status !== 0 || !/checks_passed/.test(output)) {
  console.error('FAILED. Output follows.\n');
  console.error(output.trim());
  process.exit(1);
}
console.log(output.trim());
console.log(
  `\nAll plan step 2 checks passed (transaction rolled back${withMigration ? ', migration dry-run included' : ''}).`,
);
