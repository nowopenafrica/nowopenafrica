import { describe, expect, it } from 'vitest';

import {
  MOCKUP_SCENES, UNPREVIEWABLE, sceneById, sceneForType,
} from './mockupScenes';
import { isUsableQuad, matrix3dFor } from './surface';

describe('every scene can actually hold artwork', () => {
  it('has a convex surface a transform can be solved for', () => {
    for (const scene of MOCKUP_SCENES) {
      expect(isUsableQuad(scene.surface), scene.id).toBe(true);
      expect(matrix3dFor(1000, 500, scene.surface, scene.width, scene.height), scene.id).not.toBeNull();
    }
  });

  it('keeps the surface inside the scene', () => {
    for (const scene of MOCKUP_SCENES) {
      for (const corner of Object.values(scene.surface)) {
        expect(corner.x, scene.id).toBeGreaterThanOrEqual(0);
        expect(corner.x, scene.id).toBeLessThanOrEqual(1);
        expect(corner.y, scene.id).toBeGreaterThanOrEqual(0);
        expect(corner.y, scene.id).toBeLessThanOrEqual(1);
      }
    }
  });

  /*
   * The scenes are drawn rather than photographed, and a preview that does
   * not say so is a preview a business could mistake for their actual site.
   */
  it('says on every one that it is illustrative', () => {
    for (const scene of MOCKUP_SCENES) {
      expect(scene.caption.length, scene.id).toBeGreaterThan(30);
      expect(/illustrative|confirmed/i.test(scene.caption), scene.id).toBe(true);
    }
  });

  it('draws no remote asset, so nothing is lifted and nothing is fetched', () => {
    for (const scene of MOCKUP_SCENES) {
      const svg = `${scene.background}${scene.foreground ?? ''}`;
      expect(/https?:|<image|xlink:href/i.test(svg), scene.id).toBe(false);
    }
  });
});

describe('a medium with something in front of the artwork', () => {
  /*
   * The point of the bus preview. A wrap is interrupted — a design whose
   * words sit behind a window is a design that will not be read, and that
   * is exactly what a flat rectangle preview hides.
   */
  it('draws the bus windows and wheels over the wrap', () => {
    const bus = sceneById('bus')!;
    expect(bus.foreground).toBeTruthy();
    expect(bus.foreground!).toMatch(/circle/);
  });

  it('draws the feed chrome over the social post', () => {
    expect(sceneById('social')!.foreground).toBeTruthy();
  });
});

describe('matching a scene to real inventory', () => {
  /* These are the `advertisements.type` values actually on production. */
  it('previews the types it can honestly preview', () => {
    expect(sceneForType('Billboard')?.id).toBe('billboard');
    expect(sceneForType('Digital Screen')?.id).toBe('digital-led');
    expect(sceneForType('Transit')?.id).toBe('bus');
    expect(sceneForType('Vehicle Wrap')?.id).toBe('bus');
    expect(sceneForType('Online')?.id).toBe('social');
  });

  /*
   * A radio slot previewed on a billboard is not a preview, it is a mistake
   * with a picture attached.
   */
  it('returns nothing for a medium with no visual surface', () => {
    for (const type of UNPREVIEWABLE) {
      expect(sceneForType(type), type).toBeNull();
    }
    expect(sceneForType('')).toBeNull();
    expect(sceneForType(null)).toBeNull();
  });
});
