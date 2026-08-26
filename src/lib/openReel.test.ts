import { describe, it, expect } from 'vitest';
import {
  pickRecorderMimeType, formatForMimeType, chooseVideoBitrate, zoomCropRect,
  nativeZoomTarget, ZOOM_STEPS, captureResolutionFor, estimatedBytes,
  formatRecordingClock, REEL_HARD_MAX_BYTES, REEL_SIZE_BUDGET_BYTES, AUDIO_BITRATE,
  applyAutoAdapt, cameraControls, readRange, clampToRange, stepValue, midpointOf,
  zoomStepSupported, isUltraWideLabel, applyTrackValue, applyTrackMode,
  wellExposedness, fuseExposures, bracketStops, applyPointOfInterest,
} from './openReel';
import {
  REEL_SECONDS_LIMITS, reelLimitForPlan, formatReelLimit, reelLimitAdjective,
  BUSINESS_TIERS,
} from '../data/pricingPlans';

describe('pickRecorderMimeType', () => {
  it('prefers MP4 when the browser records it (iOS Safari)', () => {
    const safari = (t: string) => t.startsWith('video/mp4');
    const f = pickRecorderMimeType(safari);
    expect(f.mimeType).toMatch(/^video\/mp4/);
    expect(f.ext).toBe('mp4');
    expect(f.contentType).toBe('video/mp4');
  });

  it('falls to VP9 WebM when MP4 is unavailable (older Chrome)', () => {
    const chrome = (t: string) => t.includes('webm');
    const f = pickRecorderMimeType(chrome);
    expect(f.mimeType).toBe('video/webm;codecs=vp9');
    expect(f.ext).toBe('webm');
  });

  it('never returns an unsupported type — the bug that threw on iOS', () => {
    // A browser that supports nothing we asked for must yield undefined so the
    // MediaRecorder constructor picks, rather than being handed 'video/webm'.
    const f = pickRecorderMimeType(() => false);
    expect(f.mimeType).toBeUndefined();
  });

  it('degrades safely when isTypeSupported is missing entirely', () => {
    expect(pickRecorderMimeType(undefined).mimeType).toBeUndefined();
  });

  it('survives an isTypeSupported that throws', () => {
    expect(() => pickRecorderMimeType(() => { throw new Error('nope'); })).not.toThrow();
    expect(pickRecorderMimeType(() => { throw new Error('nope'); }).mimeType).toBeUndefined();
  });
});

describe('formatForMimeType', () => {
  it('reads the container out of a codec-qualified type', () => {
    expect(formatForMimeType('video/mp4;codecs=avc1.42E01E')).toEqual({ ext: 'mp4', contentType: 'video/mp4' });
    expect(formatForMimeType('video/webm;codecs=vp9')).toEqual({ ext: 'webm', contentType: 'video/webm' });
    expect(formatForMimeType('video/quicktime')).toEqual({ ext: 'mov', contentType: 'video/quicktime' });
  });

  it('defaults to webm for an empty or unknown type rather than claiming mp4', () => {
    expect(formatForMimeType('')).toEqual({ ext: 'webm', contentType: 'video/webm' });
    expect(formatForMimeType(undefined)).toEqual({ ext: 'webm', contentType: 'video/webm' });
    expect(formatForMimeType('video/x-matroska;codecs=avc1')).toEqual({ ext: 'webm', contentType: 'video/webm' });
  });
});

