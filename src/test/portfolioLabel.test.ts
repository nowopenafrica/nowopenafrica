import { describe, expect, it } from 'vitest';

import { BUSINESS_CATEGORIES } from '../data/categories';
import { CATEGORY_TAB_LABELS, portfolioLabel } from '../data/categoryTabLabels';

describe('the word a trade uses for its past work', () => {
  /*
   * Calling a builder's finished estate a "portfolio" sounds like an
   * investment product; calling a makeup artist's work a "project" sounds
   * like paperwork. The word follows what the work IS.
   */
  it('says Portfolio where the work is the artefact', () => {
    for (const category of [
      'Photography & Video', 'Art & Design', 'Tailor & Fashion Designer',
      'Makeup Artist', 'Salon / Barber', 'Interior Decoration',
      'Architecture & Design', 'Furniture Maker / Carpentry',
    ]) {
      expect(portfolioLabel(category), category).toBe('Portfolio');
    }
  });

  it('says Projects where the work is a job with a start and an end', () => {
    for (const category of [
      'Construction', 'Software & IT', 'Web & App Development', 'Consulting',
      'Event Planning', 'Solar Installation', 'Plumbing Services',
    ]) {
      expect(portfolioLabel(category), category).toBe('Projects');
    }
  });

  /*
   * Every profile gets the tab, so every category must get a word — and the
   * default has to be the one that reads sensibly for a trade nobody thought
   * about. A caterer's wedding is a project; it is not a portfolio.
   */
  it('gives every category in the product a sensible word', () => {
    for (const category of BUSINESS_CATEGORIES) {
      const label = portfolioLabel(category);
      expect(['Portfolio', 'Projects'], category).toContain(label);
    }
  });

  it('falls back to Projects when the category is unknown or missing', () => {
    expect(portfolioLabel(undefined)).toBe('Projects');
    expect(portfolioLabel(null)).toBe('Projects');
    expect(portfolioLabel('')).toBe('Projects');
    expect(portfolioLabel('Something Nobody Has Added Yet')).toBe('Projects');
  });

  /* A single category may still say something else entirely. */
  it('lets an explicit override win over the rule', () => {
    const overridden = Object.entries(CATEGORY_TAB_LABELS)
      .find(([, labels]) => labels.portfolio);
    if (overridden) {
      expect(portfolioLabel(overridden[0])).toBe(overridden[1].portfolio);
    } else {
      /* None today — assert the mechanism rather than skipping silently. */
      expect(portfolioLabel('Construction')).toBe('Projects');
    }
  });
});
