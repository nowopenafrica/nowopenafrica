import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import type { SlotSpec } from '../designTemplates';
import {
  ICON_EM, ICON_GAP_EM, LUCIDE_NODES, LUCIDE_VERSION, classifyRow, glyphOf, iconIndent, isProfilePointer, namedPlatforms, nodePath, rowGlyph,
  type LucideName, type LucideNode,
} from './icons';
import { platformMark } from './platformMarks';

const lucideFile = (name: string): string =>
  readFileSync(`node_modules/lucide-react/dist/esm/icons/${name}.js`, 'utf8');

describe('the Lucide icons', () => {
  it('are copied from the installed lucide-react, at the version recorded', () => {
    const pkg = JSON.parse(readFileSync('node_modules/lucide-react/package.json', 'utf8')) as { version: string };
    expect(pkg.version).toBe(LUCIDE_VERSION);
  });

  it.each(Object.keys(LUCIDE_NODES))('%s matches the package node for node', (name) => {
    const file = lucideFile(name);
    // Each element in the package's own order: ["tag", { attrs }]
    const shipped = [...file.matchAll(/\[\s*"(\w+)",\s*\{([^}]*)\}\s*\]/g)].map(([, tag, body]) => {
      const attrs: Record<string, string> = {};
      for (const [, k, v] of body.matchAll(/(\w+):\s*"([^"]*)"/g)) if (k !== 'key') attrs[k] = v;
      return [tag, attrs];
    });
    expect(LUCIDE_NODES[name as LucideName]).toEqual(shipped);
  });

  it('turns every node into path data Path2D can draw', () => {
    expect(nodePath(['circle', { cx: '12', cy: '12', r: '10' }])).toBe('M22 12A10 10 0 1 1 2 12A10 10 0 1 1 22 12Z');
    expect(nodePath(['polyline', { points: '12 6 12 12 16 14' }])).toBe('M12 6L12 12L16 14');
    expect(nodePath(['rect', { width: '20', height: '16', x: '2', y: '4', rx: '2' }]))
      .toBe('M4 4H20A2 2 0 0 1 22 6V18A2 2 0 0 1 20 20H4A2 2 0 0 1 2 18V6A2 2 0 0 1 4 4Z');
    for (const nodes of Object.values(LUCIDE_NODES) as LucideNode[][]) {
      for (const node of nodes) expect(nodePath(node)).toMatch(/^[Mm][\d\s.,\-A-Za-z]+$/);
    }
  });
});

describe('glyphOf', () => {
  it('strokes Lucide at its own width and fills a platform mark', () => {
    expect(glyphOf({ set: 'lucide', name: 'phone' })).toMatchObject({ paint: 'stroke', strokeWidth: 2, grid: 24 });
    const ig = glyphOf({ set: 'platform', name: 'instagram' });
    expect(ig).toMatchObject({ paint: 'fill', grid: 24, viewBox: '0 0 24 24' });
    expect(ig?.paths).toEqual([platformMark('instagram')!.path]);
  });

  it('swaps a platform mark for the chosen platform, and only a platform mark', () => {
    expect(glyphOf({ set: 'platform', name: 'instagram' }, 'tiktok')?.name).toBe('tiktok');
    expect(glyphOf({ set: 'platform', name: 'instagram' }, 'linkedin')?.name).toBe('instagram');
    expect(glyphOf({ set: 'lucide', name: 'phone' }, 'tiktok')?.name).toBe('phone');
  });

  it('knows nothing it was not given', () => {
    expect(glyphOf({ set: 'lucide', name: 'twitter' })).toBeNull();
    expect(glyphOf({ set: 'platform', name: 'linkedin' })).toBeNull();
    expect(glyphOf({ set: 'tabler' as 'lucide', name: 'phone' })).toBeNull();
  });
});

describe('isProfilePointer', () => {
  it.each(['@yourhandle', '  @your.handle', 'Find us on Instagram', 'FOLLOW US ON TIKTOK', 'Link in bio', 'LINK IN BIO'])(
    'accepts %s', (t) => expect(isProfilePointer(t)).toBe(true));
  it.each(['Your phone', 'Your website', 'hello@yourbusiness.com', '@', 'Book now', 'Visit us on Saturday'])(
    'refuses %s', (t) => expect(isProfilePointer(t)).toBe(false));
});