describe('chooseVideoBitrate', () => {
  it('scales the ceiling with resolution', () => {
    expect(chooseVideoBitrate(1920, 1080)).toBe(4_500_000);
    expect(chooseVideoBitrate(1280, 720)).toBe(2_500_000);
    expect(chooseVideoBitrate(640, 480)).toBe(1_500_000);
  });

  it('assumes 720p before the dimensions are known', () => {
    expect(chooseVideoBitrate(0, 0)).toBe(2_500_000);
  });

  it('keeps a 10s clip to a few megabytes, not tens', () => {
    const bytes = (chooseVideoBitrate(1920, 1080) / 8) * 10;
    expect(bytes).toBeLessThan(8 * 1024 * 1024);
  });

  it('never lets the longest allowed recording exceed the gallery upload cap', () => {
    // The whole point of the duration argument: OpenReel feeds a gallery that
    // rejects anything over 50 MB, so every plan's maximum must still fit.
    for (const seconds of Object.values(REEL_SECONDS_LIMITS)) {
      const res = captureResolutionFor(seconds);
      const rate = chooseVideoBitrate(res.width, res.height, seconds);
      expect(estimatedBytes(rate, seconds)).toBeLessThan(REEL_HARD_MAX_BYTES);
    }
  });

  it('spends the full quality ceiling on a short clip', () => {
    expect(chooseVideoBitrate(1920, 1080, 60)).toBe(4_500_000);
  });

  it('tightens the bitrate as the duration grows', () => {
    const short = chooseVideoBitrate(1280, 720, 60);
    const long = chooseVideoBitrate(1280, 720, 10 * 60);
    expect(long).toBeLessThan(short);
  });

  it('stays within the budget even at the longest limit, and stays positive', () => {
    const rate = chooseVideoBitrate(640, 360, 20 * 60);
    expect(rate).toBeGreaterThan(0);
    expect(estimatedBytes(rate, 20 * 60)).toBeLessThanOrEqual(REEL_SIZE_BUDGET_BYTES);
  });

  it('reserves the audio track out of the budget', () => {
    // Without reserving it, a long recording would overshoot by the audio size.
    const seconds = 10 * 60;
    const rate = chooseVideoBitrate(854, 480, seconds);
    expect(rate + AUDIO_BITRATE).toBeLessThanOrEqual(
      Math.floor((REEL_SIZE_BUDGET_BYTES * 8) / seconds),
    );
  });
});

describe('captureResolutionFor', () => {
  it('asks for 1080p only when the clip is short enough to afford it', () => {
    expect(captureResolutionFor(60)).toEqual({ width: 1920, height: 1080 });
    expect(captureResolutionFor(5 * 60)).toEqual({ width: 1280, height: 720 });
    expect(captureResolutionFor(10 * 60)).toEqual({ width: 854, height: 480 });
    expect(captureResolutionFor(20 * 60)).toEqual({ width: 640, height: 360 });
  });

  it('never increases resolution as the limit grows', () => {
    const limits = [60, 300, 600, 1200];
    const areas = limits.map((s) => {
      const r = captureResolutionFor(s);
      return r.width * r.height;
    });
    for (let i = 1; i < areas.length; i++) expect(areas[i]).toBeLessThanOrEqual(areas[i - 1]);
  });
});

describe('formatRecordingClock', () => {
  it('reads as a clock at every plan limit', () => {
    expect(formatRecordingClock(0)).toBe('0:00');
    expect(formatRecordingClock(9)).toBe('0:09');
    expect(formatRecordingClock(60)).toBe('1:00');
    expect(formatRecordingClock(5 * 60)).toBe('5:00');
    expect(formatRecordingClock(10 * 60)).toBe('10:00');
    expect(formatRecordingClock(20 * 60)).toBe('20:00');
    expect(formatRecordingClock(671)).toBe('11:11');
  });

  it('never renders a negative clock', () => {
    expect(formatRecordingClock(-5)).toBe('0:00');
  });
});

