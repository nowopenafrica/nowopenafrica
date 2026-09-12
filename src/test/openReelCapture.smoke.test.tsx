import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

vi.mock('../lib/supabase', () => ({
  supabase: {
    storage: {
      from: () => ({
        upload: vi.fn(async () => ({ error: null })),
        getPublicUrl: () => ({ data: { publicUrl: 'https://example.test/reel.mp4' } }),
      }),
    },
  },
}));

import OpenReelCapture from '../components/dashboard/OpenReelCapture';

// jsdom has neither getUserMedia nor MediaRecorder, so the camera hardware is
// stubbed to the minimum surface the component touches. This is what makes the
// tiered limit and the pause/resume wiring testable without a device.
class FakeRecorder {
  state: 'inactive' | 'recording' | 'paused' = 'inactive';
  mimeType = 'video/mp4';
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  static isTypeSupported = (t: string) => t.startsWith('video/mp4');
  constructor(public stream: unknown, public options?: unknown) { FakeRecorder.last = this; }
  static last: FakeRecorder | null = null;
  start() { this.state = 'recording'; }
  stop() {
    this.state = 'inactive';
    // Hand the recorder a real chunk so the review stage is reachable — with
    // nothing recorded, the component refuses to leave the camera.
    this.ondataavailable?.({ data: new Blob(['recording'], { type: 'video/mp4' }) });
    this.onstop?.();
  }
  pause() { this.state = 'paused'; }
  resume() { this.state = 'recording'; }
}

const fakeTrack = () => ({
  stop: vi.fn(),
  getCapabilities: () => ({}), // no hardware zoom — exercises the crop fallback
  applyConstraints: vi.fn(async () => {}),
});

beforeEach(() => {
  FakeRecorder.last = null;
  vi.stubGlobal('MediaRecorder', FakeRecorder as unknown as typeof MediaRecorder);
  const video = fakeTrack();
  const audio = fakeTrack();
  vi.stubGlobal('navigator', {
    ...navigator,
    mediaDevices: {
      getUserMedia: vi.fn(async () => ({
        getTracks: () => [video, audio],
        getVideoTracks: () => [video],
        getAudioTracks: () => [audio],
      })),
    },
  });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(async () => {});
  // Report a ready frame so capture paths don't bail on a 0x0 video.
  Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', { configurable: true, value: 1280 });
  Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', { configurable: true, value: 720 });
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const openReelMode = async () => {
  render(<OpenReelCapture userId="u-1" maxSeconds={5 * 60} onCaptured={vi.fn()} onClose={vi.fn()} />);
  // Wait for the camera to come up (otherwise the error state renders instead).
  await waitFor(() => expect(screen.getByRole('button', { name: /Reel/ })).toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: /Reel/ }));
  await act(async () => { vi.advanceTimersByTime(200); });
};

describe('OpenReelCapture — plan-tiered recording length', () => {
  it('advertises the plan limit on the mode tab and the hint', async () => {
    await openReelMode();
    expect(screen.getByRole('button', { name: /Reel \(5:00\)/ })).toBeInTheDocument();
    expect(screen.getByText(/your plan allows 5 minutes/)).toBeInTheDocument();
  });

  it('defaults to the free minute when no plan is supplied', async () => {
    render(<OpenReelCapture userId="u-1" onCaptured={vi.fn()} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole('button', { name: /Reel \(1:00\)/ })).toBeInTheDocument());
  });

  it('counts the clock against the plan limit, not a fixed 10 seconds', async () => {
    await openReelMode();
    fireEvent.click(screen.getByRole('button', { name: 'Start recording' }));
    await act(async () => { vi.advanceTimersByTime(3000); });
    expect(screen.getByText('0:03 / 5:00')).toBeInTheDocument();
  });
});

