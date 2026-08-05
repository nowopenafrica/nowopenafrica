import { describe, it, expect } from 'vitest';
import {
  VIDEO_MODELS, SEEDANCE_REFERENCE,
  autoSelectVideoModel, modelMeta, modelLabel,
} from './videoModels';

describe('videoModels registry', () => {
  it('only ships free models, none reach Seedance', () => {
    for (const m of VIDEO_MODELS) {
      expect(m.closeness).toBeLessThan(SEEDANCE_REFERENCE.closeness);
      expect(m.closeness).toBeGreaterThan(0);
    }
  });

  it('keys are unique and resolvable', () => {
    const keys = new Set(VIDEO_MODELS.map((m) => m.key));
    expect(keys.size).toBe(VIDEO_MODELS.length);
    for (const m of VIDEO_MODELS) {
      expect(modelMeta(m.key)).toBe(m);
    }
    expect(modelMeta('nope')).toBeUndefined();
    expect(modelLabel('nope')).toBe('nope');
    expect(modelLabel('wan-2.2')).toContain('Wan 2.2');
  });

  it('is pre-sorted closest-to-Seedance first', () => {
    const closeness = VIDEO_MODELS.map((m) => m.closeness);
    expect(closeness).toEqual([...closeness].sort((a, b) => b - a));
    expect(VIDEO_MODELS[0].key).toBe('wan-2.2');
  });
});

describe('autoSelectVideoModel', () => {
  it('auto-picks the best free model closest to Seedance (Wan 2.2) by default', () => {
    const sel = autoSelectVideoModel({ quality: '720p', length: 30 });
    expect(sel.pick.key).toBe('wan-2.2');
    expect(sel.upscaled).toBe(false);
    expect(sel.ranked[0]).toBe(sel.pick);
    expect(sel.reason).toContain('closest to Seedance 2.5');
  });

  it('still picks Wan 2.2 at 1080p and flags the upscale', () => {
    const sel = autoSelectVideoModel({ quality: '1080p', length: 30 });
    expect(sel.pick.key).toBe('wan-2.2');
    expect(sel.upscaled).toBe(true);
    expect(sel.reason).toContain('upscaled on render');
  });

  it('is deterministic for the same input', () => {
    const a = autoSelectVideoModel({ quality: '720p', length: 15 });
    const b = autoSelectVideoModel({ quality: '720p', length: 15 });
    expect(a.pick.key).toBe(b.pick.key);
    expect(a.reason).toBe(b.reason);
  });

  it('prefers the same leader at 720p', () => {
    const sel = autoSelectVideoModel({ quality: '720p' });
    expect(sel.pick.key).toBe('wan-2.2');
  });

  it('4K falls back to the highest free resolution and notes the upscale', () => {
    const sel = autoSelectVideoModel({ quality: '4K', length: 30 });
    expect(sel.pick.key).toBe('wan-2.2');
    expect(sel.reason).toMatch(/highest free resolution|upscaled/i);
  });

  it('always returns a stable ranked list of free models', () => {
    const sel = autoSelectVideoModel();
    expect(sel.ranked.length).toBeGreaterThan(0);
    expect(new Set(sel.ranked.map((m) => m.key)).size).toBe(sel.ranked.length);
  });
});
