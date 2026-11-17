import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

if (typeof window.matchMedia !== 'function') {
  window.matchMedia = (query: string) =>
    ({ matches: false, media: query, onchange: null, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false }) as unknown as MediaQueryList;
}

const mod = vi.hoisted(() => ({
  listModeration: vi.fn(),
  hideUpdate: vi.fn(),
  unhideUpdate: vi.fn(),
  dismissReports: vi.fn(),
}));
// The pure wouldBeLive helper stays real; only the reads and writes are faked.
vi.mock('../lib/updateModeration', async (orig) => ({ ...(await orig<typeof import('../lib/updateModeration')>()), ...mod }));

import UpdatesModerationPanel from '../components/admin/UpdatesModerationPanel';
import type { ModItem } from '../lib/updateModeration';
import { EDITOR_TABS } from '../lib/permissions';

const item = (id: string, over: Partial<ModItem['update']> = {}, reports: ModItem['reports'] = []): ModItem => ({
  update: {
    id, type: 'offer', title: `Update ${id}`, body: '', published_at: new Date(Date.now() - 3_600_000).toISOString(),
    expires_at: new Date(Date.now() + 3_600_000).toISOString(), ended_at: null, moderation_status: 'ok', moderation_note: null,
    media: [], ...over,
  },
  business: { id: 'b1', name: 'Mama Put', username: 'mama-put', user_id: 'owner-1' },
  reports,
  thumb: null,
});

const renderPanel = () => render(<MemoryRouter><UpdatesModerationPanel /></MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks();
  mod.hideUpdate.mockResolvedValue({ ok: true, value: {} });
  mod.unhideUpdate.mockResolvedValue({ ok: true, value: {} });
  mod.dismissReports.mockResolvedValue({ ok: true, value: {} });
});

describe('UpdatesModerationPanel', () => {
  it('tells a failed read from an empty queue', async () => {
    mod.listModeration.mockResolvedValue({ ok: false, message: 'down' });
    renderPanel();
    expect(await screen.findByText(/Couldn't load updates for review/)).toBeInTheDocument();
    expect(screen.queryByText(/Nothing reported/)).not.toBeInTheDocument();
  });

  it('says plainly when nothing is reported', async () => {
    mod.listModeration.mockResolvedValue({ ok: true, value: { reported: [], live: [], hidden: [] } });
    renderPanel();
    expect(await screen.findByText(/Nothing reported/)).toBeInTheDocument();
  });

  it('shows the reasons people gave, and needs a written reason to hide', async () => {
    const reported = item('r1', {}, [
      { reason: 'scam', detail: 'Price is fake', created_at: new Date().toISOString() },
      { reason: 'scam', detail: null, created_at: new Date().toISOString() },
    ]);
    mod.listModeration.mockResolvedValue({ ok: true, value: { reported: [reported], live: [], hidden: [] } });
    renderPanel();
    const card = (await screen.findByText('Update r1')).closest('li') as HTMLElement;
    expect(within(card).getByText(/Looks like a scam × 2/)).toBeInTheDocument();
    expect(within(card).getByText(/Price is fake/)).toBeInTheDocument();

    fireEvent.click(within(card).getByRole('button', { name: /Hide Update r1/ }));
    const confirm = screen.getByRole('button', { name: 'Hide update' });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Reason the owner will see/), { target: { value: 'bad' } });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Reason the owner will see/), { target: { value: 'Misleading price' } });
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);
    await vi.waitFor(() => expect(mod.hideUpdate).toHaveBeenCalledWith(reported, 'Misleading price'));
  });

  it('dismisses reports and unhides', async () => {
    const reported = item('r1', {}, [{ reason: 'spam', detail: null, created_at: new Date().toISOString() }]);
    const hidden = item('h1', { moderation_status: 'hidden', moderation_note: 'Spam' });
    mod.listModeration.mockResolvedValue({ ok: true, value: { reported: [reported], live: [], hidden: [hidden] } });
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: /Dismiss reports for Update r1/ }));
    await vi.waitFor(() => expect(mod.dismissReports).toHaveBeenCalledWith('r1'));

    fireEvent.click(screen.getByRole('button', { name: /Unhide Update h1/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Unhide' }));
    await vi.waitFor(() => expect(mod.unhideUpdate).toHaveBeenCalledWith(hidden));
  });

  it('is an admin-only tab', () => {
    expect(EDITOR_TABS).not.toContain('updates');
  });

  it('does not promise visibility when unhiding an update that has ended', async () => {
    const old = item('o1', {
      moderation_status: 'hidden', moderation_note: 'Spam',
      published_at: new Date(Date.now() - 30 * 3_600_000).toISOString(),
      expires_at: new Date(Date.now() - 6 * 3_600_000).toISOString(),
    });
    mod.listModeration.mockResolvedValue({ ok: true, value: { reported: [], live: [], hidden: [old] } });
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: /Unhide Update o1/ }));
    expect(screen.getByText(/Its 24 hours have already ended/)).toBeInTheDocument();
    expect(screen.queryByText(/It becomes visible again/)).not.toBeInTheDocument();
  });
});
