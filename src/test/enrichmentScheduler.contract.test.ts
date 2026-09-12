import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

/**
 * The enrichment scheduler is SQL and Deno — neither runs under Vitest — so
 * the invariant has to be pinned from the source text, the way
 * `applyPendingBundle.test.ts` pins the paste-able bundle.
 *
 * The failure this guards against is the one this session measured: the
 * executor existed, the queue table existed, and NOTHING EVER FILLED IT. The
 * spine below (refill → tick → cron) is what makes enrichment run at all, and
 * the owner opt-out is the only thing between it and an unattended machine
 * building profile pages nobody asked to be built.
 */

const MIGRATION = 'supabase/migrations/20260912000000_enrichment_scheduler.sql';
const EXECUTOR = 'supabase/functions/enrich-business/index.ts';
const migration = readFileSync(MIGRATION, 'utf8');
const executor = readFileSync(EXECUTOR, 'utf8');

describe('the queue gets refilled', () => {
  it('defines the refill function', () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.queue_due_enrichment_businesses');
  });

  it('cannot stack duplicate work on one (business, job_type)', () => {
    // The partial unique index is the arbiter; without this the insert would
    // duplicate on re-run and the tick would snowball.
    expect(migration).toMatch(/ON CONFLICT \(business_id, job_type\) WHERE status IN \('queued','running'\) DO NOTHING/);
  });

  it('honours the owner opt-out while being on by default', () => {
    // LEFT JOIN + coalesce defaults a business with no prefs row to opted-in,
    // and a hard `false` switch turns it off. Regressing to an INNER JOIN (or
    // dropping the coalesce) would change who gets enriched, so it is pinned.
    expect(migration).toContain('LEFT JOIN public.business_sync_preferences p ON p.business_id = b.id');
    expect(migration).toContain('coalesce(p.sync_enabled, true)');
  });

  it('only queues listable, not-removed businesses', () => {
    expect(migration).toContain('coalesce(b.removal_status, \'none\') <> \'removed\'');
    expect(migration).toContain('WHERE b.is_listable');
  });
});

describe('a live executor tick refills before it drains', () => {
  it('calls the refill, but only when live', () => {
    expect(executor).toMatch(/refill = !dryRun && params\.get\("refill"\) !== "0"/);
    expect(executor).toContain('db.rpc("queue_due_enrichment_businesses"');
  });

  it('stops a run whose owner switched sync off mid-queue', () => {
    /*
     * The scheduler already filters on sync_enabled; this is the executor
     * refusing the job anyway. It must read the column and cancel rather than
     * fail — the run did not error, it was refused.
     */
    expect(executor).toMatch(/select\("approval_threshold, auto_apply_hours, auto_apply_source_images, auto_apply_discovery_fields, confirm_24_hours, sync_enabled"\)/);
    expect(executor).toContain('prefsRow && prefsRow.sync_enabled === false');
    expect(executor).toContain('p_status: "cancelled"');
  });

  it('feeds the owner 24/7 confirmation into the engine policy', () => {
    expect(executor).toContain('confirm24Hours: Boolean(prefsRow?.confirm_24_hours)');
  });

  it('reports how many it queued', () => {
    expect(executor).toContain('refilled, outcomes, errors');
  });
});

describe('the safety boundary still holds', () => {
  it('cron fits the migration and is re-runnable', () => {
    expect(migration).toContain("cron.schedule('nowopen-enrichment'");
    expect(migration).toContain("cron.unschedule('nowopen-enrichment')");
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.tick_enrichment()');
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.enrichment_cron_status()');
  });

  it('the executor still cannot write a business directly', () => {
    // loadBusiness is the only `.from("businesses")` in the file — a second
    // one (a write) is exactly the boundary 20260911030000 drew.
    expect(executor.match(/\.from\("businesses"\)/g) ?? []).toHaveLength(1);
  });
});

describe('owner sync preferences close the loop', () => {
  const autoApply = readFileSync('supabase/migrations/20260912020000_enrichment_auto_apply.sql', 'utf8');
  const prefs = readFileSync('supabase/migrations/20260911050000_business_sync_preferences.sql', 'utf8');

  it('the executor hands finished proposals to the owner-authorized applier, but never in a dry run', () => {
    // The call sits inside the `summary.matched && !dryRun` block that also
    // writes evidence/proposals/media — dry runs plan, they never apply.
    expect(executor).toContain('db.rpc("auto_apply_due_proposals", { p_business: job.business_id })');
    const marker = executor.indexOf('db.rpc("auto_apply_due_proposals"');
    const blockStart = executor.indexOf('summary.matched && !dryRun');
    const mediaWrite = executor.indexOf('.from("business_media_assets").insert');
    expect(marker).toBeGreaterThan(blockStart);
    expect(marker).toBeGreaterThan(mediaWrite);
    expect(executor).toContain('auto_applied: autoApplied');
  });

  it('auto-apply only ever runs inside the database, against an owner flag', () => {
    // No frontend/edge code decides applicability — the applier reads the
    // owner's stored flags and confidence bar in SQL, under the service role.
    expect(autoApply).toContain('CREATE OR REPLACE FUNCTION public.auto_apply_due_proposals(p_business uuid)');
    expect(autoApply).toContain('GRANT EXECUTE ON FUNCTION public.auto_apply_due_proposals(uuid) TO service_role');
    expect(autoApply).toContain("IF NOT v_flag THEN CONTINUE; END IF;");
    expect(autoApply).toContain('IF v.confidence < v_pref.approval_threshold THEN CONTINUE; END IF;');
  });

  it('every flag defaults to ask-first and nothing auto-applies without one', () => {
    // The prefs migration's defaults are the safety state: all auto_apply_*
    // false except source images, which the migration deliberately defaults on.
    expect(prefs).toMatch(/auto_apply_hours\s+boolean NOT NULL DEFAULT false/);
    expect(prefs).toMatch(/auto_apply_discovery_fields\s+boolean NOT NULL DEFAULT false/);
    expect(prefs).toMatch(/auto_apply_source_images\s+boolean NOT NULL DEFAULT true/);
    // And every pending proposal the run creates is a candidate the applier
    // must decide about — nothing is applied outside that queue.
    expect(autoApply).toContain("WHERE business_id = p_business AND status = 'pending'");
  });

  it('the owner 24/7 confirmation overrides the flag and the bar for a matching value', () => {
    expect(autoApply).toContain('v_pref.confirm_24_hours');
    expect(autoApply).toContain("v.proposed_value ~* '24\\s*/\\s*7|24[\\s-]*hours|always open'");
  });

  it('the staff applier and the auto applier share one write core', () => {
    expect(autoApply).toContain('CREATE OR REPLACE FUNCTION public._apply_proposal_write(p_proposal uuid)');
    expect(autoApply).toContain('RETURN public._apply_proposal_write(p_proposal);');
    expect(autoApply).toContain('PERFORM public._apply_proposal_write(v.id);');
  });
});