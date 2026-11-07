/**
 * The customer's look as it travels: in a `?look=` URL parameter from the
 * customiser to the editor, and as the `?look=<seed>` link that opens a
 * remixed design.
 *
 * WHY THIS IS A VALIDATOR FIRST. A URL is typed, pasted and forwarded by
 * strangers, and whatever is in it ends up in resolveLook(). So nothing here
 * trusts its input: a palette or pattern key that does not exist is dropped, a
 * hex colour inside a Look is refused outright (hex lives only in palettes.ts;
 * a brand colour travels in the separate `b` field, where brandPalette()'s own
 * strict parser vets it), and a seed must be a finite integer.
 *
 * The wire shape is `{ o: Partial<Look>, s?: seed, b?: brand }`. A bare integer
 * is shorthand for `{ s }`: "remix this design with that seed".
 */
import { paletteOf, type PaletteRole } from './palettes';
import type { GradientSpec, Look, PatternSpec } from './look';
import { PATTERNS } from './patterns';
import { TYPE_PAIRINGS } from './typefaces';
import { brandPalette, needsMet, remixLook, textNeeds, type Harmony } from './remix';
import type { DesignTemplate } from '../designTemplates';
import type { Palette } from './palettes';

export interface BrandInput {
  primary: string;
  secondary?: string;
  harmony: Harmony;
}

export interface ParsedLook {
  override: Partial<Look>;
  seed: number | null;
  brand: BrandInput | null;
}

const ROLES: readonly PaletteRole[] = ['ground', 'ink', 'primary', 'secondary', 'highlight'];
const HARMONIES: readonly Harmony[] = ['analogous', 'complementary', 'split'];
const ZONES = ['full', 'top', 'bottom', 'left', 'right', 'band'] as const;
const KINDS = ['linear', 'radial', 'mesh'] as const;
const HEX = /#[0-9a-f]{3,8}\b/i;
export const isHexColour = (v: string): boolean => STRICT_HEX.test(v.trim());
const STRICT_HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

const isRole = (v: unknown): v is PaletteRole => typeof v === 'string' && (ROLES as readonly string[]).includes(v);
const isRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export const isSeed = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v);

/** Keep only the parts of a Look override that name things that exist. */
export function sanitiseOverride(raw: unknown): Partial<Look> {
  if (!isRecord(raw)) return {};
  // Hex has no business inside a Look. Refuse the whole override rather than
  // guess which part was meant.
  if (HEX.test(JSON.stringify(raw))) return {};
  const out: Partial<Look> = {};

  if (typeof raw.palette === 'string' && paletteOf(raw.palette)) out.palette = raw.palette;
  if (typeof raw.type === 'string' && TYPE_PAIRINGS.some((p) => p.key === raw.type)) out.type = raw.type;
  // headlineGradient is not accepted from a link: the editor cannot draw it and
  // textNeeds does not measure it. A template whose own look sets it keeps it.

  if (isRecord(raw.gradient)) {
    const g = raw.gradient;
    const stops = Array.isArray(g.stops) ? g.stops.filter(isRole) : [];
    if ((KINDS as readonly unknown[]).includes(g.kind) && stops.length >= 2 && stops.length <= 4
      && stops.length === (g.stops as unknown[]).length) {
      const spec: GradientSpec = { kind: g.kind as GradientSpec['kind'], stops };
      if (finite(g.angle)) spec.angle = clamp(g.angle, 0, 360);
      out.gradient = spec;
    }
  }

  if (isRecord(raw.pattern)) {
    const p = raw.pattern;
    const known = PATTERNS.some((x) => x.key === p.key);
    if (known && isRole(p.role) && finite(p.opacity) && finite(p.scale)) {
      const spec: PatternSpec = {
        key: p.key as PatternSpec['key'],
        role: p.role,
        // 0.12 is the ceiling for a pattern that may sit under text.
        opacity: clamp(p.opacity, 0, 0.12),
        scale: clamp(p.scale, 0.02, 0.5),
      };
      if ((ZONES as readonly unknown[]).includes(p.zone)) spec.zone = p.zone as PatternSpec['zone'];
      out.pattern = spec;
    }
  }

  if (Array.isArray(raw.duotone) && raw.duotone.length === 2 && raw.duotone.every(isRole)) {
    out.duotone = [raw.duotone[0], raw.duotone[1]];
  }
  return out;
}

