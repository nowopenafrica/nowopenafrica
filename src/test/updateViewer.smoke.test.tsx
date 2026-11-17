import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

if (typeof window.matchMedia !== 'function') {
  window.matchMedia = (query: string) =>
    ({ matches: false, media: query, onchange: null, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false }) as unknown as MediaQueryList;
}

const pub = vi.hoisted(() => ({
  resignMedia: vi.fn(),
  reportUpdate: vi.fn(),
}));
vi.mock('../lib/publicUpdates', async (orig) => ({ ...(await orig<typeof import('../lib/publicUpdates')>()), ...pub }));
const tele = vi.hoisted(() => ({ track: vi.fn() }));
vi.mock('../lib/telemetry', async (orig) => ({ ...(await orig<typeof import('../lib/telemetry')>()), ...tele }));

import UpdateViewer from '../components/updates/UpdateViewer';
import type { PublicUpdate } from '../lib/publicUpdates';

const NOW = new Date('2026-11-15T12:00:00.000Z').getTime();
const iso = (ms: number) => new Date(NOW + ms).toISOString();
const H = 3_600_000;

const u = (id: string, over: Partial<PublicUpdate> = {}): PublicUpdate => ({
  id, type: 'announcement', title: `Title ${id}`, body: `Body ${id}`, cta_label: null, cta_url: null, offer_id: null,
  published_at: iso(-3 * H), expires_at: iso(21 * H), media: [], ...over,
});

const UPDATES = [
  u('a', { media: [{ id: 'm1', kind: 'image', alt: 'Fresh loaves', path: 'b/a/1.webp', url: 'https://s/1', signedUntil: NOW + 600_000 }] }),
  u('b', { media: [{ id: 'm2', kind: 'video', alt: 'Oven tour', path: 'b/b/v.mp4', url: 'https://s/v', signedUntil: NOW + 600_000 }] }),
  u('c', { type: 'offer', offer_id: 'o1', cta_label: 'Order now', cta_url: '/mama-put?tab=products' }),
];

const open = (over: Partial<Parameters<typeof UpdateViewer>[0]> = {}) => {
  const onClose = vi.fn();
  const onIndexChange = vi.fn();
  render(
    <MemoryRouter>
      <UpdateViewer updates={UPDATES} startIndex={0} businessId="biz-1" businessName="Mama Put" slug="mama-put" mode="focus"
        liveIds={new Set((over.updates ?? UPDATES).map((x) => x.id))}
        onClose={onClose} onIndexChange={onIndexChange} {...over} />
    </MemoryRouter>,
  );
  return { onClose, onIndexChange };
};

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(NOW);
  vi.clearAllMocks();
  pub.reportUpdate.mockResolvedValue({ ok: true });
  pub.resignMedia.mockResolvedValue('https://s/1?again');
});
afterEach(() => { vi.useRealTimers(); });