describe('classifyRow (Ruling AL)', () => {
  it.each([
    ['+234 803 123 4567', 'phone'],
    ['0803-123-4567', 'phone'],
    ['(01) 234 5678', 'phone'],
    ['hello@mamaput.ng', 'mail'],
    ['www.mamaput.ng', 'globe'],
    ['https://mamaput.ng/menu', 'globe'],
    ['mamaput.nowopenafrica.com', 'globe'],
    ['Mon to Fri, 9:00 to 17:00', 'clock'],
    ['Saturday 10am to 2pm', 'clock'],
    ['Open 8 am daily', 'clock'],
    ['12 Allen Avenue, Ikeja', 'map-pin'],
    ['3 Bode Thomas Street, Surulere', 'map-pin'],
  ])('reads %s as %s', (text, want) => expect(classifyRow(text)).toBe(want));

  it.each([
    ['Your phone', 'phone'],
    ['Your booking line', 'phone'],
    ['Call us', 'phone'],
    ['Your email', 'mail'],
    ['Your website', 'globe'],
    ['Your address', 'map-pin'],
    ['Your area', 'map-pin'],
    ['Your days · Your hours', 'clock'],
    ['Out of hours · Your number', 'phone'],
    ['Out of hours', 'clock'],
  ])('reads the placeholder %s as %s', (text, want) => expect(classifyRow(text)).toBe(want));

  it('reads a street-type word as an address before a weekday or "number" (fix round 2)', () => {
    expect(classifyRow('5 Sun Street')).toBe('map-pin');
    expect(classifyRow('Friday Market Road')).toBe('map-pin');
    expect(classifyRow('Plot Number 5, Allen Avenue')).toBe('map-pin');
    expect(classifyRow('Off Admiralty Way, Lekki')).toBe('map-pin');
    expect(classifyRow('Allen Close, Ikeja')).toBe('map-pin');
    expect(classifyRow('12 Admiralty Way')).toBe('map-pin');
    expect(classifyRow('4 Bourdillon Crescent')).toBe('map-pin');
    // A real number still wins over everything.
    expect(classifyRow('0803 123 4567')).toBe('phone');
    expect(classifyRow('Sunday')).toBe('clock');
  });

  it('counts Close, Way, Lane and Crescent only as part of a street name', () => {
    expect(classifyRow('Open late, close at 10pm')).toBe('clock');
    expect(classifyRow('Find your way to us')).toBeNull();
    expect(classifyRow('We close early on Sundays')).toBe('clock');
    expect(classifyRow('down the lane from the market')).toBeNull();
  });

  it('does not read a name with an honorific or a capitalised word as a domain', () => {
    expect(classifyRow('Dr.Ade')).toBeNull();
    expect(classifyRow('Mr.Smith')).toBeNull();
    expect(classifyRow('Mrs.Okafor')).toBeNull();
    expect(classifyRow('John.Smith')).toBeNull();
    expect(classifyRow('shop.ng')).toBe('globe');
    expect(classifyRow('MamaPut.NG')).toBe('globe');
    expect(classifyRow('mamaput.kitchen')).toBe('globe');
  });

  it('lets contact words outrank hours, and a phone number outrank everything (Ruling AM)', () => {
    expect(classifyRow('Out of hours · Your number')).toBe('phone');
    expect(classifyRow('Out of hours')).toBe('clock');
    expect(classifyRow('Call us Mon to Fri')).toBe('phone');
    expect(classifyRow('Mon to Fri, 9:00 to 17:00')).toBe('clock');
    expect(classifyRow('0803 123 4567')).toBe('phone');
  });

  it.each(['Ikeja, Lagos', 'Order at the counter', 'Mama Put Kitchen', '12345', '@yourhandle', ''])(
    'finds nothing in %s', (text) => expect(classifyRow(text)).toBeNull());
});

