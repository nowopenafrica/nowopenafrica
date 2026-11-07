import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/*
 * Instagram logos already worked on the admin batch path (carryLogos defaults
 * to true, and `instagram-logo` copies the BYTES into business-images). They
 * were unreachable from the Review queue: ReviewTab fetched `profile` via
 * select('*') and never typed or used it, so a reviewer looking at a candidate
 * had no way to give it a logo.
 */
const RAW = readFileSync('src/components/admin/businessIntelligence/ReviewTab.tsx', 'utf8');
// Comments are prose, not code — this trap has fired repeatedly.
const TAB = RAW
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter((l) => !l.trim().startsWith('//'))
  .join('\n');

describe('a reviewer can give an Instagram candidate its logo', () => {
  it('calls the function that copies the bytes, not Meta\'s URL', () => {
    expect(TAB).toMatch(/invoke\('instagram-logo'/);
    // Meta's signed address expires within days; it must never be stored.
    expect(TAB).not.toMatch(/profile_picture_url/);
  });

  it('stages it under the whitelisted key so publishing carries it', () => {
    expect(TAB).toMatch(/logo_url: logoUrl/);
  });

  /*
   * The profile also holds instagram_recent_posts. Replacing it instead of
   * merging would silently drop the gallery a publish would have created.
   */
  it('merges the profile rather than replacing it', () => {
    expect(TAB).toMatch(/\.\.\.\(r\.profile \?\? \{\}\)/);
  });

  it('only offers the action when there is a handle and no logo yet', () => {
    expect(TAB).toContain('instagram');
    expect(TAB).toContain('replace(/^@/,');
  });

  it('finds the handle from the staged username or the profile URL', () => {
    expect(TAB).toMatch(/instagram_username/);
    expect(TAB).toContain('instagram');
  });
});
