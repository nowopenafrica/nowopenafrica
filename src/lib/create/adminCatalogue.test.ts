import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

import {
  chargeableWarning, draftFrom, parseAmount, turnsChargeable, validate, wouldBeOrderable,
  type Draft, type EditableService,
} from './adminCatalogue';

const service = (over: Partial<EditableService> = {}): EditableService => ({
  sku: 'ds-flyer', name: 'Promotional flyer', short_description: null,
  price_minor: 750000, currency: 'NGN', price_unit: null,
  price_basis: 'proposed', pricing_model: 'starting_at', quote_required: false,
  publication_status: 'published', turnaround_min_days: 2, turnaround_max_days: 4,
  revisions_included: null, is_orderable: false,
  ...over,
});

const draft = (over: Partial<Draft> = {}): Draft => ({ ...draftFrom(service()), ...over });

describe('typing an amount', () => {
  it('accepts the separators people actually use', () => {
    expect(parseAmount('7500')).toEqual({ ok: true, minor: 750000 });
    expect(parseAmount('₦7,500')).toEqual({ ok: true, minor: 750000 });
    expect(parseAmount(' 7 500 ')).toEqual({ ok: true, minor: 750000 });
  });

  it('treats an empty box as "no price", not as zero', () => {
    /* Zero is a price — it means free. Absent means there isn't one. */
    expect(parseAmount('')).toEqual({ ok: true, minor: null });
    expect(parseAmount('0')).toEqual({ ok: true, minor: 0 });
  });

  /*
   * ₦7,500.005 is somebody's mistake. Rounding it to ₦7,500.01 stores a
   * number nobody typed and hides the error until it reaches an invoice.
   */
  it('refuses a fraction of a kobo rather than rounding it away', () => {
    expect(parseAmount('7500.005').ok).toBe(false);
    expect(parseAmount('7500.50')).toEqual({ ok: true, minor: 750050 });
  });

  it('refuses anything that is not a number', () => {
    for (const bad of ['seven thousand', '7500abc', '-500', '1e5']) {
      expect(parseAmount(bad).ok, bad).toBe(false);
    }
  });
});

describe('validating an edit', () => {
  it('insists on a name', () => {
    expect(validate(draft({ name: '   ' }))).toMatchObject({ ok: false });
  });

  it('refuses a turnaround that runs backwards', () => {
    const result = validate(draft({ turnaround_min: '9', turnaround_max: '2' }));
    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.reason).toMatch(/slower/i);
  });

  /*
   * A published service with no price and no quote route is a card that can
   * neither be bought nor asked about.
   */
  it('refuses a published dead end', () => {
    expect(validate(draft({ price: '', quote_required: false }))).toMatchObject({ ok: false });
    expect(validate(draft({ price: '', quote_required: true })).ok).toBe(true);
    expect(validate(draft({ price: '', pricing_model: 'free' })).ok).toBe(true);
    expect(validate(draft({ price: '', publication_status: 'draft' })).ok).toBe(true);
  });

  it('gives the reason in words a person can act on', () => {
    const result = validate(draft({ price: 'lots' }));
    if (result.ok) throw new Error('expected a refusal');
    expect(result.reason).not.toMatch(/constraint|violates|null value/i);
  });
});

describe('the edit that starts taking money', () => {
  const patchOf = (d: Partial<Draft>) => {
    const result = validate(draft(d));
    if (!result.ok) throw new Error(result.reason);
    return result.patch;
  };

  it('is exactly the four conditions, together', () => {
    expect(wouldBeOrderable(patchOf({ price_basis: 'quoted' }))).toBe(true);
    expect(wouldBeOrderable(patchOf({ price_basis: 'proposed' }))).toBe(false);
    expect(wouldBeOrderable(patchOf({ price_basis: 'quoted', publication_status: 'draft' }))).toBe(false);
    expect(wouldBeOrderable(patchOf({ price_basis: 'quoted', quote_required: true, price: '' }))).toBe(false);
  });

  /*
   * ── THE DEFINITION LIVES IN THE DATABASE ─────────────────────────────
   *
   * is_orderable is a GENERATED column. This helper exists only so the
   * screen can warn BEFORE saving, and it is worth nothing if the two
   * drift — a warning that fires on the wrong edits is a warning people
   * learn to dismiss. So the generated column is read out of the migration
   * and checked against this function's own conditions.
   */
  it('matches the generated column it is mirroring', () => {
    const sql = readFileSync(
      join(process.cwd(), 'supabase', 'migrations', '20261107010000_service_catalogue.sql'),
      'utf8',
    );
    const generated = sql.slice(sql.indexOf('is_orderable'), sql.indexOf('STORED'));
    expect(generated).toMatch(/publication_status\s*=\s*'published'/);
    expect(generated).toMatch(/price_basis\s*=\s*'quoted'/);
    expect(generated).toMatch(/quote_required\s*=\s*false/);
    expect(generated).toMatch(/price_minor IS NOT NULL/);
    /* And nothing else: a fifth condition here would make the warning lie. */
    const conditions = generated.split(/\bAND\b/).filter((p) => /[a-z_]+\s*(=|IS)/.test(p));
    expect(conditions).toHaveLength(4);
  });

  it('only warns when the service was not already chargeable', () => {
    expect(turnsChargeable(service({ is_orderable: false }), patchOf({ price_basis: 'quoted' }))).toBe(true);
    /* Already live: editing its description must not raise a money warning. */
    expect(turnsChargeable(service({ is_orderable: true }), patchOf({ price_basis: 'quoted' }))).toBe(false);
    expect(turnsChargeable(service({ is_orderable: false }), patchOf({ price_basis: 'proposed' }))).toBe(false);
  });

  /* A confirmation that does not repeat the figure is one people click through. */
  it('says the amount and what it commits NowOpen to', () => {
    const warning = chargeableWarning('Promotional flyer', '₦7,500');
    expect(warning).toContain('₦7,500');
    expect(warning).toContain('Promotional flyer');
    expect(warning).toMatch(/committed to delivering/i);
    expect(warning).toMatch(/actually quoted/i);
  });
});
