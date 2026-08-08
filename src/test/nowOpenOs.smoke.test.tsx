import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import NowOpenOs from '../pages/NowOpenOs';

vi.mock('../lib/seo', () => ({
  applySeo: () => () => {},
}));

describe('NowOpenOs public page', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('tells the eight-ledger operating system story', () => {
    render(
      <MemoryRouter>
        <NowOpenOs />
      </MemoryRouter>
    );

    expect(screen.getByText('The operating system we run on')).toBeTruthy();
    expect(screen.getByText('Workforce')).toBeTruthy();
    expect(screen.getByText('Campaigns')).toBeTruthy();
    expect(screen.getAllByText(/os_[a-z_]+/).length).toBeGreaterThanOrEqual(8);
    expect(screen.getByText('One source of truth')).toBeTruthy();
    expect(screen.getByText('Derived, not fabricated')).toBeTruthy();
  });

  it('deep-links to the founder page', () => {
    render(
      <MemoryRouter>
        <NowOpenOs />
      </MemoryRouter>
    );

    const founder = screen.getByText('Meet the founder');
    expect(founder.closest('a')?.getAttribute('href')).toBe('/founder');
  });
});
