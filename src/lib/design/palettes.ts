/**
 * Curated palettes: five colours that were chosen together, not computed.
 *
 * Why a library at all: a design built from one brand hue plus tints of it is
 * single-hue by construction. These sets give templates and looks a real
 * ground / ink / three-accent structure to draw on.
 *
 * Hex lives ONLY here. Everything else refers to a palette key and a role.
 * Every set is held to the contrast floors by palettes.test.ts, so a template
 * that puts text on a role can trust it without measuring again.
 */
import { contrastRatio } from './styles';

export type PaletteRole = 'ground' | 'ink' | 'primary' | 'secondary' | 'highlight';
export type PaletteFamily = 'warm' | 'cool' | 'earth' | 'bold' | 'pastel' | 'mono';

export interface Palette {
  key: string;
  name: string;
  family: PaletteFamily;
  scheme: 'dark' | 'light';
  colours: Record<PaletteRole, string>;
}

const INK_DARK = '#0b1220';
const INK_LIGHT = '#ffffff';

const p = (
  key: string,
  name: string,
  family: PaletteFamily,
  scheme: 'dark' | 'light',
  [ground, ink, primary, secondary, highlight]: [string, string, string, string, string],
): Palette => ({ key, name, family, scheme, colours: { ground, ink, primary, secondary, highlight } });

