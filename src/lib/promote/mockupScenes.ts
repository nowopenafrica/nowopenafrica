/**
 * The scenes an advertisement can be previewed in.
 *
 * ── WHY THESE ARE DRAWN AND NOT PHOTOGRAPHED ─────────────────────────────
 *
 * A preview has to show a believable environment, and there are three ways
 * to get one. Two are not available here:
 *
 *   - A photograph of a REAL advertising site, presented as that site. The
 *     inventory carries its own images, but nobody has marked where the
 *     advertising surface sits inside them, and guessing would mean showing
 *     a business their artwork on the wrong wall.
 *   - A stock or third-party mockup. This product already has a rule about
 *     lifting assets from Canva, Freepik and the rest, and a mockup library
 *     is exactly that.
 *
 * So the scenes are DRAWN, as vector, here. They are unambiguously
 * illustrative, they carry no licence, they scale to any size without going
 * soft, and — most usefully — the advertising surface is known exactly,
 * because it was placed deliberately rather than estimated from a photo.
 *
 * ── WHAT MAKES A SCENE USEFUL RATHER THAN DECORATIVE ─────────────────────
 *
 * Perspective and OCCLUSION. A flat rectangle with artwork in it tells a
 * business nothing they could not see in the editor. A surface that recedes,
 * with the bus windows and wheel arches drawn in FRONT of the artwork, shows
 * them the thing they actually need to know: how much of their design
 * survives contact with the medium.
 */

import type { Quad } from './surface';

/** Which mediums have a preview. Matches `advertisements.type` values. */
export type MockupMedium = 'billboard' | 'digital-led' | 'bus' | 'social';

export interface MockupScene {
  id: MockupMedium;
  name: string;
  /** One line, in the words a business owner would use. */
  blurb: string;
  /** `advertisements.type` values this scene is a fair preview of. */
  matches: string[];
  /** The scene's own coordinate space. */
  width: number;
  height: number;
  /** The advertising surface, clockwise from top-left. */
  surface: Quad;
  /** The shape the artwork should be, when the medium has a usual one. */
  defaultRatio: number;
  /** Painted behind the artwork. */
  background: string;
  /** Painted IN FRONT of it — windows, wheels, device chrome. */
  foreground?: string;
  /** Said on the preview itself. Never omitted. */
  caption: string;
}

/* Shared palette, kept dull so the artwork is what is looked at. */
const SKY = '#cdd9e6';
const SKY_LOW = '#e7eef5';
const ROAD = '#6b7280';
const KERB = '#9ca3af';
const STEEL = '#8d99a8';
const STEEL_DARK = '#6b7684';
const NIGHT = '#141b2a';

/**
 * A roadside billboard, seen from the near side of the carriageway.
 *
 * The board recedes to the right, which is what makes the preview worth
 * looking at: the far edge is shorter than the near one, so artwork with
 * detail crammed at one end shows that it will be read at an angle.
 */
const BILLBOARD: MockupScene = {
  id: 'billboard',
  name: 'Roadside billboard',
  blurb: 'A standard roadside board, seen from the carriageway.',
  matches: ['Billboard', 'Street Furniture'],
  width: 1200,
  height: 750,
  defaultRatio: 2,
  surface: {
    tl: { x: 0.085, y: 0.115 },
    tr: { x: 0.830, y: 0.195 },
    br: { x: 0.830, y: 0.545 },
    bl: { x: 0.085, y: 0.520 },
  },
  background: `
    <rect width="1200" height="750" fill="${SKY}"/>
    <rect y="430" width="1200" height="120" fill="${SKY_LOW}"/>
    <path d="M0 550 L1200 500 L1200 750 L0 750 Z" fill="${ROAD}"/>
    <path d="M0 550 L1200 500 L1200 516 L0 568 Z" fill="${KERB}"/>
    <path d="M120 750 L300 600 L350 600 L210 750 Z" fill="#ffffff" opacity="0.5"/>
    <path d="M520 750 L640 620 L690 620 L600 750 Z" fill="#ffffff" opacity="0.5"/>
    <rect x="300" y="120" width="140" height="60" rx="6" fill="#b8c4d2" opacity="0.5"/>
    <rect x="960" y="150" width="190" height="400" fill="#b4c0ce"/>
    <rect x="1000" y="190" width="30" height="40" fill="${SKY_LOW}" opacity="0.8"/>
    <rect x="1050" y="190" width="30" height="40" fill="${SKY_LOW}" opacity="0.8"/>
    <rect x="1000" y="260" width="30" height="40" fill="${SKY_LOW}" opacity="0.8"/>
    <rect x="1050" y="260" width="30" height="40" fill="${SKY_LOW}" opacity="0.8"/>
    <path d="M470 560 L500 560 L512 750 L458 750 Z" fill="${STEEL_DARK}"/>
    <path d="M86 108 L999 196 L999 212 L86 124 Z" fill="${STEEL}"/>
    <path d="M86 515 L999 540 L999 556 L86 531 Z" fill="${STEEL}"/>
    <rect x="78" y="105" width="16" height="430" fill="${STEEL}"/>
  `,
  caption: 'Illustrative preview. Site photography and exact board position are confirmed with the media owner.',
};

