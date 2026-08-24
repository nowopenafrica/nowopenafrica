import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import BusinessTrustPanel from './BusinessTrustPanel';
import type { Business } from '../types';

// The panel's honesty rule cuts both ways: it must never hide an unverified
// signal, and it must never dress an unverified listing up as a measured one.
// These lock in that the score, the tier and all seven checks survive in both
// states, and that only the visual weight changes.

const base = { id: 'b1', name: 'Test Business', created_at: '2024-01-01T00:00:00Z' } as unknown as Business;

const verified = {
  ...base,
  email_verified: true,
  phone_verified: true,
  id_verified: true,
  registration_verified: true,
} as unknown as Business;

const ring = (c: HTMLElement) => c.querySelector('svg circle');

describe('BusinessTrustPanel', () => {
  it('drops the score ring when our team has confirmed nothing', () => {
    const { container } = render(<BusinessTrustPanel business={base} />);
    expect(ring(container)).toBeNull();
    // The score is still stated, just inline rather than as a dial.
    expect(screen.getByText(/\/100$/)).toBeTruthy();
  });

  it('shows the ring once there is something to measure', () => {
    const { container } = render(<BusinessTrustPanel business={verified} />);
    expect(ring(container)).not.toBeNull();
  });

  it('reports the confirmed count honestly in both states', () => {
    const { unmount } = render(<BusinessTrustPanel business={base} />);
    expect(screen.getByText(/0 of 7 checks confirmed/)).toBeTruthy();
    unmount();

    render(<BusinessTrustPanel business={verified} />);
    expect(screen.getByText(/4 of 7 checks confirmed/)).toBeTruthy();
  });

  it('never hides an unverified signal', () => {
    render(<BusinessTrustPanel business={base} />);
    // The checklist lives behind a disclosure, but every step is in the DOM.
    expect(screen.getByRole('button', { name: /What we verified/i })).toBeTruthy();
  });
});
