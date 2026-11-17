/**
 * The contrast suite: no look, remix or brand palette may ever ship unreadable
 * text. Every assertion measures the colour the renderer will ACTUALLY use
 * against the colour actually beneath it, at every format.
 *
 * What "actually" means here, mirroring TemplateSurface:
 *  - a role-toned slot (accent / primary / secondary / highlight) is set in
 *    that role's colour; a plain slot in inkOn[slot.on ?? 'ground'];
 *  - a 'muted' slot is the same ink at 0.72 alpha, and it is measured that
 *    way: the ink composited at 0.72 over each colour beneath it. Measuring
 *    the full ink let a muted line through at 4.15:1 that every renderer
 *    actually draws below 4.5;
 *  - a stat's value takes the slot's role or primary, at 1.55x the slot size
 *    (a muted stat's value is the muted ink); its label is the ink at 0.7
 *    alpha, composited the same way. A price's value is the role or primary;
 *  - beneath the words is the ground (every gradient stop, since the suite
 *    cannot know which stop a given word lands on), and over it every shape
 *    that paints there, in order. A translucent shape is composited, not
 *    ignored. Rings are outlines and are skipped.
 *
 * Words are measured as ONE line (where a headline starts, and the part always
 * drawn), sampled at nine points so a shape clipping a corner counts. Only
 * templates that HAVE a look are in scope: the rest take the fallback path,
 * which the other suites pin unchanged.
 */
import { describe, expect, it } from 'vitest';

import { DESIGN_TEMPLATES, isListRole, type DesignTemplate, type SlotSpec } from '../designTemplates';
import type { Look } from './look';
import { patternZoneBox } from './patterns';
import {
  PALETTES, displayOnlyRoles, paletteOf, type Palette, type PaletteRole,
} from './palettes';
import {
  brandPalette, needsMet, remixLook, textNeeds, textSlotBox, type Harmony, type TextSlotBox,
} from './remix';
import { DESIGN_STYLES, applyStyle } from './styles';
// The measuring itself is shared with the quality scorer (C5), so it lives there.
import { MUTED_ALPHA, contrastFailures as measureFailures, toneRole } from './quality/checks/contrast';

// Same list designTemplates.test.ts holds every template to.
const FORMATS: [string, number, number][] = [
  ['square post', 1080, 1080],
  ['story', 1080, 1920],
  ['landscape', 1920, 1080],
  ['A3 poster', 2480, 3508],
  ['thumbnail preview', 240, 240],
];

const BRANDS = [
  '#2563eb', '#0b1220', '#e11d48', '#f59e0b', '#facc15',
  '#065f46', '#ffffff', '#111111', '#7c3aed', '#22d3ee', '#fef08a',
];
const HARMONIES: Harmony[] = ['analogous', 'complementary', 'split'];
const ACCENT = '#2563eb'; // only the fallback path reads this; a looked template ignores it
const ROLES: PaletteRole[] = ['ground', 'ink', 'primary', 'secondary', 'highlight'];

const LOOKED = DESIGN_TEMPLATES.filter((t) => t.look);

/** Every failure of one look on one template, across every format. */
const contrastFailures = (tpl: DesignTemplate, look: Look, brand?: Palette): string[] =>
  measureFailures(tpl, look, { formats: FORMATS, brand, accent: ACCENT, requireLook: true });

/** A text box for the pattern check: three lines, because a headline wraps. */
function tallBox(slot: SlotSpec, w: number, h: number): TextSlotBox {
  const one = textSlotBox(slot, w, h);
  if (isListRole(slot.role)) return one;
  const tall = one.h * 3;
  return { ...one, y: slot.fromBottom ? one.y + one.h - tall : one.y, h: tall };
}

const intersects = (a: TextSlotBox, b: { x: number; y: number; w: number; h: number }): boolean =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

/** The palette a look resolves to, however it was named. */
const paletteFor = (look: Look, brand?: Palette): Palette => {
  const pal = brand ?? paletteOf(look.palette);
  if (!pal) throw new Error(`unknown palette ${look.palette}`);
  return pal;
};

/**
 * Slots whose `on` is a role the palette only reaches 3:1 on: legal for display
 * type, never for body copy.
 */
function bodyOnDisplayOnly(tpl: DesignTemplate, pal: Palette): string[] {
  const displayOnly = new Set<PaletteRole>(displayOnlyRoles(pal));
  const bad: string[] = [];
  for (const slot of tpl.slots) {
    if (slot.role === 'qr') continue;
    const sits = slot.on ?? 'ground';
    const size = slot.size ?? 0.05;
    const display = size >= 0.06;
    if (displayOnly.has(sits) && !display) bad.push(`${tpl.key}/${slot.role} on ${sits}`);
    const toned = toneRole(slot.tone);
    if (slot.treatment === 'disc' && toned && displayOnly.has(toned) && !display) {
      bad.push(`${tpl.key}/${slot.role} disc ${toned}`);
    }
  }
  return bad;
}

/* ---- the suite ------------------------------------------------------------- */

