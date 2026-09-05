import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

import {
  cleanText, cleanOverride, cleanPageOverrides, isSafeHref, isInternalPath,
  resolveSlot, stripAlign,
} from './resolve';
import { SLOTS, slotsForPage, EDITABLE_PAGES, LINK_TARGETS } from './registry';
import type { SlotDef } from './types';

const routes = LINK_TARGETS;

const slot = (over: Partial<SlotDef> = {}): SlotDef => ({
  id: 'test.slot', page: 'test', label: 'Test', kind: 'text', maxLength: 50, ...over,
});

describe('link safety', () => {
  it('refuses every scheme it was not told about', () => {
    for (const href of [
      'javascript:alert(1)',
      'JavaScript:alert(1)',
      ' javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox',
      'http://insecure.example.com',
      '//evil.example.com',
      'file:///etc/passwd',
    ]) {
      expect(isSafeHref(href, routes), href).toBe(false);
    }
  });

  it('accepts known internal routes, https, mailto and tel', () => {
    expect(isSafeHref('/pricing', routes)).toBe(true);
    expect(isSafeHref('/waitlist?ref=about', routes)).toBe(true);
    expect(isSafeHref('https://nowopenafrica.com', routes)).toBe(true);
    expect(isSafeHref('mailto:hello@nowopenafrica.com', routes)).toBe(true);
    expect(isSafeHref('tel:+2348012345678', routes)).toBe(true);
  });

  it('refuses an internal path that is not a route', () => {
    // Not pedantry: middleware treats a single-segment path as a business
    // username, so a typo would resolve as a business lookup, not a 404.
    expect(isInternalPath('/pricng', routes)).toBe(false);
    expect(isSafeHref('/pricng', routes)).toBe(false);
  });
});

describe('text cleaning', () => {
  it('strips markup and caps length', () => {
    expect(cleanText('<script>alert(1)</script>Hello', 50)).toBe('alert(1)Hello');
    expect(cleanText('<b>Bold</b> claim', 50)).toBe('Bold claim');
    expect(cleanText('x'.repeat(200), 10)).toHaveLength(10);
  });

  it('removes invisible characters', () => {
    expect(cleanText('Now​Open﻿', 50)).toBe('NowOpen');
  });

  it('treats empty and non-strings as no override', () => {
    expect(cleanText('   ', 50)).toBeUndefined();
    expect(cleanText(42, 50)).toBeUndefined();
    expect(cleanText(null, 50)).toBeUndefined();
  });
});

describe('override cleaning is a whitelist', () => {
  it('ignores href on a text slot', () => {
    const out = cleanOverride(slot({ kind: 'text' }), { href: '/pricing' }, routes);
    expect(out).toBeUndefined();
  });

  it('ignores hidden unless the slot is hideable', () => {
    expect(cleanOverride(slot(), { hidden: true }, routes)).toBeUndefined();
    expect(cleanOverride(slot({ hideable: true }), { hidden: true }, routes))
      .toEqual({ hidden: true });
  });

  it('ignores a size unless the slot declared what sizes mean', () => {
    expect(cleanOverride(slot(), { style: { size: 'lg' } }, routes)).toBeUndefined();
    const sized = slot({ sizes: { sm: 'text-sm', md: 'text-base', lg: 'text-lg' } });
    expect(cleanOverride(sized, { style: { size: 'lg' } }, routes))
      .toEqual({ style: { size: 'lg' } });
  });

  it('ignores tokens outside the vocabulary', () => {
    const s = slot({ alignable: true, sizes: { sm: 'a', md: 'b', lg: 'c' } });
    expect(cleanOverride(s, { style: { size: 'huge', align: 'justify' } }, routes))
      .toBeUndefined();
  });

  it('drops unknown fields entirely', () => {
    const out = cleanOverride(slot(), { text: 'Hi', className: 'absolute', onClick: 'x' }, routes);
    expect(out).toEqual({ text: 'Hi' });
  });

  it('drops overrides for slots that no longer exist', () => {
    const defs = slotsForPage('about');
    const out = cleanPageOverrides(defs, {
      'about.hero.title': { text: 'New headline' },
      'about.slot.deleted.last.year': { text: 'ghost' },
    }, routes);
    expect(Object.keys(out)).toEqual(['about.hero.title']);
  });

  it('survives junk in the stored row', () => {
    const defs = slotsForPage('about');
    expect(cleanPageOverrides(defs, null, routes)).toEqual({});
    expect(cleanPageOverrides(defs, 'not an object', routes)).toEqual({});
    expect(cleanPageOverrides(defs, { 'about.hero.title': 'string' }, routes)).toEqual({});
  });
});

