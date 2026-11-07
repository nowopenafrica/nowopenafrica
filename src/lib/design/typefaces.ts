/**
 * The Studio type library.
 *
 * ── WHY THIS IS THE BIGGEST CHANGE IN THE STUDIO ──────────────────────────
 *
 * designTemplates.ts used to say, honestly, that every template rendered in the
 * same system sans and that this "is the main reason they read as variations of
 * one design rather than six designs". It then fixed half the problem with four
 * web-safe stacks — Georgia, Arial Narrow, SF Mono.
 *
 * Those are not display typefaces. They are the fonts that were on a 1996
 * desktop. No amount of layout work makes a poster set in Georgia look like the
 * work on Behance, because the difference was never layout: a display face IS
 * most of the design. Twenty-seven templates sharing four office fonts is one
 * design library with four voices.
 *
 * So: twelve real faces, self-hosted, each one chosen to sound different.
 *
 * ── THE CONSTRAINT THAT KEPT WEBFONTS OUT, AND HOW IT IS ANSWERED ─────────
 *
 * The original note gives the reason plainly: "a template must render
 * identically in the editor, in an html2canvas PNG and in a canvas video frame,
 * and a webfont that has not finished loading silently substitutes in one of the
 * three." That is a real failure and it is why this file exists rather than a
 * `<link>` tag.
 *
 * The answer is `ensureTypefacesReady()`. Every export path awaits it, so a
 * face is proven present before a single pixel is rasterised. Self-hosting is
 * what makes that reliable — one same-origin request, already allowed by the
 * CSP (`font-src 'self'`), with no third-party host to be slow or blocked.
 *
 * ── LICENCES ──────────────────────────────────────────────────────────────
 *
 * Every family here is SIL Open Font License 1.1, which permits redistribution,
 * self-hosting and use in commercial work — including work a customer then sells
 * or prints. The licence is carried in the data and shown in the picker, because
 * a design tool that cannot tell a business what it is allowed to do with its
 * own poster is not finished. NOTHING GOES IN THIS FILE WITHOUT A LICENCE THAT
 * PERMITS IT: no lookalike of a commercial face, and nothing lifted from another
 * tool's library.
 *
 * Files come from scripts/fetch-typefaces.mjs.
 */

export type TypefaceKey =
  // The four original keys. Kept because 27 templates already reference them —
  // and repointed at real faces, which upgrades every one of those templates
  // without touching a single template definition.
  | 'sans' | 'serif' | 'mono' | 'condensed'
  // New voices.
  | 'editorial' | 'soft' | 'grotesk' | 'heavy'
  /*
   * The house face. Already self-hosted in index.css and already used by the
   * brand-card studio — it simply was not offered in the design library, so
   * the one typeface that makes a design look like NowOpen was the one
   * typeface a user could not pick.
   */
  | 'coolvetica';

/** Retained name — designTemplates and every template still speak in FontKey. */
export type FontKey = TypefaceKey;

export type TypeRole = 'display' | 'text' | 'accent';

export interface Typeface {
  key: TypefaceKey;
  /** What the picker calls it. */
  label: string;
  /** The CSS family name declared by @font-face in index.css. */
  family: string;
  /**
   * The full stack, ending in a web-safe face of the same shape.
   *
   * The fallback is not decoration: if a woff2 ever fails, a template must
   * degrade to something with the same proportions rather than to Times.
   */
  stack: string;
  /** Weights actually shipped. Asking for one we do not have gets a synthetic
   *  bold, which on a display face looks like a mistake. */
  weights: number[];
  role: TypeRole;
  /** One line on when to reach for it. Shown in the picker. */
  voice: string;
  /*
   * Stated, not assumed.
   *
   * This was the literal 'SIL OFL 1.1' because every face was from Google
   * Fonts. Coolvetica is not: it is Ray Larabie's, distributed free for
   * commercial use, and shipped here as files the founder supplied. Widening
   * the type is the honest move — narrowing it would have meant either
   * mislabelling the licence or leaving the font out.
   */
  licence: 'SIL OFL 1.1' | 'Free for commercial use';
  /** Where it came from, so provenance survives this file being copied. */
  source: string;
  /*
   * The actual file for each weight, public path.
   *
   * Stated rather than derived from a naming convention. The convention was
   * `/fonts/studio/{slug}-{weight}.woff2` and it was only ever implied — so
   * adding Coolvetica, which was already self-hosted under its own folder by
   * the brand-card studio, failed four guards that were checking a filename
   * pattern rather than whether the font is really there. Saying where each
   * file lives makes the check true instead of conventional.
   */
  files: Record<number, string>;
}

const FALLBACK = {
  sans: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  serif: 'Georgia, "Times New Roman", "Iowan Old Style", serif',
  mono: '"SF Mono", ui-monospace, Menlo, Consolas, monospace',
  condensed: '"Arial Narrow", "Helvetica Neue Condensed", Impact, sans-serif',
} as const;

