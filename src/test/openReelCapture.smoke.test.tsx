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
  stop() { this.state = 'inactive'; this.onstop?.(); }
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
