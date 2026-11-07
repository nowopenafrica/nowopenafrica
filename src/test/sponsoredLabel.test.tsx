import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import SponsoredLabel, {
  PAID_PLACEMENTS, isPaidPlacement, type PlacementKind,
} from '../components/promotion/SponsoredLabel';

/**
 * Paid placement must never read as an editorial recommendation.
 *
 * This is the one rule in the revenue work where the failure is invisible:
 * a sponsored card without its label does not error, does not look broken, and
 * does not fail review — it just quietly looks like every organic result next
 * to it. So it gets tests rather than a convention.
 */

describe('every paid placement is disclosed', () => {
  it.each(PAID_PLACEMENTS)('%s renders a visible label', (kind) => {
    render(<SponsoredLabel kind={kind} />);
    const el = screen.getByTitle(/paid/i);
    expect(el.textContent).toMatch(/sponsored|featured|promoted/i);
  });

  it.each(PAID_PLACEMENTS)('%s says plainly that it is not ranked on relevance', (kind) => {
    /*
     * The word alone is not a disclosure — "Featured" reads as praise as
     * easily as it reads as advertising. The explanation is what makes it one,
     * and it has to reach a screen reader too.
     */
    render(<SponsoredLabel kind={kind} />);
    expect(screen.getByTitle(/not ranked by relevance alone/i)).toBeTruthy();
  });

  it('uses each word for the thing it actually means', () => {
    // Interchangeable wording is how a label stops carrying information.
    const text = (kind: PlacementKind) => {
      const { container, unmount } = render(<SponsoredLabel kind={kind} />);
      const t = container.textContent ?? '';
      unmount();
      return t;
    };
    expect(text('sponsored')).toMatch(/paid for this position/i);
    expect(text('featured')).toMatch(/paid to be surfaced/i);
    expect(text('promoted')).toMatch(/paid to amplify/i);
  });
});

describe('organic placement is left alone', () => {
  it('renders nothing at all', () => {
    // An unpaid listing wearing a "Featured" badge is the same dishonesty
    // pointed the other way.
    const { container } = render(<SponsoredLabel kind="organic" />);
    expect(container.innerHTML).toBe('');
  });

  it('is not counted as paid', () => {
    expect(isPaidPlacement('organic')).toBe(false);
    for (const kind of PAID_PLACEMENTS) expect(isPaidPlacement(kind)).toBe(true);
  });
});

describe('the label cannot be quietly dropped', () => {
  /**
   * Every file that renders a promotion must go through this component.
   *
   * A component nobody is required to use is a suggestion. This walks the
   * source and fails if a file works with paid placement kinds while rendering
   * no label — which is exactly the change a hurried card would make.
   */
  function walk(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full, out);
      else if (/\.tsx$/.test(full) && !/\.test\.tsx$/.test(full)) out.push(full);
    }
    return out;
  }

  it('is imported by anything that renders a sponsored, featured or promoted card', () => {
    const offenders: string[] = [];
    for (const file of walk('src')) {
      const src = readFileSync(file, 'utf8');
      if (file.endsWith('SponsoredLabel.tsx')) continue;

      // Does this file deal in paid placement at all?
      const touchesPaid = /placementKind|PlacementKind|isPaidPlacement|'sponsored'|"sponsored"/.test(src);
      if (!touchesPaid) continue;

      if (!/SponsoredLabel/.test(src)) offenders.push(file);
    }

    expect(
      offenders,
      `these render paid placement without the disclosure component: ${offenders.join(', ')}`,
    ).toEqual([]);
  });
});
