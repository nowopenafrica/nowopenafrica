import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

if (typeof window.matchMedia !== 'function') {
  window.matchMedia = (query: string) =>
    ({ matches: false, media: query, onchange: null, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false }) as unknown as MediaQueryList;
}

const state = vi.hoisted(() => ({
  assets: [] as Record<string, unknown>[],
  updateError: null as null | { message: string },
  updateSeq: null as null | ({ message: string } | null)[],
  updateCalls: 0,
  copyErrors: {} as Record<string, { message: string; statusCode?: string }>,
  removeFails: false,
  copy: vi.fn(),
  remove: vi.fn(),
  signed: vi.fn(),
  update: vi.fn(),
}));

vi.mock('../../lib/supabase', () => {
  const table = (name: string) => {
    let isUpdate = false;
    let myCall = -1;
    const chain: Record<string, unknown> = {};
    Object.assign(chain, {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      order: vi.fn(() => chain),
      limit: vi.fn(() => chain),
      update: vi.fn((patch: unknown) => { isUpdate = true; myCall = state.updateCalls++; state.update(patch); return chain; }),
      then: (onF?: (v: unknown) => unknown, onR?: (e: unknown) => unknown) => {
        let r: unknown;
        if (isUpdate) {
          const err = state.updateSeq ? (state.updateSeq[myCall] ?? null) : state.updateError;
          r = err ? { data: null, error: err } : { data: [{ id: 'a1' }], error: null };
        } else if (name === 'design_asset_licences') {
          r = { data: [{ key: 'cc0', name: 'CC0', restrictions: 'Licence-level note', permits_people_without_release: false }], error: null };
        } else {
          r = { data: state.assets, error: null };
        }
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
          copy: async (...a: unknown[]) => {
            state.copy(...a);
            const e = state.copyErrors[a[0] as string];
            return e ? { data: null, error: e } : { data: { path: 'x' }, error: null };
          },
          remove: async (...a: unknown[]) => {
            state.remove(bucket, ...a);
            return state.removeFails ? { data: null, error: { message: 'remove broke' } } : { data: [], error: null };
          },
          createSignedUrl: async (...a: unknown[]) => { state.signed(bucket, ...a); return { data: { signedUrl: 'https://signed.example/e' }, error: null }; },
        })),
      },
    },
  };
});

import AssetReview from './AssetReview';
import { approvalBlockers, approveAsset, retireAsset, returnAsset } from '../../lib/design/assetAdmin';

const draft = (over: Record<string, unknown> = {}) => ({
  id: 'a1', kind: 'photo', title: 'Market stall', status: 'draft', mime: 'image/png',
  storage_path: 'photos/stall.png', thumb_path: 'photos/stall.thumb.webp', licence_key: 'cc0',
  licence_evidence_path: 'evidence/stall.pdf', retrieved_at: '2026-11-01T00:00:00Z',
  restrictions: 'No political use', source_name: 'Unsplash', creator_name: 'Ada',
  sanitised_at: null, contains_people: false, contains_brands: false, release_on_file: false,
  tags: [], ...over,
});

beforeEach(() => {
  state.assets = [draft()];
  state.updateError = null; state.updateSeq = null; state.updateCalls = 0;
  state.copyErrors = {}; state.removeFails = false;
  state.copy.mockClear(); state.remove.mockClear(); state.signed.mockClear(); state.update.mockClear();
});

