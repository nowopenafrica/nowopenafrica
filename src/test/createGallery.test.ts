import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import TemplateGallery from '../components/create/TemplateGallery';
import { DESIGN_TEMPLATES } from '../lib/designTemplates';
import { NEEDS, isListed, listedFor, listedIn, type NeedSlug } from '../lib/create/needs';
import { templateByKeyAnywhere } from '../lib/create/templateCatalogue';
import { DESIGN_STYLES } from '../lib/design/styles';
import { TYPE_PAIRINGS } from '../lib/design/typefaces';
import { DESIGN_FORMATS } from '../data/studioPresets';
import { exportPixelRatio } from '../lib/design/printSpec';

/**
 * The design library on the PUBLIC Create page.
 *
 * Two faults these exist to keep fixed.
 *
 * ONE: everything the design engine can do lived behind the sign-in, so the
 * page promised "make it free with your own logo and colours" and then showed a
 * price list.
 *
 * TWO: the cards linked to /studio?module=design, which opens Studio's front
 * door on whatever layout was last selected — not the one that was clicked. It
 * navigated, so it "worked", and it visibly did nothing.
 */

/*
 * The gallery's catalogue is the bundled layouts plus one UPLOADED row with no
 * look, so the "filter after the merge" rule is exercised and not assumed.
 */
const UPLOADED_LABEL = 'Uploaded unfinished row';
vi.mock('../hooks/useDesignCatalogue', async () => {
  const mod = await import('../lib/designTemplates');
  const base = mod.DESIGN_TEMPLATES.find((t) => !t.look)!;
  const row = { ...base, key: 'uploaded-lookless-row', label: 'Uploaded unfinished row', look: undefined };
  return { useDesignCatalogue: () => ({ templates: [...mod.DESIGN_TEMPLATES, row] }) };
});

const gallery = readFileSync('src/components/create/TemplateGallery.tsx', 'utf8');

/**
 * The same file with its comments removed.
 *
 * Guards that search for forbidden COPY must not read the notes explaining
 * why that copy is forbidden. A comment saying "a catalogue of 649 designs
 * read as one poster repeated" is a record of a fix, not a claim shown to
 * anybody — and a guard that cannot tell the difference eventually gets
 * worked around by deleting the explanation, which is the opposite of what
 * it is for.
 */
const galleryCode = gallery
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');
const customiser = readFileSync('src/components/create/TemplateCustomiser.tsx', 'utf8');
/*
 * The gallery's sample copy moved here on 2026-10-14 so each layout can show
 * what it is FOR, rather than all of them showing the same four lines. The
 * no-invented-business rule did not move with it — this file still checks it,
 * and sampleCopy.test.ts checks every string the module produces.
 */
const sampleCopy = readFileSync('src/lib/create/sampleCopy.ts', 'utf8');
const marketplace = readFileSync('src/components/create/CreateMarketplace.tsx', 'utf8');
const studio = readFileSync('src/components/studio/DesignStudio.tsx', 'utf8');

describe('the work is public, not behind the sign-in', () => {
  it('is on the Create page itself', () => {
    /*
     * Mounted, with or without props.
     *
     * This matched the literal `<TemplateGallery />` and broke the moment the
     * gallery took one — while the thing it guards, that the work is on the
     * PUBLIC page and not behind the sign-in, was never in question. An
     * assertion that fails on a prop is testing the spelling, not the rule.
     */
    /*
     * Since the Create page became request bar → need view, the gallery
     * renders inside the need view, which the page mounts.
     */
    expect(marketplace).toMatch(/<NeedView[\s/>]/);
    expect(readFileSync('src/components/create/NeedView.tsx', 'utf8')).toMatch(/<TemplateGallery[\s/>]/);
  });

  it('renders the REAL templates through the real renderer', () => {
    // Not screenshots and not a marketing mock-up: a gallery of
    // prettier-than-real previews is a promise the product then breaks.
    expect(gallery).toContain('TemplateSurface');
    expect(gallery).toContain('applyStyle');
    /*
     * The real CATALOGUE, which is now the shipped layouts plus whatever a
     * creative manager has published — not a second, frozen copy of the
     * shipped list. Reading DESIGN_TEMPLATES directly here would mean a
     * published template appeared in the admin screen and nowhere else.
     */
    expect(gallery).toContain('useDesignCatalogue');
  });

  it('waits for the typefaces before it draws', () => {
    // The section whose whole job is the typography must not first paint in
    // Georgia and Arial Narrow.
    expect(gallery).toContain('ensureTypefacesReady');
    expect(customiser).toContain('ensureTypefacesReady');
  });

  it('claims a library size it can prove', () => {
    /* The designs on offer, counted - never layouts multiplied by styles. */
    expect(gallery).toMatch(/\{listed\.length\.toLocaleString\('en-NG'\)\} designs/);
    expect(gallery).not.toMatch(/libraryDepth/);
    // No written count anywhere — 312 must never be a literal in the copy.
    expect(galleryCode).not.toMatch(/\b(\d{3,})\s+designs/);
  });
});

