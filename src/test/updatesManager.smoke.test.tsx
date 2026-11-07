import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';

if (typeof window.matchMedia !== 'function') {
  window.matchMedia = (query: string) =>
    ({ matches: false, media: query, onchange: null, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false }) as unknown as MediaQueryList;
}

const api = vi.hoisted(() => ({
  listOwnerUpdates: vi.fn(),
  endUpdate: vi.fn(),
  deleteUpdate: vi.fn(),
  publishUpdate: vi.fn(),
  loadKeeperReach: vi.fn(),
}));
vi.mock('../lib/businessUpdatesApi', () => api);
vi.mock('../components/dashboard/UpdateComposer', () => ({
  default: () => <div>composer open</div>,
}));

import UpdatesManager from '../components/dashboard/UpdatesManager';
import type { OwnerUpdate } from '../lib/businessUpdatesApi';

const T = new Date('2026-11-01T10:00:00.000Z').getTime();
const H = 3_600_000;

const row = (id: string, over: Partial<OwnerUpdate>): OwnerUpdate => ({
  id, business_id: 'b1', author_id: null, type: 'announcement', title: id, body: '', offer_id: null,
  event_starts_at: null, cta_label: null, cta_url: null, notify_keepers: true, notified_at: null,
  published_at: null, expires_at: null, ended_at: null, moderation_status: 'ok', moderation_note: null,
  created_at: new Date(T).toISOString(), media: [], ...over,
});
const at = (ms: number) => new Date(T + ms).toISOString();

const ROWS = [
  row('Live one', { published_at: at(-H), expires_at: at(23 * H) }),
  row('Scheduled one', { published_at: at(2 * H), expires_at: at(26 * H) }),
  row('Draft one', {}),
  row('Old one', { published_at: at(-30 * H), expires_at: at(-6 * H) }),
  row('Hidden one', { published_at: at(-H), expires_at: at(23 * H), moderation_status: 'hidden', moderation_note: 'Misleading price' }),
];

const open = () => render(<UpdatesManager businessId="b1" businessName="Mama Put" isOwner onClose={vi.fn()} />);
const tab = (name: RegExp) => screen.getByRole('tab', { name });

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(T);
  vi.clearAllMocks();
  api.loadKeeperReach.mockResolvedValue(null);
  api.endUpdate.mockResolvedValue({ ok: true, value: undefined });
  api.deleteUpdate.mockResolvedValue({ ok: true, value: undefined });
  api.listOwnerUpdates.mockResolvedValue({ ok: true, value: ROWS });
});
afterEach(() => { vi.useRealTimers(); });

describe('UpdatesManager', () => {
  it('tells empty from unreadable', async () => {
    api.listOwnerUpdates.mockResolvedValue({ ok: true, value: [] });
    const first = open();
    expect(await screen.findByText(/No updates yet/)).toBeInTheDocument();
    first.unmount();

    api.listOwnerUpdates.mockResolvedValue({ ok: false, message: 'Something went wrong. Please try again.' });
    open();
    expect(await screen.findByText(/Couldn't load your updates/)).toBeInTheDocument();
    expect(screen.queryByText(/No updates yet/)).not.toBeInTheDocument();
  });

  it('puts each update in the right tab', async () => {
    open();
    expect(await screen.findByText('Live one')).toBeInTheDocument();
    expect(tab(/Active \(1\)/)).toBeInTheDocument();
    expect(tab(/Scheduled & drafts \(2\)/)).toBeInTheDocument();
    expect(tab(/Archive \(2\)/)).toBeInTheDocument();

    fireEvent.click(tab(/Scheduled & drafts/));
    expect(screen.getByText('Scheduled one')).toBeInTheDocument();
    expect(screen.getByText('Draft one')).toBeInTheDocument();
  });

  it('asks before ending an update, then ends it', async () => {
    open();
    await screen.findByText('Live one');
    fireEvent.click(screen.getByRole('button', { name: /End Live one now/ }));
    // ConfirmDialog has no accessible name of its own; its heading identifies it.
    const dialog = screen.getByRole('heading', { name: 'End this update?' }).closest('[role="dialog"]') as HTMLElement;
    expect(api.endUpdate).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'End now' }));
    await vi.waitFor(() => expect(api.endUpdate).toHaveBeenCalledWith('Live one'));
  });

  it('keeps a hidden update and says why it cannot be deleted', async () => {
    open();
    await screen.findByText('Live one');
    fireEvent.click(tab(/Archive/));
    const item = screen.getByText('Hidden one').closest('li') as HTMLElement;
    expect(within(item).getByText(/Misleading price/)).toBeInTheDocument();
    expect(within(item).queryByRole('button', { name: /Delete/ })).not.toBeInTheDocument();
    expect(within(item).getByText(/kept for review/)).toBeInTheDocument();
  });

  it('an update moves to Archive when its time ends', async () => {
    api.listOwnerUpdates.mockResolvedValue({
      ok: true, value: [row('Ending soon', { published_at: at(-24 * H + 60_000), expires_at: at(60_000) })],
    });
    open();
    await screen.findByText('Ending soon');
    expect(tab(/Active \(1\)/)).toBeInTheDocument();
    await act(async () => { vi.advanceTimersByTime(90_000); });
    expect(tab(/Active \(0\)/)).toBeInTheDocument();
    expect(tab(/Archive \(1\)/)).toBeInTheDocument();
  });

  it('does not close over an open composer when Escape is pressed', async () => {
    const onClose = vi.fn();
    render(<UpdatesManager businessId="b1" businessName="Mama Put" isOwner onClose={onClose} />);
    await screen.findByText('Live one');
    fireEvent.click(screen.getByRole('button', { name: /Create update/ }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText('composer open')).toBeInTheDocument();
  });

  it('never claims keepers were told, only that the alert was handled', async () => {
    api.listOwnerUpdates.mockResolvedValue({
      ok: true, value: [row('Sent one', { published_at: at(-H), expires_at: at(23 * H), notified_at: at(-H) })],
    });
    open();
    await screen.findByText('Sent one');
    expect(screen.queryByText(/Keepers told/)).not.toBeInTheDocument();
    expect(screen.getByText(/Keeper alert handled/)).toBeInTheDocument();
  });

  it('loads only video metadata for thumbnails, not whole files', async () => {
    api.listOwnerUpdates.mockResolvedValue({
      ok: true, value: [row('Clip', { published_at: at(-H), expires_at: at(23 * H),
        media: [{ id: 'm', storage_path: 'b1/x/v.mp4', kind: 'video', position: 0, alt_text: 'Clip', url: 'https://s/v.mp4' }] })],
    });
    open();
    await screen.findByText('Clip');
    expect(screen.getByLabelText('Clip', { selector: 'video' })).toHaveAttribute('preload', 'metadata');
  });
});
