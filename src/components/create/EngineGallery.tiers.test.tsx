import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import EngineGallery from './EngineGallery';
import type { TierInfo, TierTable } from '../../lib/create/tiers';

vi.mock('../../contexts/AuthContext', () => ({ useOptionalAuth: () => ({ user: null }) }));
vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn() } }));

const info = (tier: TierInfo['tier'], noc: number): TierInfo => ({ tier, noc, minScore: tier === 'premium' ? 90 : 85, onSale: false });
const table: TierTable = {
  byItem: new Map([['flyer', info('free', 0)], ['poster', info('premium', 35)]]),
  minorPerNoc: 5000,
  currency: 'NGN',
};
vi.mock('../../lib/create/tiers', async (orig) => ({
  ...(await orig<typeof import('../../lib/create/tiers')>()),
  useTemplateTiers: () => table,
}));

const show = (deliverables: string[]) => render(<MemoryRouter><EngineGallery deliverables={deliverables} /></MemoryRouter>);

describe('EngineGallery tiers', () => {
  it('labels each design with its tier and shows the set price as not on sale', () => {
    show(['flyer', 'poster']);
    fireEvent.click(screen.getByRole('button', { name: 'Poster' }));
    const g = screen.getByTestId('engine-gallery');
    const badges = within(g).getAllByTestId('tier-badge');
    expect(badges.every((b) => b.dataset.tier === 'premium')).toBe(true);
    expect(badges[0].textContent).toBe('Premium · 35 NOC');
    const line = within(g).getAllByTestId('tier-price')[0].textContent ?? '';
    expect(line).toMatch(/Premium price 35 NOC \(.*1,750.*\) · free to edit until it passes review/);
    expect(within(g).getByTestId('tier-note')).toBeTruthy();
  });

  it('filters the items by tier', () => {
    show(['flyer', 'poster']);
    const bar = screen.getByTestId('tier-filter');
    /* Only tiers this gallery holds are offered. */
    expect(within(bar).queryByRole('button', { name: /Signature/ })).toBeNull();
    fireEvent.click(within(bar).getByRole('button', { name: /Premium/ }));
    expect(screen.getByRole('heading', { level: 3 }).textContent).toBe('Designed for poster');
    expect(screen.queryByRole('button', { name: 'Flyer' })).toBeNull();
    fireEvent.click(within(bar).getByRole('button', { name: /Free/ }));
    expect(screen.getByRole('heading', { level: 3 }).textContent).toBe('Designed for flyer');
    expect(within(screen.getByTestId('engine-gallery')).getAllByTestId('tier-badge')[0].textContent).toBe('Free');
  });
});
