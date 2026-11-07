import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import SuggestedContentNotice from '../components/business/SuggestedContentNotice';
import type { ProvenancedContent } from '../lib/contentProvenance';

const owner: ProvenancedContent = { content_status: 'owner_confirmed', published: true };
const suggested: ProvenancedContent = { content_status: 'suggested', published: true };
const sourced: ProvenancedContent = { content_status: 'source_derived', published: true, source_name: 'CSV import' };

describe('SuggestedContentNotice', () => {
  it('says nothing when everything is the owner\'s own', () => {
    /*
     * The rule that keeps the notice meaningful. A page that always carries a
     * caveat teaches people to stop reading caveats, including the one that
     * matters.
     */
    const { container } = render(<SuggestedContentNotice items={[owner, owner]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('says nothing for an empty list', () => {
    const { container } = render(<SuggestedContentNotice items={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('tells the reader that category suggestions are not confirmed', () => {
    render(<SuggestedContentNotice items={[suggested, suggested]} noun="services" />);
    const text = screen.getByRole('note').textContent ?? '';
    expect(text).toMatch(/typical for this category/i);
    expect(text).toMatch(/has not confirmed/i);
  });

  it('tells them to check before they travel or pay', () => {
    // The instruction is the useful half. "Unverified" alone only worries
    // somebody; "check before you travel or pay" tells them what to do.
    render(<SuggestedContentNotice items={[suggested]} noun="services" />);
    expect(screen.getByRole('note').textContent).toMatch(/before you travel or pay/i);
  });

  it('distinguishes a public source from a category guess', () => {
    render(<SuggestedContentNotice items={[owner, sourced]} noun="services" />);
    const text = screen.getByRole('note').textContent ?? '';
    expect(text).toMatch(/public sources/i);
    expect(text).not.toMatch(/typical for this category/i);
  });

  it('says "some" when only part of the list is unconfirmed', () => {
    render(<SuggestedContentNotice items={[owner, suggested]} noun="services" />);
    expect(screen.getByRole('note').textContent).toMatch(/^some of these/i);
  });

  it('says "these" when the whole list is unconfirmed', () => {
    render(<SuggestedContentNotice items={[suggested, suggested]} noun="services" />);
    expect(screen.getByRole('note').textContent).toMatch(/^these services/i);
  });

  it('covers both cases in one sentence when the list is mixed', () => {
    render(<SuggestedContentNotice items={[suggested, sourced]} noun="offerings" />);
    const text = screen.getByRole('note').textContent ?? '';
    expect(text).toMatch(/public sources or are typical/i);
    expect(text).toMatch(/none has been confirmed/i);
  });

  it('never states as fact that the business offers anything', () => {
    /*
     * A substring check for "offers" is too blunt: the honest sentence is
     * "NowOpen has NOT confirmed that this business offers them", where the
     * word appears inside a negation. The rule being tested is that the claim
     * is never made AFFIRMATIVELY — so wherever it appears, a negation must
     * appear with it.
     */
    for (const items of [[suggested], [sourced], [suggested, sourced]]) {
      const { unmount } = render(<SuggestedContentNotice items={items} noun="services" />);
      const text = (screen.getByRole('note').textContent ?? '').toLowerCase();
      if (text.includes('offers') || text.includes('provides')) {
        expect(
          text.includes('not confirmed') || text.includes('has not'),
          `"${text}" mentions offering without negating it`,
        ).toBe(true);
      }
      unmount();
    }
  });

  it('is a note, not an alert — it is provenance, not a problem', () => {
    render(<SuggestedContentNotice items={[suggested]} />);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('note')).toBeTruthy();
  });
});