describe('UpdateViewer', () => {
  it('names the business and where you are', () => {
    open();
    expect(screen.getByRole('dialog', { name: 'Mama Put · Update 1 of 3' })).toBeInTheDocument();
    expect(screen.getByText('Title a')).toBeInTheDocument();
    expect(screen.getByText(/Posted 3h ago/)).toBeInTheDocument();
  });

  it('moves with buttons and arrow keys', () => {
    const { onIndexChange } = open();
    fireEvent.click(screen.getByRole('button', { name: 'Next update' }));
    expect(screen.getByText('Title b')).toBeInTheDocument();
    expect(onIndexChange).toHaveBeenLastCalledWith('b');
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(screen.getByText('Title c')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(screen.getByText('Title b')).toBeInTheDocument();
  });

  it('never plays video with sound on its own', () => {
    open({ startIndex: 1 });
    const video = screen.getByLabelText('Oven tour') as HTMLVideoElement;
    expect(video.muted).toBe(true);
    expect(video).not.toHaveAttribute('autoplay');
    expect(video).toHaveAttribute('preload', 'metadata');
    fireEvent.click(screen.getByRole('button', { name: 'Turn sound on' }));
    expect(video.muted).toBe(false);
    expect(screen.getByRole('button', { name: 'Turn sound off' })).toBeInTheDocument();
  });

  it('links the offer and the business\'s own button', () => {
    open({ startIndex: 2 });
    expect(screen.getByRole('link', { name: 'Order now' })).toHaveAttribute('href', '/mama-put?tab=products');
    expect(screen.getByRole('link', { name: /See the offer/ })).toHaveAttribute('href', '/offers');
  });

  it('an update that ends while open says so', async () => {
    open({ updates: [u('x', { expires_at: iso(20_000) })] });
    expect(screen.getByText('Title x')).toBeInTheDocument();
    await act(async () => { vi.advanceTimersByTime(31_000); });
    expect(screen.getByText('This update has ended.')).toBeInTheDocument();
    expect(screen.queryByText('Title x')).not.toBeInTheDocument();
  });

  it('re-signs once on a failed image', async () => {
    open();
    const img = screen.getByAltText('Fresh loaves');
    await act(async () => { fireEvent.error(img); });
    expect(pub.resignMedia).toHaveBeenCalledTimes(1);
    expect(pub.resignMedia).toHaveBeenCalledWith('b/a/1.webp', UPDATES[0].expires_at);
    expect(screen.getByAltText('Fresh loaves')).toHaveAttribute('src', 'https://s/1?again');
    await act(async () => { fireEvent.error(screen.getByAltText('Fresh loaves')); });
    expect(pub.resignMedia).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Photo unavailable')).toBeInTheDocument();
  });

  it('sends a report with the chosen reason and says thank you', async () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Report this update' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Looks like a scam' }));
    fireEvent.click(screen.getByRole('button', { name: 'Send report' }));
    expect(await screen.findByText(/Thanks\. NowOpen will review it\./)).toBeInTheDocument();
    expect(pub.reportUpdate).toHaveBeenCalledWith('a', 'scam', '');
  });

  it('closes the report form before the viewer on Escape', () => {
    const { onClose } = open();
    fireEvent.click(screen.getByRole('button', { name: 'Report this update' }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('button', { name: 'Send report' })).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('shows every update as text in list mode', () => {
    open({ mode: 'list' });
    for (const id of ['a', 'b', 'c']) {
      expect(screen.getByText(`Title ${id}`)).toBeInTheDocument();
      expect(screen.getByText(`Body ${id}`)).toBeInTheDocument();
    }
  });

  it('treats an update the server no longer returns as ended', () => {
    open({ liveIds: new Set(['b', 'c']) });
    expect(screen.getByText('This update has ended.')).toBeInTheDocument();
    expect(screen.queryByText('Title a')).not.toBeInTheDocument();
  });

  it('hides ended updates in list mode too, and reports from the right card', async () => {
    open({ mode: 'list', liveIds: new Set(['a', 'c']) });
    expect(screen.queryByText('Title b')).not.toBeInTheDocument();
    expect(screen.getAllByText('This update has ended.')).toHaveLength(1);
    const reportButtons = screen.getAllByRole('button', { name: 'Report this update' });
    expect(reportButtons).toHaveLength(2);
    fireEvent.click(reportButtons[1]);
    expect(reportButtons[0]).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(screen.getByRole('radio', { name: 'Spam' }));
    fireEvent.click(screen.getByRole('button', { name: 'Send report' }));
    await screen.findByText(/Thanks\. NowOpen will review it\./);
    expect(pub.reportUpdate).toHaveBeenCalledWith('c', 'spam', '');
  });

  it('closes itself when an in-app link is followed', () => {
    const { onClose } = open({ startIndex: 2 });
    fireEvent.click(screen.getByRole('link', { name: 'Order now' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('never treats //host or /\\host as an in-app link', () => {
    open({ updates: [u('x', { cta_label: 'Go', cta_url: '//evil.example' })] });
    expect(screen.queryByRole('link', { name: 'Go' })).not.toBeInTheDocument();
  });

  it('lets the page scroll vertically, and ignores drags on the video', () => {
    const { onIndexChange } = open({ startIndex: 1 });
    const area = screen.getByTestId('update-swipe-area');
    expect(area.className).toMatch(/touch-pan-y/);
    const video = screen.getByLabelText('Oven tour');
    fireEvent.pointerDown(video, { clientX: 300 });
    fireEvent.pointerUp(area, { clientX: 100 });
    expect(onIndexChange).not.toHaveBeenCalled();
  });

  it('keeps Shift+Tab inside the dialog right after opening', () => {
    open();
    const dialog = screen.getByRole('dialog');
    expect(document.activeElement).toBe(dialog);
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).not.toBe(dialog);
  });

  it('moves focus to Close after a report is sent', async () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Report this update' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Spam' }));
    fireEvent.click(screen.getByRole('button', { name: 'Send report' }));
    const close = await screen.findByRole('button', { name: 'Close' });
    expect(document.activeElement).toBe(close);
  });

  it('records one open per update shown, with the business', () => {
    open();
    expect(tele.track).toHaveBeenCalledWith('update_viewed', { update_id: 'a', type: 'announcement' }, 'biz-1');
    fireEvent.click(screen.getByRole('button', { name: 'Next update' }));
    expect(tele.track).toHaveBeenCalledWith('update_viewed', { update_id: 'b', type: 'announcement' }, 'biz-1');
    fireEvent.click(screen.getByRole('button', { name: 'Previous update' }));
    expect(tele.track.mock.calls.filter((c) => c[0] === 'update_viewed' && c[1].update_id === 'a')).toHaveLength(1);
  });

  it('records a button tap', () => {
    open({ startIndex: 2 });
    fireEvent.click(screen.getByRole('link', { name: 'Order now' }));
    expect(tele.track).toHaveBeenCalledWith('update_cta_clicked', { update_id: 'c', type: 'offer' }, 'biz-1');
  });

  it('records a share once it succeeds', async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn(async () => {}) } });
    open();
    fireEvent.click(screen.getByRole('button', { name: /Share/ }));
    await vi.waitFor(() => expect(tele.track).toHaveBeenCalledWith('update_shared', { update_id: 'a', method: 'copy' }, 'biz-1'));
  });

  it('records no opens in list mode, where nothing was chosen', () => {
    open({ mode: 'list' });
    expect(tele.track.mock.calls.filter((c) => c[0] === 'update_viewed')).toHaveLength(0);
  });
});