describe('plan reel limits', () => {
  it('gives each tier the advertised recording length', () => {
    expect(reelLimitForPlan('starter')).toBe(60);
    expect(reelLimitForPlan('growth')).toBe(5 * 60);
    expect(reelLimitForPlan('business-pro')).toBe(10 * 60);
    expect(reelLimitForPlan('enterprise')).toBe(20 * 60);
  });

  it('falls back to the free limit for an unknown or missing plan', () => {
    expect(reelLimitForPlan(null)).toBe(60);
    expect(reelLimitForPlan(undefined)).toBe(60);
    expect(reelLimitForPlan('no-such-plan')).toBe(60);
  });

  it('never shrinks as the plan gets more capable', () => {
    const order = ['starter', 'growth', 'business-pro', 'enterprise'];
    for (let i = 1; i < order.length; i++) {
      expect(reelLimitForPlan(order[i])).toBeGreaterThan(reelLimitForPlan(order[i - 1]));
    }
  });

  it('advertises each limit on its pricing tier, worded from the same table', () => {
    // Guards against the pricing page promising a length the camera does not
    // actually allow — the two must move together.
    for (const [plan, seconds] of Object.entries(REEL_SECONDS_LIMITS)) {
      const tier = BUSINESS_TIERS.find((t) => t.id === plan);
      expect(tier, `no pricing tier for plan "${plan}"`).toBeDefined();
      const adjective = reelLimitAdjective(seconds);
      expect(
        tier!.features.some((f) => f.includes(adjective) && /OpenReel/.test(f)),
        `${plan} should advertise a "${adjective} OpenReel" feature`,
      ).toBe(true);
    }
  });

  it('words limits for people', () => {
    expect(formatReelLimit(60)).toBe('60 seconds');
    expect(formatReelLimit(300)).toBe('5 minutes');
    expect(formatReelLimit(45)).toBe('45 seconds');
    expect(reelLimitAdjective(60)).toBe('60-second');
    expect(reelLimitAdjective(600)).toBe('10-minute');
  });
});

describe('zoomCropRect', () => {
  it('is the whole frame at 1x', () => {
    expect(zoomCropRect(1280, 720, 1)).toEqual({ sx: 0, sy: 0, sw: 1280, sh: 720 });
  });

  it('centre-crops at 1.5x so the subject stays framed', () => {
    const r = zoomCropRect(1280, 720, 1.5);
    expect(r.sw).toBe(853);
    expect(r.sh).toBe(480);
    // Equal margins left/right and top/bottom.
    expect(r.sx).toBe(Math.round((1280 - 853) / 2));
    expect(r.sy).toBe(Math.round((720 - 480) / 2));
    expect(r.sx + r.sw).toBeLessThanOrEqual(1280);
    expect(r.sy + r.sh).toBeLessThanOrEqual(720);
  });

  it('never inverts or exceeds the frame for odd inputs', () => {
    for (const z of [0, -3, NaN, Infinity, 1, 1.5, 4]) {
      const r = zoomCropRect(1080, 1920, z as number);
      expect(r.sw).toBeGreaterThan(0);
      expect(r.sh).toBeGreaterThan(0);
      expect(r.sx).toBeGreaterThanOrEqual(0);
      expect(r.sy).toBeGreaterThanOrEqual(0);
      expect(r.sx + r.sw).toBeLessThanOrEqual(1080);
      expect(r.sy + r.sh).toBeLessThanOrEqual(1920);
    }
  });

  it('handles a not-yet-ready video element (0x0) without NaN', () => {
    const r = zoomCropRect(0, 0, 1.5);
    expect(r).toEqual({ sx: 0, sy: 0, sw: 0, sh: 0 });
  });

  it('covers every offered zoom step', () => {
    for (const z of ZOOM_STEPS) {
      expect(zoomCropRect(1280, 720, z).sw).toBeGreaterThan(0);
    }
  });
});

