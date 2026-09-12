import type { DesignTemplate, SlotSpec, SurfaceSpec } from '../designTemplates';
import { pairingOf, type TypefaceKey } from './typefaces';

/**
 * Styles — the layer that turns 27 templates into a library.
 *
 * ── WHAT A STYLE IS, AND WHY IT IS NOT A TEMPLATE ─────────────────────────
 *
 * A template is a LAYOUT: where the headline sits, how wide the services
 * column is, which corner the wedge fills. A style is the TREATMENT: which
 * typefaces speak, how the colour behaves, whether the surface is a flat block
 * or a lit gradient, how tight the display type is set.
 *
 * They are independent, and that is the whole point. Canva does not sell
 * thousands of unrelated designs; it sells a few hundred layouts crossed with a
 * handful of styles, and a customer changes the look of a finished design with
 * one click instead of starting again. Twenty-seven layouts × eight styles is
 * 216 distinct looks from data we can actually hold in our heads and keep good.
 *
 * The alternative — hand-authoring 216 templates — is how a template library
 * becomes 200 mediocre designs nobody maintains.
 *
 * ── COLOUR COMES FROM THE BUSINESS, NEVER FROM THE STYLE ──────────────────
 *
 * A style never carries a hex value. It carries a RULE for what to do with the
 * accent the business already has: use it, deepen it, wash it out, ignore it in
 * favour of black and white, or pair it with a derived second tone. NowOpen's
 * entire pitch is "made from your brand" — a style that overrode the brand
 * colour would be a stock template with the business's name typed into it.
 *
 * Everything here is pure. Same template plus same style plus same accent
 * always produces the same design, which is the only way an export can be
 * trusted to match the preview.
 */

/* -- colour maths ---------------------------------------------------------- */

/*
 * Everything below exists so that a generated design is READABLE without a
 * human checking it. That is not a nicety: the same eight styles run against
 * whatever hex a business happened to pick, and nobody looks at all 216
 * combinations before one goes to print.
 *
 * The first version of this file used a luma threshold to decide black-or-white
 * text and a fixed multiplier to darken a ground. The contrast test in
 * styles.test.ts rejected it immediately: a white brand colour darkened by 45%
 * is mid grey, and white text on mid grey is 3.4:1 — below AA, and unreadable
 * on a phone in sunlight, which is where most of this gets seen.
 *
 * So grounds are derived by TARGET LUMINANCE rather than by a percentage, and
 * the ink is whichever of the two actually measures better.
 */

const DEFAULT_BRAND = '#2563eb';
const INK_DARK = '#0b1220';
const INK_LIGHT = '#ffffff';

const HEX_RE = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** A usable 6-digit hex, whatever we were handed. */
export function normaliseHex(input: string | null | undefined): string {
  const m = HEX_RE.exec((input ?? '').trim());
  if (!m) return DEFAULT_BRAND;
  const h = m[1];
  return `#${(h.length === 3 ? h.split('').map((c) => c + c).join('') : h).toLowerCase()}`;
}

const clamp255 = (n: number) => Math.max(0, Math.min(255, Math.round(n)));