/**
 * A building-mounted LED screen after dark.
 *
 * Lit rather than printed, so the preview adds a glow and a faint scanline
 * — a digital screen that looks like paper misrepresents the medium.
 */
const DIGITAL_LED: MockupScene = {
  id: 'digital-led',
  name: 'Digital LED screen',
  blurb: 'A building-mounted LED screen, lit, after dark.',
  matches: ['Digital Screen', 'Mall Media', 'Airport', 'Stadium'],
  width: 1200,
  height: 750,
  defaultRatio: 1.667,
  surface: {
    tl: { x: 0.175, y: 0.150 },
    tr: { x: 0.775, y: 0.088 },
    br: { x: 0.775, y: 0.632 },
    bl: { x: 0.175, y: 0.700 },
  },
  background: `
    <rect width="1200" height="750" fill="${NIGHT}"/>
    <rect y="600" width="1200" height="150" fill="#0d1320"/>
    <path d="M150 40 L960 0 L960 750 L150 750 Z" fill="#1d2738"/>
    <path d="M960 0 L1120 60 L1120 750 L960 750 Z" fill="#161e2c"/>
    <rect x="1000" y="120" width="26" height="36" fill="#f0c674" opacity="0.5"/>
    <rect x="1048" y="200" width="26" height="36" fill="#f0c674" opacity="0.3"/>
    <rect x="1000" y="300" width="26" height="36" fill="#f0c674" opacity="0.45"/>
    <rect x="1048" y="420" width="26" height="36" fill="#f0c674" opacity="0.25"/>
    <path d="M170 110 L940 48 L940 32 L170 94 Z" fill="#39455a"/>
    <path d="M170 715 L940 650 L940 668 L170 733 Z" fill="#39455a"/>
    <circle cx="220" cy="690" r="4" fill="#f0c674" opacity="0.6"/>
    <circle cx="880" cy="640" r="4" fill="#f0c674" opacity="0.6"/>
  `,
  foreground: `
    <path d="M170 110 L940 48 L940 56 L170 118 Z" fill="#ffffff" opacity="0.10"/>
  `,
  caption: 'Illustrative preview. Screen pitch, brightness and loop length are confirmed with the media owner.',
};

/**
 * The flank of a city bus.
 *
 * The windows and the wheel arches are drawn IN FRONT of the artwork,
 * because that is the whole point: a bus wrap is interrupted, and a design
 * whose words sit behind a window is a design that will not be read.
 */