describe('look contrast suite', () => {
  it('covers the three proving looks', () => {
    const keys = LOOKED.map((t) => t.key);
    for (const key of ['brand-intro-reveal', 'tiered-sale', 'swiss-event-poster']) {
      expect(keys).toContain(key);
    }
  });

  it('keeps every text slot readable on what is actually beneath it', () => {
    for (const tpl of LOOKED) {
      expect(contrastFailures(tpl, tpl.look as Look), tpl.key).toEqual([]);
    }
  });

  it('keeps every text slot readable under every style', () => {
    /*
     * The gallery, the customiser and the editor all draw a looked template
     * through applyStyle. A style used to add its furniture and could flip the
     * scheme, which put tiered-sale's stat values at 1.33:1 under `kitchen`.
     * A look owns colour and composition; this pins that no style can undo it.
     */
    for (const tpl of LOOKED) {
      for (const style of DESIGN_STYLES) {
        const styled = applyStyle(tpl, style);
        const tag = `${tpl.key} under ${style.key}`;
        expect(styled.shapes, tag).toEqual(tpl.shapes);
        expect(styled.scheme, tag).toBe(tpl.scheme);
        expect(contrastFailures(styled, styled.look as Look), tag).toEqual([]);
        expect(bodyOnDisplayOnly(styled, paletteFor(styled.look as Look)), tag).toEqual([]);
        expect(needsMet(paletteFor(styled.look as Look).colours, textNeeds(styled), styled.look?.gradient?.stops), tag)
          .toBe(true);
      }
    }
  });

  it('measures muted words at the alpha they are drawn with', () => {
    // The fixture the I1 finding measured: a muted meta line on a palette
    // whose full ink clears 4.5:1 and whose 0.72 ink does not.
    const swiss = LOOKED.find((t) => t.key === 'swiss-event-poster') as DesignTemplate;
    const needs = textNeeds(swiss);
    expect(needs.some((n) => n.alpha === MUTED_ALPHA)).toBe(false);
    const muted: DesignTemplate = {
      ...swiss,
      slots: swiss.slots.map((s) => (s.role === 'subline' ? { ...s, tone: 'muted' as const } : s)),
    };
    expect(textNeeds(muted).some((n) => n.alpha === MUTED_ALPHA)).toBe(true);
  });

  it('keeps patterns out from behind text', () => {
    for (const tpl of LOOKED) {
      const pattern = (tpl.look as Look).pattern;
      if (!pattern) continue;
      expect(pattern.opacity, `${tpl.key} opacity`).toBeGreaterThan(0);
      for (const [name, w, h] of FORMATS) {
        const zone = patternZoneBox(pattern.zone, w, h);
        for (const slot of tpl.slots) {
          if (slot.role === 'qr') continue;
          const clear = !intersects(tallBox(slot, w, h), zone);
          expect(
            pattern.opacity <= 0.12 || clear,
            `${tpl.key}/${slot.role} @ ${name}: pattern ${pattern.opacity} sits behind text`,
          ).toBe(true);
        }
      }
    }
  });

  it('never assigns body text to a display-only role', () => {
    for (const tpl of LOOKED) {
      expect(bodyOnDisplayOnly(tpl, paletteFor(tpl.look as Look)), tpl.key).toEqual([]);
    }
  });

  it('stays readable under 20 remixes', () => {
    for (const tpl of LOOKED) {
      const look = tpl.look as Look;
      const needs = textNeeds(tpl);
      for (let seed = 1; seed <= 20; seed += 1) {
        // Free, then with the gradient locked: a kept gradient must still suit
        // whatever palette the remix lands on.
        for (const locks of [new Set<never>(), new Set(['gradient' as const]), new Set(['palette' as const])]) {
          const remixed = remixLook(look, seed, locks, tpl.scheme, needs);
          const tag = `${tpl.key} seed ${seed} locks [${[...locks].join(',')}] ${remixed.palette}`;
          expect(contrastFailures(tpl, remixed), tag).toEqual([]);
          expect(bodyOnDisplayOnly(tpl, paletteFor(remixed)), tag).toEqual([]);
          if (remixed.pattern) {
            const zoneIsFull = (remixed.pattern.zone ?? 'full') === 'full';
            expect(!zoneIsFull || remixed.pattern.opacity <= 0.12, tag).toBe(true);
          }
        }
      }
    }
  });

  it('stays readable on brand palettes', () => {
    for (const tpl of LOOKED) {
      const look = tpl.look as Look;
      const needs = textNeeds(tpl);
      for (const primary of BRANDS) {
        for (const harmony of HARMONIES) {
          const pal = brandPalette({
            primary, harmony, scheme: tpl.scheme, needs, gradientStops: look.gradient?.stops,
          }) as Palette;
          const tag = `${tpl.key} ${primary} ${harmony}`;
          expect(pal, tag).not.toBeNull();
          for (const role of ROLES) expect(pal.colours[role], `${tag} ${role}`).toMatch(/^#[0-9a-f]{6}$/);
          expect(contrastFailures(tpl, look, pal), tag).toEqual([]);
          expect(bodyOnDisplayOnly(tpl, pal), tag).toEqual([]);
        }
      }
    }
  });

  it('would notice an unreadable look', () => {
    // The suite is only worth having if it can fail. A pastel palette puts the
    // primary-toned words of this fixture at under 2:1 on their own ground.
    const base = LOOKED.find((t) => t.key === 'tiered-sale') as DesignTemplate;
    const bad: DesignTemplate = {
      ...base,
      look: { ...(base.look as Look), palette: 'peach-sky' },
      slots: base.slots.map((s) => (s.role === 'headline' ? { ...s, tone: 'accent' as const } : s)),
    };
    expect(contrastFailures(bad, bad.look as Look).length).toBeGreaterThan(0);
    expect(PALETTES.some((p) => p.key === 'peach-sky')).toBe(true);
  });
});
