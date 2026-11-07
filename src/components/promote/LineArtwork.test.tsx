import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import type { PlanLine } from '../../lib/promote/campaignPlan';

const h = vi.hoisted(() => ({
  upload: vi.fn(),
  setArt: vi.fn(),
  signed: vi.fn(),
  designs: vi.fn(),
  /** What the next Image load measures. */
  size: { w: 1000, h: 1000, fail: false },
  studioProps: [] as unknown[],
}));

vi.mock('../../lib/promote/campaigns', () => ({
  uploadLineArtwork: h.upload,
  setLineArtwork: h.setArt,
  artworkUrlFor: h.signed,
  fetchOwnDesigns: h.designs,
}));
vi.mock('./AdPreviewStudio', () => ({
  default: (p: unknown) => { h.studioProps.push(p); return <div data-testid="studio" />; },
}));

import LineArtwork from './LineArtwork';

class FakeImage {
  naturalWidth = 0;
  naturalHeight = 0;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  set src(_v: string) {
    queueMicrotask(() => {
      if (h.size.fail) { this.onerror?.(); return; }
      this.naturalWidth = h.size.w;
      this.naturalHeight = h.size.h;
      this.onload?.();
    });
  }
}

const line = (over: Partial<PlanLine> = {}): PlanLine => ({
  id: 'l1', advertId: 'a1', title: 'Allen Avenue gantry', type: 'Billboard', location: 'Lagos',
  dimensions: '12m x 6m', days: 30, ratePerDay: 10, priceBasis: 'indicative', currency: 'USD',
  artworkUrl: null, kind: 'placement', productId: null, priceMinor: null, artworkDesignId: null,
  artworkWidth: null, artworkHeight: null, offered: true, ...over,
});

const view = (l: PlanLine, signedIn = true, onChanged = vi.fn()) => {
  /* Holds the line the way the plan page does, so a new upload reads back. */
  function Harness() {
    const [cur, setCur] = useState(l);
    return (
      <LineArtwork
        line={cur}
        campaignId="c1"
        placementDimensions={cur.dimensions}
        signedIn={signedIn}
        onChanged={(a) => { onChanged(a); setCur((c) => ({ ...c, artworkUrl: a.path, artworkWidth: a.width, artworkHeight: a.height })); }}
      />
    );
  }
  render(<MemoryRouter initialEntries={['/advertise/plan']}><Harness /></MemoryRouter>);
  return onChanged;
};

