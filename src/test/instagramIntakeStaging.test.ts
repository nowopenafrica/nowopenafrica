import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/*
 * MEASURED 2026-10-12 against the live queue: the newest public Instagram
 * candidate ("Palton Morgan Holdings") had profile = {"instagram": "..."} —
 * one key. The twelve posts and the account metrics had already been fetched
 * from Meta, at the cost of real quota, and were then discarded.
 */
const RAW = readFileSync('supabase/functions/instagram-intake/index.ts', 'utf8');

/*
 * Comments are prose, not code. The comment explaining WHY logo_url is not
 * staged contains the words "logo_url", and a scanner that cannot tell the two
 * apart reports the documentation as the defect. Fourth time this exact trap
 * has fired today.
 */
const INTAKE = RAW
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter((line) => !line.trim().startsWith('//'))
  .join('\n');

describe('the public Instagram intake keeps what it fetched', () => {
  it('stages the recent posts under the key the publish trigger reads', () => {
    expect(INTAKE).toMatch(/instagram_recent_posts/);
    // The trigger does `btrim(e #>> '{}')` — an array of permalink STRINGS.
    expect(INTAKE).toMatch(/m\.permalink/);
    expect(INTAKE).toMatch(/\.slice\(0, 12\)/);
  });

  it('reads a category from the account\'s own words', () => {
    expect(INTAKE).toMatch(/categoryFromSelfDescription/);
    expect(INTAKE).toMatch(/category: readCategory\?\.category \?\? null/);
  });

  /*
   * The rights gate, and the reason this is not simply "store everything".
   * radar_sources.image_reuse_allowed = 'prohibited' for public_instagram,
   * and Meta's CDN addresses expire within days.
   */
  it('never stages a Meta image as the listing logo or cover', () => {
    expect(INTAKE).not.toMatch(/\blogo_url\b/);
    expect(INTAKE).not.toMatch(/\bcover_image_url\b/);
    expect(INTAKE).not.toMatch(/\bimage_url\b/);
    // Kept for the reviewer, under a key the publish whitelist cannot reach.
    expect(INTAKE).toMatch(/instagram_profile_picture_url/);
  });

  /*
   * The admin extractor stages `about`, services and products only after an
   * operator confirms the business authored them. This endpoint is anonymous,
   * so nobody has confirmed anything.
   */
  it('does not stage owner-authored fields nobody has confirmed', () => {
    expect(INTAKE).not.toMatch(/staged\.about\b/);
    expect(INTAKE).not.toMatch(/services_json/);
    expect(INTAKE).not.toMatch(/products_json/);
  });

  it('records provenance so a reviewer can age the data', () => {
    expect(INTAKE).toMatch(/retrieved_at/);
    expect(INTAKE).toMatch(/instagram_followers/);
  });
});
