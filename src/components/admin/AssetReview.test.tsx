import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

if (typeof window.matchMedia !== 'function') {
  window.matchMedia = (query: string) =>
    ({ matches: false, media: query, onchange: null, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false }) as unknown as MediaQueryList;
}

const state = vi.hoisted(() => ({
  assets: [] as Record<string, unknown>[],
  updateError: null as null | { message: string },
  copyError: null as null | { message: string },
  copy: vi.fn(),
  remove: vi.fn(),
  signed: vi.fn(),
  update: vi.fn(),
}));

vi.mock('../../lib/supabase', () => {
  const table = (name: string) => {
    let isUpdate = false;
    const chain: Record<string, unknown> = {};
    Object.assign(chain, {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      order: vi.fn(() => chain),
      limit: vi.fn(() => chain),
      maybeSingle: vi.fn(() => chain),
      update: vi.fn((patch: unknown) => { isUpdate = true; state.update(patch); return chain; }),
      then: (onF?: (v: unknown) => unknown, onR?: (e: unknown) => unknown) => {
        let r: unknown;
        if (isUpdate) r = state.updateError ? { data: null, error: state.updateError } : { data: [{ id: 'a1' }], error: null };
        else if (name === 'design_asset_licences') r = { data: [{ key: 'cc0', name: 'CC0', restrictions: 'Licence-level note', permits_people_without_release: false }], error: null };
        else r = { data: state.assets, error: null };
        return Promise.resolve(r).then(onF, onR);
      },
    });
    return chain;
  };
  return {
    supabase: {
      from: vi.fn((n: string) => table(n)),
      storage: {
        from: vi.fn((bucket: string) => ({
          copy: async (...a: unknown[]) => { state.copy(...a); return state.copyError ? { data: null, error: state.copyError } : { data: { path: 'x' }, error: null }; },
          remove: async (...a: unknown[]) => { state.remove(bucket, ...a); return { data: [], error: null }; },
          createSignedUrl: async (...a: unknown[]) => { state.signed(bucket, ...a); return { data: { signedUrl: 'https://signed.example/e' }, error: null }; },
        })),
      },
    },
  };
});

import AssetReview from './AssetReview';
import { approveAsset, retireAsset, returnAsset } from '../../lib/design/assetAdmin';

const draft = (over: Record<string, unknown> = {}) => ({
  id: 'a1', kind: 'photo', title: 'Market stall', status: 'draft', mime: 'image/png',
  storage_path: 'photos/stall.png', thumb_path: null, licence_key: 'cc0',
  licence_evidence_path: 'evidence/stall.pdf', retrieved_at: '2026-11-01T00:00:00Z',
  restrictions: 'No political use', source_name: 'Unsplash', creator_name: 'Ada',
  sanitised_at: null, contains_people: false, contains_brands: false, release_on_file: false,
  tags: [], ...over,
});

beforeEach(() => {
  state.assets = [draft()];
  state.updateError = null;
  state.copyError = null;
  state.copy.mockClear(); state.remove.mockClear(); state.signed.mockClear(); state.update.mockClear();
});

describe('assetAdmin', () => {
  it('removes the public copy and returns the reason when the row update fails', async () => {
    state.updateError = { message: 'new row violates check constraint "design_assets_svg_sanitised_before_approval"' };
    const r = await approveAsset('a1');
    expect(r).toEqual({ ok: false, reason: 'This SVG has not passed the safety check.' });
    expect(state.copy).toHaveBeenCalledWith('photos/stall.png', 'photos/stall.png', { destinationBucket: 'design-assets' });
    expect(state.remove).toHaveBeenCalledWith('design-assets', ['photos/stall.png']);
  });

  it('does not touch the row when the copy fails', async () => {
    state.copyError = { message: 'copy broke' };
    const r = await approveAsset('a1');
    expect(r).toEqual({ ok: false, reason: 'copy broke' });
    expect(state.update).not.toHaveBeenCalled();
  });

  it('never sends reviewer stamps', async () => {
    await approveAsset('a1');
    expect(state.update.mock.calls[0][0]).toEqual({ status: 'approved' });
  });

  it('blocks retiring without a reason', async () => {
    expect(await retireAsset('a1', '   ')).toEqual({ ok: false, reason: 'Give a reason before retiring.' });
    expect(state.update).not.toHaveBeenCalled();
  });

  it('send back only sets draft', async () => {
    expect(await returnAsset('a1')).toEqual({ ok: true });
    expect(state.update).toHaveBeenCalledWith({ status: 'draft' });
  });

  it('shows unknown errors raw', async () => {
    state.updateError = { message: 'something odd' };
    expect(await returnAsset('a1')).toEqual({ ok: false, reason: 'something odd' });
  });
});

describe('AssetReview', () => {
  it('shows evidence link, licence and restrictions for each draft', async () => {
    state.assets = [draft(), draft({ id: 'a2', title: 'Second', restrictions: 'Second restriction' })];
    render(<AssetReview />);
    expect(await screen.findByText('Market stall')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /View evidence/ })).toHaveLength(2);
    expect(screen.getAllByText(/CC0/).length).toBe(2);
    expect(screen.getByText(/No political use/)).toBeInTheDocument();
    expect(screen.getByText(/Second restriction/)).toBeInTheDocument();
    expect(screen.getByText(/notes are not stored yet/)).toBeInTheDocument();
  });

  it('signs the evidence URL for 300 seconds from the private bucket', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    render(<AssetReview />);
    fireEvent.click(await screen.findByRole('button', { name: /View evidence/ }));
    await waitFor(() => expect(state.signed).toHaveBeenCalledWith('design-assets-intake', 'evidence/stall.pdf', 300));
    await waitFor(() => expect(open).toHaveBeenCalled());
  });

  it('asks through ConfirmDialog before approving and retiring', async () => {
    const confirm = vi.spyOn(window, 'confirm');
    render(<AssetReview />);
    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(state.copy).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    fireEvent.click(screen.getByRole('button', { name: 'Retire' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    const confirmBtn = screen.getAllByRole('button', { name: 'Retire' }).pop()!;
    expect(confirmBtn).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Licence changed' } });
    expect(confirmBtn).not.toBeDisabled();
    expect(confirm).not.toHaveBeenCalled();
  });

  it('shows the plain-words reason when approval is refused', async () => {
    state.updateError = { message: 'violates "design_assets_brands_never_approved"' };
    render(<AssetReview />);
    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Approve now' }));
    expect(await screen.findByText(/shows a brand/)).toBeInTheDocument();
    expect(state.remove).toHaveBeenCalled();
  });
});
