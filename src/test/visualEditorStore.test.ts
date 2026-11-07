import { describe, it, expect, vi, beforeEach } from 'vitest';

/*
 * MEASURED 2026-10-10: `page_content` holds 0 rows — nothing has ever been
 * published — and seven public pages mount a PageContentProvider, each firing
 * its own query on every mount. Home -> About -> Contact -> Home was four
 * round trips that all returned nothing.
 */

const maybeSingle = vi.fn();
vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }),
    rpc: vi.fn(async () => ({ error: null })),
  },
}));

async function store() {
  return import('../lib/visualEditor/store');
}

describe('published page content is fetched once per page load', () => {
  beforeEach(() => {
    vi.resetModules();
    maybeSingle.mockReset();
    maybeSingle.mockResolvedValue({ data: null, error: null });
  });

  it('asks the database once however many components mount', async () => {
    const { fetchPublished } = await store();
    await Promise.all([fetchPublished('home'), fetchPublished('home'), fetchPublished('home')]);
    expect(maybeSingle).toHaveBeenCalledTimes(1);
  });

  it('shares an in-flight request rather than racing a second one', async () => {
    const { fetchPublished } = await store();
    const a = fetchPublished('about');
    const b = fetchPublished('about');
    await Promise.all([a, b]);
    expect(maybeSingle).toHaveBeenCalledTimes(1);
  });

  it('keeps pages separate', async () => {
    const { fetchPublished } = await store();
    await fetchPublished('home');
    await fetchPublished('contact');
    expect(maybeSingle).toHaveBeenCalledTimes(2);
  });

  /*
   * The one that protects the admin: publishing must not leave them staring
   * at the previous copy and concluding the feature is broken.
   */
  it('forgets the cached copy after a publish', async () => {
    const { fetchPublished, publishPage } = await store();
    await fetchPublished('home');
    expect(maybeSingle).toHaveBeenCalledTimes(1);
    await publishPage('home');
    await fetchPublished('home');
    expect(maybeSingle).toHaveBeenCalledTimes(2);
  });

  it('still returns {} when the read fails, so the page renders its own copy', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: { message: 'nope' } });
    const { fetchPublished } = await store();
    await expect(fetchPublished('home')).resolves.toEqual({});
  });
});
