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

import {
  DESIGN_TEMPLATES, isListRole, shapeColor, shapeGeometry,
  type DesignTemplate, type ShapeSpec, type SlotSpec,
} from '../designTemplates';
import { resolveLook, type Look, type ResolvedLook } from './look';
import { patternZoneBox } from './patterns';
import {
  PALETTES, displayOnlyRoles, paletteOf, type Palette, type PaletteRole,
} from './palettes';
import {
  brandPalette, needsMet, remixLook, sampleBox, textNeeds, textSlotBox, type Harmony, type TextSlotBox,
} from './remix';
import { DESIGN_STYLES, applyStyle, contrastRatio } from './styles';

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

/* ---- colour under the words ------------------------------------------------ */

const rgb = (hex: string): [number, number, number] => {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const toHexString = ([r, g, b]: [number, number, number]): string =>
  `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

/** `top` painted at `alpha` over `under`. */
const composite = (top: string, under: string, alpha: number): string => {
  const [a, b] = [rgb(top), rgb(under)];
  return toHexString([0, 1, 2].map((i) => a[i] * alpha + b[i] * (1 - alpha)) as [number, number, number]);
};

/** The colours a shape paints: one per gradient stop, or its single tone. */
function shapeColours(shape: ShapeSpec, r: ResolvedLook): string[] {
  const fill = (shape.kind === 'rect' || shape.kind === 'circle') ? shape.fill : undefined;
  if (fill) return fill.stops.map((role) => r.roles[role]);
  return [shapeColor(shape.tone, ACCENT, r.roles.ink, r.roles.ground, r.roles)];
}

function covers(shape: ShapeSpec, x: number, y: number, w: number, h: number): boolean {
  if (shape.kind === 'ring') return false;
  const g = shapeGeometry(shape, w, h);
  if (g.kind === 'circle') return (x - g.cx) ** 2 + (y - g.cy) ** 2 <= g.r ** 2;
  if (g.kind === 'rect') return x >= g.x && x <= g.x + g.w && y >= g.y && y <= g.y + g.h;
  if (g.kind === 'polygon') {
    let inside = false;
    for (let i = 0, j = g.points.length - 1; i < g.points.length; j = i, i += 1) {
      const [xi, yi] = g.points[i];
      const [xj, yj] = g.points[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  return false;
}

/** The roles the ground is painted from: the gradient's stops, else the ground. */
const groundRoles = (look: Look): PaletteRole[] =>
  look.gradient ? [...new Set<PaletteRole>(look.gradient.stops)] : ['ground'];

/** Every colour that can sit beneath a point: each ground stop, shapes composited over it. */
function coloursAt(
  tpl: DesignTemplate, look: Look, r: ResolvedLook, x: number, y: number, w: number, h: number,
): string[] {
  let stack: string[] = groundRoles(look).map((role) => r.roles[role]);
  for (const shape of tpl.shapes ?? []) {
    if (!covers(shape, x, y, w, h)) continue;
    const alpha = shape.alpha ?? 1;
    stack = stack.flatMap((under) => shapeColours(shape, r).map((c) => composite(c, under, alpha)));
  }
  return stack;
}

/* ---- what is set, in what colour, how big ---------------------------------- */

/** `alpha` below 1 means the renderer draws `fg` translucent; it is composited before measuring. */
interface Run { label: string; fg: string; min: number; box: TextSlotBox; alpha?: number }

// The alphas TemplateSurface, drawTemplate and the editor draw with.
const MUTED_ALPHA = 0.72;
const STAT_LABEL_ALPHA = 0.7;

const toneRole = (tone: SlotSpec['tone']): PaletteRole | null =>
  tone === 'accent' || tone === 'primary' ? 'primary'
    : tone === 'secondary' || tone === 'highlight' ? tone : null;

/** The coloured runs of text a template draws, as the renderer will colour them. */
function runsOf(tpl: DesignTemplate, r: ResolvedLook, w: number, h: number): Run[] {
  const out: Run[] = [];
  for (const slot of tpl.slots) {
    if (slot.role === 'qr') continue;
    const box = textSlotBox(slot, w, h);
    const ink = r.inkOn[slot.on ?? 'ground'];
    const toned = toneRole(slot.tone);
    const size = slot.size ?? 0.05;
    const body = size >= 0.06 ? 3 : 4.5;
    const tag = (what: string) => `${tpl.key}/${slot.role}${what}`;
    const muted = !toned && slot.tone === 'muted' ? MUTED_ALPHA : undefined;
    const plain = { fg: toned ? r.roles[toned] : ink, alpha: muted };
    if (isListRole(slot.role)) {
      if (slot.role === 'stats') {
        // TemplateSurface: a muted stat's value is the muted tone, otherwise the slot's role or primary.
        const value = muted ? { fg: ink, alpha: muted } : { fg: r.roles[toned ?? 'primary'] };
        out.push({ label: tag(' value'), ...value, min: size * 1.55 >= 0.06 ? 3 : 4.5, box });
        out.push({ label: tag(' label'), fg: ink, alpha: STAT_LABEL_ALPHA, min: 4.5, box });
      } else {
        out.push({ label: tag(''), ...plain, min: body, box });
        // A price is always set in the slot's role, or primary; never muted.
        if (slot.role === 'price') out.push({ label: tag(' value'), fg: r.roles[toned ?? 'primary'], min: body, box });
      }
    } else if (slot.treatment === 'disc' && toned) {
      out.push({ label: tag(' on disc'), fg: r.inkOn[toned], min: body, box });
    } else {
      out.push({ label: tag(''), ...plain, min: body, box });
    }
  }
  return out;
}

/** Every failure of one look on one template, across every format. */
function contrastFailures(tpl: DesignTemplate, look: Look, brand?: Palette): string[] {
  const failures: string[] = [];
  for (const [name, w, h] of FORMATS) {
    const r = resolveLook(tpl, { override: look, brandPalette: brand, accent: ACCENT, width: w, height: h });
    expect(r.source, `${tpl.key} resolves through its look`).toBe('look');
    for (const run of runsOf(tpl, r, w, h)) {
      const beneath = new Set<string>();
      for (const [x, y] of sampleBox(run.box)) {
        for (const c of coloursAt(tpl, look, r, x, y, w, h)) beneath.add(c);
      }
      for (const bg of beneath) {
        const fg = run.alpha !== undefined ? composite(run.fg, bg, run.alpha) : run.fg;
        const ratio = contrastRatio(fg, bg);
        if (ratio < run.min) {
          const shown = run.alpha !== undefined ? `${run.fg}@${run.alpha}` : run.fg;
          failures.push(`${run.label} @ ${name}: ${shown} on ${bg} is ${ratio.toFixed(2)}:1, needs ${run.min}`);
        }
      }
    }
  }
  return failures;
}

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
