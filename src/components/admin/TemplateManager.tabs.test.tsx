import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

if (typeof window.matchMedia !== 'function') {
  window.matchMedia = (query: string) =>
    ({ matches: false, media: query, onchange: null, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false }) as unknown as MediaQueryList;
}

vi.mock('../../lib/supabase', () => {
  const chain: Record<string, unknown> = {};
  Object.assign(chain, {
    select: vi.fn(() => chain), eq: vi.fn(() => chain), order: vi.fn(() => chain), limit: vi.fn(() => chain),
    then: (f?: (v: unknown) => unknown, r?: (e: unknown) => unknown) =>
      Promise.resolve({ data: [], error: null }).then(f, r),
  });
  return { supabase: { from: vi.fn(() => chain), auth: { getUser: vi.fn() }, storage: { from: vi.fn() } } };
});

vi.mock('../../lib/create/ingestTemplates', () => ({
  ingestFiles: vi.fn(async () => [{ ok: false, fileName: 'bad.json', reason: 'Not a template' }]),
}));

import TemplateManager from './TemplateManager';

describe('TemplateManager tabs', () => {
  it('keeps staged upload results when switching to Assets and back', async () => {
    const { container } = render(<TemplateManager />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['{}'], 'bad.json', { type: 'application/json' })] } });
    expect(await screen.findByText(/Not a template/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Assets' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Templates' }));
    await waitFor(() => expect(screen.getByText(/Not a template/)).toBeVisible());
  });
});