describe('applyAutoAdapt', () => {
  const track = (caps: Record<string, unknown>, reject: string[] = []) => {
    const applied: unknown[] = [];
    return {
      applied,
      getCapabilities: () => caps,
      applyConstraints: async (c: any) => {
        const key = Object.keys(c.advanced[0])[0];
        if (reject.includes(key)) throw new Error('refused');
        applied.push(c.advanced[0]);
      },
    };
  };

  it('turns on every continuous mode the camera offers', async () => {
    const t = track({
      exposureMode: ['manual', 'continuous'],
      whiteBalanceMode: ['continuous'],
      focusMode: ['single-shot', 'continuous'],
    });
    const report = await applyAutoAdapt(t);
    expect(report.adapted).toBe(true);
    expect(report.applied).toEqual(['exposureMode', 'whiteBalanceMode', 'focusMode']);
    expect(t.applied).toEqual([
      { exposureMode: 'continuous' },
      { whiteBalanceMode: 'continuous' },
      { focusMode: 'continuous' },
    ]);
  });

  it('only asks for what the camera advertises', async () => {
    // A webcam that offers continuous exposure but no focus control.
    const t = track({ exposureMode: ['continuous'] });
    const report = await applyAutoAdapt(t);
    expect(report.applied).toEqual(['exposureMode']);
    expect(t.applied).toHaveLength(1);
  });

  it('keeps going when one mode is advertised but refused', async () => {
    const t = track(
      { exposureMode: ['continuous'], whiteBalanceMode: ['continuous'] },
      ['exposureMode'],
    );
    const report = await applyAutoAdapt(t);
    expect(report.applied).toEqual(['whiteBalanceMode']);
    expect(report.adapted).toBe(true);
  });

  it('reports no adaptation on a camera that exposes none of it (iOS Safari)', async () => {
    const report = await applyAutoAdapt(track({}));
    expect(report).toEqual({ applied: [], adapted: false });
  });

  it('never throws on a track missing the APIs entirely', async () => {
    await expect(applyAutoAdapt(null)).resolves.toEqual({ applied: [], adapted: false });
    await expect(applyAutoAdapt(undefined)).resolves.toEqual({ applied: [], adapted: false });
    await expect(applyAutoAdapt({})).resolves.toEqual({ applied: [], adapted: false });
  });

  it('survives a getCapabilities that throws (Firefox)', async () => {
    const t = {
      getCapabilities: () => { throw new Error('not implemented'); },
      applyConstraints: async () => {},
    };
    await expect(applyAutoAdapt(t)).resolves.toEqual({ applied: [], adapted: false });
  });
});

describe('camera control discovery', () => {
  const caps = {
    zoom: { min: 1, max: 8, step: 0.1 },
    focusDistance: { min: 0.1, max: 10 },
    exposureCompensation: { min: -3, max: 3, step: 0.33 },
    focusMode: ['none', 'manual', 'continuous'],
    exposureMode: ['manual', 'continuous'],
    whiteBalanceMode: ['continuous'],
  };

  it('reads the ranges and modes a camera offers', () => {
    const c = cameraControls({ getCapabilities: () => caps, applyConstraints: async () => {} });
    expect(c.zoom).toEqual({ min: 1, max: 8, step: 0.1 });
    expect(c.exposureCompensation).toEqual({ min: -3, max: 3, step: 0.33 });
    expect(c.focusModes).toContain('manual');
    expect(c.brightness).toBeNull();
  });

  it('invents a usable step when the camera omits one', () => {
    // focusDistance above has no step; without a default the slider is unusable.
    const c = cameraControls({ getCapabilities: () => caps, applyConstraints: async () => {} });
    expect(c.focusDistance?.step).toBeCloseTo((10 - 0.1) / 100);
  });

  it('reports nothing controllable on a camera that exposes nothing', () => {
    const c = cameraControls({ getCapabilities: () => ({}), applyConstraints: async () => {} });
    expect(c.zoom).toBeNull();
    expect(c.focusModes).toEqual([]);
  });

  it('survives a missing or throwing getCapabilities', () => {
    expect(cameraControls(null).zoom).toBeNull();
    expect(cameraControls({ getCapabilities: () => { throw new Error('x'); } }).zoom).toBeNull();
  });

  it('ignores a degenerate range', () => {
    expect(readRange({ zoom: { min: 1, max: 1 } }, 'zoom')).toBeNull();
    expect(readRange({}, 'zoom')).toBeNull();
    expect(readRange(null, 'zoom')).toBeNull();
  });
});

