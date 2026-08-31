import { describe, it, expect } from 'vitest';
import {
  cameraSources, sourceKind, cleanLabel, hasMultipleSources, quickSources,
  activeSource, nextSource, constraintsForDevice, deviceIdOfTrack,
  MAX_QUICK_SOURCES, type DeviceLike,
} from '../lib/cameraSources';

const cam = (deviceId: string, label?: string): DeviceLike => ({ deviceId, kind: 'videoinput', label });

describe('sourceKind', () => {
  it('reads front and back from a phone label', () => {
    expect(sourceKind('front camera')).toBe('front');
    expect(sourceKind('camera2 0, facing back')).toBe('back');
  });

  it('calls a USB webcam external even when its name says front', () => {
    // "USB Camera (front)" is an add-on, not the selfie camera, and mislabelling
    // it would mirror the preview of a camera pointed at the room.
    expect(sourceKind('USB Camera (front)')).toBe('external');
    expect(sourceKind('Logitech StreamCam')).toBe('external');
    expect(sourceKind('Elgato Cam Link 4K')).toBe('external');
  });

  it('admits it does not know rather than guessing', () => {
    expect(sourceKind('')).toBe('unknown');
    expect(sourceKind(undefined)).toBe('unknown');
    expect(sourceKind('Integrated Camera')).toBe('unknown');
  });
});

describe('cleanLabel', () => {
  it('drops the hardware id browsers append', () => {
    expect(cleanLabel('HD Pro Webcam C920 (046d:082d)')).toBe('HD Pro Webcam C920');
  });

  it('leaves an ordinary name alone', () => {
    expect(cleanLabel('FaceTime HD Camera')).toBe('FaceTime HD Camera');
    expect(cleanLabel(undefined)).toBe('');
  });
});

describe('cameraSources', () => {
  it('numbers the cameras from one', () => {
    const s = cameraSources([cam('a', 'FaceTime HD Camera'), cam('b', 'Logitech C920')]);
    expect(s.map((x) => x.index)).toEqual([1, 2]);
    expect(s[0].label).toBe('Camera 1 · FaceTime HD Camera');
    expect(s[1].label).toBe('Camera 2 · Logitech C920');
  });

  it('ignores microphones and speakers', () => {
    const s = cameraSources([
      { deviceId: 'm', kind: 'audioinput', label: 'Mic' },
      cam('c', 'Webcam'),
      { deviceId: 's', kind: 'audiooutput', label: 'Speakers' },
    ]);
    expect(s).toHaveLength(1);
  });

  it('still offers a camera the browser will not name yet', () => {
    // Before permission is granted labels are empty, but the device is real
    // and selectable — dropping it would show an empty switcher.
    const s = cameraSources([cam('a'), cam('b')]);
    expect(s.map((x) => x.label)).toEqual(['Camera 1', 'Camera 2']);
  });

  it('names by facing when there is no product name', () => {
    expect(cameraSources([cam('a', 'camera 0, facing back')])[0].label)
      .toBe('Camera 1 · camera 0, facing back');
  });

  it('drops duplicates and the blank default id', () => {
    // Firefox reports '' for the default device; some browsers list one camera
    // twice across groups. Either would put the same camera on two buttons.
    const s = cameraSources([cam('', 'Default'), cam('a', 'Cam'), cam('a', 'Cam')]);
    expect(s).toHaveLength(1);
    expect(s[0].deviceId).toBe('a');
  });

  it('keeps the browser order, so the live camera does not move', () => {
    const s = cameraSources([cam('z', 'Zebra Cam'), cam('a', 'Alpha Cam')]);
    expect(s.map((x) => x.deviceId)).toEqual(['z', 'a']);
  });

  it('copes with nothing at all', () => {
    expect(cameraSources(null)).toEqual([]);
    expect(cameraSources(undefined)).toEqual([]);
    expect(cameraSources([])).toEqual([]);
  });
});

describe('choosing between them', () => {
  const four = cameraSources([cam('a', 'A'), cam('b', 'B'), cam('c', 'C'), cam('d', 'D')]);

  it('does not offer a chooser for a single camera', () => {
    expect(hasMultipleSources(cameraSources([cam('a')]))).toBe(false);
    expect(hasMultipleSources(four)).toBe(true);
  });

  it('caps the numbered buttons at four', () => {
    const many = cameraSources(['a', 'b', 'c', 'd', 'e', 'f'].map((id) => cam(id, id.toUpperCase())));
    expect(many).toHaveLength(6);
    expect(quickSources(many)).toHaveLength(MAX_QUICK_SOURCES);
  });

  it('finds which one is live', () => {
    expect(activeSource(four, 'c')?.index).toBe(3);
    expect(activeSource(four, 'nope')).toBeNull();
    expect(activeSource(four, null)).toBeNull();
  });

  it('cycles, and wraps at the end', () => {
    // The control is pressed repeatedly while pointing at something, not
    // navigated — so the last camera goes back to the first.
    expect(nextSource(four, 'a')?.deviceId).toBe('b');
    expect(nextSource(four, 'd')?.deviceId).toBe('a');
  });

  it('starts at the first when the current camera is unknown', () => {
    expect(nextSource(four, null)?.deviceId).toBe('a');
    expect(nextSource([], 'a')).toBeNull();
  });
});

describe('constraintsForDevice', () => {
  it('pins the device exactly', () => {
    // An `ideal` deviceId lets the browser quietly return a different camera,
    // so a switch would sometimes silently do nothing.
    const c = constraintsForDevice('abc') as { deviceId: { exact: string } };
    expect(c.deviceId).toEqual({ exact: 'abc' });
  });

  it('carries the resolution and frame rate', () => {
    const c = constraintsForDevice('x', 1920, 1080, 60) as Record<string, unknown>;
    expect(c.width).toEqual({ ideal: 1920 });
    expect(c.frameRate).toEqual({ ideal: 60, max: 60 });
  });
});

describe('deviceIdOfTrack', () => {
  it('reads the id off a live track', () => {
    expect(deviceIdOfTrack({ getSettings: () => ({ deviceId: 'live-1' }) })).toBe('live-1');
  });

  it('returns null rather than throwing on a track that will not say', () => {
    expect(deviceIdOfTrack(null)).toBeNull();
    expect(deviceIdOfTrack({})).toBeNull();
    expect(deviceIdOfTrack({ getSettings: () => { throw new Error('no'); } })).toBeNull();
  });
});
