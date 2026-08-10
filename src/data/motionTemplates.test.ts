import { describe, it, expect } from 'vitest';
import {
  MOTION_TEMPLATES, motionTemplateByKey, DESIGN_STYLES,
} from './motionTemplates';
import { MOTION_SCENE_COUNTS, MOTION_SECONDS, motionScenesFromJob, type MotionConfig } from '../lib/motionGraphics';
import type { RenderAspect } from '../lib/renderVideo';

describe('motionTemplates — modern gallery', () => {
  it('has unique keys and named concepts', () => {
    const keys = new Set(MOTION_TEMPLATES.map((t) => t.key));
    expect(keys.size).toBe(MOTION_TEMPLATES.length);
    for (const t of MOTION_TEMPLATES) {
      expect(t.name.trim().length).toBeGreaterThan(0);
      expect(t.concept.trim().length).toBeGreaterThan(0);
      expect(t.tags.length).toBeGreaterThan(0);
    }
  });

  it('carries a 3-colour palette and a valid engine preset', () => {
    for (const t of MOTION_TEMPLATES) {
      expect(t.palette).toHaveLength(3);
      t.palette.forEach((c) => expect(c).toMatch(/^#[0-9a-f]{6}$/i));
      expect(MOTION_SCENE_COUNTS[t.preset.style]).toBeGreaterThan(0);
      expect(MOTION_SECONDS[t.preset.duration]).toBeGreaterThan(0);
      expect(['Vertical', 'Square', 'Landscape'] as RenderAspect[]).toContain(t.preset.aspect);
    }
  });

  it('covers every motion style across the gallery', () => {
    const covered = new Set(MOTION_TEMPLATES.map((t) => t.preset.style));
    for (const style of Object.keys(MOTION_SCENE_COUNTS)) {
      expect(covered.has(style as keyof typeof MOTION_SCENE_COUNTS)).toBe(true);
    }
  });

  it('builds a full, non-empty storyboard from every template', () => {
    const base: MotionConfig = { business: 'Meat Club', headline: '', subhead: '', cta: '', logoEmoji: '', aspect: 'Vertical', duration: 'medium', style: 'logo-reveal' };
    for (const t of MOTION_TEMPLATES) {
      const scenes = motionScenesFromJob({ ...base, ...t.preset });
      expect(scenes).toHaveLength(MOTION_SCENE_COUNTS[t.preset.style]);
      scenes.forEach((s) => expect(s.text.trim().length).toBeGreaterThan(0));
    }
  });

  it('looks templates up by key', () => {
    expect(motionTemplateByKey('aurora-glass')?.name).toBe('Aurora Glass');
    expect(motionTemplateByKey('nope')).toBeUndefined();
  });

  it('tags every template with a known design style', () => {
    const known = new Set(DESIGN_STYLES.map((s) => s.key));
    for (const t of MOTION_TEMPLATES) {
      expect(known.has(t.designStyle)).toBe(true);
    }
  });

  it('gives every design style at least one template to browse', () => {
    for (const style of DESIGN_STYLES) {
      expect(MOTION_TEMPLATES.some((t) => t.designStyle === style.key)).toBe(true);
    }
  });

  it('describes each design style for the gallery header', () => {
    for (const style of DESIGN_STYLES) {
      expect(style.label.trim().length).toBeGreaterThan(0);
      expect(style.blurb.trim().length).toBeGreaterThan(0);
      expect(style.emoji.length).toBeGreaterThan(0);
    }
  });
});