describe('a card opens the design it shows', () => {
  it('opens the editor rather than navigating to a different design', () => {
    expect(gallery).toContain('TemplateCustomiser');
    expect(gallery).toMatch(/onClick=\{onOpen\}/);
    // A card must not be a bare link to the module front door again.
    expect(gallery).not.toMatch(/to="\/studio\?module=design"/);
  });

  it('is a real control with an accessible name', () => {
    expect(gallery).toMatch(/aria-label=\{`Edit \$\{template\.label\}`\}/);
  });

  it('carries the template and the style when it does go to Studio', () => {
    /*
     * The RULE is that the link carries the design, not that it is spelled a
     * particular way. It used to point at /studio?module=design — the
     * brand-kit module, a different and older editor that knew nothing about
     * the layout, the size or the words just typed. It now points at
     * /media/studio and carries template, style, accent, size and copy.
     */
    expect(customiser).toContain('/media/studio?');
    expect(customiser).toMatch(/template: template\.key/);
    expect(customiser).toMatch(/style: styleKey/);
    expect(customiser).toMatch(/accent: brand/);
  });

  it('and Studio honours both, after checking they exist', () => {
    // An unknown key would otherwise render a blank canvas with no explanation.
    expect(studio).toMatch(/q\.get\('template'\)/);
    expect(studio).toMatch(/q\.get\('style'\)/);
    expect(studio).toMatch(/templateByKey\(wanted\)\.key === wanted/);
    expect(studio).toMatch(/DESIGN_STYLES\.some\(\(s\) => s\.key === style\)/);
  });
});

describe('it is genuinely editable', () => {
  it('lets the words be changed', () => {
    for (const label of ['Headline', 'Business name', 'Supporting line', 'Small line above']) {
      expect(customiser, label).toContain(`aria-label="${label}"`);
    }
  });

  it('lets the fonts be changed, which is the first thing anybody asks', () => {
    // "Pick a different style" is not an answer to "can I change the font".
    expect(customiser).toContain('TYPE_PAIRINGS');
    expect(customiser).toMatch(/setPairingKey/);
    expect(TYPE_PAIRINGS.length).toBeGreaterThanOrEqual(6);
  });

  it('lets any colour be used, not only the swatches', () => {
    expect(customiser).toContain('type="color"');
    expect(customiser).toMatch(/aria-label="Pick any colour"/);
  });

  it('offers every style and every size', () => {
    expect(customiser).toContain('DESIGN_STYLES.map');
    expect(customiser).toContain('DESIGN_FORMATS.map');
    expect(DESIGN_STYLES.length).toBeGreaterThanOrEqual(8);
    expect(DESIGN_FORMATS.length).toBeGreaterThanOrEqual(20);
  });

  it('closes on Escape, because a panel that traps you is worse than none', () => {
    expect(customiser).toMatch(/e\.key === 'Escape'/);
  });
});

