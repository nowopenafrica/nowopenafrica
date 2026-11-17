import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * "Happening on NowOpen" sits on Discover above the rails, only when the
 * visitor is not searching or filtering, and ranks kept businesses first
 * within the hour. Keeps shows "New today" above the list of kept businesses.
 * Both pages are shared with other work, so the wiring is pinned by source.
 */
const read = (p: string) => readFileSync(join(process.cwd(), 'src', p), 'utf8');

describe('Discover and Keeps wiring for Business Updates', () => {
  const discover = read('pages/Discover.tsx');
  const keeps = read('pages/Keeps.tsx');

  it('imports the row on Discover', () => {
    expect(discover).toContain("import HappeningRow from '../components/updates/HappeningRow'");
  });

  it('renders it above the rails, only when not filtering, with kept businesses for ranking', () => {
    const row = discover.indexOf('<HappeningRow');
    const rails = discover.indexOf('rails.map(');
    expect(row).toBeGreaterThan(0);
    expect(row).toBeLessThan(rails);
    expect(discover.slice(Math.max(0, row - 200), row)).toMatch(/!filtering/);
    expect(discover.slice(row, row + 400)).toMatch(/rankContext=\{happeningContext\}/);
    expect(discover.slice(row, row + 400)).toMatch(/perBusiness=\{2\}/);
    expect(discover).toMatch(/const happeningContext = useMemo\([\s\S]{0,200}kept\.map/);
  });

  it('shows "New today" on Keeps above the kept list', () => {
    expect(keeps).toContain("import KeptUpdates from '../components/updates/KeptUpdates'");
    expect(keeps.indexOf('<KeptUpdates')).toBeGreaterThan(0);
    expect(keeps.indexOf('<KeptUpdates')).toBeLessThan(keeps.indexOf('<MyKeeps'));
  });
});