beforeEach(() => {
  h.upload.mockReset().mockResolvedValue({ path: 'u1/c1/l1-art.png' });
  h.setArt.mockReset().mockResolvedValue(true);
  h.signed.mockReset().mockResolvedValue('https://signed.example/a.png');
  h.designs.mockReset().mockResolvedValue({ state: 'ready', designs: [] });
  h.size = { w: 1000, h: 1000, fail: false };
  h.studioProps.length = 0;
  vi.stubGlobal('Image', FakeImage);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const openMenu = () => fireEvent.click(screen.getByRole('button', { name: 'Add artwork' }));
const upload = (name = 'art.png') => {
  const input = document.querySelector('input[type=file]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [new File(['x'], name, { type: 'image/png' })] } });
};

describe('LineArtwork', () => {
  it('links "Make one at the right size" to the placement shape', () => {
    view(line());
    openMenu();
    const href = screen.getByRole('link', { name: 'Make one at the right size' }).getAttribute('href')!;
    expect(href).toContain('/media/studio?w=2400&h=1200&plan_line=l1&plan=c1');
    expect(href).toContain('text=Allen%20Avenue%20gantry');
  });

  it('with no readable size, sends no w or h and says so', () => {
    view(line({ dimensions: '3 faces' }));
    openMenu();
    const href = screen.getByRole('link', { name: 'Make one at the right size' }).getAttribute('href')!;
    expect(href).not.toMatch(/[?&]w=/);
    expect(href).not.toMatch(/[?&]h=/);
    expect(href).toContain('plan_line=l1');
    expect(screen.getByText('Size to confirm with the media owner — start square and adjust.')).toBeTruthy();
  });

  it('a square upload on a 2:1 line says so', async () => {
    const changed = view(line());
    openMenu();
    upload();
    await screen.findByText('This is square; the placement is 2:1.');
    expect(h.setArt).toHaveBeenCalledWith('l1', { path: 'u1/c1/l1-art.png', width: 1000, height: 1000 });
    expect(changed).toHaveBeenCalled();
  });

  it('a failed or zero measurement is an upload error and is never saved', async () => {
    view(line());
    openMenu();
    h.size = { w: 0, h: 0, fail: false };
    upload();
    await screen.findByText("We could not read that image's size.");
    expect(h.setArt).not.toHaveBeenCalled();

    h.size = { w: 10, h: 10, fail: true };
    upload();
    await waitFor(() => expect(h.upload).toHaveBeenCalledTimes(2));
    await screen.findByText("We could not read that image's size.");
    expect(h.setArt).not.toHaveBeenCalled();
  });

  it('an upload error from the bucket is shown', async () => {
    h.upload.mockResolvedValue({ error: 'Attach the artwork as a PNG, JPG or WebP image.' });
    view(line());
    openMenu();
    upload();
    await screen.findByText('Attach the artwork as a PNG, JPG or WebP image.');
    expect(h.setArt).not.toHaveBeenCalled();
  });

  it('signed out, offers sign-in and nothing else', () => {
    view(line(), false);
    const link = screen.getByRole('link', { name: 'Sign in to attach artwork' });
    expect(link.getAttribute('href')).toBe('/login?next=%2Fadvertise%2Fplan');
    expect(screen.queryByRole('button', { name: 'Add artwork' })).toBeNull();
  });

  it('lists own designs with their shape and fit before choosing', async () => {
    h.designs.mockResolvedValue({
      state: 'ready',
      designs: [
        { id: 'd1', title: 'Wide one', width: 2400, height: 1200 },
        { id: 'd2', title: 'Square one', width: 1000, height: 1000 },
      ],
    });
    view(line());
    openMenu();
    fireEvent.click(screen.getByRole('button', { name: 'Pick a design made in Create' }));
    const wide = await screen.findByRole('link', { name: /Wide one/ });
    expect(wide.getAttribute('href')).toBe('/media/studio/d1?plan_line=l1&plan=c1');
    expect(wide.textContent).toContain('2:1');
    expect(wide.textContent).toContain('Fits this placement');
    expect(screen.getByRole('link', { name: /Square one/ }).textContent).toContain('This is square; the placement is 2:1.');
  });

  it('a failed designs read is not "no designs"', async () => {
    h.designs.mockResolvedValue({ state: 'unavailable', reason: 'We could not load your designs just now.' });
    view(line());
    openMenu();
    fireEvent.click(screen.getByRole('button', { name: 'Pick a design made in Create' }));
    await screen.findByText('We could not load your designs just now.');
    expect(screen.queryByText(/no designs/i)).toBeNull();
  });

  it('shows the verdict for attached artwork and signs a fresh link on every preview', async () => {
    view(line({ artworkUrl: 'u1/c1/l1-art.png', artworkWidth: 2400, artworkHeight: 1200 }));
    expect(screen.getByText('Fits this placement')).toBeTruthy();
    await waitFor(() => expect(h.signed).toHaveBeenCalled());
    const before = h.signed.mock.calls.length;

    fireEvent.click(screen.getByRole('button', { name: 'Preview on the medium' }));
    await screen.findByTestId('studio');
    expect(h.signed.mock.calls.length).toBe(before + 1);
    expect(h.studioProps[h.studioProps.length - 1]).toMatchObject({ initialArtwork: { url: 'https://signed.example/a.png' } });

    fireEvent.click(screen.getByRole('button', { name: 'Close preview' }));
    fireEvent.click(screen.getByRole('button', { name: 'Preview on the medium' }));
    await screen.findByTestId('studio');
    expect(h.signed.mock.calls.length).toBe(before + 2);
  });

  it('unknown placement size says to confirm', () => {
    view(line({ dimensions: '3 faces', artworkUrl: 'p', artworkWidth: 100, artworkHeight: 100 }));
    expect(screen.getByText('Size to confirm with the media owner')).toBeTruthy();
  });
});
