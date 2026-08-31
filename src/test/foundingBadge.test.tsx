import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import FoundingBadge from '../components/business/FoundingBadge';

/**
 * The badge's whole job is to be absent unless the database issued a number.
 * No business currently holds one, so the live page cannot demonstrate either
 * branch — these do.
 */
const show = (number: number | null | undefined) =>
  render(<MemoryRouter><FoundingBadge number={number} /></MemoryRouter>);

describe('FoundingBadge', () => {
  it('renders nothing without a number — a page cannot claim founding status on its own', () => {
    const { container } = show(null);
    expect(container).toBeEmptyDOMElement();
    expect(show(undefined).container).toBeEmptyDOMElement();
  });

  it('renders nothing for a number outside the programme', () => {
    expect(show(0).container).toBeEmptyDOMElement();
    expect(show(1001).container).toBeEmptyDOMElement();
  });

  it('marks the first hundred as Founding 100', () => {
    show(47);
    expect(screen.getByText('Founding 100')).toBeTruthy();
    expect(screen.getByText('#47')).toBeTruthy();
  });

  it('marks the rest as Founding, still numbered', () => {
    show(640);
    expect(screen.getByText('Founding')).toBeTruthy();
    expect(screen.getByText('#640')).toBeTruthy();
  });

  it('links to the page explaining what the badge means', () => {
    show(12);
    expect(screen.getByRole('link').getAttribute('href')).toBe('/founding');
  });

  it('spells the padded number out for screen readers', () => {
    show(12);
    expect(screen.getByText('Founding No. 00012')).toBeTruthy();
  });
});