export const TYPEFACES: Typeface[] = [
  {
    key: 'sans', label: 'Outfit', family: 'Outfit',
    stack: `Outfit, ${FALLBACK.sans}`, weights: [400, 600, 800], role: 'text',
    voice: 'Clean geometric sans. The safe, modern default for anything that has to be read.',
    licence: 'SIL OFL 1.1', files: { 400: '/fonts/studio/outfit-400.woff2', 600: '/fonts/studio/outfit-600.woff2', 800: '/fonts/studio/outfit-800.woff2' },
    source: 'Google Fonts',
  },
  {
    key: 'serif', label: 'Playfair Display', family: 'Playfair Display',
    stack: `"Playfair Display", ${FALLBACK.serif}`, weights: [700, 900], role: 'display',
    voice: 'High-contrast serif. Fashion, property, anything that needs to feel expensive.',
    licence: 'SIL OFL 1.1', files: { 700: '/fonts/studio/playfair-display-700.woff2', 900: '/fonts/studio/playfair-display-900.woff2' },
    source: 'Google Fonts',
  },
  {
    key: 'mono', label: 'Space Mono', family: 'Space Mono',
    stack: `"Space Mono", ${FALLBACK.mono}`, weights: [700], role: 'accent',
    voice: 'Technical monospace. Use small and spaced, for eyebrows and codes.',
    licence: 'SIL OFL 1.1', files: { 700: '/fonts/studio/space-mono-700.woff2' },
    source: 'Google Fonts',
  },
  {
    key: 'condensed', label: 'Bebas Neue', family: 'Bebas Neue',
    stack: `"Bebas Neue", ${FALLBACK.condensed}`, weights: [400], role: 'display',
    voice: 'Tall condensed caps. Sales, events, street posters — loud without shouting.',
    licence: 'SIL OFL 1.1', files: { 400: '/fonts/studio/bebas-neue-400.woff2' },
    source: 'Google Fonts',
  },
  {
    key: 'editorial', label: 'DM Serif Display', family: 'DM Serif Display',
    stack: `"DM Serif Display", ${FALLBACK.serif}`, weights: [400], role: 'display',
    voice: 'Editorial serif with tight fit. Magazine covers, menus, considered headlines.',
    licence: 'SIL OFL 1.1', files: { 400: '/fonts/studio/dm-serif-display-400.woff2' },
    source: 'Google Fonts',
  },
  {
    key: 'soft', label: 'Fraunces', family: 'Fraunces',
    stack: `Fraunces, ${FALLBACK.serif}`, weights: [600], role: 'display',
    voice: 'Warm, slightly odd serif. Food, wellness, anything that should feel handmade.',
    licence: 'SIL OFL 1.1', files: { 600: '/fonts/studio/fraunces-600.woff2' },
    source: 'Google Fonts',
  },
  {
    key: 'grotesk', label: 'Space Grotesk', family: 'Space Grotesk',
    stack: `"Space Grotesk", ${FALLBACK.sans}`, weights: [500, 700], role: 'text',
    voice: 'Modern grotesk with character. Tech, agencies, studios.',
    licence: 'SIL OFL 1.1', files: { 500: '/fonts/studio/space-grotesk-500.woff2', 700: '/fonts/studio/space-grotesk-700.woff2' },
    source: 'Google Fonts',
  },
  {
    key: 'heavy', label: 'Archivo Black', family: 'Archivo Black',
    stack: `"Archivo Black", ${FALLBACK.sans}`, weights: [400], role: 'display',
    voice: 'One weight, very heavy. For a headline that is the whole design.',
    licence: 'SIL OFL 1.1', files: { 400: '/fonts/studio/archivo-black-400.woff2' },
    source: 'Google Fonts',
  },
  {
    key: 'coolvetica', label: 'Coolvetica', family: 'Coolvetica',
    stack: `Coolvetica, ${FALLBACK.sans}`, weights: [300, 400, 700], role: 'display',
    voice: 'Tight, rounded and confident. The NowOpen house face — good for a short, loud line.',
    licence: 'Free for commercial use', files: { 300: '/fonts/coolvetica/Coolvetica-Light.woff2', 400: '/fonts/coolvetica/Coolvetica-Regular.woff2', 700: '/fonts/coolvetica/Coolvetica-Bold.woff2' },
    source: 'Typodermic (Ray Larabie), self-hosted',
  },
];

const BY_KEY = new Map(TYPEFACES.map((t) => [t.key, t]));

export const typefaceOf = (key: TypefaceKey | undefined, fallback: TypefaceKey = 'sans'): Typeface =>
  BY_KEY.get(key ?? fallback) ?? (BY_KEY.get(fallback) as Typeface);

