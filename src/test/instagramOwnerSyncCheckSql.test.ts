import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

/**
 * Structural guards for the Instagram owner-handle sync (spec phase 1).
 * The check script runs against production, so the first guard is that it
 * can never commit; the rest pin the contract between the migration, the
 * edge function and the spec.
 */

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), 'utf8');
const stripLineComments = (s: string) => s.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n');

const CHECK_SQL = stripLineComments(read('scripts', 'check-instagram-owner-sync.sql'));
const RUNNER = read('scripts', 'check-instagram-owner-sync.mjs');
const MIGRATION = read('supabase', 'migrations', '20261118010000_instagram_owner_handle_sync.sql');
const FN = read('supabase', 'functions', 'refresh-instagram-gallery', 'index.ts');

describe('check script safety', () => {
  it('never commits', () => {
    expect(CHECK_SQL).not.toMatch(/\bCOMMIT\b/i);
    // A top-level END; (unindented, outside a DO body) would commit the
    // runner's BEGIN. Indented END; inside a DO block is plpgsql and is fine.
    expect(CHECK_SQL).not.toMatch(/^END\s*;/m);
  });
  it('the runner wraps everything in BEGIN ... ROLLBACK', () => {
    expect(RUNNER).toMatch(/\['BEGIN;'\]/);
    expect(RUNNER).toMatch(/parts\.push\('ROLLBACK;'\)/);
  });
});

describe('migration contract', () => {
  it('only claimed businesses with an owner queue a request', () => {
    expect(MIGRATION).toMatch(/new\.user_id is null or coalesce\(new\.claim_status, ''\) <> 'claimed'/);
  });
  it('respects the owner master switch', () => {
    expect(MIGRATION.match(/sync_enabled = false/g)?.length).toBeGreaterThanOrEqual(2);
  });
  it('gives browsers no write path', () => {
    expect(MIGRATION).toMatch(/revoke insert, update, delete on public\.instagram_sync_requests from anon, authenticated/);
    expect(MIGRATION).not.toMatch(/for (insert|update|delete)\s/i);
  });
  it('keeps the pool and the poke off the public API', () => {
    expect(MIGRATION).toMatch(/revoke all on function public\.instagram_gallery_refresh_pool\(\) from public, anon, authenticated/);
    expect(MIGRATION).toMatch(/revoke all on function public\.poke_instagram_sync\(\) from public, anon, authenticated/);
  });
  it('orders the pool so it can be paged', () => {
    expect(MIGRATION).toMatch(/order by b\.id;/);
  });
  it('a failed poke cannot fail the owner’s save', () => {
    expect(MIGRATION).toMatch(/exception when others then\s+raise notice 'queue_instagram_owner_sync: poke failed/);
  });
  it('never writes */ inside a block comment', () => {
    // Postgres block comments nest; a stray close inside prose breaks a push.
    const header = MIGRATION.slice(0, MIGRATION.indexOf('*/') + 2);
    expect(header.slice(2, -2)).not.toMatch(/\/\*|\*\//);
  });
});

describe('edge function contract', () => {
  it('works owner requests before the rotation', () => {
    expect(FN.indexOf('instagram_sync_requests')).toBeLessThan(FN.indexOf('instagram_gallery_refresh_pool'));
  });
  it('no longer reads the pool from a capped table select', () => {
    expect(FN).not.toMatch(/from\("business_gallery"\)\s*\.select\("business_id"\)/);
    expect(FN).toMatch(/\.rpc\("instagram_gallery_refresh_pool"\)\s*\.range\(/);
  });
  it('claims a request before working it', () => {
    expect(FN).toMatch(/update\(\{ status: "working"/);
    expect(FN).toMatch(/\.eq\("status", r\.status\)/);
  });
  it('still never asks for or stores media_url', () => {
    expect(FN).not.toMatch(/media_url/);
  });
  it('still stops on a rate limit', () => {
    expect(FN.match(/throttled = true/g)?.length).toBeGreaterThanOrEqual(2);
  });
});
