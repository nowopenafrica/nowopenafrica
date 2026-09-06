import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import IndustryDirectory from '../components/home/IndustryDirectory';
import { INDUSTRIES } from '../data/industrySystems';

/**
 * What a visitor sees now that the thirty invented businesses are gone.
 *
 * The risk this guards is not a rendering bug. It is that somebody, faced with
 * an empty-looking directory, seeds demo rows again — so these tests assert the
 * empty state is honest and useful enough that nobody needs to.
 */

const renderIt = (props = {}) => render(
  <MemoryRouter><IndustryDirectory {...props} /></MemoryRouter>,
);

describe('the empty directory', () => {
  it('shows real industries from the platform taxonomy', () => {
    renderIt();
    // Not a hardcoded list — the same source /platform uses, so it cannot drift.
    for (const ind of INDUSTRIES.slice(0, 12)) {
      expect(screen.getAllByText(ind.name).length, ind.name).toBeGreaterThan(0);
    }
  });

  it('says plainly that nothing is listed yet', () => {
    renderIt({ label: 'businesses' });
    expect(screen.getByText(/no businesses listed yet/i)).toBeInTheDocument();
  });

  it('adapts to the listing type it was given', () => {
    renderIt({ label: 'creative services' });
    expect(screen.getByText(/no creative services listed yet/i)).toBeInTheDocument();
  });

  it('offers the owner a way in', () => {
    renderIt();
    const cta = screen.getByRole('link', { name: /list your business/i });
    expect(cta).toHaveAttribute('href', '/waitlist');
  });

  it('states the real number of industries, not a rounded boast', () => {
    renderIt();
    expect(screen.getByText(new RegExp(`see all ${INDUSTRIES.length} industries`, 'i'))).toBeInTheDocument();
  });

  it('invents no business, rating, count or testimonial', () => {
    const { container } = renderIt();
    const text = container.textContent ?? '';
    // The failure this is really guarding: an empty state that fills the space
    // with "trusted by 10,000 businesses" or a fake star rating.
    expect(text).not.toMatch(/\b\d{2,}\+?\s*(businesses|customers|reviews|users)\b/i);
    expect(text).not.toMatch(/★|trusted by|join thousands/i);
  });
});

describe('the empty state is only used when the directory is truly empty', () => {
  it('keeps the filtered-empty message separate on the homepage explorer', () => {
    const src = readFileSync('src/components/home/ListingExplorer.tsx', 'utf8');
    // rows = everything for this type before filtering; visible = after.
    expect(src).toContain('rows.length === 0 ? (');
    expect(src).toContain('<IndustryDirectory');
    // The reset affordance must survive for the case filters caused.
    expect(src).toMatch(/Nothing here/);
  });

  it('keeps the filtered-empty message separate on /businesses', () => {
    const src = readFileSync('src/pages/Businesses.tsx', 'utf8');
    expect(src).toContain('businesses.length === 0 ? (');
    expect(src).toContain('<IndustryDirectory />');
    expect(src).toMatch(/No businesses match your filters/);
  });
});

describe('the seeded demo businesses are gone for good', () => {
  it('has no script that recreates them', () => {
    // The seed file was deleted with this change. If it comes back, so do
    // thirty businesses with invented phone numbers.
    let existed = true;
    try { readFileSync('scripts/sql/seed_30_businesses.sql', 'utf8'); } catch { existed = false; }
    expect(existed, 'scripts/sql/seed_30_businesses.sql is back').toBe(false);
  });

  it('removes them by username rather than by a blanket rule', () => {
    const sql = readFileSync('supabase/migrations/20260906010000_remove_seeded_demo_businesses.sql', 'utf8');
    expect(sql).toContain('mama-put-kitchen');
    // A rule like "delete everything unclaimed" would take real imported
    // listings with it the first time one is added.
    expect(sql).toMatch(/user_id IS NULL/);
    expect(sql).toMatch(/claim_status IS DISTINCT FROM 'claimed'/);
    // The two real businesses must not appear anywhere in the delete list.
    expect(sql).not.toMatch(/'yemzoarts'/);
    expect(sql).not.toMatch(/'nowopen-media-ad-placeements'/);
  });
});
