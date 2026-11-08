import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { DESIGN_TEMPLATES } from '../lib/designTemplates';
import { canvasOf } from '../lib/create/templateDetail';
import { formatOf } from '../lib/design/formats';

/* No network, no writes: the catalogue hook and the anon client are stubs. */
vi.mock('../hooks/useDesignCatalogue', () => ({
  useDesignCatalogue: () => ({ entries: [], templates: DESIGN_TEMPLATES, ready: true, incomplete: null }),
  invalidateCatalogue: () => {},
}));
vi.mock('../components/create/TemplateCustomiser', () => ({ default: () => <div data-testid="customiser" /> }));
vi.mock('../components/studio/TemplateSurface', () => ({ default: () => <div data-testid="surface" /> }));

const db = vi.hoisted(() => ({ data: [] as unknown[], error: null as unknown, reads: 0 }));
vi.mock('../lib/supabase', () => {
  const chain = {
    select: () => chain,
    order: () => chain,
    limit: () => { db.reads += 1; return Promise.resolve({ data: db.data, error: db.error }); },
  };
  return { supabase: { from: () => chain } };
});

import TemplateDetail from './TemplateDetail';
import { resetScenesCache } from '../lib/create/mockup';

const CARD = DESIGN_TEMPLATES.find((t) => t.key === 'card-minimal')!;
const F = formatOf(canvasOf(CARD).formatKey!)!;

const row = (id: string, ratio: number) => ({
  id: `s-${id}`, asset_id: id, ratio, format_keys: [], label: 'Desk',
  tl_x: 0.2, tl_y: 0.2, tr_x: 0.8, tr_y: 0.25, br_x: 0.8, br_y: 0.65, bl_x: 0.2, bl_y: 0.7,
  design_assets: { id, kind: 'mockup_scene', title: 'A desk', storage_path: 'desk.jpg', width_px: 1600, height_px: 1000 },
});

let widthSpy: PropertyDescriptor | undefined;
beforeEach(() => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://proj.supabase.co');
  db.data = []; db.error = null; db.reads = 0;
  resetScenesCache();
  widthSpy = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 600 });
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  if (widthSpy) Object.defineProperty(HTMLElement.prototype, 'clientWidth', widthSpy);
});

const mount = () => render(
  <MemoryRouter initialEntries={[`/media/templates/${CARD.key}`]}>
    <Routes><Route path="/media/templates/:key" element={<TemplateDetail />} /></Routes>
  </MemoryRouter>,
);

describe('template detail: See it in place', () => {
  it('shows nothing new while no scene exists (the table is empty today)', async () => {
    mount();
    await waitFor(() => expect(db.reads).toBe(1));
    await Promise.resolve();
    expect(screen.queryByTestId('mockups')).toBeNull();
    expect(screen.queryByRole('button', { name: /see it in place/i })).toBeNull();
    expect(screen.queryByText(/Mockup: illustration only/)).toBeNull();
  });

  it('shows nothing when the read fails', async () => {
    db.error = { message: 'down' };
    mount();
    await waitFor(() => expect(db.reads).toBe(1));
    await Promise.resolve();
    expect(screen.queryByRole('button', { name: /see it in place/i })).toBeNull();
  });

  it('offers the toggle when a scene matches the format, and shows the labelled mockup on press', async () => {
    db.data = [row('match', F.w / F.h)];
    mount();
    const toggle = await screen.findByRole('button', { name: /see it in place/i });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByTestId('mockup-view')).toBeNull();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getAllByTestId('mockup-view')).toHaveLength(1);
    expect(screen.getByText('Mockup: illustration only')).toBeVisible();
    expect(screen.getByRole('img', { name: 'A desk' })).toHaveAttribute(
      'src', 'https://proj.supabase.co/storage/v1/object/public/design-assets/desk.jpg',
    );

    fireEvent.click(toggle);
    expect(screen.queryByTestId('mockup-view')).toBeNull();
  });

  it('offers no toggle when the only scene is off-ratio (artwork is never stretched)', async () => {
    db.data = [row('wide', (F.w / F.h) * 1.05)];
    mount();
    await waitFor(() => expect(db.reads).toBe(1));
    await Promise.resolve();
    expect(screen.queryByRole('button', { name: /see it in place/i })).toBeNull();
  });
});
