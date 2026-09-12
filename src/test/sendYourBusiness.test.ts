import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

/**
 * Guards for the acquisition front door.
 *
 * "Send us your business name. We'll set up your NowOpen profile." only works
 * if three things stay true: it needs no account, it cannot create a listing,
 * and somebody actually works the queue. Each is easy to break later without
 * noticing, so each is asserted here.
 */

const form = readFileSync('src/components/home/SendYourBusiness.tsx', 'utf8');
const sql = readFileSync('supabase/migrations/20260906050000_profile_requests.sql', 'utf8');
const home = readFileSync('src/pages/Home.tsx', 'utf8');

describe('the form asks for as little as possible', () => {
  it('takes a name and one contact, and nothing else', () => {
    const inputs = form.match(/<input/g) ?? [];
    expect(inputs).toHaveLength(2);
    // No dropdown asking somebody to classify their own phone number.
    expect(form).not.toContain('<select');
  });

  it('accepts whatever contact the person actually has', () => {
    expect(form).toMatch(/WhatsApp, phone or Instagram/);
  });

  it('never asks for an account', () => {
    expect(form).not.toMatch(/useAuth|signIn|requireAuth|user\?\./);
  });
});

describe('the insert cannot trip the RLS trap', () => {
  it('does not chain .select() onto the insert', () => {
    // profile_requests is insert-only to the public. Asking for the row back
    // makes RLS refuse the whole statement, and the error blames the insert.
    const insert = form.slice(form.indexOf("from('profile_requests')"));
    const stmt = insert.slice(0, insert.indexOf(';'));
    expect(stmt).toContain('.insert(');
    expect(stmt).not.toContain('.select(');
  });

  it('is insert-only to the public in the policy too', () => {
    expect(sql).toMatch(/CREATE POLICY "profile_requests_public_insert"[\s\S]*?FOR INSERT/);
    // No anon SELECT policy: these rows are other people's contact details.
    expect(sql).not.toMatch(/FOR SELECT\s+TO anon/);
    expect(sql).toMatch(/profile_requests_staff_read[\s\S]*?USING \(public\.is_staff\(\)\)/);
  });
});

describe('a request is not a business', () => {
  it('cannot arrive already approved or attached to a listing', () => {
    expect(sql).toMatch(/AND status = 'new'/);
    expect(sql).toMatch(/AND business_id IS NULL/);
    expect(sql).toMatch(/AND handled_by IS NULL/);
  });

  it('rejects an empty name or contact at the database, not just the form', () => {
    expect(sql).toMatch(/btrim\(business_name\) <> ''/);
    expect(sql).toMatch(/btrim\(contact\) <> ''/);
  });

  it('promises nothing goes live unclaimed', () => {
    expect(form).toMatch(/Nothing goes live until you have seen it and claimed it/);
  });
});

describe('it is on the homepage and it is measured', () => {
  it('sits in the directory section, not buried on /waitlist', () => {
    expect(home).toContain('<SendYourBusiness');
    // A declared fallback, used only when the visit carries no attribution of
    // its own — crediting "homepage" for a visitor who arrived from Instagram
    // would credit the page they landed on rather than the thing that worked.
    expect(home).toMatch(/fallbackSource="[a-z]+"/);
  });

  it('emits an event, so the funnel can show whether it works', () => {
    expect(form).toMatch(/track\('profile_requested'/);
    const telemetry = readFileSync('src/lib/telemetry.ts', 'utf8');
    expect(telemetry).toContain("'profile_requested'");
  });
});

describe('somebody can work the queue', () => {
  const panel = readFileSync('src/components/admin/ProfileRequests.tsx', 'utf8');

  it('shows how many are waiting', () => {
    expect(panel).toMatch(/waiting/);
    expect(panel).toMatch(/status === 'new'/);
  });

  it('can move a request through to live, or close it honestly', () => {
    for (const s of ['new', 'contacted', 'building', 'live', 'declined']) {
      expect(panel, s).toContain(`'${s}'`);
    }
  });

  it('is reachable by an editor, not only an admin', () => {
    const perms = readFileSync('src/lib/permissions.ts', 'utf8');
    const editorTabs = perms.slice(perms.indexOf('export const EDITOR_TABS'));
    expect(editorTabs.slice(0, 600)).toContain("'profile-requests'");
  });
});
