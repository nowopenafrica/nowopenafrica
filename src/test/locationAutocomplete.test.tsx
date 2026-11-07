import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';

/**
 * The "Where?" box.
 *
 * ── WHAT IT HAS TO GET RIGHT ─────────────────────────────────────────────
 *
 * MEASURED 2026-09-17: 278 distinct places hold 3,141 listings, and the
 * distribution is steep — Lagos 325, Abuja 153, Lekki 5, and most places have
 * exactly one. A place name on its own is therefore a poor suggestion: it
 * invites somebody to filter the directory down to nothing and conclude the
 * platform is empty.
 *
 * So the count travels with the suggestion, places with NO listings are marked
 * as such rather than mixed in, and a failed read says so instead of reporting
 * that NowOpen covers nowhere near you.
 */

const rpc = vi.fn();
vi.mock('../lib/supabase', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));
vi.mock('../lib/geolocation', () => ({ detectLocation: vi.fn() }));

import LocationAutocomplete from '../components/LocationAutocomplete';

/** A controlled host, because the component is controlled. */
function Host({ remote = true }: { remote?: boolean }) {
  const [value, setValue] = useState('');
  return <LocationAutocomplete remote={remote} value={value} onChange={setValue} ariaLabel="Where?" />;
}

const box = () => screen.getByRole('combobox', { name: 'Where?' });
const option = (re: RegExp) => screen.getByRole('option', { name: re });
const findOption = (re: RegExp) => waitFor(() => expect(option(re)).toBeTruthy());

beforeEach(() => {
  vi.clearAllMocks();
  rpc.mockResolvedValue({ data: [{ label: 'Lekki', hits: 5, score: 80 }], error: null });
});

describe('where the places come from', () => {
  it('asks the database rather than a list shipped in the bundle', async () => {
    const user = userEvent.setup();
    render(<Host />);
    await user.type(box(), 'lekki');
    await waitFor(() => expect(rpc).toHaveBeenCalled());

    const [fn, args] = rpc.mock.calls[rpc.mock.calls.length - 1];
    expect(fn).toBe('place_suggest');
    expect(args).toMatchObject({ q: 'lekki' });
  });

  it('says how many businesses are in each place', async () => {
    rpc.mockResolvedValue({
      data: [
        { label: 'Lagos', hits: 325, score: 100 },
        { label: 'Lagos Island', hits: 2, score: 80 },
      ],
      error: null,
    });
    const user = userEvent.setup();
    render(<Host />);
    await user.type(box(), 'lagos');

    await findOption(/Lagos.*325 businesses/);
    // Singular and plural both matter — "1 businesses" is the kind of thing
    // that makes a directory look automated rather than maintained.
    await findOption(/Lagos Island.*2 businesses/);
  });

  it('uses the singular for a place with one listing', async () => {
    rpc.mockResolvedValue({ data: [{ label: 'Ho', hits: 1, score: 100 }], error: null });
    const user = userEvent.setup();
    render(<Host />);
    await user.type(box(), 'ho');
    await findOption(/Ho.*1 business(?!es)/);
  });

  it('does not ask for one character', async () => {
    const user = userEvent.setup();
    render(<Host />);
    await user.type(box(), 'l');
    await new Promise((r) => setTimeout(r, 300));
    expect(rpc).not.toHaveBeenCalled();
  });

  it('sends one request for a burst of typing', async () => {
    const user = userEvent.setup();
    render(<Host />);
    await user.type(box(), 'lekki phase one');
    await waitFor(() => expect(rpc).toHaveBeenCalled());
    expect(rpc.mock.calls.length).toBeLessThan(4);
  });
});

