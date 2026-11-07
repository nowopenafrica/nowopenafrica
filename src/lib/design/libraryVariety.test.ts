import { describe, expect, it } from 'vitest';

import { DESIGN_TEMPLATES } from '../designTemplates';
import { deliverableFor } from './deliverables';
import { paletteOf } from './palettes';

/*
 * ── ONE PALETTE EVERYWHERE IS THE FAILURE THIS GUARDS ─────────────────────
 *
 * The founder's complaint that started the redesign: every design "carries
 * one colour palette". Giving each template a look fixes that only if the
 * looks are spread out — thirty templates in Lagos Sunset is the same
 * complaint with a nicer palette. Spec §5 sets the rule: no palette on more
 * than six templates, and within one collection (the business cards, say) no
 * palette twice, because those are shown side by side as a choice.
 */
const looked = DESIGN_TEMPLATES.filter((t) => t.look);

describe('the library stays colourful as looks are added', () => {
  it('only ever names a palette that exists', () => {
    for (const t of looked) expect(paletteOf(t.look?.palette), t.key).not.toBeNull();
  });

  it('uses no palette on more than six templates', () => {
    const uses = new Map<string, string[]>();
    for (const t of looked) {
      const key = t.look?.palette ?? '';
      uses.set(key, [...(uses.get(key) ?? []), t.key]);
    }
    for (const [palette, keys] of uses) {
      expect(keys.length, `${palette}: ${keys.join(', ')}`).toBeLessThanOrEqual(6);
    }
  });

  it('never repeats a palette inside one collection', () => {
    const bySlug = new Map<string, Map<string, string>>();
    for (const t of looked) {
      const slug = deliverableFor(t)?.slug;
      if (!slug) continue;
      const seen = bySlug.get(slug) ?? new Map<string, string>();
      const palette = t.look?.palette ?? '';
      expect(seen.get(palette), `${slug}: ${t.key} repeats ${palette}`).toBeUndefined();
      seen.set(palette, t.key);
      bySlug.set(slug, seen);
    }
  });
});
