import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

/**
 * NOWOPEN YOUR BUSINESS — the guards.
 *
 * This is an acquisition campaign, which means it will be pointed at from
 * flyers, QR codes and other people's phones by people who have never heard of
 * NowOpen. Two things therefore matter more here than anywhere else on the
 * site: it must ask for almost nothing, and it must never create or claim
 * anything on somebody's behalf.
 */

const page = readFileSync('src/pages/SendBusiness.tsx', 'utf8');
const nominate = readFileSync('src/pages/Nominate.tsx', 'utf8');
const sql = readFileSync('supabase/migrations/20260907010000_send_business.sql', 'utf8');
const app = readFileSync('src/App.tsx', 'utf8');
const middleware = readFileSync('middleware.ts', 'utf8');
const admin = readFileSync('src/components/admin/ProfileRequests.tsx', 'utf8');

describe('the link works everywhere it is printed', () => {
  it('serves the canonical campaign URL and the aliases people will type', () => {
    for (const path of ['/send-business', '/send-your-business', '/yourbusiness', '/nominate']) {
      expect(app, path).toContain(`path="${path}"`);
    }
  });

  it('points the canonical tag at one of them, so the aliases do not compete', () => {
    expect(page).toMatch(/path: '\/send-business'/);
  });

  it('is reserved, so a crawler is not handed the business-profile renderer', () => {
    for (const slug of ['send-business', 'send-your-business', 'yourbusiness', 'nominate']) {
      expect(middleware, slug).toContain(`'${slug}'`);
    }
  });

  it('is server-rendered for crawlers, because WhatsApp previews run no JavaScript', () => {
    // This is the most-shared link on the site. Without a rendered page its
    // preview is a blank JavaScript shell.
    const render = readFileSync('src/lib/marketingPageRender.ts', 'utf8');
    expect(render).toContain("path: '/send-business'");
    expect(render).toContain("path: '/nominate'");
  });
});

describe('it asks for almost nothing', () => {
  it('needs no account', () => {
    expect(app).not.toMatch(/path="\/send-business"[^>]*ProtectedRoute/);
    expect(page).not.toMatch(/ProtectedRoute|requireAuth/);
    expect(page).not.toMatch(/password/i);
  });

  it('asks three questions, and the nomination asks two', () => {
    const lib = readFileSync('src/lib/acquisition.ts', 'utf8');
    expect((lib.match(/key: '(name|location|contact)'/g) ?? []).length).toBe(3);
    // Name and town is all somebody can honestly supply about a business they
    // do not own. Asking for more invites a guess that then looks like a fact.
    expect(nominate).toContain('nominate-name');
    expect(nominate).toContain('nominate-city');
    expect(nominate).not.toMatch(/nominate-(phone|email|website|category)/);
  });

  it('does not chain .select() onto either insert', () => {
    for (const [label, src, table] of [
      ['send-business', page, "from('profile_requests')"],
      ['nominate', nominate, "from('radar_candidates')"],
    ] as const) {
      const stmt = src.slice(src.indexOf(table));
      expect(stmt.slice(0, stmt.indexOf(';')), label).not.toContain('.select(');
    }
  });
});

describe('it creates nothing public', () => {
  it('never writes a business from either page', () => {
    for (const src of [page, nominate]) {
      expect(src).not.toMatch(/from\('businesses'\)/);
    }
  });

  it('files a nomination as an unscored candidate awaiting a person', () => {
    // Anyone can say a business exists. Saying so must never make it appear.
    expect(nominate).toMatch(/status: 'pending'/);
    expect(nominate).toMatch(/confidence: 0/);
  });

  it('refuses a submission that arrives pre-approved', () => {
    expect(sql).toMatch(/AND status = 'new'/);
    expect(sql).toMatch(/AND business_id IS NULL/);
    expect(sql).toMatch(/AND handled_by IS NULL/);
  });

  it('keeps the queue unreadable by the public', () => {
    // These rows are other people's phone numbers.
    expect(sql).not.toMatch(/FOR SELECT\s+TO anon/);
    expect(sql).toMatch(/IF NOT public\.is_staff\(\) THEN/);
  });
});

describe('it promises only what we can do', () => {
  it('commits to no turnaround, because nobody has committed to one', () => {
    for (const src of [page, nominate]) {
      expect(src).not.toMatch(/within 24 hours|same day|in minutes|by tomorrow/i);
    }
  });

  it('says the owner decides before anything is published', () => {
    expect(page).toMatch(/Nothing is published until you have seen it/);
    expect(page).toMatch(/never invent details/i);
  });

  it('claims no counts, no ratings and no press', () => {
    for (const src of [page, nominate]) {
      expect(src).not.toMatch(/\b\d[\d,]{2,}\s*(businesses|owners|users|members)\b/i);
      expect(src).not.toMatch(/trusted by|as seen in|no\.\s*1/i);
    }
  });
});

describe('the funnel can be read', () => {
  it('counts every tile from a table rather than a literal', () => {
    // A dashboard that opens with plausible-looking numbers is one nobody can
    // trust again once they find out. Zero is the honest answer before launch.
    expect(admin).toMatch(/acquisition_funnel/);
    expect(admin).toMatch(/funnel\.requests_new/);
    expect(admin).not.toMatch(/requests_new:\s*\d+/);
  });

  it('breaks results down by the surface that produced them', () => {
    expect(admin).toMatch(/acquisition_by_source/);
    expect(sql).toMatch(/FUNCTION public\.acquisition_by_source/);
  });

  it('separates a nomination from an owner asking about themselves', () => {
    // Working them identically either pesters a business that never asked, or
    // leaves an owner waiting.
    expect(sql).toMatch(/CHECK \(kind IN \('owner', 'nomination'\)\)/);
    expect(admin).toMatch(/nomination/);
  });
});

describe('the second loop is reachable from the first', () => {
  it('asks for another business at the only moment somebody is this willing', () => {
    expect(page).toMatch(/Know another business\?/);
    expect(page).toMatch(/to="\/nominate"/);
  });

  it('sends an owner who landed on the nomination page to the right one', () => {
    expect(nominate).toMatch(/to="\/send-business"/);
  });
});
