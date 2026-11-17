import { afterEach, describe, expect, it } from 'vitest';

import { DESIGN_TEMPLATES, templateByKey, type DesignTemplate } from '../../designTemplates';
import { clearUploadedDeliverables } from '../deliverables';
import type { AssetManifest } from '../assetManifestTypes';
import { sampleFor } from '../../create/sampleCopy';
import { AUTO_MAX, AUTO_TOTAL, automatedScore, type AutoScore } from './score';

const EMPTY: AssetManifest = { assets: [] };
const CRITERIA = Object.keys(AUTO_MAX) as (keyof typeof AUTO_MAX)[];

afterEach(() => clearUploadedDeliverables());

describe('automatedScore', () => {
  it('has the spec maxima, 59 in all', () => {
    expect(AUTO_MAX).toEqual({
      typography: 5, relevance: 4, image: 5, editability: 10, dimensions: 10,
      exportReady: 10, access: 7, licensing: 5, mobile: 3,
    });
    expect(AUTO_TOTAL).toBe(59);
  });

  it('stays inside every maximum, and writes evidence for every non-zero criterion', () => {
    for (const tpl of DESIGN_TEMPLATES) {
      const s: AutoScore = automatedScore(tpl, DESIGN_TEMPLATES, EMPTY);
      let sum = 0;
      for (const c of CRITERIA) {
        expect(s[c], `${tpl.key} ${c}`).toBeGreaterThanOrEqual(0);
        expect(s[c], `${tpl.key} ${c}`).toBeLessThanOrEqual(AUTO_MAX[c]);
        if (s[c] > 0) expect(s.evidence[c], `${tpl.key} ${c} evidence`).toMatch(/\S/);
        sum += s[c];
      }
      expect(s.total, tpl.key).toBeCloseTo(sum, 5);
      expect(s.total, tpl.key).toBeLessThanOrEqual(59);
    }
  });

  it('does not lower editability for an empty optional field', () => {
    const t = templateByKey('tiered-sale');
    const full = sampleFor(t);
    const with_ = automatedScore(t, [], EMPTY, { copy: full });
    for (const field of ['eyebrow', 'subline', 'cta', 'meta'] as const) {
      const without = automatedScore(t, [], EMPTY, { copy: { ...full, [field]: '' } });
      expect(without.editability, field).toBe(with_.editability);
    }
  });

  it('scores relevance by the share of required roles present', () => {
    const t = templateByKey('card-front');
    expect(automatedScore(t, [], EMPTY).relevance).toBe(4);
    const noContact: DesignTemplate = {
      ...t,
      slots: t.slots.filter((s) => s.role !== 'contact'),
      extraPages: t.extraPages?.map((p) => ({ ...p, slots: p.slots.filter((s) => s.role !== 'contact') })),
    };
    // business-card needs brand, headline and contact: two of three.
    expect(automatedScore(noContact, [], EMPTY).relevance).toBeCloseTo(4 * (2 / 3), 5);
  });

  it('gives full image marks when no raster is used, and fewer for an undersized one', () => {
    const t = templateByKey('card-front');
    expect(automatedScore(t, [], EMPTY).image).toBe(5);
    const small: DesignTemplate = { ...t, surface: { ...t.surface, image: 'asset:tiny' } as DesignTemplate['surface'] };
    const manifest: AssetManifest = { assets: [{
      id: 'tiny', kind: 'photo', path: '/a/tiny.webp', w: 200, h: 120, licence: 'Pexels', attribution: null,
      tags: [], people: false, iconSet: null,
    }] };
    const s = automatedScore(small, [], manifest);
    expect(s.image).toBeLessThan(5);
    expect(s.evidence.image).toMatch(/200x120/);
  });

  it('gives an image with no pixel size 0 marks and says why', () => {
    const t = templateByKey('card-front');
    const tpl: DesignTemplate = { ...t, surface: { ...t.surface, image: 'asset:blank' } as DesignTemplate['surface'] };
    const manifest: AssetManifest = { assets: [{
      id: 'blank', kind: 'photo', path: '/a/blank.webp', w: 0, h: 0, licence: 'Pexels', attribution: null,
      tags: [], people: false, iconSet: null,
    }] };
    const s = automatedScore(tpl, [], manifest);
    expect(s.image).toBe(0);
    expect(s.evidence.image).toMatch(/no pixel size [(]0x0[)]/);
  });

  it('scores the mobile card from the headline at 160 px', () => {
    const s = automatedScore(templateByKey('tiered-sale'), [], EMPTY);
    expect(s.mobile).toBe(3);
    expect(s.evidence.mobile).toMatch(/160 px/);
  });
});
