import { describe, it, vi, expect, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';

/**
 * The spreadsheet import panel, against a fake supabase client. Nothing here
 * reaches a database: rpc and table calls are recorded and answered in memory,
 * and no import is run in a browser.
 */

interface Call { op: string; name?: string; args?: unknown; table?: string; payload?: unknown }
const calls: Call[] = [];
const state: { imports: Record<string, unknown>[]; adverts: Record<string, unknown>[] } = { imports: [], adverts: [] };

vi.mock('../lib/supabase', () => {
  const chainFor = (table: string) => {
    const call: Call = { op: 'select', table };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c: any = {};
    for (const m of ['select', 'eq', 'order', 'range', 'or']) c[m] = vi.fn(() => c);
    c.insert = vi.fn((payload: unknown) => { call.op = 'insert'; call.payload = payload; return c; });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    c.then = (f?: any, r?: any) => {
      calls.push(call);
      if (call.op === 'insert') {
        state.imports = [{ id: `i${state.imports.length + 1}`, created_at: '2026-11-01T10:00:00Z', ...(call.payload as object) }, ...state.imports];
        return Promise.resolve({ data: null, error: null }).then(f, r);
      }
      const data = table === 'placement_imports' ? state.imports : table === 'advertisements' ? state.adverts : [];
      return Promise.resolve({ data, error: null }).then(f, r);
    };
    return c;
  };
  return {
    supabase: {
      from: vi.fn((t: string) => chainFor(t)),
      rpc: vi.fn(async (name: string, args: unknown) => {
        calls.push({ op: 'rpc', name, args });
        return { data: `${name}-id`, error: null };
      }),
      storage: { from: vi.fn() },
    },
  };
});

vi.mock('../lib/currency', async (orig) => {
  const real = await orig<typeof import('../lib/currency')>();
  return { ...real, loadRates: vi.fn(async () => ({ rates: Object.fromEntries(real.CURRENCIES.map((c) => [c.code, c.fallbackRate])) })) };
});

import PlacementImport from '../components/dashboard/PlacementImport';
import { TEMPLATE_HEADERS } from '../lib/promote/placementImport';

const owner = { id: 'o1', name: 'Ikeja Outdoor', website: null, country_codes: ['NG'], verification: 'verified' as const, verified_at: null, verification_note: null };
const HEADER = TEMPLATE_HEADERS.map(([, h]) => h).join(',');
const line = (title: string, city: string) => `Billboard,${title},${city},NG,,area,12,6,,,,,,,450000,NGN,month,,`;

function upload(text: string, name = 'sites.csv') {
  const file = new File([text], name, { type: 'text/csv' });
  fireEvent.change(screen.getByLabelText('Choose a spreadsheet'), { target: { files: [file] } });
}

beforeEach(() => {
  calls.length = 0;
  state.imports = [];
  state.adverts = [];
});

describe('Spreadsheet import', () => {
  it('shows past imports with their error report', async () => {
    state.imports = [{
      id: 'i0', file_name: 'october.xlsx', rows_total: 5, rows_created: 3, rows_claimed: 1, rows_failed: 1,
      error_report: [{ row: 14, message: 'row 14: city missing' }], created_at: '2026-10-20T09:00:00Z',
    }];
    render(<PlacementImport owner={owner} />);
    const list = await screen.findByRole('list', { name: 'Past imports' });
    expect(within(list).getByText(/october\.xlsx/)).toBeTruthy();
    expect(within(list).getByText('5 rows: 3 added, 0 updated, 1 claimed, 1 left out')).toBeTruthy();
    expect(within(list).getByText('row 14: city missing')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Download the template/ }).getAttribute('href')).toBe('/templates/nowopen-placements-template.csv');
  });

  it('lists rows left out, waits for a duplicate choice, then imports and shows the report and history', async () => {
    state.adverts = [{ id: 'ad1', title: 'Ikeja Along unipole', location: 'Lagos, Nigeria', owner_id: null, lifecycle: 'admin_verified' }];
    render(<PlacementImport owner={owner} />);
    await screen.findByText('No imports yet.');

    upload([HEADER, line('Ikeja Along unipole', 'Lagos'), line('Lekki gantry', ''), line('Yaba bridge board', 'Lagos')].join('\n'));
    fireEvent.click(await screen.findByRole('button', { name: 'Check the rows' }));

    const left = await screen.findByRole('list', { name: 'Rows left out' });
    expect(within(left).getByText('row 3: city missing')).toBeTruthy();
    expect(screen.getByText(/2 rows are ready/)).toBeTruthy();

    // The match is not linked to this owner: choosing it means a claim.
    const importBtn = screen.getByRole('button', { name: 'Import 2 rows' }) as HTMLButtonElement;
    expect(importBtn.disabled).toBe(true);
    fireEvent.click(screen.getByLabelText(/Same site as “Ikeja Along unipole” in Lagos: claim it/));
    expect(importBtn.disabled).toBe(true); // a claim needs the owner's statement
    fireEvent.change(screen.getByLabelText('How are these sites yours?'), { target: { value: 'We built this structure' } });
    expect(importBtn.disabled).toBe(false);

    fireEvent.click(importBtn);
    const status = await screen.findByRole('status');
    expect(status.textContent).toContain('1 placement added, 0 updated, 1 claim sent, 1 row left out');
    expect(within(status).getByText('row 3: city missing')).toBeTruthy();

    const rpcs = calls.filter((c) => c.op === 'rpc').map((c) => c.name).sort();
    expect(rpcs).toEqual(['owner_claim_placement', 'owner_create_placement']);
    const insert = calls.find((c) => c.op === 'insert' && c.table === 'placement_imports')!;
    expect(insert.payload).toMatchObject({ owner_id: 'o1', file_name: 'sites.csv', rows_total: 3, rows_created: 1, rows_claimed: 1, rows_failed: 1 });

    await waitFor(() => expect(screen.getByRole('list', { name: 'Past imports' })).toBeTruthy());
    expect(within(screen.getByRole('list', { name: 'Past imports' })).getByText(/sites\.csv/)).toBeTruthy();
  });

  it('refuses a file that is not CSV or XLSX without reading it', async () => {
    render(<PlacementImport owner={owner} />);
    upload('x', 'sites.numbers');
    expect((await screen.findByRole('alert')).textContent).toMatch(/CSV or XLSX/);
    expect(calls.filter((c) => c.op === 'rpc')).toEqual([]);
  });
});