describe('clampToRange / stepValue / midpointOf', () => {
  const range = { min: -3, max: 3, step: 0.5 };

  it('keeps values inside the range', () => {
    expect(clampToRange(99, range)).toBe(3);
    expect(clampToRange(-99, range)).toBe(-3);
    expect(clampToRange(NaN, range)).toBe(-3);
  });

  it('steps up and down without escaping the range', () => {
    expect(stepValue(0, range, 1)).toBe(0.5);
    expect(stepValue(0, range, -1)).toBe(-0.5);
    expect(stepValue(3, range, 1)).toBe(3);
    expect(stepValue(-3, range, -1)).toBe(-3);
  });

  it('treats 0 as neutral brightness when the range spans it', () => {
    expect(midpointOf(range)).toBe(0);
  });

  it('falls back to the middle for a range that never reaches 0', () => {
    expect(midpointOf({ min: 10, max: 20, step: 1 })).toBe(15);
  });
});

describe('zoomStepSupported', () => {
  it('always allows 1x and above — those can be cropped', () => {
    for (const step of [1, 1.5, 2, 4]) {
      expect(zoomStepSupported(null, step), String(step)).toBe(true);
    }
  });

  it('allows 0.5x only when the lens actually goes that wide', () => {
    // You cannot crop outward, so 0.5x needs hardware.
    expect(zoomStepSupported({ min: 0.5, max: 8, step: 0.1 }, 0.5)).toBe(true);
    expect(zoomStepSupported({ min: 1, max: 8, step: 0.1 }, 0.5)).toBe(false);
    expect(zoomStepSupported(null, 0.5)).toBe(false);
  });

  it('understands a 100-based zoom range', () => {
    expect(zoomStepSupported({ min: 50, max: 400, step: 1 }, 0.5)).toBe(true);
    expect(zoomStepSupported({ min: 100, max: 400, step: 1 }, 0.5)).toBe(false);
  });
});

describe('isUltraWideLabel', () => {
  it('spots an ultra-wide camera, which is how 0.5x is reached', () => {
    for (const label of ['Back Ultra Wide Camera', 'camera2 2, facing back (ultrawide)', 'Wide Angle 0.5x']) {
      expect(isUltraWideLabel(label), label).toBe(true);
    }
  });

  it('does not mistake a telephoto or depth sensor for one', () => {
    for (const label of ['Back Telephoto Camera', 'Depth Camera', 'Macro lens', '']) {
      expect(isUltraWideLabel(label), label).toBe(false);
    }
  });
});

describe('applyTrackValue / applyTrackMode', () => {
  const track = (reject = false) => {
    const applied: unknown[] = [];
    return {
      applied,
      getCapabilities: () => ({}),
      applyConstraints: async (c: any) => { if (reject) throw new Error('no'); applied.push(c.advanced[0]); },
    };
  };

  it('applies a numeric control', async () => {
    const t = track();
    expect(await applyTrackValue(t, 'exposureCompensation', 1.5)).toBe(true);
    expect(t.applied).toEqual([{ exposureCompensation: 1.5 }]);
  });

  it('reports failure instead of throwing when the camera refuses', async () => {
    expect(await applyTrackValue(track(true), 'zoom', 2)).toBe(false);
    expect(await applyTrackValue(null, 'zoom', 2)).toBe(false);
  });

  it('refuses a mode the camera never advertised', async () => {
    const t = track();
    expect(await applyTrackMode(t, 'focusMode', 'manual', ['continuous'])).toBe(false);
    expect(t.applied).toEqual([]);
  });

  it('applies an advertised mode', async () => {
    const t = track();
    expect(await applyTrackMode(t, 'focusMode', 'manual', ['manual', 'continuous'])).toBe(true);
    expect(t.applied).toEqual([{ focusMode: 'manual' }]);
  });
});

