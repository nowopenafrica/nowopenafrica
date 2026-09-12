import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/**
 * A single dropped request used to disable site-wide search for the whole
 * session.
 *
 * `getIndex()` memoises `buildIndex()` in a module-level promise, and
 * `buildIndex()` cannot reject — a `.catch(() => [null, null, null])` swallows
 * the failure and returns an EMPTY index instead. That empty index was then
 * cached for the lifetime of the page.
 *
 * So if the reads failed the first time the visitor touched the search box —
 * one blip on a mobile connection — the box stayed open, kept accepting
 * typing, and matched nothing for the rest of the visit. Nothing told them, no
 * error was reported anywhere, and only a reload fixed it.
 *
 * It needed two fixes, because there are two caches:
 *
 *   1. `indexPromise`, module-level, shared by every search box on the page.
 *   2. `loadStarted`, a per-instance ref — so even with (1) cleared, the
 *      component that hit the failure would never ask again while mounted.
 *
 * These tests drive the component the way a visitor does: type, fail, keep
 * typing. An earlier round of failure-state work wrote tests that only proved
 * the wiring existed, and the bug survived them.
 *
 * NOTE ON ISOLATION. `indexPromise` is module state, so a test that inherited
 * a warm cache from the test before it would pass or fail for reasons that
 * have nothing to do with what it asserts. Each test therefore resets the
 * module registry and imports the component fresh.
 */

let failReads = true;
let selectCalls = 0;

vi.mock('../lib/supabase', () => {
  const rowsFor = (table: string) =>
    table === 'businesses'
      ? [{
          id: 'b1',
          name: 'Zanzibar Coffee',
          username: 'zanzibar-coffee',
          category: 'Café & Bakery',
          secondary_categories: [],
          location: 'Lagos',
        }]
      : [];

  const chain = (table: string): any => {
    const settle = () =>
      failReads
        ? { data: null, error: { message: 'network' } }
        : { data: rowsFor(table), error: null };

    const c: any = {
      select: vi.fn(() => { selectCalls += 1; return c; }),
      eq: vi.fn(() => c),
      order: vi.fn(() => c),
      limit: vi.fn(() => Promise.resolve(settle())),
      then: (onOk: any, onErr: any) => Promise.resolve(settle()).then(onOk, onErr),
    };
    return c;
  };
  return { supabase: { from: vi.fn((table: string) => chain(table)) } };
});

/** A fresh module registry per test, so `indexPromise` starts empty. */
async function freshBox() {
  vi.resetModules();
  const { default: GlobalSearchInput } = await import('../components/GlobalSearchInput');
  return function renderBox(value = '') {
    return render(
      <MemoryRouter>
        <GlobalSearchInput
          searchType="businesses"
          value={value}
          onChange={vi.fn()}
          onPickCategory={() => {}}
          onPickLocation={() => {}}
          placeholder="Search businesses"
        />
      </MemoryRouter>,
    );
  };
}

/** The index builds lazily, on first interaction — not on mount. */
const wake = () => fireEvent.focus(screen.getAllByRole('combobox')[0]);
const sleep = () => fireEvent.blur(screen.getAllByRole('combobox')[0]);

beforeEach(() => {
  selectCalls = 0;
  failReads = true;
});

describe('a failed search index is not cached for the session', () => {
  it('reads the database again after a failure', async () => {
    const renderBox = await freshBox();
    renderBox();

    wake();
    await waitFor(() => expect(selectCalls).toBeGreaterThan(0));
    const afterFailure = selectCalls;

    /*
     * THE DEFECT. Before the fix, `indexPromise` held the empty index and
     * `loadStarted` was stuck true, so this second interaction issued no
     * queries at all — the visitor was served the failure for the rest of
     * their visit.
     */
    failReads = false;
    sleep();
    wake();

    await waitFor(() => expect(selectCalls).toBeGreaterThan(afterFailure));
  });

  it('keeps the index once a build succeeds', async () => {
    /*
     * The fix must not throw caching away altogether — rebuilding on every
     * interaction would put three queries behind each one.
     */
    failReads = false;
    const renderBox = await freshBox();
    renderBox();

    wake();
    await waitFor(() => expect(selectCalls).toBeGreaterThan(0));
    const afterSuccess = selectCalls;

    sleep();
    wake();
    // Give a rebuild time to happen before asserting that it did not.
    await new Promise((r) => setTimeout(r, 30));

    expect(selectCalls).toBe(afterSuccess);
  });

  it('serves real matches once the connection comes back', async () => {
    /*
     * Proves the recovered index holds real rows, not merely that a second
     * request went out.
     *
     * The component is fully controlled, so the query arrives as a prop:
     * firing a change event cannot move a value the parent owns.
     *
     * And the assertion reads textContent rather than using queryByText,
     * because the suggestion label is split by the match highlighter — no
     * single element holds the whole name.
     */
    const renderBox = await freshBox();
    const { container } = renderBox('zanzibar');

    wake();
    await waitFor(() => expect(selectCalls).toBeGreaterThan(0));

    failReads = false;
    sleep();
    wake();

    await waitFor(() => {
      expect(container.textContent).toMatch(/zanzibar coffee/i);
    });
  });
});

describe('the failure is detected where it actually appears', () => {
  it('inspects `error`, not a catch that never fires', async () => {
    /*
     * supabase-js RESOLVES with `{ data: null, error }`. The `.catch()` in
     * buildIndex only ever fired for a thrown exception, which is not how
     * these reads fail — the same mistake that made the discovery pages show
     * empty states for dropped connections.
     */
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/components/GlobalSearchInput.tsx', 'utf8');
    expect(src).toMatch(/const failed =[\s\S]{0,200}?bizRes\.error/);
    expect(src).toMatch(/if \(index\.failed\) indexPromise = null;/);
    expect(src).toMatch(/if \(index\.failed\) loadStarted\.current = false;/);
  });
});

describe('the close-on-blur timer does not outlive the component', () => {
  it('is cancelled on unmount', async () => {
    /*
     * `onBlur` schedules setOpen(false) 120ms later, so a click on a
     * suggestion lands before the list closes. Nothing cancelled it.
     *
     * It surfaced as an intermittent failure in the FULL suite — never in
     * isolation:
     *
     *     ReferenceError: window is not defined
     *       at dispatchSetState (react-dom)
     *       at Timeout._onTimeout (GlobalSearchInput.tsx)
     *
     * The timer fired after the environment had been torn down. That is a
     * test artifact; the leak underneath is not. The header mounts this on
     * every page, so a stray timer holding a closure over unmounted state
     * was created on every navigation.
     *
     * Fixed in the component rather than waited out in the test: a test that
     * sleeps past a leak proves it is survivable, not that it is gone.
     */
    failReads = false;
    const renderBox = await freshBox();
    const { unmount } = renderBox();

    wake();
    sleep();

    const cleared = vi.spyOn(window, 'clearTimeout');
    unmount();
    expect(cleared).toHaveBeenCalled();
    cleared.mockRestore();
  });

  it('replaces a pending timer rather than stacking them', async () => {
    // Two blurs in quick succession should leave one timer, not two.
    failReads = false;
    const renderBox = await freshBox();
    renderBox();

    const cleared = vi.spyOn(window, 'clearTimeout');
    wake();
    sleep();
    wake();
    sleep();
    expect(cleared).toHaveBeenCalled();
    cleared.mockRestore();
  });
});
