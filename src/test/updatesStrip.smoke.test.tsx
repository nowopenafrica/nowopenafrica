import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

if (typeof window.matchMedia !== 'function') {
  window.matchMedia = (query: string) =>
    ({ matches: false, media: query, onchange: null, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false }) as unknown as MediaQueryList;
}

const pub = vi.hoisted(() => ({ fetchActiveUpdates: vi.fn() }));
vi.mock('../lib/publicUpdates', () => pub);
vi.mock('../components/updates/UpdateViewer', () => ({
  default: (p: { updates: { title: string }[]; startIndex: number; liveIds: Set<string> }) => (
    <div>viewer at {p.updates[p.startIndex].title}; live: {[...p.liveIds].sort().join(',') || 'none'}</div>
  ),
}));

import UpdatesStrip from '../components/updates/UpdatesStrip';
import type { PublicUpdate } from '../lib/publicUpdates';

const NOW = new Date('2026-11-15T12:00:00.000Z').getTime();
const iso = (ms: number) => new Date(NOW + ms).toISOString();
const H = 3_600_000;
const u = (id: string, over: Partial<PublicUpdate> = {}): PublicUpdate => ({
  id, type: 'announcement', title: `Title ${id}`, body: '', cta_label: null, cta_url: null, offer_id: null,
  published_at: iso(-3 * H), expires_at: iso(21 * H), media: [], ...over,
});

const strip = (openUpdateId: string | null = null) => {
  const onOpenChange = vi.fn();
  const view = render(
    <UpdatesStrip businessId="b1" businessName="Mama Put" slug="mama-put" openUpdateId={openUpdateId} onOpenChange={onOpenChange} />,
  );
  return { onOpenChange, ...view };
};

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(NOW);
  vi.clearAllMocks();
});
afterEach(() => { vi.useRealTimers(); });

describe('UpdatesStrip', () => {
  it('renders nothing when unreadable', async () => {
    pub.fetchActiveUpdates.mockResolvedValue({ ok: false });
    const { container } = strip();
    await waitFor(() => expect(pub.fetchActiveUpdates).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when there are no live updates', async () => {
    pub.fetchActiveUpdates.mockResolvedValue({ ok: true, value: [] });
    const { container } = strip();
    await waitFor(() => expect(pub.fetchActiveUpdates).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('lists each live update as a labelled button, newest first', async () => {
    pub.fetchActiveUpdates.mockResolvedValue({
      ok: true, value: [u('new', { type: 'offer', title: '20% off this weekend' }), u('old', { published_at: iso(-5 * H) })],
    });
    strip();
    const buttons = await screen.findAllByRole('button', { name: /posted/ });
    expect(buttons[0]).toHaveAccessibleName('Offer: 20% off this weekend, posted 3h ago');
    expect(buttons[1]).toHaveAccessibleName(/Title old, posted 5h ago/);
    expect(screen.getByRole('button', { name: 'View as list' })).toBeInTheDocument();
  });

  it('opens the viewer on a shared link to a live update', async () => {
    pub.fetchActiveUpdates.mockResolvedValue({ ok: true, value: [u('a'), u('b')] });
    strip('b');
    expect(await screen.findByText(/^viewer at Title b;/)).toBeInTheDocument();
  });

  it('an ended link says so', async () => {
    pub.fetchActiveUpdates.mockResolvedValue({ ok: true, value: [u('a')] });
    const { onOpenChange } = strip('gone');
    expect(await screen.findByRole('status')).toHaveTextContent('This update has ended.');
    expect(onOpenChange).toHaveBeenCalledWith(null);
  });

  it('an ended link says so even when nothing else is live', async () => {
    pub.fetchActiveUpdates.mockResolvedValue({ ok: true, value: [] });
    strip('gone');
    expect(await screen.findByRole('status')).toHaveTextContent('This update has ended.');
  });

  it('keeps the viewer open, and says the update ended, when the last one runs out', async () => {
    pub.fetchActiveUpdates.mockResolvedValue({ ok: true, value: [u('only', { expires_at: iso(20_000) })] });
    strip();
    fireEvent.click(await screen.findByRole('button', { name: /posted/ }));
    expect(screen.getByText(/viewer at Title only; live: only/)).toBeInTheDocument();
    await act(async () => { vi.advanceTimersByTime(31_000); });
    expect(screen.getByText(/viewer at Title only; live: none/)).toBeInTheDocument();
  });

  it('keeps what it showed when a refresh fails', async () => {
    pub.fetchActiveUpdates.mockResolvedValueOnce({ ok: true, value: [u('a')] });
    pub.fetchActiveUpdates.mockResolvedValue({ ok: false });
    strip();
    expect(await screen.findByRole('button', { name: /Title a/ })).toBeInTheDocument();
    await act(async () => { vi.advanceTimersByTime(61_000); });
    await waitFor(() => expect(pub.fetchActiveUpdates).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('button', { name: /Title a/ })).toBeInTheDocument();
  });

  it('tells an open viewer when an update is ended early or hidden', async () => {
    pub.fetchActiveUpdates.mockResolvedValueOnce({ ok: true, value: [u('a'), u('b')] });
    pub.fetchActiveUpdates.mockResolvedValue({ ok: true, value: [u('b')] });
    strip();
    fireEvent.click((await screen.findAllByRole('button', { name: /posted/ }))[0]);
    await act(async () => { vi.advanceTimersByTime(61_000); });
    expect(await screen.findByText(/viewer at Title a; live: b$/)).toBeInTheDocument();
  });

  it('hands the previous read back so unchanged photos are not signed again', async () => {
    pub.fetchActiveUpdates.mockResolvedValue({ ok: true, value: [u('a')] });
    strip();
    await screen.findByRole('button', { name: /Title a/ });
    await act(async () => { vi.advanceTimersByTime(61_000); });
    await waitFor(() => expect(pub.fetchActiveUpdates).toHaveBeenCalledTimes(2));
    expect(pub.fetchActiveUpdates.mock.calls[1][1]).toEqual([expect.objectContaining({ id: 'a' })]);
  });
});