describe('nativeZoomTarget', () => {
  it('maps the multiplier onto a 1-based range', () => {
    const track = { getCapabilities: () => ({ zoom: { min: 1, max: 8 } }) };
    expect(nativeZoomTarget(track, 1)).toBe(1);
    expect(nativeZoomTarget(track, 1.5)).toBe(1.5);
  });

  it('maps onto a 100-based range, as some Android cameras report', () => {
    const track = { getCapabilities: () => ({ zoom: { min: 100, max: 400 } }) };
    expect(nativeZoomTarget(track, 1.5)).toBe(150);
  });

  it('clamps to the advertised maximum', () => {
    const track = { getCapabilities: () => ({ zoom: { min: 1, max: 1.2 } }) };
    expect(nativeZoomTarget(track, 1.5)).toBe(1.2);
  });

  it('returns null when the camera exposes no zoom, so callers crop instead', () => {
    expect(nativeZoomTarget({ getCapabilities: () => ({}) }, 1.5)).toBeNull();
    expect(nativeZoomTarget({}, 1.5)).toBeNull();
    expect(nativeZoomTarget(null, 1.5)).toBeNull();
    // Firefox: method exists but is not implemented.
    expect(nativeZoomTarget({ getCapabilities: () => { throw new Error('ni'); } }, 1.5)).toBeNull();
    // A degenerate range carries no usable zoom.
    expect(nativeZoomTarget({ getCapabilities: () => ({ zoom: { min: 1, max: 1 } }) }, 1.5)).toBeNull();
  });
});

describe('exposure fusion', () => {
  // Structural frames, not ImageData: the fusion is arithmetic and this test
  // runs outside a browser.
  const px = (r: number, g: number, b: number, count = 1) => {
    const data = new Uint8ClampedArray(count * 4);
    for (let i = 0; i < count * 4; i += 4) {
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
    }
    return { width: count, height: 1, data };
  };

  it('trusts a mid-grey sample and discounts a blown or crushed one', () => {
    // The whole point: a pixel at the extremes carries no detail worth keeping.
    expect(wellExposedness(0.5)).toBeCloseTo(1, 5);
    expect(wellExposedness(1)).toBeLessThan(0.05);
    expect(wellExposedness(0)).toBeLessThan(0.05);
    expect(wellExposedness(0.5)).toBeGreaterThan(wellExposedness(0.8));
  });

  it('survives a NaN sample rather than poisoning the whole average', () => {
    expect(wellExposedness(Number.NaN)).toBe(0);
  });

  it('keeps detail from whichever frame exposed the pixel best', () => {
    // Blown highlight in one frame, well exposed in the other: the good one
    // should dominate, which is the entire reason for bracketing.
    const blown = px(255, 255, 255);
    const good = px(128, 128, 128);
    const fused = fuseExposures([blown, good])!;
    expect(fused.data[0]).toBeGreaterThan(120);
    expect(fused.data[0]).toBeLessThan(150);
  });

  it('falls back to the middle frame when every frame is hopeless', () => {
    // All black: weights are ~0, and a naive average would divide by zero and
    // punch a transparent hole in the picture.
    const fused = fuseExposures([px(0, 0, 0), px(0, 0, 0), px(0, 0, 0)])!;
    expect(fused.data[0]).toBe(0);
    expect(fused.data[3]).toBe(255);
  });

  it('refuses frames that are not the same size', () => {
    // These come from consecutive camera reads; a size change means the track
    // reconfigured mid-bracket and the frames cannot be combined.
    expect(fuseExposures([px(10, 10, 10, 2), px(10, 10, 10, 3)])).toBeNull();
  });

  it('passes a single frame straight through, and nothing at all as null', () => {
    const one = px(90, 90, 90);
    expect(fuseExposures([one])).toBe(one);
    expect(fuseExposures([])).toBeNull();
  });

  it('never mutates the frames it was given', () => {
    const a = px(255, 255, 255);
    const b = px(0, 0, 0);
    fuseExposures([a, b]);
    expect(a.data[0]).toBe(255);
    expect(b.data[0]).toBe(0);
  });
});

