/**
 * Icons on a design (Task 18b, 2026-11-08): what a row's leading icon is,
 * where its geometry comes from, and the rules for drawing it.
 *
 * Two sets, and only two:
 *
 * - `lucide`, the general icons (phone, mail, globe, map pin, clock,
 *   calendar...): one consistent outline style, ISC licence. The node data
 *   below is copied verbatim from the installed `lucide-react` package
 *   (LUCIDE_VERSION); icons.test.ts reads the package's own files and fails
 *   if a node here differs from them.
 * - `platform`, the social platform marks in platformMarks.ts.
 *
 * ── ONE SOURCE OF TRUTH PER ICON ─────────────────────────────────────────
 *
 * Every glyph resolves to path data here, once. TemplateSurface draws those
 * paths as inline SVG; drawTemplate draws the SAME strings through Path2D, at
 * the same size, gap and colour, so an exported PNG matches the preview. The
 * Lucide nodes (circles, rects, polylines) are turned into path data by
 * nodePath() so that the canvas needs nothing but Path2D.
 *
 * ── THE RULES (both renderers call rowGlyph, so neither can skip one) ─────
 *
 * - An icon leads a list row (services, contact) or a one-line text slot
 *   (eyebrow, meta, cta). Never the brand, the headline or the subline, and
 *   never inside a disc badge.
 * - The icon box is the row's type size (1 em), which is above the text's
 *   cap height by construction, with a gap of ICON_GAP_EM after it (clear
 *   space of more than the quarter of its height a platform mark needs).
 * - It takes the row's text colour, unchanged.
 * - A platform mark is drawn only when its row's words are a handle or a
 *   profile pointer (isProfilePointer), and never beside words that name a
 *   different platform. Change "@yourhandle" to a web address and the mark
 *   goes; the row stays.
 * - A general icon comes from what the row's words ARE (classifyRow), so it
 *   follows the row wherever the business puts it (Ruling AL).
 */
import type { SlotRole, SlotSpec } from '../designTemplates';
import { isPlatformKey, platformMark } from './platformMarks';

/** The lucide-react release the nodes below were copied from. */
export const LUCIDE_VERSION = '0.344.0';

export type IconSetKey = 'lucide' | 'platform';

/** A leading icon on a row: which set, and which icon in it. */
export interface SlotIcon {
  set: IconSetKey;
  name: string;
}

/** A Lucide node as the package writes it: an SVG element name and its attributes. */
export type LucideNode = [tag: 'path' | 'circle' | 'rect' | 'polyline' | 'line', attrs: Record<string, string>];

