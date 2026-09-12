import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

/**
 * A dropped connection must not tell somebody a listing does not exist.
 *
 * BusinessDetail was fixed in Phase 8. The two other detail pages had the same
 * defect and were missed:
 *
 *   AdvertDetail   "Advert Not Found — The advert you are looking for does not exist."
 *   MediaDetail    "Media service not found"
 *
 * To a customer that reads as "this is not on NowOpen". To whoever listed it,
 * it reads as "my page is gone". Neither was true; the network had blinked.
 *
 * THE DISTINCTION THAT MAKES THIS HARDER THAN THE LIST PAGES
 *
 * These pages have a real not-found case that must survive — an id that
 * genuinely does not exist. So a single boolean will not do; the two outcomes
 * have to be separated at the source:
 *
 *   `.single()`      errors with code PGRST116 when no row matched. That code,
 *                    and only that code, is the genuine 404.
 *   `.maybeSingle()` returns `{ data: null, error: null }` for a genuine miss,
 *                    so any error at all means the read failed.
 *
 * MediaDetail was the worse of the two: it logged the supabase error with
 * console.warn and then discarded it, letting `data` stay null and fall
 * through to a mock lookup that returns nothing in production, because samples
 * are DEV-gated. The error was known and thrown away one line later.
 */

type Result = { data: unknown; error: unknown };
let advertResult: Result = { data: null, error: null };
let mediaResult: Result = { data: null, error: null };

vi.mock('../lib/supabase', () => {
  const chain = (table: string): any => {
    const settle = () => (table === 'advertisements' ? advertResult : mediaResult);
    const c: any = {
      select: vi.fn(() => c),
      eq: vi.fn(() => c),
      order: vi.fn(() => c),
      limit: vi.fn(() => Promise.resolve({ data: [], error: null })),
      single: vi.fn(() => Promise.resolve(settle())),
      maybeSingle: vi.fn(() => Promise.resolve(settle())),
      then: (ok: any, no: any) => Promise.resolve({ data: [], error: null }).then(ok, no),
    };
    return c;
  };
  return { supabase: { from: vi.fn((t: string) => chain(t)) } };
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

// MediaDetail reads the session to decide whether a review can be left. A
// signed-out visitor is the case that matters here: the failure state has to
// be right for someone who has never logged in.
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: null, session: null, loading: false, signOut: vi.fn() }),
}));

import AdvertDetail from '../pages/AdvertDetail';
import MediaDetail from '../pages/MediaDetail';

function renderAt(path: string, pattern: string, element: React.ReactElement) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={pattern} element={element} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  advertResult = { data: null, error: null };
  mediaResult = { data: null, error: null };
});

describe('AdvertDetail tells a missing advert from an unreachable one', () => {
  it('says the advert does not exist when no row matched', async () => {
    // PGRST116 is `.single()` reporting zero rows. This is the real 404 and
    // it has to keep working — the fix must not turn every miss into "we
    // could not load it".
    advertResult = {
      data: null,
      error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' },
    };
    renderAt('/adverts/11111111-1111-1111-1111-111111111111', '/adverts/:id', <AdvertDetail />);

    await waitFor(() => expect(screen.getByText(/advert not found/i)).toBeInTheDocument());
    expect(screen.queryByText(/could not load/i)).not.toBeInTheDocument();
  });

  it('says the load failed when the read failed', async () => {
    advertResult = { data: null, error: { message: 'TypeError: Failed to fetch' } };
    renderAt('/adverts/11111111-1111-1111-1111-111111111111', '/adverts/:id', <AdvertDetail />);

    await waitFor(() => expect(screen.getByText(/could not load this advert/i)).toBeInTheDocument());
  });

  it('does NOT claim the advert is gone when the read failed', async () => {
    /*
     * The actual defect. Both outcomes leave `advert === null`, so whichever
     * branch is evaluated first decides what the visitor is told.
     */
    advertResult = { data: null, error: { message: 'TypeError: Failed to fetch' } };
    renderAt('/adverts/11111111-1111-1111-1111-111111111111', '/adverts/:id', <AdvertDetail />);

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.queryByText(/advert not found/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/does not exist/i)).not.toBeInTheDocument();
  });

  it('states outright that this is not an empty result', async () => {
    advertResult = { data: null, error: { message: 'network' } };
    renderAt('/adverts/11111111-1111-1111-1111-111111111111', '/adverts/:id', <AdvertDetail />);

    await waitFor(() =>
      expect(screen.getByText(/does not mean there is nothing here/i)).toBeInTheDocument(),
    );
  });
});

describe('MediaDetail tells a missing service from an unreachable one', () => {
  it('says the service does not exist when there genuinely is no row', async () => {
    // `.maybeSingle()` reports a real miss as data null AND error null.
    mediaResult = { data: null, error: null };
    renderAt('/media/22222222-2222-2222-2222-222222222222', '/media/:id', <MediaDetail />);

    await waitFor(() => expect(screen.getByText(/media service not found/i)).toBeInTheDocument());
  });

  it('says the load failed when the read failed', async () => {
    mediaResult = { data: null, error: { message: 'TypeError: Failed to fetch' } };
    renderAt('/media/22222222-2222-2222-2222-222222222222', '/media/:id', <MediaDetail />);

    await waitFor(() => expect(screen.getByText(/could not load this service/i)).toBeInTheDocument());
    expect(screen.queryByText(/media service not found/i)).not.toBeInTheDocument();
  });

  it('no longer warns about the error and then discards it', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/pages/MediaDetail.tsx', 'utf8');
    /*
     * The old line read:
     *   console.warn('Supabase fetch failed, falling back to mock data', …)
     * and there was no fallback in production to fall back to.
     */
    expect(src).not.toMatch(/falling back to mock data/);
    expect(src).toMatch(/setLoadFailed\(true\)/);
  });
});

describe('both retries actually re-run the fetch', () => {
  for (const [path, needle] of [
    ['src/pages/AdvertDetail.tsx', 'reloadKey'],
    ['src/pages/MediaDetail.tsx', 'reloadKey'],
  ] as const) {
    it(`${path} has the retry key in its dependency array`, async () => {
      /*
       * A retry button that does not re-run the read looks like the page is
       * broken twice. The typecheck caught this on MediaDetail — the state
       * existed and nothing consumed it.
       */
      const { readFileSync } = await import('node:fs');
      const src = readFileSync(path, 'utf8');
      expect(src).toMatch(new RegExp(`\\}, \\[[^\\]]*\\b${needle}\\b[^\\]]*\\]\\)`));
      expect(src).toMatch(/setReloadKey\(\(k\) => k \+ 1\)/);
    });
  }
});
