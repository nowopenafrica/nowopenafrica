import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

import {
  checkWebsite, websiteHref, websiteLabel, isPlaceholderValue, blankIfPlaceholder,
  PLACEHOLDER_VALUES,
} from './webLink';

/**
 * The bug this prevents was live on 85 business profiles.
 *
 * `website = 'UNKNOWN'` was rendered as `href="UNKNOWN"`, which a browser
 * resolves as a RELATIVE path — so "Website" took a visitor to a not-found
 * page inside NowOpen, and the business looked broken because of our data.
 *
 * So the assertion that matters most is not "good URLs work"; it is that a
 * value which is not a URL produces NO LINK AT ALL rather than a bad one.
 */

describe('placeholder values', () => {
  it('recognises what people type when they cannot fill in a cell', () => {
    for (const v of ['UNKNOWN', 'unknown', ' N/A ', 'none', 'TBD', 'coming soon', 'not available']) {
      expect(isPlaceholderValue(v), v).toBe(true);
    }
  });

  it('treats empty and whitespace as placeholders', () => {
    expect(isPlaceholderValue('')).toBe(true);
    expect(isPlaceholderValue('   ')).toBe(true);
    expect(isPlaceholderValue(null)).toBe(true);
    expect(isPlaceholderValue(undefined)).toBe(true);
  });

  it('recognises punctuation runs and all-zero numbers', () => {
    for (const v of ['-', '--', '...', '?', '0', '000', '0000000000']) {
      expect(isPlaceholderValue(v), v).toBe(true);
    }
  });

  it('never matches inside a real name', () => {
    /*
     * The whole reason the rule is whole-value only. Each of these would be
     * destroyed by a substring match, and they are all plausible businesses.
     */
    for (const v of [
      'Unknown Pleasures Records',
      'Missing Link Studios',
      'NA Motors',
      'Nairobi None Cafe',
      'Pending Perfection Salon',
      '0801 Autos',
    ]) {
      expect(isPlaceholderValue(v), v).toBe(false);
    }
  });

  it('returns the trimmed value or null', () => {
    expect(blankIfPlaceholder('  Zanzibar Coffee ')).toBe('Zanzibar Coffee');
    expect(blankIfPlaceholder('UNKNOWN')).toBeNull();
  });
});

describe('checkWebsite', () => {
  it('produces no link for a placeholder', () => {
    // The live bug, in one assertion.
    expect(websiteHref('UNKNOWN')).toBeNull();
    expect(checkWebsite('UNKNOWN').problem).toBe('placeholder');
  });

  it('produces no link for prose', () => {
    for (const v of ['see our facebook', 'ask for details', 'website soon']) {
      expect(websiteHref(v), v).toBeNull();
    }
  });

  it('refuses a scheme that is not http(s)', () => {
    for (const v of [
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox',
      'file:///etc/passwd',
      'blob:https://x.test/abc',
    ]) {
      const r = checkWebsite(v);
      expect(r.url, v).toBeNull();
      expect(r.problem, v).toBe('unsafe_scheme');
    }
  });

  it('accepts a bare domain, because directory data is full of them', () => {
    expect(websiteHref('zanzibar.ng')).toBe('https://zanzibar.ng/');
    expect(websiteHref('www.example.com')).toBe('https://www.example.com/');
  });

  it('upgrades http to https rather than discarding it', () => {
    expect(websiteHref('http://example.com/shop')).toBe('https://example.com/shop');
  });

  it('keeps a path, query and port', () => {
    expect(websiteHref('https://example.com:8443/shop?ref=nowopen'))
      .toBe('https://example.com:8443/shop?ref=nowopen');
  });

  it('rejects a hostname with no dot', () => {
    // `new URL('https://UNKNOWN')` parses happily; the dot is what saves us.
    expect(websiteHref('localhost')).toBeNull();
    expect(websiteHref('intranet')).toBeNull();
  });

  it('rejects a value containing whitespace', () => {
    expect(websiteHref('example.com and facebook.com')).toBeNull();
  });
});

describe('websiteLabel', () => {
  it('shows the host without scheme, www or trailing slash', () => {
    expect(websiteLabel('https://www.zanzibar.ng/')).toBe('zanzibar.ng');
    expect(websiteLabel('zanzibar.ng/menu')).toBe('zanzibar.ng/menu');
  });

  it('has nothing to show for a value that is not a link', () => {
    expect(websiteLabel('UNKNOWN')).toBeNull();
  });
});

describe('the SQL and TypeScript rules do not drift', () => {
  /*
   * `blank_if_placeholder` in the database and `isPlaceholderValue` here are
   * two implementations of one rule — normally the shape that rots. The
   * migration is the source of truth for the list; this parses it and compares.
   */
  const sql = readFileSync(
    'supabase/migrations/20260908190000_placeholder_scrub_trigger.sql',
    'utf8',
  );

  it('lists exactly the same placeholder values', () => {
    const block = sql.slice(
      sql.indexOf("upper(btrim(p_value)) in ("),
      sql.indexOf(') then null'),
    );
    const fromSql = [...block.matchAll(/'([^']+)'/g)].map((m) => m[1]);

    expect(fromSql.length).toBeGreaterThan(20);
    expect([...fromSql].sort()).toEqual([...PLACEHOLDER_VALUES].sort());
  });

  it('scrubs the same fields the trigger scrubs', () => {
    // If a field is added to the trigger, the importer should warn about it too.
    for (const field of ['phone', 'whatsapp', 'email', 'website', 'address', 'description']) {
      expect(sql).toContain(`new.${field}`);
    }
  });

  it('guards the candidate queue as well as the businesses table', () => {
    // Otherwise the next publish re-creates what the repair removed.
    expect(sql).toContain('scrub_candidate_placeholders');
    expect(sql).toContain('before insert or update on public.radar_candidates');
  });
});
