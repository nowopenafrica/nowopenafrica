import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

if (typeof window.matchMedia !== 'function') {
  window.matchMedia = (query: string) =>
    ({ matches: false, media: query, onchange: null, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false }) as unknown as MediaQueryList;
}

const pub = vi.hoisted(() => ({ fetchHappening: vi.fn() }));
vi.mock('../lib/publicUpdates', async (orig) => ({ ...(await orig<typeof import('../lib/publicUpdates')>()), ...pub }));

import HappeningRow from '../components/updates/HappeningRow';
import type { HappeningItem } from '../lib/publicUpdates';

const NOW = new Date('2026-11-15T12:30:00.000Z').getTime();
const iso = (ms: number) => new Date(NOW + ms).toISOString();
const M = 60_000;

const item = (id: string, minsAgo: number, over: { username?: string | null; bizId?: string; expires?: number } = {}): HappeningItem => ({
  update: {
    id, type: 'new_product', title: `Fresh ${id}`, body: '', cta_label: null, cta_url: null, offer_id: null,
    published_at: iso(-minsAgo * M), expires_at: iso(over.expires ?? (24 * 60 - minsAgo) * M), media: [],
  },
  business: {
    id: over.bizId ?? `b-${id}`, name: `Biz ${id}`,
    username: over.username === undefined ? `user-${id}` : over.username,
    image_url: null, category: 'Bakery', location: 'Lekki',
  },
  thumb: null,
});

const renderRow = (props: Partial<Parameters<typeof HappeningRow>[0]> = {}) => render(
  <MemoryRouter>
    <HappeningRow title="Happening on NowOpen" blurb="Live updates" {...props} />
  </MemoryRouter>,
);

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(NOW);
  vi.clearAllMocks();
});
afterEach(() => { vi.useRealTimers(); });

describe('HappeningRow', () => {
  it('renders nothing when the read fails', async () => {
    pub.fetchHappening.mockResolvedValue({ ok: false });
    const { container } = renderRow();
    await waitFor(() => expect(pub.fetchHappening).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when nothing is live', async () => {
    pub.fetchHappening.mockResolvedValue({ ok: true, value: [] });
    const { container } = renderRow();
    await waitFor(() => expect(pub.fetchHappening).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('links each card to the update on its profile, named in full', async () => {
    pub.fetchHappening.mockResolvedValue({ ok: true, value: [item('a', 5), item('b', 40, { username: null, bizId: 'b9' })] });
    renderRow();
    const a = await screen.findByRole('link', { name: 'Biz a: New product: Fresh a, posted 5 min ago' });
    expect(a).toHaveAttribute('href', '/user-a?update=a');
    expect(screen.getByRole('link', { name: /Biz b:/ })).toHaveAttribute('href', '/businesses/b9?update=b');
    expect(screen.getByRole('heading', { name: 'Happening on NowOpen' })).toBeInTheDocument();
    // The section takes its name from the heading.
    expect(screen.getByRole('region', { name: 'Happening on NowOpen' })).toBeInTheDocument();
  });

  it('puts businesses the person keeps first within the hour', async () => {
    pub.fetchHappening.mockResolvedValue({ ok: true, value: [item('stranger', 2), item('kept', 20)] });
    renderRow({ rankContext: { keptIds: new Set(['b-kept']), place: '', category: '' } });
    await screen.findByRole('link', { name: /Biz kept/ });
    const links = screen.getAllByRole('link');
    expect(links[0]).toHaveAccessibleName(/Biz kept/);
  });

  it('passes the businesses to read when given', async () => {
    pub.fetchHappening.mockResolvedValue({ ok: true, value: [] });
    renderRow({ businessIds: ['x', 'y'] });
    await waitFor(() => expect(pub.fetchHappening).toHaveBeenCalledWith({ businessIds: ['x', 'y'] }, []));
  });

  it('disappears when the last update ends', async () => {
    pub.fetchHappening.mockResolvedValue({ ok: true, value: [item('a', 5, { expires: 20_000 })] });
    const { container } = renderRow();
    await screen.findByRole('link', { name: /Biz a/ });
    await act(async () => { vi.advanceTimersByTime(31_000); });
    expect(container).toBeEmptyDOMElement();
  });

  it('shows at most two updates from any one business', async () => {
    const many = [1, 2, 3, 4].map((n) => item(`x${n}`, n, { bizId: 'same' }));
    pub.fetchHappening.mockResolvedValue({ ok: true, value: [...many, item('other', 10)] });
    renderRow({ perBusiness: 2 });
    await screen.findByRole('link', { name: /Biz other/ });
    expect(screen.getAllByRole('link')).toHaveLength(3);
    expect(screen.getAllByRole('link').map((l) => l.getAttribute('href'))).toEqual(['/user-x1?update=x1', '/user-x2?update=x2', '/user-other?update=other']);
  });
});
