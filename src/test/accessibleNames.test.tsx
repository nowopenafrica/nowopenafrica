import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import LocationAutocomplete from '../components/LocationAutocomplete';

/**
 * Every control a visitor can operate has to say what it is.
 *
 * Measured on production: `/` and `/businesses` each had two inputs with no
 * accessible name — the directory's search box and the location filter. Both
 * relied on a placeholder, and a placeholder is not a name: it is not reliably
 * exposed as one, and it disappears the moment somebody types. The category
 * `<select>` sitting between them already carried an `aria-label`, so the
 * pattern was understood; it simply had not been applied to its neighbours.
 *
 * The location field was the worse of the two. It declares
 * `role="combobox"` with `aria-expanded` and `aria-autocomplete` — a role that
 * promises a name — and had none, so a screen reader announced "combobox" and
 * nothing about what it filtered.
 */

describe('the location combobox has a name', () => {
  it('carries one by default', () => {
    render(<LocationAutocomplete value="" onChange={() => {}} />);
    expect(screen.getByRole('combobox', { name: /filter by location/i })).toBeInTheDocument();
  });

  it('lets a caller say something more accurate', () => {
    // Discover's placeholder is just "Anywhere", which describes the empty
    // value rather than the field.
    render(<LocationAutocomplete value="" onChange={() => {}} ariaLabel="Filter by place" />);
    expect(screen.getByRole('combobox', { name: /filter by place/i })).toBeInTheDocument();
  });

  it('keeps the name once the placeholder is gone', () => {
    /*
     * The whole reason a placeholder cannot serve as the name: it vanishes on
     * the first keystroke, and the control must still be identifiable.
     */
    render(<LocationAutocomplete value="Lagos" onChange={() => {}} />);
    const box = screen.getByRole('combobox', { name: /filter by location/i });
    expect(box).toHaveValue('Lagos');
  });

  it('still declares the combobox contract it promises', () => {
    render(<LocationAutocomplete value="" onChange={() => {}} />);
    const box = screen.getByRole('combobox');
    expect(box).toHaveAttribute('aria-expanded');
    expect(box).toHaveAttribute('aria-autocomplete', 'list');
  });
});

describe('the directory search box has a name', () => {
  const src = readFileSync('src/pages/Businesses.tsx', 'utf8');

  it('is labelled, not just placeheld', () => {
    expect(src).toContain('aria-label="Search businesses"');
  });

  it('says why, so nobody removes it as redundant', () => {
    expect(src).toMatch(/A placeholder is not an accessible name/);
  });
});

describe('every LocationAutocomplete call site ends up named', () => {
  for (const path of [
    'src/pages/Businesses.tsx',
    'src/pages/Adverts.tsx',
    'src/pages/Discover.tsx',
  ]) {
    it(`${path} passes a name or inherits the default`, () => {
      const src = readFileSync(path, 'utf8');
      // Either an explicit ariaLabel, or the component's own default — both
      // produce a name. What must never happen is the component losing its
      // default, which would silently un-name all three at once.
      expect(src).toContain('<LocationAutocomplete');
      const component = readFileSync('src/components/LocationAutocomplete.tsx', 'utf8');
      expect(component).toContain("ariaLabel = 'Filter by location'");
      expect(component).toContain('aria-label={ariaLabel}');
    });
  }
});