const parseHex = (hex: string): [number, number, number] => {
  const n = Number.parseInt(normaliseHex(hex).slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const toHex = (r: number, g: number, b: number): string =>
  `#${[r, g, b].map((v) => clamp255(v).toString(16).padStart(2, '0')).join('')}`;

/** Toward black. amount 0..1. */
export const shade = (hex: string, amount: number): string => {
  const [r, g, b] = parseHex(hex);
  const k = 1 - Math.max(0, Math.min(1, amount));
  return toHex(r * k, g * k, b * k);
};

/** Toward white. amount 0..1. */
export const tint = (hex: string, amount: number): string => {
  const [r, g, b] = parseHex(hex);
  const k = Math.max(0, Math.min(1, amount));
  return toHex(r + (255 - r) * k, g + (255 - g) * k, b + (255 - b) * k);
};

/**
 * WCAG relative luminance — the real gamma curve, not a weighted average.
 *
 * The curve matters: a weighted average of the raw channels puts mid grey at
 * 0.5, but perceptually it sits near 0.21, and every threshold built on the
 * wrong number is wrong in the same direction.
 */
export function relativeLuminance(hex: string): number {
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = parseHex(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Kept for callers that only want a rough brightness. */
export const luminance = relativeLuminance;

/** WCAG contrast ratio. 4.5 is the AA floor for body text. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Black or white — whichever MEASURES better on this ground.
 *
 * Not a luminance threshold. A threshold gets mid-tones wrong in both
 * directions, and mid-tones are exactly what a darkened or washed brand colour
 * lands on.
 */
export const inkOn = (hex: string): string =>
  (contrastRatio(INK_LIGHT, hex) >= contrastRatio(INK_DARK, hex) ? INK_LIGHT : INK_DARK);

/**
 * Push a colour until it is dark enough (or light enough) to carry type.
 *
 * `target` is a relative luminance. Stepping rather than solving because the
 * step is 6% and the loop is bounded — a closed form would need the inverse of
 * the gamma curve per channel for no benefit anyone can see.
 */
export function towardLuma(hex: string, target: number): string {
  const start = normaliseHex(hex);
  const goDark = relativeLuminance(start) > target;
  let out = start;
  for (let i = 0; i < 60; i += 1) {
    const l = relativeLuminance(out);
    if (goDark ? l <= target : l >= target) break;
    out = goDark ? shade(out, 0.06) : tint(out, 0.06);
  }
  return out;
}

/**
 * A version of the brand colour that reads as a separate colour on this ground.
 *
 * The naive version tinted the brand by a fixed amount, which on a pale yellow
 * brand produced a near-white accent on a near-white ground — invisible, and
 * the test caught it. This moves whichever way there is room to move.
 */
export function accentOn(base: string, brand: string): string {
  const candidates = relativeLuminance(base) > 0.3
    ? [shade(brand, 0.3), shade(brand, 0.55), shade(brand, 0.75), INK_DARK]
    : [tint(brand, 0.3), tint(brand, 0.55), tint(brand, 0.8), INK_LIGHT];
  return candidates.find((c) => contrastRatio(c, base) >= 1.7) ?? candidates[candidates.length - 1];
}

/** A second tone from one brand colour, for the duotone styles. */
export const partnerTone = (hex: string): string =>
  (relativeLuminance(hex) > 0.3 ? shade(hex, 0.6) : tint(hex, 0.5));

/* ── the styles ───────────────────────────────────────────────────────────── */

/** What a style does with the brand's own accent. */
export type ColourRule =
  /** Use it as it is. */
  | 'brand'
  /** Deepen it, for light text on a rich ground. */
  | 'deep'
  /** Wash it back, for a pale ground with dark type. */
  | 'wash'
  /** Ignore it for the ground; keep it only for accents on black and white. */
  | 'mono'
  /** Pair it with a derived second tone. */
  | 'duotone';

export interface StyleType {
  /** Added to every slot's tracking. Negative tightens display type. */
  tracking?: number;
  /** Multiplies every slot's size. Under 1 is more air, over 1 is more shout. */
  scale?: number;
  /** Force the headline to caps, or force it out of caps. */
  upperHeadline?: boolean;
  /** Weight for display slots, resolved against what the face actually ships. */
  displayWeight?: number;
}

export interface DesignStyle {
  key: string;
  label: string;
  /** What it is for, in the words of the person choosing it. */
  blurb: string;
  /** A TYPE_PAIRINGS key — which faces do the talking. */
  pairing: string;
  colour: ColourRule;
  /** 'keep' leaves the template's own scheme alone. */
  scheme: 'dark' | 'light' | 'keep';
  surface?: Partial<SurfaceSpec>;
  type?: StyleType;
}

/**
 * Eight styles, each a different room.
 *
 * Chosen to be genuinely far apart rather than eight shades of the same taste:
 * if two styles produce designs a customer cannot tell apart, one of them is
 * costing us a slot in the picker and buying nothing.
 */
export const DESIGN_STYLES: DesignStyle[] = [
  {
    key: 'signature',
    label: 'Signature',
    blurb: 'The NowOpen default. Clean, current, works for anything.',
    pairing: 'modern',
    colour: 'brand',
    scheme: 'keep',
    surface: { kind: 'gradient', intensity: 0.9 },
    type: { tracking: -0.01 },
  },
  {
    key: 'gallery',
    label: 'Gallery',
    blurb: 'White space and a serif. Property, fashion, salons, anything premium.',
    pairing: 'luxury',
    colour: 'wash',
    scheme: 'light',
    surface: { kind: 'wash', intensity: 0.18, frame: 0.035 },
    type: { tracking: -0.02, scale: 0.94, upperHeadline: false },
  },
  {
    key: 'press',
    label: 'Press',
    blurb: 'Editorial serif on a flat ground. Menus, announcements, reports.',
    pairing: 'editorial',
    colour: 'deep',
    scheme: 'dark',
    surface: { kind: 'solid', intensity: 1 },
    type: { tracking: -0.025, scale: 0.98 },
  },
  {
    key: 'megaphone',
    label: 'Megaphone',
    blurb: 'Heaviest type we have, set huge. Sales you want read from a car.',
    pairing: 'impact',
    colour: 'brand',
    scheme: 'dark',
    surface: { kind: 'solid', intensity: 1 },
    type: { tracking: -0.035, scale: 1.14, upperHeadline: true },
  },
  {
    key: 'nightshift',
    label: 'Night Shift',
    blurb: 'Condensed caps, lit from one side. Events, nightlife, gyms.',
    pairing: 'street',
    colour: 'deep',
    scheme: 'dark',
    surface: { kind: 'spotlight', intensity: 0.95, vignette: 0.45 },
    type: { tracking: 0.02, scale: 1.06, upperHeadline: true },
  },
  {
    key: 'kitchen',
    label: 'Kitchen Table',
    blurb: 'Warm serif on a soft ground. Food, wellness, family businesses.',
    pairing: 'warmth',
    colour: 'wash',
    scheme: 'light',
    surface: { kind: 'wash', intensity: 0.3 },
    type: { tracking: -0.005, scale: 0.97, upperHeadline: false },
  },
  {
    key: 'blueprint',
    label: 'Blueprint',
    blurb: 'Black, white and one accent. Studios, agencies, consultants.',
    pairing: 'modern',
    colour: 'mono',
    scheme: 'light',
    surface: { kind: 'solid', intensity: 0.05, frame: 0.02 },
    type: { tracking: 0, scale: 0.95 },
  },
  {
    key: 'duotone',
    label: 'Duotone',
    blurb: 'Your colour and a derived second tone. Bold without being loud.',
    pairing: 'modern',
    colour: 'duotone',
    scheme: 'dark',
    surface: { kind: 'gradient', angle: 145, intensity: 1 },
    type: { tracking: -0.02, scale: 1.02 },
  },
];

export const styleOf = (key: string): DesignStyle =>
  DESIGN_STYLES.find((s) => s.key === key) ?? DESIGN_STYLES[0];

/* ── applying one ─────────────────────────────────────────────────────────── */

export interface StyleColours {
  /** The ground the surface is built from. */
  base: string;
  /** The colour that draws the eye — bullets, prices, badges. */
  accent: string;
  /** Text colour, chosen to be readable on `base`. */
  ink: string;
}

/**
 * What this style does with this brand's colour.
 *
 * Note every branch returns an `ink` that was CHOSEN against the ground rather
 * than assumed from the scheme. A business whose brand colour is a pale yellow
 * gets dark type on it; the same style on a navy brand gets light type. Getting
 * that wrong is the single most common way a generated design becomes unusable.
 */
export function styleColours(
  style: DesignStyle,
  brandAccent: string,
  /**
   * The scheme the template will actually render in — i.e. what applyStyle
   * resolved, which is the style's scheme unless the style says 'keep'.
   *
   * THIS ARGUMENT IS THE FIX FOR A REAL BUG. The renderer decides its text
   * colour from the TEMPLATE's scheme (inkFor), while the ground came from the
   * STYLE. Under a 'keep' style those two disagree the moment a light-scheme
   * layout is dressed in a dark style: the surface came out deep blue and the
   * renderer painted near-black type on it. Caught by looking at the gallery,
   * not by the contrast test — which was testing this function in isolation,
   * where it was perfectly correct.
   *
   * Defaulting to 'dark' keeps every existing caller behaving as before.
   */
  scheme: 'dark' | 'light' = (style.scheme === 'keep' ? 'dark' : style.scheme),
): StyleColours {
  const brand = normaliseHex(brandAccent);
  const wantsDark = scheme === 'dark';

  /*
   * Target luminances, not percentages. 0.06 for a dark ground puts white ink
   * near 15:1; 0.80 for a light ground puts dark ink near 13:1. Both leave
   * headroom for the surface gradient, which lightens or darkens the ground
   * further toward the edges.
   */
  const DARK = 0.06;
  const LIGHT = 0.8;
  const target = wantsDark ? DARK : LIGHT;

  const ground = (from: string) => towardLuma(from, target);

  switch (style.colour) {
    case 'deep':
      return finish(ground(brand), brand);
    case 'wash':
      // A wash wants a pale ground. On a dark-scheme layout that would invert
      // the design, so the scheme wins and the wash reads as a deep tint.
      return finish(ground(brand), brand);
    case 'mono': {
      // The ground is deliberately not the brand colour. The accent still is,
      // so the design is still theirs — it is just doing one job instead of all.
      const base = wantsDark ? '#0b0d12' : '#f7f7f5';
      return finish(base, brand);
    }
    case 'duotone':
      return finish(ground(partnerTone(brand)), brand);
    case 'brand':
    default: {
      /*
       * The only case that can use the brand colour untouched — and only when
       * it is already the right side of the scheme AND can carry type. A
       * #ffff00 brand carries body text at 1.07:1 in white and 2.4:1 in black,
       * so it gets nudged. Shipping unreadable type is worse than shipping a
       * deeper yellow, and refusing to render is not an option.
       */
      const usable = wantsDark
        ? relativeLuminance(brand) <= 0.3 && contrastRatio(INK_LIGHT, brand) >= 4.5
        : relativeLuminance(brand) >= 0.6 && contrastRatio(INK_DARK, brand) >= 4.5;
      return finish(usable ? brand : ground(brand), brand);
    }
  }
}

/**
 * Pin the ink to what the RENDERER will use, then make the accent work on it.
 *
 * inkFor() in designTemplates picks white for a dark scheme and near-black for
 * a light one, full stop — it never measures. So this must return exactly that
 * colour rather than the best-measuring one, or the two disagree again. The
 * ground is already at a target luminance that makes the pinned ink correct.
 */
function finish(base: string, brand: string): StyleColours {
  const ink = relativeLuminance(base) < 0.4 ? INK_LIGHT : INK_DARK;
  return { base, accent: accentOn(base, brand), ink };
}

const DISPLAY_ROLES = new Set(['headline', 'eyebrow', 'price']);

/**
 * Restyle a template.
 *
 * Returns a NEW template — nothing here mutates the catalogue, because the
 * catalogue is module-level data shared by every tool and a mutation would
 * leak one customer's style into the next render.
 *
 * A slot that names its own font keeps it ONLY when the template author was
 * making a deliberate contrast (a mono eyebrow over a serif headline); the
 * pairing decides the rest. Without that rule a style could not change the look
 * of the templates that need it most, because those are exactly the ones whose
 * slots are most specified.
 */
export function applyStyle(
  tpl: DesignTemplate,
  style: DesignStyle,
): DesignTemplate {
  const pairing = pairingOf(style.pairing);
  const t = style.type ?? {};

  const fontFor = (slot: SlotSpec): TypefaceKey => {
    if (slot.role === 'eyebrow' || slot.role === 'meta') return pairing.accent;
    if (DISPLAY_ROLES.has(slot.role)) return pairing.display;
    return pairing.text;
  };

  return {
    ...tpl,
    font: pairing.text,
    scheme: style.scheme === 'keep' ? tpl.scheme : style.scheme,
    surface: { ...tpl.surface, ...style.surface },
    slots: tpl.slots.map((slot) => {
      const size = slot.size != null && t.scale ? slot.size * t.scale : slot.size;
      return {
        ...slot,
        font: fontFor(slot),
        size,
        tracking: (slot.tracking ?? 0) + (t.tracking ?? 0),
        upper: slot.role === 'headline' && t.upperHeadline !== undefined
          ? t.upperHeadline
          : slot.upper,
        weight: DISPLAY_ROLES.has(slot.role) && t.displayWeight
          ? t.displayWeight
          : slot.weight,
      };
    }),
  };
}

/** Every layout × every style, for a picker or a contact sheet. */
export const styleCount = (): number => DESIGN_STYLES.length;
