import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

import { PILLARS, INDUSTRIES } from '../data/industrySystems';
import { OS_SHOWCASE } from '../data/osShowcase';
import { INDUSTRY_EXAMPLES, demoUsernameFor } from '../lib/industryExamples';

/**
 * The /platform page's layout, and the Create page's empty marketplace.
 *
 * Both are about the same rule from the Create 2.0 brief: every visible
 * control must either work or be clearly marked unavailable. A filter for an
 * empty set is neither, and a card that looks like a business but has no
 * business behind it is worse.
 */

const stripComments = (src: string) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

const platform = stripComments(readFileSync('src/pages/Platform.tsx', 'utf8'));
const media = stripComments(readFileSync('src/pages/Media.tsx', 'utf8'));

describe('the ten capabilities read as one control, not ten cards', () => {
  it('is a tablist, so the ten are a selector', () => {
    /*
     * It was ten cards, each carrying the pillar's tagline, above a panel that
     * repeated the tagline of whichever was active — ten paragraphs competing
     * for attention, one of them duplicated, before the reader had chosen.
     */
    expect(platform).toMatch(/role="tablist"/);
    expect(platform).toContain('aria-label="Platform capabilities"');
    expect(platform).toContain('id="pillar-panel"');
    expect(platform).toMatch(/role="tabpanel"/);
  });

  it('is keyboard-navigable, since it is now a tablist', () => {
    // A tablist that does not move on arrow keys is a lie to a screen reader.
    const strip = platform.slice(platform.indexOf('aria-label="Platform capabilities"'));
    expect(strip).toMatch(/ArrowRight/);
    expect(strip).toMatch(/ArrowLeft/);
    expect(strip).toMatch(/tabIndex=\{selected \? 0 : -1\}/);
  });

  it('stops printing each tagline twice', () => {
    // The selector carries the name only; the panel does the explaining.
    const strip = platform.slice(
      platform.indexOf('aria-label="Platform capabilities"'),
      platform.indexOf('id="pillar-panel"'),
    );
    expect(strip).not.toContain('tagline');
  });

  it('still reaches every one of the ten', () => {
    expect(PILLARS).toHaveLength(10);
    expect(platform).toMatch(/PILLARS\.map\(\(\{ name, icon: Icon \}, i\) =>/);
  });

  it('does not tick the pillar features either', () => {
    // Billboards, radio and TV booking are roadmap. A tick is a claim.
    const panel = platform.slice(platform.indexOf('id="pillar-panel"'));
    // Bounded: an open-ended slice runs past this section into the industry
    // panel below, whose live-module chips are ticked on purpose.
    const at = panel.indexOf('pillar.features.map');
    const features = panel.slice(at, at + 600);
    expect(features).not.toMatch(/<Check/);
    expect(features).toMatch(/<Plus/);
  });
});

describe('see it live covers every industry, six to a row', () => {
  it('lays out six across on a wide screen', () => {
    const grid = platform.slice(platform.indexOf('OS_SHOWCASE.map') - 900);
    expect(grid).toMatch(/xl:grid-cols-6/);
  });

  it('adds the industries that have no demo profile', () => {
    /*
     * All 45 curated spotlights were already on the page, so "more industries"
     * could not come from more spotlights without inventing more businesses.
     * These six have example pages instead — the layout, filled from the
     * shipped module config, named after the industry and never a business.
     */
    expect(platform).toContain('const layoutOnly = INDUSTRY_EXAMPLES.filter');
    expect(platform).toMatch(/layoutOnly\.map\(\(ex\) =>/);
    const expected = INDUSTRY_EXAMPLES.filter((ex) => !demoUsernameFor(ex.slug));
    expect(expected.length).toBeGreaterThan(0);
    expect(OS_SHOWCASE.length + expected.length).toBeGreaterThanOrEqual(INDUSTRIES.length);
  });

  it('never dresses a layout card as a business', () => {
    // No photograph, no location, dashed border, and it says what it is —
    // because there is no business behind it and the card must not imply one.
    const block = platform.slice(platform.indexOf('layoutOnly.map'));
    expect(block).toContain('Page layout');
    expect(block).toContain('No demo profile yet');
    expect(block).toMatch(/border-dashed/);
    expect(block).not.toMatch(/<img/);
    expect(block).toMatch(/examplePath\(ex\.slug\)/);
    // And it must not link to /business/<something>.
    expect(block).not.toMatch(/\/business\//);
  });

  it('every layout card points at an industry that really lacks a demo', () => {
    for (const ex of INDUSTRY_EXAMPLES.filter((e) => !demoUsernameFor(e.slug))) {
      expect(INDUSTRIES.map((i) => i.slug), ex.slug).toContain(ex.slug);
    }
  });
});

describe('the Create marketplace hides controls it cannot honour', () => {
  it('knows the difference between empty and filtered-to-nothing', () => {
    /*
     * Now also guarded on !loadError. The original condition treated a failed
     * read as an empty marketplace — and this page is genuinely empty in
     * production, which is exactly what made that mistake invisible.
     */
    expect(media).toContain('const marketplaceEmpty = !loading && !loadError && services.length === 0;');
  });

  it('drops the search, the discipline filters and the zero count when empty', () => {
    /*
     * With nothing listed the page still rendered a search box that could not
     * match, a 21-option discipline dropdown, six discipline chips each
     * reading 0, and a heading counting to zero. Each worked exactly as built
     * and did nothing.
     */
    expect(media.match(/\{!marketplaceEmpty && \(/g) ?? []).toHaveLength(3);
  });

  it('says something true in the subtitle while it is empty', () => {
    expect(media).toMatch(/opens as creators join/);
  });

  it('keeps the honest empty state and both ways out', () => {
    expect(media).toMatch(/No creative professionals listed yet/);
    expect(media).toMatch(/until a real person has claimed their profile/);
    expect(media).toContain('href="#create-designs"');
    expect(media).toMatch(/to="\/waitlist"/);
  });

  it('leaves the invented creative services gated to DEV', () => {
    /*
     * The reason the section is empty in production. CREATIVE_SERVICES is
     * invented studios — "Kalahari Films", "Sable Studio" — carrying invented
     * ratings, review counts and clients_served. They must never ship.
     */
    const populate = readFileSync('src/data/populateData.ts', 'utf8');
    expect(populate).toContain('const SAMPLES_ENABLED = import.meta.env.DEV;');
    expect(stripComments(populate)).toMatch(/generateMediaServices[\s\S]{0,80}!SAMPLES_ENABLED \? \[\]/);
  });
});
