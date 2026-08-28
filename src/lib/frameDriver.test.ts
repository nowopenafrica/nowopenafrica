import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { driveVideoFrames, type FrameSourceVideo } from './openReel';

/** A video that delivers frames only when told to, like a real camera. */
function fakeVideo() {
  let pending: (() => void) | null = null;
  let nextHandle = 1;
  const cancelled: number[] = [];
  const video: FrameSourceVideo = {
    requestVideoFrameCallback: (cb) => { pending = cb; return nextHandle++; },
    cancelVideoFrameCallback: (h) => { cancelled.push(h); },
  };
  return { video, deliverFrame: () => { const cb = pending; pending = null; cb?.(); }, cancelled };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('driveVideoFrames', () => {
  it('draws once per camera frame, not once per display refresh', () => {
    // The bug this replaces: a rAF loop on a 120 Hz phone redrew a 30 fps
    // camera four times per frame, competing with the encoder for the same CPU.
    const { video, deliverFrame } = fakeVideo();
    const draw = vi.fn();
    driveVideoFrames(video, draw);

    deliverFrame();
    deliverFrame();
    deliverFrame();
    expect(draw).toHaveBeenCalledTimes(3);
  });

  it('does not draw at all until a frame actually arrives', () => {
    const { video } = fakeVideo();
    const draw = vi.fn();
    driveVideoFrames(video, draw);
    expect(draw).not.toHaveBeenCalled();
  });

  it('keeps drawing when frames stop, so a backgrounded recording is not frozen', () => {
    // requestVideoFrameCallback stops when the app is backgrounded. The
    // backstop is what keeps the recording moving, at a low rate.
    const { video } = fakeVideo();
    const draw = vi.fn();
    driveVideoFrames(video, draw);

    vi.advanceTimersByTime(1000);
    expect(draw.mock.calls.length).toBeGreaterThan(0);
  });

  it('stays quiet while frames are arriving normally', () => {
    const { video, deliverFrame } = fakeVideo();
    const draw = vi.fn();
    driveVideoFrames(video, draw);

    // A frame every 100ms: well inside the 250ms backstop, so the interval
    // should add nothing on top.
    for (let i = 0; i < 10; i++) { vi.advanceTimersByTime(100); deliverFrame(); }
    expect(draw).toHaveBeenCalledTimes(10);
  });

  it('falls back to a timer on a browser without frame callbacks', () => {
    const draw = vi.fn();
    driveVideoFrames({}, draw, 30);
    vi.advanceTimersByTime(1000);
    // ~30 a second, give or take how the interval lands.
    expect(draw.mock.calls.length).toBeGreaterThan(20);
  });

  it('stops cleanly, and cancels the frame callback it was holding', () => {
    const { video, deliverFrame, cancelled } = fakeVideo();
    const draw = vi.fn();
    const stop = driveVideoFrames(video, draw);

    deliverFrame();
    stop();
    const after = draw.mock.calls.length;

    vi.advanceTimersByTime(5000);
    expect(draw).toHaveBeenCalledTimes(after);
    expect(cancelled.length).toBe(1);
  });
});