/** The Lucide icons a design may use, verbatim from lucide-react (`key` attributes dropped). */
export const LUCIDE_NODES = {
  phone: [
    ['path', { d: 'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z' }],
  ],
  mail: [
    ['rect', { width: '20', height: '16', x: '2', y: '4', rx: '2' }],
    ['path', { d: 'm22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7' }],
  ],
  globe: [
    ['circle', { cx: '12', cy: '12', r: '10' }],
    ['path', { d: 'M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20' }],
    ['path', { d: 'M2 12h20' }],
  ],
  'map-pin': [
    ['path', { d: 'M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z' }],
    ['circle', { cx: '12', cy: '10', r: '3' }],
  ],
  clock: [
    ['circle', { cx: '12', cy: '12', r: '10' }],
    ['polyline', { points: '12 6 12 12 16 14' }],
  ],
  calendar: [
    ['path', { d: 'M8 2v4' }],
    ['path', { d: 'M16 2v4' }],
    ['rect', { width: '18', height: '18', x: '3', y: '4', rx: '2' }],
    ['path', { d: 'M3 10h18' }],
  ],
  'at-sign': [
    ['circle', { cx: '12', cy: '12', r: '4' }],
    ['path', { d: 'M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8' }],
  ],
  link: [
    ['path', { d: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71' }],
    ['path', { d: 'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71' }],
  ],
} satisfies Record<string, LucideNode[]>;

export type LucideName = keyof typeof LUCIDE_NODES;

export const isLucideName = (name: unknown): name is LucideName =>
  typeof name === 'string' && Object.prototype.hasOwnProperty.call(LUCIDE_NODES, name);

const n = (v: string | undefined): number => Number(v ?? 0);

/** One Lucide node as path data, drawing exactly what the SVG element draws. */
export function nodePath([tag, a]: LucideNode): string {
  switch (tag) {
    case 'path':
      return a.d;
    case 'circle': {
      const [cx, cy, r] = [n(a.cx), n(a.cy), n(a.r)];
      return `M${cx + r} ${cy}A${r} ${r} 0 1 1 ${cx - r} ${cy}A${r} ${r} 0 1 1 ${cx + r} ${cy}Z`;
    }
    case 'rect': {
      const [x, y, w, h] = [n(a.x), n(a.y), n(a.width), n(a.height)];
      const r = Math.min(n(a.rx ?? a.ry), w / 2, h / 2);
      if (!(r > 0)) return `M${x} ${y}H${x + w}V${y + h}H${x}Z`;
      return `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}`
        + `A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}`
        + `V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`;
    }
    case 'polyline': {
      const p = a.points.trim().split(/[\s,]+/).map(Number);
      const pts: string[] = [];
      for (let i = 0; i + 1 < p.length; i += 2) pts.push(`${i === 0 ? 'M' : 'L'}${p[i]} ${p[i + 1]}`);
      return pts.join('');
    }
    case 'line':
      return `M${n(a.x1)} ${n(a.y1)}L${n(a.x2)} ${n(a.y2)}`;
  }
}

/** What both renderers draw: path data in a square viewBox, stroked (Lucide) or filled (a mark). */
export interface Glyph {
  set: IconSetKey;
  name: string;
  viewBox: string;
  /** The viewBox's side, in its own units. */
  grid: number;
  paths: string[];
  paint: 'stroke' | 'fill';
  /** Stroke width in viewBox units (Lucide's 2). */
  strokeWidth: number;
}

const LUCIDE_GLYPHS = new Map<string, Glyph>(
  (Object.keys(LUCIDE_NODES) as LucideName[]).map((name) => [name, {
    set: 'lucide', name, viewBox: '0 0 24 24', grid: 24,
    paths: (LUCIDE_NODES[name] as LucideNode[]).map(nodePath),
    paint: 'stroke', strokeWidth: 2,
  }]),
);

/**
 * The glyph an icon names, or null when it names nothing known.
 *
 * `platform` is the visitor's choice of platform for a handle row; it
 * replaces the template's default mark, and only on a platform icon.
 */
export function glyphOf(icon: SlotIcon, platform?: string): Glyph | null {
  if (icon.set === 'lucide') return LUCIDE_GLYPHS.get(icon.name) ?? null;
  if (icon.set !== 'platform') return null;
  const mark = platformMark(isPlatformKey(platform) ? platform : icon.name);
  if (!mark) return null;
  const grid = Number(mark.viewBox.split(/\s+/)[2]) || 24;
  return { set: 'platform', name: mark.key, viewBox: mark.viewBox, grid, paths: [mark.path], paint: 'fill', strokeWidth: 0 };
}

/** The icon box, as a multiple of the row's type size. Above cap height (~0.7 em) by construction. */
export const ICON_EM = 1;

/** The space between the icon and its words, as a multiple of the type size. */
export const ICON_GAP_EM = 0.42;

/** How far an icon pushes its row's words along: the box and the gap. */
export const iconIndent = (sizePx: number): number => sizePx * (ICON_EM + ICON_GAP_EM);

/** Roles whose ROWS may carry an icon. */
export const ICON_LIST_ROLES: readonly SlotRole[] = ['services', 'contact'];

/** One-line text roles that may lead with an icon. */
export const ICON_TEXT_ROLES: readonly SlotRole[] = ['eyebrow', 'meta', 'cta'];

export const mayCarryIcon = (slot: Pick<SlotSpec, 'role' | 'treatment'>): boolean =>
  (ICON_LIST_ROLES.includes(slot.role) || ICON_TEXT_ROLES.includes(slot.role)) && slot.treatment !== 'disc';

/**
 * A handle or a pointer to a profile: "@yourhandle", "Find us on Instagram",
 * "Follow us on TikTok", "Link in bio". The only words a platform mark may
 * stand beside.
 */
export function isProfilePointer(text: string): boolean {
  const t = text.trim();
  return /^@[\p{L}\p{N}._]/u.test(t)
    || /^(find|follow) us on\b/i.test(t)
    || /^link in (our |my )?bio\b/i.test(t);
}

/* ── WHICH PLATFORM THE WORDS NAME ───────────────────────────────────────
 *
 * "Find us on Instagram" beside an X mark is a trademark misstatement. A row
 * whose words name a platform shows that platform's mark or none. Twitter is
 * X's former name, so it names X. LinkedIn is named but has no mark here
 * (platformMarks.ts), so a row naming it never shows one.
 */
const NAMED: readonly [RegExp, string][] = [
  [/\binstagram\b|\binsta\b|\bIG\b/i, 'instagram'],
  [/\btik ?tok\b/i, 'tiktok'],
  // Bare "X" is a letter as often as a platform: it names X only after "on" ("follow us on x").
  [/\btwitter\b|\bon x\b/i, 'x'],
  [/\byou ?tube\b/i, 'youtube'],
  [/\bfacebook\b/i, 'facebook'],
  [/\bwhats ?app\b/i, 'whatsapp'],
  [/\bthreads\b/i, 'threads'],
  [/\bsnap ?chat\b/i, 'snapchat'],
  [/\bpinterest\b/i, 'pinterest'],
  [/\blinked ?in\b/i, 'linkedin'],
];

/** A handle that IS a platform's name ("@instagram") names that platform; any other handle names none. */
const HANDLE_TOKEN = /@([\p{L}\p{N}._]+)/gu;
const HANDLE_NAMES: Record<string, string> = {
  instagram: 'instagram', tiktok: 'tiktok', x: 'x', twitter: 'x', youtube: 'youtube', facebook: 'facebook',
  whatsapp: 'whatsapp', threads: 'threads', snapchat: 'snapchat', pinterest: 'pinterest', linkedin: 'linkedin',
};

/**
 * The platforms a row's words name, by registry key ('linkedin' included,
 * which has no mark). A handle token is the business's own name, not a
 * platform's: "@insta.cafe" and "@Mama.X" name nothing; "@instagram" does.
 */
export function namedPlatforms(text: string): string[] {
  const keys = new Set<string>();
  const rest = text.replace(HANDLE_TOKEN, (_whole, body: string) => {
    const key = HANDLE_NAMES[body.toLowerCase()];
    if (key) keys.add(key);
    return ' ';
  });
  for (const [re, key] of NAMED) if (re.test(rest)) keys.add(key);
  return [...keys];
}

/* ── WHAT THE WORDS ARE (Ruling AL) ───────────────────────────────────────
 *
 * A general icon is read from the row's own words, not from its position:
 * saved designs, a real business's details and the Studio all put rows in
 * their own order, and a phone icon must never end up beside an email. The
 * template's per-row icon is only a hint, used for a row the words cannot
 * classify AND whose words are still the template's own sample text there.
 */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL = /^(https?:\/\/|www\.)\S+$/i;
const DOMAIN = /^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.([a-z]{2,})(\/\S*)?$/i;
/** "Dr.Ade" and "Mr.Smith" are names, not domains. */
const HONORIFIC = /^(dr|mr|mrs|ms|prof)\./i;
/** Top-level domains accepted in capitals too ("MamaPut.NG"); any other TLD must be written lowercase. */
const KNOWN_TLDS = new Set([
  'com', 'net', 'org', 'ng', 'africa', 'co', 'io', 'za', 'ke', 'gh', 'ug', 'tz', 'rw', 'uk', 'biz', 'info',
  'shop', 'store', 'online', 'site', 'app', 'dev', 'me',
]);

/** A web address: a URL, or a bare domain whose TLD is lowercase or a known one. */
function isWebAddress(t: string): boolean {
  if (URL.test(t)) return true;
  if (HONORIFIC.test(t)) return false;
  const m = DOMAIN.exec(t);
  if (!m) return false;
  return m[1] === m[1].toLowerCase() || KNOWN_TLDS.has(m[1].toLowerCase());
}
const PHONE = /^\+?[\d\s().\-/]+$/;
const HOURS = [
  /\b(mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)(day)?s?\b/i,
  /\b(weekdays?|weekends?|daily|everyday|public holidays?)\b/i,
  /\bhours?\b/i,
  /\b\d{1,2}(:\d{2})?\s?(am|pm|a\.m\.|p\.m\.)(?![a-z])/i,
  /\b\d{1,2}:\d{2}\b/,
  /\byour days\b/i,
];
/*
 * A street-type word makes the row an address before a weekday or "number"
 * can claim it. Close, Way, Lane and Crescent are everyday words too ("close
 * at 10pm", "find your way"), so they count only as part of a street's
 * proper name: capitalised, after a capitalised word or a number ("Allen
 * Close", "12 Admiralty Way"). Lowercase, they never do.
 */
const STREET_WORD = /\b(street|road|avenue|plot|estate)\b/i;
const STREET_NAME = /(?:\b\p{Lu}[\p{L}'-]*|\b\d+[A-Za-z]?)\s+(Close|Way|Lane|Crescent)\b/u;
const isStreet = (t: string): boolean => STREET_WORD.test(t) || STREET_NAME.test(t);
const ADDRESS = /\b(street|road|avenue|plot|boulevard|estate|junction|plaza|your address|your area|your location)\b|\b(st|rd|ave)\.(\s|$)/i;
const PHONE_WORDS = /\b(phone|number|call|booking line|telephone|tel)\b/i;
const MAIL_WORDS = /\b(e-?mail)\b/i;
const WEB_WORDS = /\b(website|web)\b/i;

/**
 * The Lucide icon a row's words call for, or null when they say nothing an icon can.
 *
 * Precedence (Rulings AM and fix round 2): a phone-like run of digits
 * outranks everything; then an email or a web address; then a street-type
 * word makes it an address ("5 Sun Street", "Friday Market Road", "Plot
 * Number 5, Allen Avenue"); then explicit contact words (number, phone,
 * call, tel, booking line) outrank hours cues, because "Out of hours · Your
 * number" is a phone line, not opening times; then hours, then other
 * address cues, then the remaining placeholder words.
 */
export function classifyRow(text: string): LucideName | null {
  const t = text.trim();
  if (!t) return null;
  if (PHONE.test(t) && (t.match(/\d/g)?.length ?? 0) >= 7) return 'phone';
  if (EMAIL.test(t)) return 'mail';
  if (isWebAddress(t)) return 'globe';
  if (isStreet(t)) return 'map-pin';
  if (PHONE_WORDS.test(t)) return 'phone';
  if (HOURS.some((re) => re.test(t))) return 'clock';
  if (ADDRESS.test(t)) return 'map-pin';
  if (MAIL_WORDS.test(t)) return 'mail';
  if (WEB_WORDS.test(t)) return 'globe';
  return null;
}

export interface RowGlyphOptions {
  /** The visitor's platform choice for a handle row (platformMarks.ts). */
  platform?: string;
  /**
   * The template's own sample words for this row (create/sampleCopy.ts).
   * The per-row hint is trusted only while the row still reads exactly this.
   */
  sample?: string;
}

/**
 * The glyph to draw before row `index` of a slot (0 for a text slot), or null.
 *
 * Both renderers call this with the row's own words, before any capitals are
 * applied, so the rules above hold identically in the preview and the export.
 *
 * - No icon at all unless the template put icons on this slot.
 * - A handle or profile pointer takes the slot's platform mark (the visitor's
 *   choice, else the template's), unless the words name another platform.
 * - Anything else takes the icon its words call for (classifyRow), but only
 *   on a slot the template gave at least one Lucide hint: a slot that carries
 *   only a platform mark never gets a general icon. If the words call for
 *   none, the template's hint for this row, but only while the row is still
 *   the template's own sample text.
 */
export function rowGlyph(slot: SlotSpec, index: number, text: string, opts: RowGlyphOptions = {}): Glyph | null {
  const icons = slot.icons ?? [];
  if (!icons.some(Boolean) || !text.trim() || !mayCarryIcon(slot)) return null;
  const hint = icons[index] ?? null;

  if (isProfilePointer(text)) {
    const mark = hint?.set === 'platform' ? hint : icons.find((i) => i?.set === 'platform');
    if (!mark) return null;
    const glyph = glyphOf(mark, opts.platform);
    if (!glyph) return null;
    const named = namedPlatforms(text);
    if (named.some((k) => k !== glyph.name)) return null;
    return glyph;
  }

  if (!icons.some((i) => i?.set === 'lucide')) return null;
  const read = classifyRow(text);
  if (read) return glyphOf({ set: 'lucide', name: read });
  if (hint?.set === 'lucide' && opts.sample !== undefined && text === opts.sample) return glyphOf(hint);
  return null;
}