describe('bracketStops', () => {
  it('centres the bracket on the metered exposure', () => {
    // The middle frame must be the one the camera would have taken anyway, so
    // that abandoning fusion still leaves a correct photograph.
    const stops = bracketStops({ min: -3, max: 3, step: 0.1 });
    expect(stops).toHaveLength(3);
    expect(stops[1]).toBe(0);
    expect(stops[0]).toBe(-stops[2]);
  });

  it('stays inside what the camera actually allows', () => {
    const stops = bracketStops({ min: -1, max: 1, step: 0.1 });
    expect(Math.min(...stops)).toBeGreaterThanOrEqual(-1);
    expect(Math.max(...stops)).toBeLessThanOrEqual(1);
  });

  it('does not bracket at all when there is no compensation to give', () => {
    // A camera that cannot change exposure gets one frame, not three identical
    // ones — three reads of the same exposure is latency for nothing.
    expect(bracketStops({ min: 0, max: 0, step: 0 })).toEqual([0]);
    expect(bracketStops(null)).toEqual([0]);
  });
});

describe('cameraControls — the wider settings', () => {
  type FakeTrack = Parameters<typeof cameraControls>[0];
  const track = (caps: Record<string, unknown>): FakeTrack => ({
    getCapabilities: () => caps,
    applyConstraints: async () => {},
  } as unknown as FakeTrack);

  it('reads white balance, ISO and shutter when the camera offers them', () => {
    const c = cameraControls(track({
      colorTemperature: { min: 2500, max: 7500, step: 50 },
      iso: { min: 50, max: 3200, step: 1 },
      exposureTime: { min: 1, max: 10000, step: 1 },
    }));
    expect(c.colorTemperature?.max).toBe(7500);
    expect(c.iso?.min).toBe(50);
    expect(c.exposureTime?.max).toBe(10000);
  });

  it('only reports a torch the camera can actually switch on', () => {
    // Cameras without a light still advertise the key, as [false]. Treating
    // presence as support puts a dead button on the screen.
    expect(cameraControls(track({ torch: [false] })).torch).toBe(false);
    expect(cameraControls(track({ torch: [false, true] })).torch).toBe(true);
    expect(cameraControls(track({})).torch).toBe(false);
  });

  it('reports whether the camera can be told where to focus', () => {
    expect(cameraControls(track({ pointsOfInterest: {} })).pointsOfInterest).toBe(true);
    expect(cameraControls(track({})).pointsOfInterest).toBe(false);
  });
});

describe('applyPointOfInterest', () => {
  type Applied = { advanced: Record<string, unknown>[] };
  type FocusTrack = Parameters<typeof applyPointOfInterest>[0];
  const spyTrack = () => {
    const calls: Applied[] = [];
    return {
      calls,
      track: {
        applyConstraints: async (c: Applied) => { calls.push(c); },
      } as unknown as FocusTrack,
    };
  };

  it('sends normalised coordinates and pins the focus so it stops hunting', () => {
    // Continuous autofocus wanders straight back off a tapped point, so the
    // mode has to change with it.
    const { calls, track } = spyTrack();
    return applyPointOfInterest(track, 0.25, 0.75, ['single-shot', 'continuous']).then((ok) => {
      expect(ok).toBe(true);
      expect(calls[0].advanced[0].pointsOfInterest).toEqual([{ x: 0.25, y: 0.75 }]);
      expect(calls[0].advanced[1].focusMode).toBe('single-shot');
    });
  });

  it('clamps a tap that lands outside the frame', async () => {
    const { calls, track } = spyTrack();
    await applyPointOfInterest(track, -0.4, 1.9, []);
    expect(calls[0].advanced[0].pointsOfInterest).toEqual([{ x: 0, y: 1 }]);
  });

  it('reports false rather than throwing when the camera refuses', async () => {
    const track = {
      applyConstraints: async () => { throw new Error('nope'); },
    } as unknown as Parameters<typeof applyPointOfInterest>[0];
    expect(await applyPointOfInterest(track, 0.5, 0.5, [])).toBe(false);
    expect(await applyPointOfInterest(null, 0.5, 0.5, [])).toBe(false);
  });
});