const readBrand = (raw: unknown): BrandInput | null => {
  if (!isRecord(raw) || typeof raw.p !== 'string' || !STRICT_HEX.test(raw.p.trim())) return null;
  const harmony = (HARMONIES as readonly unknown[]).includes(raw.h) ? (raw.h as Harmony) : 'analogous';
  const secondary = typeof raw.s === 'string' && STRICT_HEX.test(raw.s.trim()) ? raw.s.trim() : undefined;
  return { primary: raw.p.trim(), ...(secondary ? { secondary } : {}), harmony };
};

/** What a `?look=` value means, or null when it means nothing usable. */
export function parseLookParam(raw: string | null | undefined): ParsedLook | null {
  if (!raw) return null;
  const text = raw.trim();
  if (/^-?\d+$/.test(text)) {
    const n = Number(text);
    return isSeed(n) ? { override: {}, seed: n, brand: null } : null;
  }
  let data: unknown;
  try { data = JSON.parse(text); } catch { return null; }
  if (!isRecord(data)) return null;
  return {
    override: sanitiseOverride(data.o),
    seed: isSeed(data.s) ? data.s : null,
    brand: readBrand(data.b),
  };
}

/** The `?look=` value for a customiser state. */
export function encodeLookParam(state: ParsedLook): string {
  return JSON.stringify({
    o: state.override,
    ...(state.seed !== null ? { s: state.seed } : {}),
    ...(state.brand
      ? { b: { p: state.brand.primary, ...(state.brand.secondary ? { s: state.brand.secondary } : {}), h: state.brand.harmony } }
      : {}),
  });
}

/** The scheme a template's own look sits in: brand palettes and Remix stay in it. */
export const baseScheme = (tpl: DesignTemplate): 'dark' | 'light' =>
  paletteOf(tpl.look?.palette)?.scheme ?? tpl.scheme;

/**
 * The brand as a palette for THIS template: the readable-text needs and the
 * ground gradient it will be painted under are always passed, or a brand
 * colour can produce unreadable type. Null for a colour that cannot be read.
 */
export function brandPaletteFor(
  tpl: DesignTemplate,
  brand: BrandInput,
  gradient: GradientSpec | undefined,
): Palette | null {
  return brandPalette({
    primary: brand.primary,
    secondary: brand.secondary,
    harmony: brand.harmony,
    scheme: baseScheme(tpl),
    needs: textNeeds(tpl),
    gradientStops: gradient?.stops,
  });
}

/**
 * Everything the editor needs to open a template in the look the customer
 * made: the override to resolve with, the brand palette, and the provenance.
 * A bare seed is expanded here, the same way the customiser does it.
 */
export function lookFromParam(tpl: DesignTemplate, raw: string | null | undefined): {
  look?: Partial<Look>; brandPalette?: Palette; seed?: number; brand?: BrandInput;
} {
  const parsed = tpl.look ? parseLookParam(raw) : null;
  if (!parsed || !tpl.look) return {};
  let override = parsed.override;
  // A palette that cannot carry this template's text is dropped, as the
  // customiser would never have offered it.
  if (override.palette) {
    const pal = paletteOf(override.palette);
    const stops = (override.gradient ?? tpl.look.gradient)?.stops ?? [];
    if (!pal || !needsMet(pal.colours, textNeeds(tpl), stops)) {
      const { palette: _dropped, ...rest } = override;
      override = rest;
    }
  }
  // Likewise a gradient: a crafted link can paint the ground in a role the
  // template's ink cannot be read on (ink on cobalt measured about 2.5:1).
  if (override.gradient) {
    const g = override.gradient;
    const pal = parsed.brand
      ? brandPaletteFor(tpl, parsed.brand, g)
      : paletteOf(override.palette ?? tpl.look.palette);
    if (!pal || !needsMet(pal.colours, textNeeds(tpl), g.stops)) {
      const { gradient: _dropped, ...rest } = override;
      override = rest;
    }
  }
  if (parsed.seed !== null && Object.keys(override).length === 0 && !parsed.brand) {
    override = remixLook(tpl.look, parsed.seed, new Set(), baseScheme(tpl), textNeeds(tpl));
  }
  const gradient = override.gradient ?? tpl.look.gradient;
  const palette = parsed.brand ? brandPaletteFor(tpl, parsed.brand, gradient) : null;
  return {
    look: override,
    ...(palette ? { brandPalette: palette, brand: parsed.brand ?? undefined } : {}),
    ...(parsed.seed !== null ? { seed: parsed.seed } : {}),
  };
}
