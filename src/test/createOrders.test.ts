import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

/**
 * Guards for the Create order flow.
 *
 * The page had a catalogue and no function: every button went to /studio or
 * /waitlist, so somebody who knew exactly what they wanted could not say so.
 * These assert the three things that make the new flow safe rather than merely
 * present.
 */

const ui = readFileSync('src/components/create/CreateConfigurator.tsx', 'utf8');
const sql = readFileSync('supabase/migrations/20260906060000_create_orders.sql', 'utf8');

describe('an estimate is never presented as a price', () => {
  it('says "Request this order" while the basis is indicative', () => {
    const lib = readFileSync('src/lib/create/configure.ts', 'utf8');
    expect(lib).toMatch(/quote\.basis === 'quoted' \? 'Place this order' : 'Request this order'/);
  });

  it('warns, in the panel, that nothing is charged yet', () => {
    expect(ui).toMatch(/market estimate/i);
    expect(ui).toMatch(/nothing is charged/i);
  });

  it('takes no payment anywhere in the flow', () => {
    // A Pay button against a price no supplier agreed to is a loss on every
    // order, or a price rise after the fact. Neither is acceptable.
    expect(ui).not.toMatch(/paystack|checkout|card number|pay now/i);
  });
});

describe('the order cannot be tampered with on the way in', () => {
  it('refuses a pre-accepted or pre-priced order at the database', () => {
    expect(sql).toMatch(/AND status = 'new'/);
    expect(sql).toMatch(/AND quoted_total IS NULL/);
    expect(sql).toMatch(/AND handled_by IS NULL/);
  });

  it('keeps orders unreadable by the public', () => {
    // These rows carry contact details and what somebody is spending.
    expect(sql).not.toMatch(/FOR SELECT\s+TO anon/);
    expect(sql).toMatch(/create_orders_staff_read[\s\S]*?USING \(public\.is_staff\(\)\)/);
  });

  it('does not chain .select() onto the insert', () => {
    const stmt = ui.slice(ui.indexOf("from('create_orders')"));
    expect(stmt.slice(0, stmt.indexOf(';'))).not.toContain('.select(');
  });
});

describe('the order is worth acting on', () => {
  it('captures a spec a printer can quote from', () => {
    expect(ui).toMatch(/spec: specLine\(item, config\)/);
  });

  it('records the estimate the customer was shown, and its basis', () => {
    expect(ui).toMatch(/estimate_total: quote\.total/);
    expect(ui).toMatch(/estimate_basis: quote\.basis/);
  });

  it('keeps the real price beside the estimate, so the gap is visible', () => {
    const panel = readFileSync('src/components/admin/CreateOrders.tsx', 'utf8');
    expect(panel).toMatch(/quoted_total/);
    expect(panel).toMatch(/vs estimate/);
  });

  it('emits an event, so demand can be counted before a printer is signed', () => {
    expect(ui).toMatch(/track\('create_order_requested'/);
    expect(readFileSync('src/lib/telemetry.ts', 'utf8')).toContain("'create_order_requested'");
  });
});