describe('places the directory does not cover', () => {
  it('marks a curated city with no listings instead of hiding the gap', async () => {
    /*
     * place_suggest returns every place that HAS a listing, so anything falling
     * through to the curated list has none. Showing it as an ordinary
     * suggestion answers "do you cover Accra?" with a blank page; saying "no
     * listings yet" answers it truthfully and still lets them try.
     */
    rpc.mockResolvedValue({ data: [], error: null });
    const user = userEvent.setup();
    render(<Host />);
    await user.type(box(), 'accra');

    /*
     * The row FOR Accra carries the label. Rows merely mentioning Accra —
     * "Osu, Accra, Ghana", "East Legon, Accra, Ghana" — must not, because a
     * search for "accra" would not necessarily have found a business stored
     * under "Osu", so their absence proves nothing about them.
     */
    await waitFor(() => {
      const rows = screen.getAllByRole('option').map((o) => o.textContent ?? '');
      const accraItself = rows.filter((t) => /^Accra,/.test(t));
      expect(accraItself.length, 'Accra itself did not surface').toBeGreaterThan(0);
      for (const t of accraItself) expect(t).toMatch(/No listings yet/i);

      for (const t of rows.filter((t) => /^(Osu|East Legon),/.test(t))) {
        expect(t).not.toMatch(/No listings yet/i);
      }
    });
  });

  it('claims nothing about a city the query never asked about', async () => {
    /*
     * REGRESSION, observed in the browser 2026-09-17. Typing "lag" listed
     * "Ikeja, Lagos, Nigeria — No listings yet". Ikeja has TEN listings; it
     * only appeared because "lag" matches *Lagos* further along the label, and
     * place_suggest — which matches the stored location string — was never
     * asked about Ikeja at all.
     *
     * An absence is only evidence when the query would have found the thing.
     * Here it would not, so the row must make no claim either way.
     */
    rpc.mockResolvedValue({ data: [{ label: 'Lagos', hits: 325, score: 100 }], error: null });
    const user = userEvent.setup();
    render(<Host />);
    await user.type(box(), 'lag');
    await findOption(/Lagos.*325 businesses/);

    const ikeja = screen.getAllByRole('option')
      .map((o) => o.textContent ?? '')
      .filter((t) => /Ikeja/i.test(t));
    expect(ikeja.length, 'Ikeja did not surface; the case is untested').toBeGreaterThan(0);
    for (const t of ikeja) expect(t).not.toMatch(/No listings yet/i);
  });

  it('says nothing about coverage when the lookup itself failed', async () => {
    // A failed read is not evidence of absence either.
    rpc.mockResolvedValue({ data: null, error: { message: 'down' } });
    const user = userEvent.setup();
    render(<Host />);
    await user.type(box(), 'accra');
    await waitFor(() => expect(screen.getAllByRole('option').length).toBeGreaterThan(0));
    for (const o of screen.getAllByRole('option')) {
      expect(o.textContent ?? '').not.toMatch(/No listings yet/i);
    }
  });

  it('never labels a place that does have listings as empty', async () => {
    rpc.mockResolvedValue({ data: [{ label: 'Lagos', hits: 325, score: 100 }], error: null });
    const user = userEvent.setup();
    render(<Host />);
    await user.type(box(), 'lagos');
    await findOption(/Lagos.*325 businesses/);

    /*
     * The live "Lagos" must not ALSO appear from the curated list wearing "no
     * listings yet" — the same place contradicting itself two rows apart is
     * the specific thing the de-duplication exists to prevent.
     */
    const empties = screen.getAllByRole('option')
      .map((o) => o.textContent ?? '')
      .filter((t) => /No listings yet/i.test(t))
      .map((t) => t.split(',')[0].trim().toLowerCase());
    expect(empties).not.toContain('lagos');
  });
});

describe('the ways it could lie', () => {
  it('says the lookup failed rather than that nowhere matched', async () => {
    /*
     * supabase-js resolves with { data: null, error }, so a dropped connection
     * and "we cover nowhere near you" are the same shape unless somebody
     * checks `error`.
     */
    rpc.mockResolvedValue({ data: null, error: { message: 'connection refused' } });
    const user = userEvent.setup();
    render(<Host />);
    await user.type(box(), 'zzqq');

    await waitFor(() => expect(
      screen.getByText((_, el) => !!el && /could not be loaded/i.test(el.textContent ?? '') && !el.querySelector('*')),
    ).toBeTruthy());
  });

  it('never paints an older answer over a newer one', async () => {
    let releaseFirst: (v: unknown) => void = () => {};
    rpc
      .mockImplementationOnce(() => new Promise((res) => { releaseFirst = res; }))
      .mockResolvedValue({ data: [{ label: 'Lagos', hits: 325, score: 100 }], error: null });

    const user = userEvent.setup();
    render(<Host />);
    await user.type(box(), 'la');
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
    await user.type(box(), 'gos');
    await findOption(/Lagos.*325 businesses/);

    releaseFirst({ data: [{ label: 'STALE PLACE', hits: 9, score: 100 }], error: null });

    await findOption(/Lagos.*325 businesses/);
    expect(screen.queryByRole('option', { name: /STALE PLACE/ })).toBeNull();
  });

  it('clears the list when the box is emptied', async () => {
    const user = userEvent.setup();
    render(<Host />);
    await user.type(box(), 'lekki');
    await findOption(/Lekki.*5 businesses/);

    await user.clear(box());
    await waitFor(() =>
      expect(screen.queryByRole('option', { name: /Lekki/ })).toBeNull());
  });
});

describe('choosing a place', () => {
  it('fills the box with what was chosen', async () => {
    const user = userEvent.setup();
    render(<Host />);
    await user.type(box(), 'lekki');
    await findOption(/Lekki.*5 businesses/);
    await user.click(option(/Lekki.*5 businesses/));
    expect((box() as HTMLInputElement).value).toBe('Lekki');
  });

  it('is reachable with the keyboard alone', async () => {
    const user = userEvent.setup();
    render(<Host />);
    await user.type(box(), 'lekki');
    await findOption(/Lekki.*5 businesses/);
    await user.keyboard('{ArrowDown}{Enter}');
    expect((box() as HTMLInputElement).value).toBe('Lekki');
  });
});

describe('the existing callers are untouched', () => {
  it('asks the database nothing when it is given its own options', async () => {
    /*
     * /businesses has already fetched every listing, so it passes them in.
     * Turning that page into one RPC per keystroke would be a regression, not
     * an upgrade.
     */
    const user = userEvent.setup();
    function Local() {
      const [v, setV] = useState('');
      return (
        <LocationAutocomplete
          value={v}
          onChange={setV}
          ariaLabel="Where?"
          extraOptions={['Lekki', 'Ikeja', 'Yaba']}
        />
      );
    }
    render(<Local />);
    await user.type(box(), 'lek');
    await findOption(/Lekki/);
    expect(rpc).not.toHaveBeenCalled();
  });
});
