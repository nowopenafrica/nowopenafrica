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

/**
 * The order used to end at "Request received." and nothing else. No account
 * means no inbox and no dashboard, so that sentence was the end of the road:
 * the customer could not see the job again, and could not say yes when we came
 * back with a price. These guard the way back in.
 */
const track = readFileSync('supabase/migrations/20260906070000_create_order_tracking.sql', 'utf8');
const status = readFileSync('src/pages/OrderStatus.tsx', 'utf8');

describe('the customer can find the order again', () => {
  it('still gives the public no way to read the table', () => {
    // The definer function is the alternative to a public SELECT, not a step
    // towards one. If a policy ever grants anon SELECT, this whole design goes.
    expect(track).not.toMatch(/FOR SELECT\s+TO anon/);
    expect(track).toMatch(/SECURITY DEFINER/);
  });

  it('answers about exactly one reference, never a prefix', () => {
    // A LIKE or a prefix match here would turn the tracking page into a way to
    // walk the table with a partial code.
    expect(track).toMatch(/WHERE o\.reference = p_reference/);
    expect(track).not.toMatch(/reference LIKE/i);
  });

  it('returns the job and the price, and no contact details', () => {
    const fn = track.slice(track.indexOf('FUNCTION public.create_order_status'));
    const body = fn.slice(0, fn.indexOf('REVOKE'));
    expect(body).toMatch(/o\.quoted_total/);
    expect(body).not.toMatch(/o\.contact/);
    expect(body).not.toMatch(/o\.note\b/);
  });

  it('is never indexed, because a reference in a search result is a leaked order', () => {
    expect(status).toMatch(/robots: 'noindex, nofollow'/);
    expect(readFileSync('middleware.ts', 'utf8')).toMatch(/'order',/);
  });

  it('makes the reference impossible to miss when the order is placed', () => {
    expect(ui).toMatch(/Your reference/);
    expect(ui).toMatch(/orderTrackPath\(reference\)/);
  });
});

describe('accepting a quote', () => {
  it('can only move a quoted order that carries a real price', () => {
    const fn = track.slice(track.indexOf('FUNCTION public.accept_create_order'));
    expect(fn).toMatch(/AND status = 'quoted'/);
    expect(fn).toMatch(/AND quoted_total IS NOT NULL/);
  });

  it('cannot price, cancel or create anything', () => {
    const fn = track.slice(track.indexOf('FUNCTION public.accept_create_order'), track.indexOf('-- 5.'));
    expect(fn).not.toMatch(/INSERT|DELETE|quoted_total\s*=/i);
  });

  it('still takes no payment', () => {
    expect(status).not.toMatch(/paystack|checkout|card number|pay now/i);
  });
});

describe('the artwork somebody already has', () => {
  it('goes to a private bucket, never the world-readable one', () => {
    expect(track).toMatch(/'create-artwork', 'create-artwork', false/);
    expect(ui).not.toMatch(/business-images/);
  });

  it('only permits an upload a recent order already asked for', () => {
    // Without this an anonymous-writable bucket is a free file host.
    expect(track).toMatch(/o\.artwork_path = p_name/);
    expect(track).toMatch(/o\.created_at > now\(\) - interval '1 hour'/);
  });

  it('stops an order from claiming a file that belongs to another order', () => {
    expect(track).toMatch(/artwork_path LIKE reference \|\| '\/%'/);
  });

  it('writes the order before the file, because the order is the authorisation', () => {
    expect(ui.indexOf("from('create_orders')")).toBeLessThan(ui.indexOf('.storage'));
  });

  it('keeps the order when the upload fails', () => {
    expect(ui).toMatch(/Order placed, but the artwork did not upload/);
  });

  it('never hands out a public URL for it', () => {
    const panel = readFileSync('src/components/admin/CreateOrders.tsx', 'utf8');
    expect(panel).toMatch(/createSignedUrl\(path, 300\)/);
    expect(panel).not.toMatch(/getPublicUrl/);
  });
});
