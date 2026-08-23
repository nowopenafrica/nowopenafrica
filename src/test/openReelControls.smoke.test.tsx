import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import OpenReelCapture from '../components/dashboard/OpenReelCapture';

vi.mock('../../src/lib/supabase', () => ({ supabase: { storage: { from: () => ({}) } } }));

/** Capabilities of a capable phone camera, and a record of what was applied. */
const makeTrack = (caps: Record<string, unknown>) => {
  const applied: Record<string, unknown>[] = [];
  return {
    applied,
    track: {
      kind: 'video',
      getCapabilities: () => caps,
      applyConstraints: async (c: any) => { applied.push(c.advanced[0]); },
      stop: () => {},
    },
  };
};

const FULL_CAPS = {
  zoom: { min: 1, max: 8, step: 0.1 },
  focusDistance: { min: 0.1, max: 10, step: 0.1 },
  exposureCompensation: { min: -3, max: 3, step: 0.5 },
  focusMode: ['manual', 'continuous'],
  exposureMode: ['manual', 'continuous'],
  whiteBalanceMode: ['continuous'],
};

const install = (caps: Record<string, unknown>) => {
  const { applied, track } = makeTrack(caps);
  const stream = {
    getVideoTracks: () => [track],
    getAudioTracks: () => [],
    getTracks: () => [track],
  };
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: vi.fn(async () => stream),
      enumerateDevices: vi.fn(async () => [
        { kind: 'videoinput', deviceId: 'w1', label: 'Back Ultra Wide Camera' },
      ]),
    },
  });
  return applied;
};

const mount = () => render(
  <OpenReelCapture userId="u-1" maxSeconds={60} onCaptured={vi.fn()} onClose={vi.fn()} />,
);

beforeEach(() => {
  vi.clearAllMocks();
  window.HTMLMediaElement.prototype.play = vi.fn(async () => {});
});

describe('OpenReel camera controls', () => {
  it('hands metering to the camera on open, and says so', async () => {
    const applied = install(FULL_CAPS);
    mount();
    await waitFor(() => expect(applied.length).toBeGreaterThan(0));
    // Continuous modes requested for exposure, white balance and focus.
    expect(applied).toEqual(expect.arrayContaining([
      { exposureMode: 'continuous' },
      { whiteBalanceMode: 'continuous' },
      { focusMode: 'continuous' },
    ]));
    expect(await screen.findByLabelText('Turn auto light off')).toBeInTheDocument();
  });

  it('auto light is a switch: turning it off holds exposure steady', async () => {
    const applied = install(FULL_CAPS);
    mount();
    const off = await screen.findByLabelText('Turn auto light off');
    fireEvent.click(off);
    // Manual exposure is what makes a set brightness actually stick.
    await waitFor(() => expect(applied).toEqual(expect.arrayContaining([{ exposureMode: 'manual' }])));
    expect(await screen.findByLabelText('Turn auto light on')).toBeInTheDocument();
  });

  it('offers auto focus and switches it to manual on request', async () => {
    const applied = install(FULL_CAPS);
    mount();
    fireEvent.click(await screen.findByLabelText('Camera settings'));
    const focusToggle = await screen.findByRole('button', { name: 'Auto' });
    fireEvent.click(focusToggle);
    await waitFor(() => expect(applied).toEqual(expect.arrayContaining([{ focusMode: 'manual' }])));
    expect(await screen.findByRole('button', { name: 'Manual' })).toBeInTheDocument();
  });

  it('changing focus distance applies it, and leaves auto focus behind', async () => {
    const applied = install(FULL_CAPS);
    mount();
    fireEvent.click(await screen.findByLabelText('Camera settings'));
    const slider = await screen.findByLabelText('Focus distance');
    fireEvent.change(slider, { target: { value: '4' } });
    await waitFor(() => expect(applied).toEqual(expect.arrayContaining([{ focusDistance: 4 }])));
    // Moving the slider means manual focus, or the value would be overridden.
    expect(applied).toEqual(expect.arrayContaining([{ focusMode: 'manual' }]));
  });

  it('brightness steps up and down through EV compensation', async () => {
    const applied = install(FULL_CAPS);
    mount();
    fireEvent.click(await screen.findByLabelText('Camera settings'));
    fireEvent.click(await screen.findByLabelText('Increase brightness'));
    await waitFor(() => expect(applied).toEqual(expect.arrayContaining([{ exposureCompensation: 0.5 }])));
    fireEvent.click(screen.getByLabelText('Reduce brightness'));
    await waitFor(() => expect(applied).toEqual(expect.arrayContaining([{ exposureCompensation: 0 }])));
  });

  it('never exceeds the camera-reported brightness range', async () => {
    const applied = install(FULL_CAPS);
    mount();
    fireEvent.click(await screen.findByLabelText('Camera settings'));
    const up = await screen.findByLabelText('Increase brightness');
    for (let i = 0; i < 20; i++) fireEvent.click(up);
    await waitFor(() => expect(applied.length).toBeGreaterThan(5));
    const evValues = applied
      .filter((a) => 'exposureCompensation' in a)
      .map((a) => a.exposureCompensation as number);
    expect(Math.max(...evValues)).toBeLessThanOrEqual(3);
  });

  it('offers 0.5x, 1x and 2x', async () => {
    install(FULL_CAPS);
    mount();
    for (const step of ['0.5', '1', '2']) {
      expect(await screen.findByLabelText(`Zoom ${step}x`)).toBeInTheDocument();
    }
  });

  it('reaches 0.5x by switching to the ultra-wide lens when zoom cannot go below 1', async () => {
    install(FULL_CAPS); // zoom.min is 1 — cropping cannot go wider
    mount();
    await screen.findByLabelText('Zoom 0.5x');
    fireEvent.click(screen.getByLabelText('Zoom 0.5x'));
    await waitFor(() => {
      expect(navigator.mediaDevices.enumerateDevices).toHaveBeenCalled();
      // A second getUserMedia call = it opened the other camera.
      expect((navigator.mediaDevices.getUserMedia as any).mock.calls.length).toBeGreaterThan(1);
    });
  });

  it('still offers the settings panel on a basic webcam, and explains the limits', async () => {
    // Hiding the button when a camera reported nothing made Focus and Brightness
    // invisible on exactly the devices where people went looking for them. The
    // panel is always reachable; it just says what this camera cannot do.
    install({ zoom: { min: 1, max: 4, step: 0.1 } });
    mount();
    fireEvent.click(await screen.findByLabelText('Camera settings'));
    expect(await screen.findByText(/Focus isn't adjustable on this camera/)).toBeInTheDocument();
    expect(screen.getByText(/Brightness isn't adjustable on this camera/)).toBeInTheDocument();
    // ...and offers no controls that would do nothing.
    expect(screen.queryByLabelText('Increase brightness')).toBeNull();
    expect(screen.queryByLabelText('Focus distance')).toBeNull();
  });

  it('shows the auto light switch even on a camera that reports no modes', async () => {
    install({ zoom: { min: 1, max: 4, step: 0.1 } });
    mount();
    expect(await screen.findByLabelText(/Turn auto light (on|off)/)).toBeInTheDocument();
  });
});
