import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

import { DESIGN_TEMPLATES } from '../lib/designTemplates';
import { DESIGN_STYLES } from '../lib/design/styles';
import { TYPE_PAIRINGS } from '../lib/design/typefaces';
import { DESIGN_FORMATS } from '../data/studioPresets';

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

const gallery = readFileSync('src/components/create/TemplateGallery.tsx', 'utf8');
const customiser = readFileSync('src/components/create/TemplateCustomiser.tsx', 'utf8');
const marketplace = readFileSync('src/components/create/CreateMarketplace.tsx', 'utf8');
const studio = readFileSync('src/components/studio/DesignStudio.tsx', 'utf8');

describe('the work is public, not behind the sign-in', () => {
  it('is on the Create page itself', () => {
    expect(marketplace).toContain('<TemplateGallery />');
  });

  it('renders the REAL templates through the real renderer', () => {
    // Not screenshots and not a marketing mock-up: a gallery of
    // prettier-than-real previews is a promise the product then breaks.
    expect(gallery).toContain('TemplateSurface');
    expect(gallery).toContain('DESIGN_TEMPLATES');
    expect(gallery).toContain('applyStyle');
  });

  it('waits for the typefaces before it draws', () => {
    // The section whose whole job is the typography must not first paint in
    // Georgia and Arial Narrow.
    expect(gallery).toContain('ensureTypefacesReady');
    expect(customiser).toContain('ensureTypefacesReady');
  });

  it('claims a library size it can prove', () => {
    expect(gallery).toContain('libraryDepth()');
    // No written count anywhere — 312 must never be a literal in the copy.
    expect(gallery).not.toMatch(/\b(\d{3,})\s+designs/);
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
    expect(customiser).toMatch(/module=design&template=\$\{encodeURIComponent\(template\.key\)\}/);
    expect(customiser).toMatch(/&style=\$\{encodeURIComponent\(styleKey\)\}/);
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
    expect(customiser).toContain('MAX_EXPORT_EDGE');
    expect(customiser).toMatch(/Math\.min\(2, MAX_EXPORT_EDGE/);
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
    for (const src of [gallery, customiser]) {
      expect(src).toMatch(/Your business/);
      expect(src).toMatch(/Your headline here/);
      // No plausible-looking phone number, and no invented review or rating.
      expect(src).not.toMatch(/\+?234[\s-]?\d{3}/);
      expect(src).not.toMatch(/\b0[789]\d{9}\b/);
      expect(src).not.toMatch(/\b\d(\.\d)? stars?\b|\d+ reviews?\b/i);
    }
  });

  it('shows the placeholders as labels, so nobody mistakes them for data', () => {
    expect(customiser).toContain("'Your phone'");
    expect(customiser).toContain("'Your first service'");
  });
});

describe('it does not stall the page', () => {
  it('mounts a preview only once it is in view', () => {
    // A TemplateSurface is a dozen absolutely-positioned nodes with gradients
    // and clip paths. Thirty-nine at once is a visible stall on the phones this
    // page is mostly read on.
    expect(gallery).toContain('IntersectionObserver');
    expect(gallery).toMatch(/setShown/);
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

  it('shows six across on a desktop and steps down to two on a phone', () => {
    expect(gallery).toContain('lg:grid-cols-6');
    expect(gallery).toContain('grid-cols-2');
    expect(gallery).toContain('sm:grid-cols-3');
    expect(gallery).toContain('md:grid-cols-4');
  });

  it('pages by a number every column count divides', () => {
    // 12 works at 2, 3, 4 and 6 across, so a row is never left part-full and
    // "Show more" cannot produce a ragged one.
    expect(gallery).toMatch(/const PAGE = 12;/);
    for (const cols of [2, 3, 4, 6]) expect(12 % cols, `${cols} across`).toBe(0);
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
