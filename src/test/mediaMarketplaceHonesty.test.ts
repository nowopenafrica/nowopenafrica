import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/*
 * MEASURED 2026-10-14 against https://www.nowopenafrica.com/media — the live
 * site, not the dev server:
 *
 *   18 creative studios rendered, ratings 4.4 to 4.9
 *   1,152 reviews claimed between them, 2,396 clients served
 *   media_reviews: 0 rows
 *   every one: user_id NULL, all created the same day
 *
 * They were invented. The page said otherwise to every visitor.
 *
 * The code believed this was handled: Media.tsx carried a comment saying the
 * samples were "gated to DEV" and the section "reads empty in production on
 * purpose". That was true of the GENERATOR and never of the READER, and dev
 * and production share one Supabase project — so a dev session put invented
 * businesses in front of the public permanently.
 */
const strip = (s: string) => s
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n');

/* The creator marketplace moved off /media to /media/services. */
const MEDIA = strip(readFileSync('src/pages/MediaServices.tsx', 'utf8'));
const MIGRATION = readFileSync('supabase/migrations/20261105010000_media_services_sample_flag.sql', 'utf8');

describe('the public marketplace never serves seeded businesses', () => {
  it('filters samples out in the query, not after it', () => {
    expect(MEDIA).toMatch(/\.eq\('is_sample', false\)/);
  });

  /*
   * The gate has to be in the data. A client-side gate is what failed here:
   * it stopped generation and the reader never knew.
   */
  it('keeps the flag on the row, with a default that fails safe', () => {
    expect(MIGRATION).toMatch(/add column if not exists is_sample boolean not null default false/);
    expect(MIGRATION).toMatch(/set is_sample = true/);
  });

  it('stops the next ownerless seed becoming public', () => {
    expect(MIGRATION).toMatch(/check \(user_id is not null or is_sample\)/);
  });

  /* Reversible. Eighteen production rows are not deleted to fix a label. */
  it('hides them rather than deleting them', () => {
    expect(MIGRATION).not.toMatch(/\bdelete\s+from\b/i);
    expect(MIGRATION).not.toMatch(/\btruncate\b/i);
  });
});

describe('a star is a claim about customers', () => {
  it('shows a rating only when reviews exist', () => {
    expect(MEDIA).toMatch(/\(service\.review_count \?\? 0\) > 0/);
  });

  /*
   * The old line was `(service.rating || 0).toFixed(1)` beside a filled star,
   * which renders a score for a listing nobody has reviewed.
   */
  it('no longer renders a score for a listing with no reviews', () => {
    expect(MEDIA).not.toMatch(/\(service\.rating \|\| 0\)\.toFixed/);
    expect(MEDIA).toMatch(/No reviews yet/);
  });
});
