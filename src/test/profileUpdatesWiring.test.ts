import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The public Updates strip sits on the business profile above the tab bar,
 * never on sample listings, and owns ?update=<id> so a shared link opens one
 * update. BusinessDetail is 2,800+ lines and shared with other work, so the
 * wiring is pinned by source rather than by rendering the page.
 */
const page = readFileSync(join(process.cwd(), 'src', 'pages', 'BusinessDetail.tsx'), 'utf8');

describe('Business profile Updates wiring', () => {
  it('imports the strip', () => {
    expect(page).toContain("import UpdatesStrip from '../components/updates/UpdatesStrip'");
  });

  it('renders it before the tab bar, and never for sample listings', () => {
    const strip = page.indexOf('<UpdatesStrip');
    const tabs = page.indexOf('role="tablist" aria-label="Business sections"');
    expect(strip).toBeGreaterThan(0);
    expect(strip).toBeLessThan(tabs);
    expect(page.slice(Math.max(0, strip - 200), strip)).toMatch(/!isSample/);
  });

  it('owns the ?update= search param without filling the history', () => {
    expect(page).toMatch(/openUpdateId=\{searchParams\.get\('update'\)\}/);
    expect(page).toMatch(/next\.(set|delete)\('update'[\s\S]{0,200}replace: true/);
  });

  it('starts afresh for each business, so nothing carries over on navigation', () => {
    expect(page).toMatch(/<UpdatesStrip\s+key=\{String\(business\.id\)\}/);
  });
});