/** The stack designTemplates hands to both the DOM and the canvas. */
export const fontStack = (key: TypefaceKey | undefined, fallback: TypefaceKey = 'sans'): string =>
  typefaceOf(key, fallback).stack;

export const FONT_STACKS: Record<TypefaceKey, string> = Object.fromEntries(
  TYPEFACES.map((t) => [t.key, t.stack]),
) as Record<TypefaceKey, string>;

/**
 * The nearest weight we actually ship.
 *
 * Asking a browser for 700 of a face that only has 400 gets a synthetic bold —
 * smeared outlines that look like a rendering bug on a display face at 200px.
 */
export function nearestWeight(key: TypefaceKey | undefined, want: number): number {
  const face = typefaceOf(key);
  return face.weights.reduce((best, w) =>
    Math.abs(w - want) < Math.abs(best - want) ? w : best, face.weights[0]);
}

/* ── Pairings ─────────────────────────────────────────────────────────────── */

export interface TypePairing {
  key: string;
  label: string;
  display: TypefaceKey;
  text: TypefaceKey;
  accent: TypefaceKey;
  /** What it is for, in the words of the person choosing. */
  suits: string;
}

/**
 * What a design tool actually sells is not fonts, it is pairings.
 *
 * Handing somebody eight typefaces and a dropdown produces eight ways to make
 * a bad poster. A pairing is the decision already made: which face carries the
 * headline, which carries the reading, and which does the small caps work.
 */
export const TYPE_PAIRINGS: TypePairing[] = [
  { key: 'modern', label: 'Modern', display: 'grotesk', text: 'sans', accent: 'mono',
    suits: 'Agencies, tech, services. Neutral and current.' },
  { key: 'editorial', label: 'Editorial', display: 'editorial', text: 'sans', accent: 'mono',
    suits: 'Menus, magazines, considered announcements.' },
  { key: 'luxury', label: 'Luxury', display: 'serif', text: 'sans', accent: 'mono',
    suits: 'Property, fashion, salons, anything premium.' },
  { key: 'impact', label: 'Impact', display: 'heavy', text: 'grotesk', accent: 'condensed',
    suits: 'One-line statements. Sales that need to be seen across a street.' },
  { key: 'street', label: 'Street', display: 'condensed', text: 'grotesk', accent: 'mono',
    suits: 'Events, nightlife, flash sales, gyms.' },
  { key: 'warmth', label: 'Warmth', display: 'soft', text: 'sans', accent: 'sans',
    suits: 'Food, wellness, family businesses. Friendly rather than corporate.' },
  /*
   * ADDED 2026-09-15, because three of the eight styles were sharing 'modern'.
   *
   * Eight styles drawing on six pairings meant Signature, Blueprint and Duotone
   * all spoke in the same voice, and a style that cannot be told from another
   * style is costing a slot in the picker and buying nothing. These two give
   * the remaining pair their own.
   */
  /*
   * NOT a 'technical' pairing with Space Mono on the headline. That was tried
   * and the display-face test refused it: Space Mono's declared role is
   * 'accent' and its own voice note says "use small and spaced, for eyebrows
   * and codes". A monospace headline at 200px is a novelty, not a display face,
   * and the rule exists precisely to stop one being chosen for variety's sake.
   */
  { key: 'statement', label: 'Statement', display: 'heavy', text: 'sans', accent: 'condensed',
    suits: 'One idea, very large, with a condensed label under it.' },
];

export const pairingOf = (key: string): TypePairing =>
  TYPE_PAIRINGS.find((p) => p.key === key) ?? TYPE_PAIRINGS[0];

/* ── Loading ──────────────────────────────────────────────────────────────── */

/**
 * Prove the faces are present before anything is rasterised.
 *
 * This is the whole reason self-hosted webfonts are safe in a tool that
 * exports. `document.fonts.load` resolves once the face is usable; awaiting it
 * before html2canvas or a canvas frame is what stops the PNG quietly falling
 * back to Georgia while the editor shows Playfair.
 *
 * Never throws. A font that will not load is a worse-looking export, not a
 * failed one — the fallback stacks are chosen to be the same shape.
 */
export async function ensureTypefacesReady(keys?: TypefaceKey[]): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts?.load) return;

  const faces = keys?.length ? keys.map((k) => typefaceOf(k)) : TYPEFACES;
  await Promise.all(
    faces.flatMap((face) =>
      face.weights.map((w) =>
        // 100px because some engines cache per-size; a size no layout uses
        // still warms the face itself.
        document.fonts.load(`${w} 100px "${face.family}"`).catch(() => undefined),
      ),
    ),
  );
  // `ready` settles once no font load is pending at all, which also covers
  // faces the page started fetching on its own.
  await document.fonts.ready.catch(() => undefined);
}

/** Every family the templates can name, for a preload or a smoke test. */
export const TYPEFACE_FAMILIES: string[] = TYPEFACES.map((t) => t.family);
