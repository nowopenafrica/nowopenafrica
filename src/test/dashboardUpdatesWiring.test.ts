import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The Updates manager is reachable two ways, the same as Offers: a button on
 * each business card, and /dashboard?open=updates&business=<id> for links from
 * elsewhere (notifications, Universal Create). Both pages are large and shared
 * with other work, so this pins the wiring by source rather than rendering
 * the whole dashboard.
 */
const read = (p: string) => readFileSync(join(process.cwd(), 'src', p), 'utf8');

describe('Business Updates dashboard wiring', () => {
  const dashboard = read('pages/Dashboard.tsx');
  const list = read('components/dashboard/BusinessList.tsx');

  it('opens from ?open=updates', () => {
    expect(dashboard).toMatch(/case 'updates':\s*setUpdatesBusiness\(target\)/);
  });

  it('mounts the manager with the owner flag', () => {
    expect(dashboard).toContain("import UpdatesManager from '../components/dashboard/UpdatesManager'");
    expect(dashboard).toMatch(/<UpdatesManager[\s\S]*?isOwner=\{/);
    expect(dashboard).toContain('onManageUpdates={(business) => setUpdatesBusiness(business)}');
  });

  it('puts a 44px button on each business card', () => {
    expect(list).toContain('onManageUpdates?: (business: Business) => void');
    expect(list).toMatch(/aria-label=\{`Post an update for \$\{business\.name\}`\}[\s\S]{0,200}w-\[44px\] h-\[44px\]/);
  });

  it('lets publishing team members reach Updates from "Shared with you"', () => {
    expect(list).toMatch(/PUBLISHER_ROLES[\s\S]{0,200}includes\(role/);
    expect(list).toContain('Post an update for ${business.name}');
  });
});
