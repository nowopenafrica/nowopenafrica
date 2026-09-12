import { readFileSync } from 'node:fs';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

/**
 * A visitor must never be shown an internal error string.
 *
 * Found by opening a dead advert link on production. The page said:
 *
 *     Advert Not Found
 *     Cannot coerce the result to a single JSON object
 *
 * The second line is PostgREST talking to a developer. The template rendered
 * `{error || 'The advert you are looking for does not exist.'}`, and because
 * `error` is always set on that path, the human sentence never appeared —
 * the fallback was dead code.
 *
 * The same shape existed in the sign-in modal: `friendlyAuthError` was written
 * to translate these, was used for email/password, and the social buttons
 * simply never called it. A visitor whose provider is not enabled got
 * "Unsupported provider: provider is not enabled", which tells them nothing
 * about the email form directly above it.
 *
 * These are not cosmetic. They appear precisely when something has already
 * gone wrong, on the two surfaces where a stranger decides whether this
 * platform is real.
 */

vi.mock('../lib/supabase', () => {
  const chain = (): any => {
    const c: any = {
      select: vi.fn(() => c),
      eq: vi.fn(() => c),
      order: vi.fn(() => c),
      limit: vi.fn(() => Promise.resolve({ data: [], error: null })),
      single: vi.fn(() =>
        Promise.resolve({
          data: null,
          // The real message production returned.
          error: { code: 'PGRST116', message: 'Cannot coerce the result to a single JSON object' },
        }),
      ),
      maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
      then: (ok: any, no: any) => Promise.resolve({ data: [], error: null }).then(ok, no),
    };
    return c;
  };
  return { supabase: { from: vi.fn(() => chain()) } };
});

vi.mock('../contexts/CurrencyContext', () => ({
  useCurrency: () => ({
    currency: 'NGN',
    setCurrency: vi.fn(),
    format: (n: number) => `₦${n}`,
    convert: (n: number) => n,
    rate: 1,
  }),
}));

vi.mock('react-hot-toast', () => ({
  default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

import AdvertDetail from '../pages/AdvertDetail';

describe('a dead advert link shows a sentence, not a database message', () => {
  it('says the advert does not exist', async () => {
    render(
      <MemoryRouter initialEntries={['/adverts/00000000-0000-4000-8000-000000000000']}>
        <Routes>
          <Route path="/adverts/:id" element={<AdvertDetail />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText(/advert not found/i)).toBeInTheDocument());
    expect(screen.getByText(/the advert you are looking for does not exist/i)).toBeInTheDocument();
  });

  it('does not leak the PostgREST string', async () => {
    render(
      <MemoryRouter initialEntries={['/adverts/00000000-0000-4000-8000-000000000000']}>
        <Routes>
          <Route path="/adverts/:id" element={<AdvertDetail />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText(/advert not found/i)).toBeInTheDocument());
    expect(screen.queryByText(/coerce/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/JSON object/i)).not.toBeInTheDocument();
  });
});

describe('the sign-in modal translates every error it shows', () => {
  const src = readFileSync('src/components/auth/AuthModal.tsx', 'utf8');

  it('routes social sign-in through the same translator as email', () => {
    /*
     * Two catch blocks, one translator. The social one was the odd branch out
     * — not because translating it was hard, but because it was written
     * separately and nobody compared them.
     */
    const rawSetError = [...src.matchAll(/setError\(([^;]*)\)/g)].map((m) => m[1]);
    const untranslated = rawSetError.filter(
      (call) => /err(or)?\.message/.test(call) && !/friendlyAuthError/.test(call),
    );
    expect(untranslated, 'every err.message must pass through friendlyAuthError').toEqual([]);
  });

  it('has an answer for a provider that is not enabled', () => {
    // The failure that actually happens if Google or GitHub is switched off
    // on the Supabase project — every click on that button.
    expect(src).toMatch(/unsupported provider/i);
    expect(src).toMatch(/isn’t available yet/);
  });

  it('still falls back to the raw message rather than swallowing it', () => {
    /*
     * Deliberate. An untranslated message is bad; NO message is worse,
     * because the visitor is left with a form that silently refuses.
     */
    expect(src).toMatch(/return message;/);
  });
});
