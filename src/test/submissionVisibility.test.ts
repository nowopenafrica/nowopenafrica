import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { isListable, isPubliclyListed } from '../lib/listingStatus';
import { safeNextPath, authRedirectTarget } from '../lib/safeNext';

/**
 * The /add-business route lets anyone with the link create a business, so the
 * rule that keeps an unreviewed submission out of the directory has to hold in
 * every query — not just the ones that existed when it was written.
 *
 * `profile_state` is not part of the generated `is_listable` column and cannot
 * cheaply be made part of it: three RLS policies, nine functions and two
 * indexes depend on that column, so changing its expression means dropping it
 * and cascading into the policies. The filter therefore lives at each query
 * site, and this test is what stops the next one from forgetting it.
 */

const ROOTS = ['src', 'api'];
const SKIP = /node_modules|\.test\.|\.d\.ts$/;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (SKIP.test(p)) continue;
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(p)) out.push(p);
  }
  return out;
}

describe('unreviewed submissions stay out of the public directory', () => {
  it('every query that filters is_listable also filters profile_state', () => {
    const offenders: string[] = [];

    for (const root of ROOTS) {
      for (const file of walk(root)) {
        const src = readFileSync(file, 'utf8');
        const lines = src.split('\n');
        lines.forEach((line, i) => {
          // The two shapes used in this codebase: the supabase-js builder and
          // the PostgREST query string the crawler endpoints build by hand.
          const builder = /\.eq\(\s*['"]is_listable['"]\s*,\s*true\s*\)/.test(line);
          const rest = /is_listable=eq\.true/.test(line);
          if (!builder && !rest) return;

          /*
           * Look ahead to the END OF THE STATEMENT rather than a fixed number
           * of lines: the builder form chains across lines and a comment
           * explaining the filter sits between the two `.eq(...)` calls, which
           * a fixed window would push the match out of.
           */
          let window = line;
          for (let j = i + 1; j < lines.length && j < i + 12; j += 1) {
            window += '\n' + lines[j];
            if (/;\s*$/.test(lines[j])) break;
          }
          if (/profile_state/.test(window)) return;

          offenders.push(`${file}:${i + 1}`);
        });
      }
    }

    expect(
      offenders,
      'These query public listings without excluding submissions awaiting review.\n' +
      'Add .eq(\'profile_state\', \'published\') (or profile_state=eq.published) beside the is_listable filter:\n' +
      offenders.join('\n'),
    ).toEqual([]);
  });
});

describe('isPubliclyListed', () => {
  const base = {
    lifecycle_status: 'active',
    data_status: 'submitted',
    claim_status: 'claim_pending',
  };

  it('hides a submission that is still awaiting review', () => {
    expect(isPubliclyListed({ ...base, profile_state: 'ready_for_review' } as never)).toBe(false);
  });

  it('shows it once it is published', () => {
    expect(isPubliclyListed({ ...base, profile_state: 'published' } as never)).toBe(true);
  });

  it('treats a missing profile_state as published, not as hidden', () => {
    // Every one of the 3,059 rows that predate this column reads NULL. Absence
    // is not a reason to hide the entire directory.
    expect(isPubliclyListed({ ...base, profile_state: null } as never)).toBe(true);
    expect(isPubliclyListed(base as never)).toBe(true);
  });

  it('still refuses anything is_listable refuses', () => {
    expect(isPubliclyListed({
      ...base, profile_state: 'published', lifecycle_status: 'suspended',
    } as never)).toBe(false);
  });

  it('leaves isListable itself an exact mirror of the database column', () => {
    // isListable mirrors a generated column referenced by RLS policies. If it
    // ever starts consulting profile_state, it has stopped being a mirror.
    expect(isListable({ ...base, profile_state: 'ready_for_review' } as never)).toBe(true);
  });
});

describe('the sign-in return path', () => {
  it('accepts a same-site path', () => {
    expect(safeNextPath('/add-business')).toBe('/add-business');
    expect(safeNextPath('/add-business?source=whatsapp')).toBe('/add-business?source=whatsapp');
  });

  it('refuses anything that could leave the site', () => {
    // The page a user trusts most with a password is the one they will follow.
    expect(safeNextPath('//evil.example')).toBeNull();
    expect(safeNextPath('https://evil.example')).toBeNull();
    expect(safeNextPath('/\\evil.example')).toBeNull();
    expect(safeNextPath('javascript:alert(1)')).toBeNull();
    expect(safeNextPath(null)).toBeNull();
  });

  it('prefers ?next= over router state, because a link set it deliberately', () => {
    expect(authRedirectTarget('?next=%2Fadd-business', { from: { pathname: '/other' } }))
      .toBe('/add-business');
  });

  it('falls back to router state, then to the given default', () => {
    expect(authRedirectTarget('', { from: { pathname: '/dashboard', search: '?tab=1' } }))
      .toBe('/dashboard?tab=1');
    expect(authRedirectTarget('', null, '/dashboard')).toBe('/dashboard');
  });

  it('ignores a hostile ?next= rather than failing the sign-in', () => {
    expect(authRedirectTarget('?next=https%3A%2F%2Fevil.example', null, '/dashboard'))
      .toBe('/dashboard');
  });
});