describe('OpenReelCapture — pause and resume', () => {
  it('pauses the recorder and says so, then resumes', async () => {
    await openReelMode();
    fireEvent.click(screen.getByRole('button', { name: 'Start recording' }));
    await act(async () => { vi.advanceTimersByTime(2000); });
    expect(FakeRecorder.last!.state).toBe('recording');

    fireEvent.click(screen.getByRole('button', { name: 'Pause recording' }));
    expect(FakeRecorder.last!.state).toBe('paused');
    expect(screen.getByText('PAUSED')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Resume recording' }));
    expect(FakeRecorder.last!.state).toBe('recording');
    expect(screen.getByText('REC')).toBeInTheDocument();
  });

  it('holds the clock while paused instead of burning the allowance', async () => {
    await openReelMode();
    fireEvent.click(screen.getByRole('button', { name: 'Start recording' }));
    await act(async () => { vi.advanceTimersByTime(2000); });
    expect(screen.getByText('0:02 / 5:00')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Pause recording' }));
    await act(async () => { vi.advanceTimersByTime(10_000); });
    // Ten seconds of wall clock passed; none of it counted.
    expect(screen.getByText('0:02 / 5:00')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Resume recording' }));
    await act(async () => { vi.advanceTimersByTime(1000); });
    expect(screen.getByText('0:03 / 5:00')).toBeInTheDocument();
  });

  it('stops automatically once the plan limit is reached', async () => {
    render(<OpenReelCapture userId="u-1" maxSeconds={5} onCaptured={vi.fn()} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole('button', { name: /Reel/ })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Reel/ }));
    await act(async () => { vi.advanceTimersByTime(200); });
    fireEvent.click(screen.getByRole('button', { name: 'Start recording' }));
    await act(async () => { vi.advanceTimersByTime(6000); });
    expect(FakeRecorder.last!.state).toBe('inactive');
  });
});

/**
 * Temporarily make jsdom's canvas claim we can capture a stream, which decides
 * whether the trim panel is offered at all. Cleans up afterwards so tests run
 * in isolation regardless of order.
 */
const withCaptureStreamSupport = async (fn: () => Promise<void>) => {
  const proto = HTMLCanvasElement.prototype as unknown as Record<string, unknown>;
  const prior = Object.getOwnPropertyDescriptor(proto, 'captureStream');
  Object.defineProperty(proto, 'captureStream', {
    configurable: true,
    value: () => ({ getTracks: () => [], getVideoTracks: () => [], getAudioTracks: () => [] }),
  });
  try {
    await fn();
  } finally {
    if (prior) Object.defineProperty(proto, 'captureStream', prior);
    else delete proto.captureStream;
  }
};

describe('OpenReelCapture — quick clip trim', () => {
  /** Record and stop so the video lands on the review stage. */
  const reachReview = async () => {
    await openReelMode();
    fireEvent.click(screen.getByRole('button', { name: 'Start recording' }));
    fireEvent.click(screen.getByRole('button', { name: 'Stop recording' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Use This' })).toBeInTheDocument());
  };

  it('offers the trim panel on a video, and adjusts the cut', async () => {
    await withCaptureStreamSupport(async () => {
      await reachReview();
      // A decoded length, as a working browser would report on loadedmetadata.
      Object.defineProperty(HTMLVideoElement.prototype, 'duration', { configurable: true, value: 65 });
      const video = document.querySelector('video')!;
      fireEvent(video, new Event('loadedmetadata'));

      fireEvent.click(await screen.findByLabelText('Show trim controls'));
      const start = await screen.findByLabelText('Trim start');
      fireEvent.change(start, { target: { value: '2' } });

      // The cut stuck: start handle reads 2s, the keep label is derived from it.
      expect((screen.getByLabelText('Trim start') as HTMLInputElement).value).toBe('2');
      expect(screen.getByText('1:03.0')).toBeInTheDocument();

      // Cutting something flips the toggle to the "edited" state; reset goes back.
      fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
      expect((screen.getByLabelText('Trim start') as HTMLInputElement).value).toBe('0');
      expect(screen.queryByRole('button', { name: 'Reset' })).toBeNull();
    });
  });

  it('hides the trim panel where re-recording is impossible', async () => {
    // jsdom's canvas reports no captureStream, same as a browser that cannot.
    await reachReview();
    expect(screen.getByText(/Quick trim isn't supported in this browser/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Show trim controls')).toBeNull();
  });
});
