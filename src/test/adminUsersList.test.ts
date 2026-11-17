/**
 * The admin Users tab must list phone-only registrations too.
 *
 * A phone signup creates a profile row with `email = NULL` and the number in
 * `phone`. The table used to render only `u.email`, so those accounts appeared
 * as a blank row — present in the list, but impossible to identify or search
 * for. This guards the contact fallback, the search fields and the badge.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const DASHBOARD = 'src/pages/AdminDashboard.tsx';
const dashboard = readFileSync(DASHBOARD, 'utf8');

describe('admin Users tab includes phone registrations', () => {
  it('falls back to the phone number when there is no email', () => {
    expect(dashboard).toMatch(/\{u\.email \|\| u\.phone \|\| '—'\}/);
  });

  it('labels phone-only accounts', () => {
    expect(dashboard).toMatch(/!u\.email && u\.phone/);
    expect(dashboard).toMatch(/Registered with a phone number/);
  });

  it('searches by phone number as well as email', () => {
    expect(dashboard).toMatch(/match\(u\.email, u\.phone, u\.name, u\.role\)/);
  });

  it('resolves other tabs (subscriptions, deletion requests) by email or phone', () => {
    expect(dashboard).toMatch(/u\.email \|\| u\.phone/);
    expect(dashboard).toMatch(/userContactById/);
    expect(dashboard).not.toMatch(/userEmailById/);
  });
});