const BUS: MockupScene = {
  id: 'bus',
  name: 'Bus flank',
  blurb: 'A full-length side wrap, with the windows and arches in front.',
  matches: ['Transit', 'Vehicle Wrap'],
  width: 1200,
  height: 560,
  defaultRatio: 4.2,
  surface: {
    tl: { x: 0.072, y: 0.235 },
    tr: { x: 0.948, y: 0.195 },
    br: { x: 0.948, y: 0.775 },
    bl: { x: 0.072, y: 0.800 },
  },
  background: `
    <rect width="1200" height="560" fill="#dfe6ee"/>
    <rect y="470" width="1200" height="90" fill="#9ca3af"/>
    <path d="M86 110 L1138 92 L1150 440 L86 452 Z" fill="#f3f4f6"/>
    <path d="M86 110 L1138 92 L1138 108 L86 126 Z" fill="#cfd6df"/>
  `,
  foreground: `
    <path d="M110 128 L300 124 L300 230 L110 234 Z" fill="#273243" opacity="0.88"/>
    <path d="M320 123 L520 119 L520 226 L320 230 Z" fill="#273243" opacity="0.88"/>
    <path d="M540 118 L740 114 L740 222 L540 226 Z" fill="#273243" opacity="0.88"/>
    <path d="M760 113 L960 109 L960 218 L760 222 Z" fill="#273243" opacity="0.88"/>
    <path d="M980 108 L1120 105 L1120 214 L980 217 Z" fill="#273243" opacity="0.88"/>
    <path d="M250 452 a86 86 0 0 1 172 0 Z" fill="#dfe6ee"/>
    <circle cx="336" cy="452" r="62" fill="#2b3342"/>
    <circle cx="336" cy="452" r="26" fill="#8d99a8"/>
    <path d="M850 452 a86 86 0 0 1 172 0 Z" fill="#dfe6ee"/>
    <circle cx="936" cy="452" r="62" fill="#2b3342"/>
    <circle cx="936" cy="452" r="26" fill="#8d99a8"/>
    <rect x="86" y="438" width="1064" height="16" fill="#cfd6df"/>
  `,
  caption: 'Illustrative preview. Panel sizes, window lines and exclusions differ per vehicle and are confirmed before production.',
};

/**
 * A post in a social feed, on a phone.
 *
 * Flat, deliberately — there is no perspective in a feed, and adding one
 * would be decoration pretending to be information. What it does show is
 * the chrome: how much of the image the interface eats.
 */
const SOCIAL: MockupScene = {
  id: 'social',
  name: 'Social feed post',
  blurb: 'A sponsored post as it appears in a phone feed.',
  matches: ['Online', 'Social'],
  width: 760,
  height: 1000,
  defaultRatio: 1,
  surface: {
    tl: { x: 0.185, y: 0.262 },
    tr: { x: 0.815, y: 0.262 },
    br: { x: 0.815, y: 0.690 },
    bl: { x: 0.185, y: 0.690 },
  },
  background: `
    <rect width="760" height="1000" fill="#e8edf3"/>
    <rect x="116" y="40" width="528" height="920" rx="44" fill="#0f1623"/>
    <rect x="130" y="56" width="500" height="888" rx="34" fill="#ffffff"/>
    <rect x="310" y="68" width="140" height="18" rx="9" fill="#0f1623"/>
    <circle cx="170" cy="210" r="24" fill="#c7d2e0"/>
    <rect x="206" y="196" width="150" height="14" rx="7" fill="#1f2937"/>
    <rect x="206" y="218" width="96" height="11" rx="5" fill="#9aa6b6"/>
    <rect x="540" y="196" width="60" height="18" rx="9" fill="#e5e9f0"/>
  `,
  foreground: `
    <rect x="140" y="700" width="20" height="20" rx="4" fill="#4b5563"/>
    <rect x="176" y="700" width="20" height="20" rx="4" fill="#4b5563"/>
    <rect x="212" y="700" width="20" height="20" rx="4" fill="#4b5563"/>
    <rect x="580" y="700" width="20" height="20" rx="4" fill="#4b5563"/>
    <rect x="140" y="740" width="320" height="12" rx="6" fill="#1f2937"/>
    <rect x="140" y="764" width="430" height="10" rx="5" fill="#9aa6b6"/>
    <rect x="140" y="784" width="380" height="10" rx="5" fill="#9aa6b6"/>
    <rect x="140" y="824" width="110" height="24" rx="6" fill="#e5e9f0"/>
  `,
  caption: 'Illustrative preview. Each network crops and compresses differently; check the final asset in the network itself.',
};

export const MOCKUP_SCENES: MockupScene[] = [BILLBOARD, DIGITAL_LED, BUS, SOCIAL];

export const sceneById = (id: string): MockupScene | undefined =>
  MOCKUP_SCENES.find((s) => s.id === id);

/**
 * The fairest scene for a placement, from its `type`.
 *
 * Returns null rather than a default when nothing fits. A radio slot
 * previewed on a billboard is not a preview, it is a mistake with a picture
 * attached.
 */
export function sceneForType(type: string | null | undefined): MockupScene | null {
  const t = (type ?? '').trim().toLowerCase();
  if (!t) return null;
  return MOCKUP_SCENES.find((s) => s.matches.some((m) => m.toLowerCase() === t)) ?? null;
}

/** Which inventory types have no preview, so the interface can say so. */
export const UNPREVIEWABLE = ['Radio', 'Television', 'Cinema', 'Print'];