export const PALETTES: Palette[] = [
  // ---- warm ----
  p('lagos-sunset', 'Lagos Sunset', 'warm', 'dark', ['#2a0f1c', '#fff1e3', '#ff7a45', '#e0509f', '#ffc94d']),
  p('terracotta-clay', 'Terracotta Clay', 'warm', 'light', ['#f6e9dc', '#3a1c12', '#c4552d', '#1f6f6b', '#e9a23b']),
  p('harmattan-sand', 'Harmattan Sand', 'warm', 'light', ['#f3e6cf', '#2e2418', '#b5651d', '#3d5a80', '#d9a441']),
  p('ink-coral', 'Ink & Coral', 'warm', 'dark', ['#0f1b2d', '#fdf3ee', '#ff6b5e', '#3cc6b8', '#ffd166']),
  p('saffron-market', 'Saffron Market', 'warm', 'light', ['#fff4d6', '#3b2a0a', '#d97706', '#8b2e5c', '#e4572e']),
  p('cola-nut', 'Cola Nut', 'warm', 'dark', ['#2b1810', '#f8e7d0', '#e0903a', '#6fae8a', '#f2c14e']),
  // ---- cool ----
  p('indigo-dye', 'Indigo Dye', 'cool', 'dark', ['#101a4a', '#eef1ff', '#6f8cff', '#f2a65a', '#8be0d0']),
  p('lagoon', 'Lagoon', 'cool', 'dark', ['#062c33', '#e8fbf8', '#2ec4b6', '#ff9f6e', '#f6e27a']),
  p('harbour-blue', 'Harbour Blue', 'cool', 'light', ['#eaf2f8', '#0d2238', '#1f6fb2', '#e0703a', '#17a398']),
  p('midnight-silk', 'Midnight Silk', 'cool', 'dark', ['#141026', '#f3effd', '#9b7bff', '#3dd6c6', '#ff8fb1']),
  p('glacier', 'Glacier', 'cool', 'light', ['#eef7f7', '#10303a', '#12879a', '#c04a37', '#5b6ee1']),
  p('deep-sea', 'Deep Sea', 'cool', 'dark', ['#0a2236', '#e6f3ff', '#4fb3ff', '#ffb347', '#7be0a8']),
  // ---- earth ----
  p('forest-brass', 'Forest & Brass', 'earth', 'dark', ['#12291f', '#f3ecd8', '#c9a24b', '#6fa88a', '#e07b4f']),
  p('red-earth', 'Red Earth', 'earth', 'light', ['#efe3d3', '#2b1c14', '#8c3b22', '#4d6b3c', '#c28a2c']),
  p('baobab', 'Baobab', 'earth', 'dark', ['#231a12', '#f1e6d2', '#b9854a', '#7c9a6d', '#d4572f']),
  p('kente-field', 'Kente Field', 'earth', 'light', ['#f5ecd7', '#1d2a1a', '#2f6b3a', '#b8452b', '#d9a21b']),
  p('moss-stone', 'Moss & Stone', 'earth', 'light', ['#e9ebe0', '#232a1e', '#5b7a3a', '#a4572f', '#3f7c85']),
  p('adire-clay', 'Adire & Clay', 'earth', 'dark', ['#17203a', '#f2e9dc', '#d68a5a', '#5f8fd6', '#e9c46a']),
  // ---- bold ----
  p('electric-lagos', 'Electric Lagos', 'bold', 'dark', ['#0d0d1a', '#ffffff', '#ff3d6e', '#2ee6a6', '#ffe14d']),
  p('sun-and-ink', 'Sun & Ink', 'bold', 'light', ['#ffe36e', '#14120b', '#d62839', '#1d3fbf', '#0e8a5f']),
  p('carnival', 'Carnival', 'bold', 'dark', ['#1a0b2e', '#fff5fb', '#ff4fa3', '#35d0ff', '#ffd23f']),
  p('royal-orange', 'Royal Orange', 'bold', 'dark', ['#0b1a4d', '#ffffff', '#ff8a1f', '#46d1ff', '#ffe066']),
  p('poppy-field', 'Poppy Field', 'bold', 'light', ['#fff5f0', '#1a0f14', '#e11d48', '#0f766e', '#f59e0b']),
  p('cobalt-pop', 'Cobalt Pop', 'bold', 'light', ['#f3f6ff', '#0b1028', '#2347e8', '#ff5a36', '#00a88f']),
  // ---- pastel ----
  p('blush-sage', 'Blush & Sage', 'pastel', 'light', ['#fbf0ec', '#3b2a2e', '#e8a0b4', '#9cc5a1', '#f2d49b']),
  p('lilac-mint', 'Lilac & Mint', 'pastel', 'light', ['#f4f0fb', '#2a2440', '#c3a6f0', '#9ee0c9', '#f6c1a8']),
  p('peach-sky', 'Peach & Sky', 'pastel', 'light', ['#fff3ea', '#3a2a22', '#ffb38a', '#8ec9ee', '#f7dc8a']),
  p('butter-lavender', 'Butter & Lavender', 'pastel', 'light', ['#fffbe8', '#332c1a', '#f4d35e', '#b7a4e8', '#f2a7a0']),
  p('seafoam-rose', 'Seafoam & Rose', 'pastel', 'light', ['#eefaf5', '#1f3a33', '#7fd1b9', '#f0a6b8', '#f3d58a']),
  p('twilight-pastel', 'Twilight Pastel', 'pastel', 'dark', ['#2b2540', '#f6f1ff', '#b9a4f5', '#8fe0c0', '#ffc2a8']),
  // ---- mono ----
  p('graphite', 'Graphite', 'mono', 'dark', ['#111315', '#f4f4f2', '#d4d8da', '#8f9aa1', '#ffffff']),
  p('paper-ink', 'Paper & Ink', 'mono', 'light', ['#f7f4ee', '#1a1a1a', '#3d3d3a', '#8a857a', '#b3ab9a']),
  p('navy-mono', 'Navy Study', 'mono', 'dark', ['#0b1b33', '#eaf1fb', '#5b8bd0', '#9db9e3', '#cfe0f7']),
  p('forest-mono', 'Forest Study', 'mono', 'dark', ['#0f2a21', '#e8f3ec', '#4f9c78', '#8fcfae', '#cbead9']),
  p('terracotta-mono', 'Terracotta Study', 'mono', 'light', ['#f8ece4', '#3a1a10', '#b4532f', '#d9876a', '#7a2f18']),
  p('plum-mono', 'Plum Study', 'mono', 'dark', ['#231229', '#f8eefb', '#a05bb8', '#cf93e0', '#ecc9f5']),
];

/** Roles text may be set on. */
export const TEXT_ROLES: PaletteRole[] = ['ground', 'primary', 'secondary', 'highlight'];

export const paletteOf = (key: string | undefined): Palette | null =>
  (key ? PALETTES.find((x) => x.key === key) : undefined) ?? null;

/** White or near-black, whichever MEASURES better on this ground. */
export const readableInk = (hex: string): string =>
  contrastRatio(INK_LIGHT, hex) >= contrastRatio(INK_DARK, hex) ? INK_LIGHT : INK_DARK;

/**
 * Roles where neither ink reaches 4.5:1 but one reaches 3:1: fine for display
 * type (large slots), never for body copy.
 */
export function displayOnlyRoles(pal: Palette): PaletteRole[] {
  return TEXT_ROLES.filter((role) => {
    const c = pal.colours[role];
    const r = contrastRatio(readableInk(c), c);
    return r < 4.5 && r >= 3;
  });
}