describe('rowGlyph', () => {
  const PHONE = { set: 'lucide' as const, name: 'phone' };
  const IG = { set: 'platform' as const, name: 'instagram' };
  const contact: SlotSpec = { role: 'contact', x: 0, y: 0, w: 1, icons: [PHONE, IG, null] };

  it('leads a row with the icon its words call for, and a handle with its mark', () => {
    expect(rowGlyph(contact, 0, 'Your phone')?.name).toBe('phone');
    expect(rowGlyph(contact, 1, '@yourhandle')?.name).toBe('instagram');
    expect(rowGlyph(contact, 1, '@yourhandle', { platform: 'x' })?.name).toBe('x');
  });

  it('keeps the right icon per row when the rows are reordered or one is deleted', () => {
    const rows = (list: string[]) => list.map((t, i) => rowGlyph(contact, i, t)?.name ?? null);
    // As authored: phone, handle.
    expect(rows(['Your phone', '@yourhandle'])).toEqual(['phone', 'instagram']);
    // Reordered: the mark follows the handle, the phone follows the number.
    expect(rows(['@yourhandle', '+234 803 123 4567'])).toEqual(['instagram', 'phone']);
    // The phone deleted: the email in row 0 gets a mail icon, never the phone hint.
    expect(rows(['hello@mamaput.ng', 'www.mamaput.ng'])).toEqual(['mail', 'globe']);
    expect(rows(['12 Allen Avenue, Ikeja'])).toEqual(['map-pin']);
  });

  it('uses the hint only for an unreadable row that is still the template sample', () => {
    const odd: SlotSpec = { role: 'contact', x: 0, y: 0, w: 1, icons: [PHONE] };
    expect(rowGlyph(odd, 0, 'Ring Ade', { sample: 'Ring Ade' })?.name).toBe('phone');
    expect(rowGlyph(odd, 0, 'Ring Ade', { sample: 'Your phone' })).toBeNull();
    expect(rowGlyph(odd, 0, 'Ring Ade')).toBeNull();
  });

  it('draws nothing on a slot without icons, or on an empty row', () => {
    expect(rowGlyph({ role: 'contact', x: 0, y: 0, w: 1 }, 0, 'Your phone')).toBeNull();
    expect(rowGlyph(contact, 0, '  ')).toBeNull();
  });

  it('never puts a mark beside words that are not a handle', () => {
    expect(rowGlyph(contact, 1, 'Your website')?.name).toBe('globe');
    expect(rowGlyph({ role: 'contact', x: 0, y: 0, w: 1, icons: [IG] }, 0, 'Your website')).toBeNull();
  });

  it('never puts a mark beside words that name another platform', () => {
    const meta: SlotSpec = { role: 'meta', x: 0, y: 0, w: 1, icons: [IG] };
    expect(rowGlyph(meta, 0, 'Find us on Instagram', { platform: 'x' })).toBeNull();
    expect(rowGlyph(meta, 0, 'Find us on Instagram', { platform: 'instagram' })?.name).toBe('instagram');
    expect(rowGlyph(meta, 0, 'Find us on Instagram')?.name).toBe('instagram');
    expect(rowGlyph(meta, 0, 'Follow us on TikTok')).toBeNull();
    expect(rowGlyph(meta, 0, 'Follow us on TikTok', { platform: 'tiktok' })?.name).toBe('tiktok');
    expect(rowGlyph(meta, 0, 'Find us on Twitter', { platform: 'x' })?.name).toBe('x');
    // LinkedIn has no mark here (Ruling AK), so naming it never shows one.
    for (const platform of [undefined, 'instagram', 'linkedin']) {
      expect(rowGlyph(meta, 0, 'Find us on LinkedIn', { platform }), String(platform)).toBeNull();
    }
    // A bare handle names no platform: any chosen one is drawn.
    for (const m of ['instagram', 'tiktok', 'x', 'youtube', 'facebook', 'whatsapp', 'threads', 'snapchat', 'pinterest']) {
      expect(rowGlyph(meta, 0, '@yourhandle', { platform: m })?.name, m).toBe(m);
    }
  });

  it('names platforms in words', () => {
    expect(namedPlatforms('Find us on Instagram')).toEqual(['instagram']);
    expect(namedPlatforms('Follow us on X')).toEqual(['x']);
    expect(namedPlatforms('follow us on x')).toEqual(['x']);
    expect(namedPlatforms('Find us on Twitter')).toEqual(['x']);
    expect(namedPlatforms('@yourhandle')).toEqual([]);
    expect(namedPlatforms('Link in bio')).toEqual([]);
    // A bare X elsewhere is a letter, not a platform.
    expect(namedPlatforms('Find us on Instagram, 2 X a week')).toEqual(['instagram']);
  });

  it('reads a handle as the business, unless it is exactly a platform name', () => {
    expect(namedPlatforms('@insta.cafe')).toEqual([]);
    expect(namedPlatforms('@Mama.X')).toEqual([]);
    expect(namedPlatforms('@ig_kitchen')).toEqual([]);
    expect(namedPlatforms('@instagram')).toEqual(['instagram']);
    expect(namedPlatforms('@X')).toEqual(['x']);
    const meta: SlotSpec = { role: 'meta', x: 0, y: 0, w: 1, icons: [IG] };
    expect(rowGlyph(meta, 0, '@insta.cafe', { platform: 'tiktok' })?.name).toBe('tiktok');
    expect(rowGlyph(meta, 0, '@Mama.X')?.name).toBe('instagram');
    expect(rowGlyph(meta, 0, '@instagram', { platform: 'x' })).toBeNull();
  });

  it('never gives a general icon on a slot that carries only a platform mark (fix round 2)', () => {
    const meta: SlotSpec = { role: 'meta', x: 0, y: 0, w: 1, icons: [IG] };
    expect(rowGlyph(meta, 0, 'Call us')).toBeNull();
    expect(rowGlyph(meta, 0, 'shop.ng')).toBeNull();
    expect(rowGlyph(meta, 0, '+234 803 123 4567')).toBeNull();
    expect(rowGlyph(meta, 0, '@yourhandle')?.name).toBe('instagram');
  });

  it('keeps icons off the name, the headline, the subline and a disc', () => {
    const icons = [IG];
    for (const role of ['brand', 'headline', 'subline'] as const) {
      expect(rowGlyph({ role, x: 0, y: 0, w: 1, icons }, 0, '@yourhandle'), role).toBeNull();
    }
    expect(rowGlyph({ role: 'cta', x: 0, y: 0, w: 1, icons, treatment: 'disc' }, 0, '@yourhandle')).toBeNull();
    expect(rowGlyph({ role: 'cta', x: 0, y: 0, w: 1, icons, treatment: 'pill' }, 0, 'Link in bio')?.name).toBe('instagram');
  });

  it('sizes the icon at least to cap height, with a quarter of clear space or more', () => {
    expect(ICON_EM).toBeGreaterThanOrEqual(0.7);
    expect(ICON_GAP_EM).toBeGreaterThanOrEqual(ICON_EM / 4);
    expect(iconIndent(20)).toBeCloseTo(20 * (ICON_EM + ICON_GAP_EM));
  });
});
