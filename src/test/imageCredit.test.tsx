import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { render, screen } from '@testing-library/react';
import ImageCredit, { requiresCredit } from '../components/business/ImageCredit';

/**
 * The credit line carries a licence obligation and an honesty obligation.
 *
 * MEASURED 2026-09-23: images recovered from Wikimedia Commons arrived under
 * CC BY-SA 3.0 and 4.0 — licences that REQUIRE the author and licence to be
 * displayed wherever the work is shown. And 2,851 of 3,167 unclaimed
 * businesses display a stock photograph with nothing saying so.
 *
 * Storing a credit in a column and never rendering it is not compliance; it is
 * a breach with a paper trail. These tests are what stops that regressing.
 */

describe('a licensed photograph is always credited', () => {
  it('shows the author and licence', () => {
    render(
      <ImageCredit
        source="business"
        licence="CC BY-SA 4.0"
        attribution="OtuNwachinemere · CC BY-SA 4.0 · via Wikimedia Commons"
      />,
    );
    expect(screen.getByText(/OtuNwachinemere/)).toBeTruthy();
    expect(screen.getByText(/CC BY-SA 4\.0/)).toBeTruthy();
  });

  it('links the source so the claim is checkable', () => {
    render(
      <ImageCredit
        source="business"
        licence="CC BY-SA 4.0"
        attribution="A. Name · CC BY-SA 4.0"
        sourceUrl="https://www.wikidata.org/wiki/Q123"
      />,
    );
    const link = screen.getByRole('link', { name: /source/i });
    expect(link.getAttribute('href')).toBe('https://www.wikidata.org/wiki/Q123');
    // Outbound to a third party: no referrer leak, no endorsement.
    expect(link.getAttribute('rel')).toMatch(/noopener/);
    expect(link.getAttribute('rel')).toMatch(/nofollow/);
  });

  it.each([
    ['CC BY-SA 4.0', true],
    ['CC BY 3.0', true],
    ['CC BY-SA 3.0', true],
    ['Share-alike', true],
    ['CC0', false],
    ['Public domain', false],
    [null, false],
  ])('requiresCredit(%s) is %s', (licence, expected) => {
    expect(requiresCredit(licence as string | null)).toBe(expected);
  });
});

describe('a stock photograph says it is not this business', () => {
  it('states the fact in words a visitor can parse', () => {
    /*
     * "Stock image" is jargon that reads as a category, not a caveat. The
     * thing a visitor needs to know is that the building in the picture is not
     * the one they would walk into.
     */
    render(<ImageCredit source="stock" />);
    expect(screen.getByText(/not a picture of this business/i)).toBeTruthy();
  });

  it('marks the element with its provenance for auditing', () => {
    const { container } = render(<ImageCredit source="stock" />);
    expect(container.querySelector('[data-image-credit="stock"]')).toBeTruthy();
  });
});

describe('the business’s own photograph is left alone', () => {
  it('renders nothing when there is nothing to disclose', () => {
    /*
     * A picture taken from the business's own website is theirs and is of
     * them. A caveat there would be noise on the one case that is simply fine
     * — and noise trains people to ignore the cases that are not.
     */
    const { container } = render(<ImageCredit source="business" />);
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing for an unknown source with no credit', () => {
    const { container } = render(<ImageCredit source="unknown" />);
    expect(container.innerHTML).toBe('');
  });

  it('still credits an owner upload that carries a licence', () => {
    render(<ImageCredit source="owner" attribution="Studio X · CC BY 4.0" licence="CC BY 4.0" />);
    expect(screen.getByText(/Studio X/)).toBeTruthy();
  });
});

/*
 * ── THE WIRING, NOT THE COMPONENT ────────────────────────────────────────
 *
 * The tests above prove ImageCredit says the right thing. They passed
 * throughout a period when the caveat appeared on ZERO of the 2,708 listings
 * that needed it, because the bug was in the three lines joining the data to
 * the component, in BusinessDetail.tsx:
 *
 *   1. the block was gated on `image_attribution`, and the Pexels licence
 *      requires no attribution — so all 2,763 stock covers stored none and
 *      the block never rendered at all;
 *   2. `source` was hardcoded to "business", which ImageCredit deliberately
 *      treats as "nothing to say".
 *
 * A correct component plus correct data still showed a stock photograph of
 * somewhere else above a real business's name with nothing saying so. These
 * assertions are about the join.
 */
describe('BusinessDetail passes provenance through', () => {
  const source = readFileSync('src/pages/BusinessDetail.tsx', 'utf8');

  it('does not hardcode the image source', () => {
    // `source="business"` silences the caveat for every stock photo.
    expect(source).not.toMatch(/<ImageCredit[\s\S]{0,200}?source="business"/);
  });

  it('reads the source from the row', () => {
    expect(source).toMatch(/<ImageCredit[\s\S]{0,200}?source=\{business\.image_source/);
  });

  it('labels a stock cover exactly once', () => {
    /*
     * Two mechanisms exist and only one should speak.
     *
     * `isStockPlaceholder` matches images.pexels.com by HOST, so it catches
     * every stock cover whatever the columns say — that is the one that
     * labels them, with "Stock photo — not this business". ImageCredit here
     * carries the LICENCE credit (Wikimedia CC BY-SA), a different obligation
     * with a different sentence.
     *
     * Adding `image_source === 'stock'` to this gate put two notices on the
     * same image; measured in the browser, both rendered. The data said
     * 2,708 rows were stock and I concluded they were unlabelled without
     * checking the other render.
     */
    const credit = source.slice(source.indexOf('<ImageCredit'));
    expect(credit.slice(0, 400), 'the licence credit must not also claim the stock caveat')
      .not.toMatch(/image_source\s*===\s*'stock'/);
  });

  it('still labels stock covers somewhere', () => {
    // Removing BOTH mechanisms would be silent, and worse than a duplicate.
    expect(source).toMatch(/isStockPlaceholder\(/);
    expect(source).toMatch(/STOCK_COVER_NOTICE/);
  });
});