describe('assetAdmin', () => {
  it('a refused update means no copy at all', async () => {
    state.updateError = { message: 'new row violates check constraint "design_assets_svg_sanitised_before_approval"' };
    const r = await approveAsset('a1');
    expect(r).toEqual({ ok: false, reason: 'This SVG has not passed the safety check.' });
    expect(state.copy).not.toHaveBeenCalled();
    expect(state.remove).not.toHaveBeenCalled();
  });

  it('copies the file and the thumbnail after the row is approved', async () => {
    expect(await approveAsset('a1')).toEqual({ ok: true });
    expect(state.update.mock.calls[0][0]).toEqual({ status: 'approved' });
    expect(state.copy).toHaveBeenCalledWith('photos/stall.png', 'photos/stall.png', { destinationBucket: 'design-assets' });
    expect(state.copy).toHaveBeenCalledWith('photos/stall.thumb.webp', 'photos/stall.thumb.webp', { destinationBucket: 'design-assets' });
  });

  it('reverts the row when a copy fails', async () => {
    state.copyErrors['photos/stall.thumb.webp'] = { message: 'copy broke' };
    const r = await approveAsset('a1');
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/copy broke/);
    expect(state.update.mock.calls.map((c) => c[0])).toEqual([{ status: 'approved' }, { status: 'draft' }]);
    expect(state.remove).toHaveBeenCalledWith('design-assets', ['photos/stall.png']);
  });

  it('reports both the copy error and a failed revert', async () => {
    state.copyErrors['photos/stall.png'] = { message: 'copy broke' };
    state.updateSeq = [null, { message: 'revert broke' }];
    const r = await approveAsset('a1');
    expect(!r.ok && r.reason).toMatch(/copy broke/);
    expect(!r.ok && r.reason).toMatch(/revert broke/);
  });

  it('counts an object that already exists as copied', async () => {
    state.copyErrors['photos/stall.png'] = { message: 'The resource already exists', statusCode: '409' };
    expect(await approveAsset('a1')).toEqual({ ok: true });
    expect(state.update).toHaveBeenCalledTimes(1);
  });

  it('maps the guard trigger message', async () => {
    state.updateError = { message: 'design asset x: people without a release cannot be approved under licence cc0' };
    const r = await approveAsset('a1');
    expect(!r.ok && r.reason).toMatch(/no release on file/);
  });

  it('blocks retiring without a reason', async () => {
    expect(await retireAsset('a1', '   ')).toEqual({ ok: false, reason: 'Give a reason before retiring.' });
    expect(state.update).not.toHaveBeenCalled();
  });

  it('retires an approved asset first, then removes its public files', async () => {
    state.assets = [draft({ status: 'approved' })];
    expect(await retireAsset('a1', 'Licence changed')).toEqual({ ok: true });
    expect(state.update).toHaveBeenCalledWith({ status: 'retired', retired_reason: 'Licence changed' });
    expect(state.remove).toHaveBeenCalledWith('design-assets', ['photos/stall.png', 'photos/stall.thumb.webp']);
  });

  it('does not remove files when the retire update is refused', async () => {
    state.assets = [draft({ status: 'approved' })];
    state.updateError = { message: 'nope' };
    expect((await retireAsset('a1', 'x')).ok).toBe(false);
    expect(state.remove).not.toHaveBeenCalled();
  });

  it('keeps the retirement when file removal fails', async () => {
    state.assets = [draft({ status: 'approved' })];
    state.removeFails = true;
    const r = await retireAsset('a1', 'x');
    expect(r.ok).toBe(true);
    expect(r.ok && r.warning).toMatch(/could not be removed/);
  });

  it('send back only sets draft', async () => {
    expect(await returnAsset('a1')).toEqual({ ok: true });
    expect(state.update).toHaveBeenCalledWith({ status: 'draft' });
  });

  it('shows unknown errors raw', async () => {
    state.updateError = { message: 'something odd' };
    expect(await returnAsset('a1')).toEqual({ ok: false, reason: 'something odd' });
  });

  it('approvalBlockers mirrors the database rules', () => {
    const ok = { contains_brands: false, licence_evidence_path: 'e', retrieved_at: 't', mime: 'image/png', sanitised_at: null, contains_people: false, release_on_file: false, tags: [] as string[] };
    expect(approvalBlockers(ok, { permits_people_without_release: false })).toEqual([]);
    expect(approvalBlockers({ ...ok, contains_brands: true }, undefined)).toHaveLength(1);
    expect(approvalBlockers({ ...ok, licence_evidence_path: null }, undefined)).toHaveLength(1);
    expect(approvalBlockers({ ...ok, mime: 'image/svg+xml' }, undefined)).toHaveLength(1);
    expect(approvalBlockers({ ...ok, contains_people: true }, { permits_people_without_release: false })).toHaveLength(2);
    expect(approvalBlockers({ ...ok, contains_people: true, tags: ['no-endorsement'] }, { permits_people_without_release: true })).toEqual([]);
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
    expect(state.update).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    fireEvent.click(screen.getByRole('button', { name: 'Retire' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    const confirmBtn = screen.getAllByRole('button', { name: 'Retire' }).pop()!;
    expect(confirmBtn).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Licence changed' } });
    expect(confirmBtn).not.toBeDisabled();
    expect(confirm).not.toHaveBeenCalled();
  });

  it('disables Approve and says why when the rules are not met', async () => {
    state.assets = [draft({ contains_brands: true })];
    render(<AssetReview />);
    expect(await screen.findByRole('button', { name: 'Approve' })).toBeDisabled();
    expect(screen.getByText(/This asset shows a brand/)).toBeInTheDocument();
  });

  it('shows a refusal once, inline, with no public copy made', async () => {
    state.updateError = { message: 'design asset x: people without a release cannot be approved under licence cc0' };
    render(<AssetReview />);
    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Approve now' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/no release on file/);
    expect(state.copy).not.toHaveBeenCalled();
  });
});
