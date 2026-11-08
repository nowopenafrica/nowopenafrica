import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import type { SlotSpec } from '../designTemplates';
import {
  ICON_EM, ICON_GAP_EM, LUCIDE_NODES, LUCIDE_VERSION, glyphOf, iconIndent, isProfilePointer, nodePath, rowGlyph,
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

describe('rowGlyph', () => {
  const contact: SlotSpec = {
    role: 'contact', x: 0, y: 0, w: 1,
    icons: [{ set: 'lucide', name: 'phone' }, { set: 'platform', name: 'instagram' }, null],
  };

  it('leads a row with its icon, and a handle with its mark', () => {
    expect(rowGlyph(contact, 0, 'Your phone')?.name).toBe('phone');
    expect(rowGlyph(contact, 1, '@yourhandle')?.name).toBe('instagram');
    expect(rowGlyph(contact, 1, '@yourhandle', 'x')?.name).toBe('x');
  });

  it('never puts a mark beside words that are not a handle', () => {
    expect(rowGlyph(contact, 1, 'Your website')).toBeNull();
  });

  it('draws nothing on a bare row, an empty row or a row with no icon', () => {
    expect(rowGlyph(contact, 2, 'Your area')).toBeNull();
    expect(rowGlyph(contact, 0, '  ')).toBeNull();
    expect(rowGlyph(contact, 5, 'Your phone')).toBeNull();
  });

  it('keeps icons off the name, the headline, the subline and a disc', () => {
    const icons = [{ set: 'platform' as const, name: 'instagram' }];
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
