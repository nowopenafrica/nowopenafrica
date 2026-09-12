import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

import { CATALOGUE, PACKS, packAsItem } from '../lib/create/catalogue';
import { defaultConfiguration, quoteFor } from '../lib/create/configure';

/**
 * Every button on the Create page must land on the thing it names.
 *
 * This is here because it did not. Seven "Create it free" buttons all pointed
 * at bare /studio, so choosing "Poster" and choosing "Caption" both dropped you
 * on the Growth Center to go and find the tool yourself. "Publish an offer"
 * went to /offers, the page where customers BROWSE other people's offers.
 * "Share to WhatsApp" went to the Studio front door. Every pack's "Request a
 * quote" went to /waitlist — a launch-signup form that reached nobody who could
 * price the job.
 *
 * None of that is visible in a type check or a render test: the links were all
 * valid routes. They were just the wrong ones. So the assertions below are
 * about destination MEANING, not about whether a link resolves.
 */

const marketplace = readFileSync('src/components/create/CreateMarketplace.tsx', 'utf8');
const app = readFileSync('src/App.tsx', 'utf8');
const studio = readFileSync('src/pages/Studio.tsx', 'utf8');

/** Every path App.tsx actually declares. */
const routes = new Set(
  [...app.matchAll(/<Route\s+path="([^"]+)"/g)].map((m) => m[1]),
);

/**
 * Every literal destination on the Create page, in all three forms it is
 * written: to="/x", the `to: '/x'` entries in the ADVERTISE table, and the
 * template literal that appends a Studio module.
 */
const targets = [
  ...[...marketplace.matchAll(/to="([^"]+)"/g)].map((m) => m[1]),
  ...[...marketplace.matchAll(/to: '([^']+)'/g)].map((m) => m[1]),
  ...[...marketplace.matchAll(/to=\{[^}]*?(\/[a-z-]+)\?/g)].map((m) => m[1]),
].map((t) => t.trim()).filter(Boolean);

const pathOf = (href: string) => href.split('?')[0];

/** The module keys Studio will actually open, from its own META and ALIAS. */
const studioModules = new Set([
  ...[...studio.matchAll(/^\s{2}'?([a-z-]+)'?:\s*\{\s*key:/gm)].map((m) => m[1]),
  ...[...studio.matchAll(/^\s{2}([a-z-]+):\s*'([a-z-]+)',$/gm)].map((m) => m[1]),
]);

describe('every destination exists', () => {
  it('finds some links to check, so this file cannot pass by finding nothing', () => {
    expect(targets.length).toBeGreaterThan(3);
    expect(routes.size).toBeGreaterThan(20);
    expect(studioModules.size).toBeGreaterThan(10);
  });

  it('points only at routes App.tsx declares', () => {
    for (const t of targets) {
      if (!t.startsWith('/')) continue;
      expect(routes.has(pathOf(t)), `${t} is not a route`).toBe(true);
    }
  });

  it('deep-links every free item to a Studio module Studio can open', () => {
    const free = CATALOGUE.filter((c) => c.free);
    expect(free.length).toBeGreaterThan(0);
    for (const item of free) {
      expect(item.studioModule, `${item.sku} has no Studio target`).toBeTruthy();
      expect(studioModules.has(item.studioModule as string), `${item.sku} -> ${item.studioModule}`).toBe(true);
    }
  });

  it('sends different things to different tools', () => {
    // The whole bug was seven buttons with one destination. If this collapses
    // back to a single module, the deep links have stopped meaning anything.
    const used = new Set(CATALOGUE.filter((c) => c.free).map((c) => c.studioModule));
    expect(used.size).toBeGreaterThan(1);
  });
});

describe('destinations can perform the action they promise', () => {
  it('does not send someone publishing an offer to the page that browses offers', () => {
    expect(marketplace).not.toMatch(/'Publish an offer',\s*to:\s*'\/offers'/);
    expect(marketplace).toMatch(/'Publish an offer',\s*to:\s*'\/studio\?module=/);
  });

  it('sends sharing to the tool that shares, not the Studio front door', () => {
    expect(marketplace).toMatch(/'Share to WhatsApp',\s*to:\s*'\/studio\?module=/);
  });

  it('never routes a quote request to the waitlist', () => {
    // The waitlist is a launch-signup form. It cannot price a job, and
    // nobody reading it is expecting to.
    expect(marketplace).not.toContain('/waitlist');
  });

  it('takes a pack through the same order flow as everything else', () => {
    expect(marketplace).toMatch(/setConfiguring\(packAsItem\(p\)\)/);
  });
});

describe('a pack prices correctly through the configurator', () => {
  it('costs exactly the pack price, with no creator fee bolted on', () => {
    for (const pack of PACKS) {
      const item = packAsItem(pack);
      const quote = quoteFor(item, defaultConfiguration(item));
      expect(quote.total, pack.sku).toBe(pack.price);
      expect(quote.lines.some((l) => /creator/i.test(l.label)), pack.sku).toBe(false);
    }
  });

  it('stays an estimate, because every pack contains print', () => {
    for (const pack of PACKS) {
      const item = packAsItem(pack);
      expect(quoteFor(item, defaultConfiguration(item)).basis, pack.sku).toBe('indicative');
    }
  });

  it('quotes the turnaround the pack declares, not an inflated one', () => {
    for (const pack of PACKS) {
      const item = packAsItem(pack);
      expect(quoteFor(item, defaultConfiguration(item)).turnaround, pack.sku).toEqual(pack.turnaround);
    }
  });
});