describe('the download', () => {
  it('needs no account and no server', () => {
    // "Do not make registration the first step" is the acquisition strategy;
    // the export runs in the browser so it costs nothing to give away.
    expect(customiser).toContain('exportNodeToPng');
    expect(customiser).not.toMatch(/ProtectedRoute|requireAuth|useAuth/);
    expect(customiser).toMatch(/no account/i);
  });

  it('caps the raster, so a billboard does not kill the tab', () => {
    // 4500px at pixelRatio 2 is a 9000px canvas. A mid-range Android cannot
    // allocate it and the tab dies with no error anybody can act on.
    //
    // The cap used to be a local constant here and is now shared with
    // lib/design/printSpec.ts, which is what tells the customer the
    // resolution they will receive. Two copies of the rule would let the
    // size picker promise one thing and the download produce another, so
    // this asserts the component calls the shared one — and then asserts
    // what the rule actually DOES, which grepping for a constant never did.
    expect(customiser).toContain('exportPixelRatio');
    expect(customiser).toMatch(/pixelRatio: exportPixelRatio\(/);
    expect(exportPixelRatio(4500)).toBe(1);
    expect(4500 * exportPixelRatio(4500)).toBeLessThanOrEqual(4500);
    // A small canvas is still rendered up, rather than shipped soft.
    expect(exportPixelRatio(1000)).toBe(2);
  });

  it('exports the format the customer chose, at its own pixel size', () => {
    expect(customiser).toMatch(/designWidth: format\.w/);
    expect(customiser).toMatch(/data-export-width=\{format\.w\}/);
  });

  it('says what an account is actually for, rather than gating the download', () => {
    expect(customiser).toMatch(/Studio adds your real logo/);
  });
});

describe('nothing is fabricated', () => {
  it('uses placeholder copy, never an invented business', () => {
    for (const src of [sampleCopy, customiser]) {
      expect(src).toMatch(/Your business/);
      expect(src).toMatch(/Your headline here/);
      // No plausible-looking phone number, and no invented review or rating.
      expect(src).not.toMatch(/\+?234[\s-]?\d{3}/);
      expect(src).not.toMatch(/\b0[789]\d{9}\b/);
      expect(src).not.toMatch(/\b\d(\.\d)? stars?\b|\d+ reviews?\b/i);
    }
  });

  it('shows the placeholders as labels, so nobody mistakes them for data', () => {
    // The panel's lists come from sampleFor(), the same source the card uses,
    // so the labels live in sampleCopy.ts rather than being repeated here.
    expect(customiser).toContain('sampleFor(template)');
    const copy = readFileSync('src/lib/create/sampleCopy.ts', 'utf8');
    expect(copy).toContain("'Your phone'");
    expect(copy).toContain("'Your first service'");
  });
});

describe('it does not stall the page', () => {
  it('mounts a preview only once it is in view', () => {
    // A TemplateSurface is a dozen absolutely-positioned nodes with gradients
    // and clip paths. Thirty-nine at once is a visible stall on the phones this
    // page is mostly read on.
    expect(gallery).toContain('IntersectionObserver');
    expect(gallery).toMatch(/setPages/);
  });

  it('measures the preview scale rather than assuming one', () => {
    // A hard-coded scale is right at exactly one viewport width.
    expect(gallery).toContain('ResizeObserver');
    expect(gallery).toMatch(/clientWidth \/ DESIGN/);
    expect(customiser).toContain('ResizeObserver');
  });

  it('never renders more layouts at once than it has', () => {
    expect(DESIGN_TEMPLATES.length).toBeGreaterThan(30);
    expect(gallery).toMatch(/results\.slice\(0, shown\)/);
  });

  it('shows seven across on a wide desktop and steps down to two on a phone', () => {
    expect(gallery).toContain('xl:grid-cols-7');
    expect(gallery).toContain('lg:grid-cols-6');
    expect(gallery).toContain('grid-cols-2');
    expect(gallery).toContain('sm:grid-cols-3');
    expect(gallery).toContain('md:grid-cols-4');
  });

  it('pages by a number every column count divides', () => {
    /*
     * This asserted the literal `const PAGE = 12`, and the component has
     * since been changed to `columns * 2` — pages measured in ROWS rather
     * than cards.
     *
     * The new rule is strictly better at the thing the old one was for. 12
     * divides 2, 3, 4 and 6, but NOT 7, and the grid goes to 7 across; a
     * fixed 12 therefore left a ragged row at the widest breakpoint, which
     * is exactly what this test exists to prevent. Two rows is whole at
     * every column count there will ever be, including after a resize.
     *
     * So the assertion follows the intent rather than the constant.
     */
    expect(gallery).toMatch(/const PAGE = columns \* 2;/);
    expect(gallery).toMatch(/const shown = pages \* PAGE;/);
    expect(gallery).toMatch(/setPages\(\(n\) => n \+ 1\)/);
  });
});

describe('background, logo and click-to-edit', () => {
  it('takes a picture or a video for the background', () => {
    expect(customiser).toMatch(/accept="image\/png,image\/jpeg,image\/webp,video\//);
    expect(customiser).toMatch(/setMedia/);
  });

  it('never puts a blob: URL where the rasteriser has to read it', () => {
    /*
     * The trap: an object URL renders perfectly in the preview and then fails
     * the export on PRODUCTION ONLY, because connect-src does not allow blob:.
     * Development never shows it. Images therefore become data URLs, and the
     * one createObjectURL is for a <video>, which media-src does allow.
     */
    expect(customiser).toContain('readAsDataURL');
    expect((customiser.match(/createObjectURL/g) ?? []).length).toBe(1);
    expect(customiser).toMatch(/kind: 'video'[\s\S]{0,80}poster/);
  });

  it('flattens a video to a real frame for the PNG', () => {
    // A rasteriser meeting a <video> produces a hole. Something has to decide
    // which instant the still is, so it is decided at upload.
    expect(customiser).toContain('posterFromVideo');
    expect(customiser).toContain('needsFlatten');
    expect(customiser).toMatch(/mediaKind=\{flattening \? 'image'/);
  });

  it('revokes the object URL, so every video tried stays out of memory', () => {
    expect(customiser).toContain('revokeObjectURL');
  });

  it('has a transparency control over the picture, and says what it is for', () => {
    expect(customiser).toContain('id="customiser-overlay"');
    expect(customiser).toMatch(/surfaceOpacity=\{media \? overlay : 1\}/);
    // Starts where the template itself would put the scrim rather than at full
    // strength, or the picture is buried the instant it is added.
    expect(customiser).toContain('defaultMediaScrim(styled)');
    expect(customiser).toMatch(/until the text is readable/);
  });

  it('takes a logo and puts it on the design', () => {
    expect(customiser).toContain('id="customiser-logo"');
    expect(customiser).toMatch(/logoUrl: logo\?\.url \?\? null/);
    // The brand slot pairs a logo with the name in TemplateSurface, so this
    // needed no per-template work — only a way to supply the file.
    const surface = readFileSync('src/components/studio/TemplateSurface.tsx', 'utf8');
    expect(surface).toMatch(/content\.logoUrl/);
  });

  it('caps what can be uploaded', () => {
    expect(customiser).toContain('MAX_MEDIA_BYTES');
    expect(customiser).toMatch(/4 \* 1024 \* 1024/);
  });

  it('lets the words be changed by clicking them on the design', () => {
    // The side panel is for working through fields. This is for somebody who
    // has spotted the wrong headline and wants to fix THAT.
    expect(customiser).toMatch(/onEditText=\{\(role: SlotRole, value: string\)/);
    expect(customiser).toMatch(/click any words on the design/);
  });

  it('uploads nothing anywhere — it all stays in the browser', () => {
    expect(customiser).not.toMatch(/supabase|fetch\(|XMLHttpRequest/);
    expect(customiser).toContain('stays in your browser');
  });
});

describe('the free download stays free', () => {
  it('adds no watermark to the export', () => {
    /*
     * Decided, with the reasoning in the file header: a NowOpen mark across a
     * small business's flyer contradicts "Look professional" and would be the
     * only place we deliberately degrade a customer's own asset.
     *
     * Comments are stripped before asserting, because the header EXPLAINS the
     * decision at length and a naive search for the word finds the explanation.
     */
    const code = customiser
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toMatch(/watermark|nowopen\.(png|svg)|© NowOpen/i);
    // And the decision itself stays recorded, so nobody adds one without
    // reading why it was refused.
    expect(customiser).toMatch(/NO WATERMARK, AND NO PER-BROWSER CAP/);
  });

  it('counts no downloads and stores no limit', () => {
    expect(customiser).not.toMatch(/localStorage|sessionStorage|downloadCount|remaining/i);
  });
});

describe('modern promo layouts', () => {
  const PROMOS = [
    'promo-mega-number', 'promo-diagonal', 'promo-sticker', 'promo-stack',
    'promo-frame', 'promo-ticker', 'promo-half-photo', 'promo-two-for',
  ];

  it('are all in the catalogue', () => {
    const keys = DESIGN_TEMPLATES.map((t) => t.key);
    for (const key of PROMOS) expect(keys, key).toContain(key);
  });

  it('are all findable as marketing', () => {
    for (const key of PROMOS) {
      const tpl = DESIGN_TEMPLATES.find((t) => t.key === key);
      expect(tpl?.use, key).toBe('marketing');
    }
  });

  it('use the new motion vocabulary rather than the old two directions', () => {
    // Eight more layouts that all rise and fade would be eight more of the
    // same animation.
    const src = readFileSync('src/lib/designTemplates.ts', 'utf8');
    const promoBlock = src.slice(src.indexOf("key: 'promo-mega-number'"));
    for (const move of ['scale-out', 'slide-right', 'slide-left', 'mask-up']) {
      expect(promoBlock, move).toContain(`'${move}'`);
    }
    expect(promoBlock).toMatch(/ease: '(spring|elastic)'/);
  });
});

describe('the gallery lists needs, then their things, and only finished designs', () => {
  afterEach(cleanup);
  // jsdom has no scrollIntoView; the focus signal calls it.
  Element.prototype.scrollIntoView = () => {};
  const mount = (focus?: { need: NeedSlug | ''; deliverable: string; n: number }) =>
    render(createElement(MemoryRouter, null, createElement(TemplateGallery, { focus })));
  const cards = () => screen.queryAllByRole('button', { name: /^Edit / });
  const labels = () => cards().map((c) => c.getAttribute('aria-label'));
  /*
   * The need and item chips live in the need view now (createPage.test.tsx
   * covers which needs and things are offered); the gallery is steered by
   * `focus`.
   */
  it('a focus on stationery and business card shows only the business cards', () => {
    mount({ need: 'stationery', deliverable: 'business-card', n: 1 });
    const expected = listedFor('business-card');
    expect(expected.length).toBeGreaterThan(0);
    expect(cards()).toHaveLength(Math.min(expected.length, 12));
    const names = new Set(expected.map((t) => `Edit ${t.label}`));
    for (const l of labels()) expect(names.has(l ?? '')).toBe(true);
  });

  it('does not render a lookless code template or an uploaded row without a look', () => {
    mount();
    const shown = labels();
    const lookless = DESIGN_TEMPLATES.filter((t) => !isListed(t));
    expect(lookless.length).toBeGreaterThan(0);
    for (const t of lookless) expect(shown).not.toContain(`Edit ${t.label}`);
    expect(shown).not.toContain(`Edit ${UPLOADED_LABEL}`);
  });

  it('shows every listed design of a focused need, even the thinnest', () => {
    const thinnest = [...NEEDS].sort((a, b) => listedIn(a.slug).length - listedIn(b.slug).length)[0];
    mount({ need: thinnest.slug, deliverable: '', n: 1 });
    expect(cards()).toHaveLength(listedIn(thinnest.slug).length);
  });

  it('keeps a lookless template reachable by key', async () => {
    const lookless = DESIGN_TEMPLATES.find((t) => !isListed(t))!;
    expect((await templateByKeyAnywhere(lookless.key))?.key).toBe(lookless.key);
  });
});
