import { describe, it, expect } from 'vitest';

import {
  oppositeFacing, facingLabel, videoConstraintsFor, canFlipCamera,
  shouldMirrorPreview, previewTransform,
} from './openReel';

describe('oppositeFacing', () => {
  it('flips both ways', () => {
    expect(oppositeFacing('user')).toBe('environment');
    expect(oppositeFacing('environment')).toBe('user');
  });

  it('names the camera the way a person would', () => {
    expect(facingLabel('user')).toBe('Front camera');
    expect(facingLabel('environment')).toBe('Back camera');
  });
});

describe('videoConstraintsFor', () => {
  it('asks for a facing without demanding it', () => {
    // { exact: … } makes getUserMedia REJECT on a single-camera device. A
    // laptop webcam should still open.
    const c = videoConstraintsFor('environment', 1920, 1080);
    expect(c.facingMode).toBe('environment');
    expect(JSON.stringify(c)).not.toContain('exact');
  });

  it('carries the resolution as a preference, not a floor', () => {
    const c = videoConstraintsFor('user', 1280, 720);
    expect(c.width).toEqual({ ideal: 1280 });
    expect(c.height).toEqual({ ideal: 720 });
  });

  it('caps the frame rate only when one is asked for', () => {
    expect(videoConstraintsFor('user', 1280, 720).frameRate).toBeUndefined();
    expect(videoConstraintsFor('user', 1280, 720, 30).frameRate).toEqual({ ideal: 30, max: 30 });
  });
});

describe('canFlipCamera', () => {
  const cam = { kind: 'videoinput' };
  const mic = { kind: 'audioinput' };

  it('offers the flip only when there is somewhere to flip to', () => {
    expect(canFlipCamera([cam, cam, mic])).toBe(true);
    expect(canFlipCamera([cam, mic])).toBe(false);
    expect(canFlipCamera([mic])).toBe(false);
  });

  it('says no rather than throwing when the device list never arrived', () => {
    // enumerateDevices is absent in some embedded webviews, and a button that
    // does nothing is worse than an absent one.
    expect(canFlipCamera(null)).toBe(false);
    expect(canFlipCamera(undefined)).toBe(false);
  });
});

describe('shouldMirrorPreview', () => {
  it('mirrors the selfie view and nothing else', () => {
    expect(shouldMirrorPreview('user')).toBe(true);
    expect(shouldMirrorPreview('environment')).toBe(false);
  });
});

describe('previewTransform', () => {
  it('leaves the back camera at 1x alone', () => {
    expect(previewTransform('environment', 1)).toBeUndefined();
  });

  it('mirrors the front camera', () => {
    expect(previewTransform('user', 1)).toBe('scale(-1, 1)');
  });

  it('combines mirroring with software zoom instead of losing one of them', () => {
    // Two separate transform assignments in one style object silently keep only
    // the last, which is how a mirrored preview stops zooming.
    expect(previewTransform('user', 2)).toBe('scale(-2, 2)');
    expect(previewTransform('environment', 2)).toBe('scale(2, 2)');
  });

  it('treats a nonsense zoom as 1x', () => {
    expect(previewTransform('environment', 0)).toBeUndefined();
    expect(previewTransform('environment', NaN)).toBeUndefined();
  });
});
