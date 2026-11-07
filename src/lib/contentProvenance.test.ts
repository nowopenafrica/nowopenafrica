import { describe, it, expect } from 'vitest';
import {
  isPubliclyVisible, needsConfirmationLabel, confirmationLabel,
  provenanceExplanation, attribution, orderByConfidence, publicContent,
  statusOf, type ProvenancedContent, type ContentStatus,
} from './contentProvenance';

const item = (over: Partial<ProvenancedContent> = {}): ProvenancedContent => ({
  content_status: 'owner_confirmed', published: true, ...over,
});

describe('isPubliclyVisible', () => {
  it('shows what the owner or a named source stands behind', () => {
    expect(isPubliclyVisible(item({ content_status: 'owner_confirmed' }))).toBe(true);
    expect(isPubliclyVisible(item({ content_status: 'source_derived' }))).toBe(true);
    expect(isPubliclyVisible(item({ content_status: 'illustrative' }))).toBe(true);
  });

  it('shows a suggestion only once a human has published it', () => {
    /*
     * The engine writes suggestions unpublished, and a database trigger refuses
     * generated content that arrives already published. So the protection is
     * not hiding the suggestion — it is that a person chose to show it, and
     * that it still says what it is (see the labelling tests below).
     */
    expect(isPubliclyVisible(item({ content_status: 'suggested', published: false }))).toBe(false);
    expect(isPubliclyVisible(item({ content_status: 'suggested', published: true }))).toBe(true);
  });

  it('never shows content that is known to be unshowable', () => {
    // These three are excluded whatever the publish flag says.
    for (const status of ['pending_review', 'rejected', 'outdated'] as const) {
      expect(isPubliclyVisible(item({ content_status: status, published: true })), status).toBe(false);
    }
  });

  it('respects the published switch whatever the status says', () => {
    // A reviewer unpublishing something must win over its status.
    expect(isPubliclyVisible(item({ content_status: 'owner_confirmed', published: false }))).toBe(false);
  });

  it('treats a row with no status as owner content, as it was before', () => {
    // 543 services predate these columns. They must not vanish.
    expect(isPubliclyVisible({ published: true })).toBe(true);
    expect(statusOf({})).toBe('owner_confirmed');
  });

  it('is false for nothing at all', () => {
    expect(isPubliclyVisible(null)).toBe(false);
    expect(isPubliclyVisible(undefined)).toBe(false);
  });
});

describe('needsConfirmationLabel', () => {
  it('leaves the owner\'s own entries unlabelled', () => {
    // Covering the page in warnings teaches people to ignore all of them.
    expect(needsConfirmationLabel(item({ content_status: 'owner_confirmed' }))).toBe(false);
  });

  it('labels anything nobody at the business has confirmed', () => {
    expect(needsConfirmationLabel(item({ content_status: 'source_derived' }))).toBe(true);
    expect(confirmationLabel(item({ content_status: 'source_derived' })))
      .toMatch(/not yet confirmed/i);
  });

  it('labels an illustrative image as not being this business', () => {
    expect(confirmationLabel(item({ content_status: 'illustrative' })))
      .toMatch(/not this business/i);
  });

  it('always labels a published suggestion as typical rather than confirmed', () => {
    /*
     * The sentence that makes publishing a suggestion honest. It describes the
     * CATEGORY, never this business, and it tells the reader what to do next.
     */
    const label = confirmationLabel(item({ content_status: 'suggested', published: true })) ?? '';
    expect(label).toMatch(/typical for this category/i);
    expect(label).toMatch(/confirm with the business/i);
    // Never the words that would turn a category note into a claim
    // about THIS business.
    expect(label.toLowerCase().includes('offers')).toBe(false);
    expect(label.toLowerCase().includes('provides')).toBe(false);
  });

  it('does not label what the visitor cannot see', () => {
    expect(needsConfirmationLabel(item({ content_status: 'rejected', published: true }))).toBe(false);
    expect(confirmationLabel(item({ content_status: 'pending_review' }))).toBeNull();
  });

  it('honours an explicit requires_confirmation flag', () => {
    expect(needsConfirmationLabel(item({ requires_confirmation: true }))).toBe(false); // owner content
    expect(needsConfirmationLabel(item({ content_status: 'source_derived', requires_confirmation: true }))).toBe(true);
  });
});

describe('provenanceExplanation', () => {
  it('names the source when it has one', () => {
    expect(provenanceExplanation(item({ content_status: 'source_derived', source_name: 'CSV import' })))
      .toMatch(/taken from CSV import/i);
  });

  it('does not invent a source name when there is none', () => {
    const text = provenanceExplanation(item({ content_status: 'source_derived' })) ?? '';
    expect(text).toMatch(/a public source/i);
    expect(text).not.toMatch(/undefined|null/);
  });

  it('says an illustrative image is not a photograph of this business', () => {
    expect(provenanceExplanation(item({ content_status: 'illustrative' })))
      .toMatch(/not a photograph of this business/i);
  });

  it('says nothing about the owner\'s own content', () => {
    expect(provenanceExplanation(item())).toBeNull();
  });
});

describe('attribution', () => {
  it('returns the source and its link', () => {
    expect(attribution(item({ content_status: 'source_derived', source_name: 'Wikidata', source_url: 'https://example.com' })))
      .toEqual({ label: 'Wikidata', href: 'https://example.com' });
  });

  it('refuses to attribute content that cannot name its source', () => {
    // Content claiming a source it cannot name is worse than claiming none.
    expect(attribution(item({ content_status: 'source_derived' }))).toBeNull();
    expect(attribution(item({ content_status: 'source_derived', source_name: '   ' }))).toBeNull();
  });

  it('does not attribute owner content to a source', () => {
    expect(attribution(item({ content_status: 'owner_confirmed', source_name: 'CSV import' }))).toBeNull();
  });
});

describe('ordering', () => {
  it('puts what the business stands behind first', () => {
    const list = [
      { id: 'src', content_status: 'source_derived' as ContentStatus, published: true },
      { id: 'own', content_status: 'owner_confirmed' as ContentStatus, published: true },
    ];
    expect(orderByConfidence(list).map((x) => x.id)).toEqual(['own', 'src']);
  });

  it('is stable within a confidence tier, so display order is not scrambled', () => {
    const list = ['a', 'b', 'c'].map((id) => ({ id, content_status: 'source_derived' as ContentStatus, published: true }));
    expect(orderByConfidence(list).map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });

  it('publicContent filters and orders in one pass', () => {
    const list = [
      { id: 'guess', content_status: 'suggested' as ContentStatus, published: true },
      { id: 'src', content_status: 'source_derived' as ContentStatus, published: true },
      { id: 'own', content_status: 'owner_confirmed' as ContentStatus, published: true },
      { id: 'hidden', content_status: 'owner_confirmed' as ContentStatus, published: false },
    ];
    /*
     * The guess is shown LAST, after everything the business or a named source
     * stands behind. A reader scanning the list meets the confirmed content
     * first, without a single warning badge being needed to achieve it.
     */
    expect(publicContent(list).map((x) => x.id)).toEqual(['own', 'src', 'guess']);
  });

  it('copes with a missing list', () => {
    expect(publicContent(null)).toEqual([]);
    expect(publicContent(undefined)).toEqual([]);
  });
});