describe('resolution', () => {
  it('falls back to the code when there is no override', () => {
    const r = resolveSlot(slot(), undefined);
    expect(r.text).toBeNull();
    expect(r.hidden).toBe(false);
    expect(r.overridden).toBe(false);
    expect(r.className).toBe('');
  });

  it('only ever emits classes from the slot definition', () => {
    const s = slot({ alignable: true, sizes: { sm: 'text-sm', md: 'text-base', lg: 'text-lg' } });
    const r = resolveSlot(s, { style: { size: 'lg', align: 'center' } });
    expect(r.className).toBe('text-lg text-center');
  });

  it('keeps the coded type scale when nobody has chosen a size', () => {
    // Making a slot size-tunable must not change how the page looks. Without
    // this the base size classes move out of the JSX and nothing replaces them.
    const s = slot({ sizes: { sm: 'text-sm', md: 'text-base', lg: 'text-lg' } });
    expect(resolveSlot(s, undefined).className).toBe('text-base');
    expect(resolveSlot(slot({ sizes: { sm: 'a', md: 'b', lg: 'c' }, defaultSize: 'lg' }), undefined).className)
      .toBe('c');
  });

  it('renders the coded copy when a slot is hidden but not hideable', () => {
    const r = resolveSlot(slot(), cleanOverride(slot(), { hidden: true }, routes));
    expect(r.hidden).toBe(false);
  });

  it('strips base alignment so a token is not fighting it', () => {
    expect(stripAlign('text-3xl text-center font-bold md:text-left'))
      .toBe('text-3xl font-bold');
  });
});

describe('the About page is fully declared', () => {
  const src = readFileSync('src/pages/About.tsx', 'utf8');

  it('declares every slot the page actually uses', () => {
    const used = [...src.matchAll(/slot="([^"]+)"/g)].map((m) => m[1]);
    expect(used.length).toBeGreaterThan(0);
    const declared = new Set(slotsForPage('about').map((s) => s.id));
    for (const id of used) expect(declared.has(id), `${id} is used but not declared`).toBe(true);
  });

  it('points every CTA at an allowed destination', () => {
    for (const to of [...src.matchAll(/\sto="([^"]+)"/g)].map((m) => m[1])) {
      expect(LINK_TARGETS, to).toContain(to);
    }
  });
});

describe('registry integrity', () => {
  it('has no duplicate slot ids', () => {
    const ids = SLOTS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every slot an id that matches its page', () => {
    for (const s of SLOTS) expect(s.id.startsWith(`${s.page}.`), s.id).toBe(true);
  });

  it('offers a sane length for every slot', () => {
    for (const s of SLOTS) {
      expect(s.maxLength, s.id).toBeGreaterThan(0);
      expect(s.maxLength, s.id).toBeLessThanOrEqual(1000);
    }
  });

  it('lists every adopted page', () => {
    const pages = new Set(SLOTS.map((s) => s.page));
    for (const p of pages) {
      expect(EDITABLE_PAGES.some((e) => e.page === p), p).toBe(true);
    }
  });

  it('declares no slot on a page that must stay system-controlled', () => {
    // Business profiles, discovery and every application surface. If one of
    // these ever appears here it is a mistake, not a feature.
    const forbidden = ['business', 'discovery', 'dashboard', 'admin', 'checkout', 'login', 'profile'];
    for (const s of SLOTS) expect(forbidden, s.id).not.toContain(s.page);
  });
});

describe('link targets track the router', () => {
  const app = readFileSync('src/App.tsx', 'utf8');

  it('every offered destination is a real route', () => {
    for (const target of LINK_TARGETS) {
      expect(app.includes(`path="${target}"`), `${target} is not a route in App.tsx`).toBe(true);
    }
  });

  it('every adopted page has a real route', () => {
    for (const p of EDITABLE_PAGES) {
      expect(app.includes(`path="${p.path}"`), `${p.path} is not a route`).toBe(true);
    }
  });
});
