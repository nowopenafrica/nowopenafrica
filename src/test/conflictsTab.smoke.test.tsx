import { describe, it, vi, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// jsdom has no matchMedia — react-hot-toast needs it.
if (typeof window.matchMedia !== 'function') {
  window.matchMedia = (query: string) =>
    ({ matches: false, media: query, onchange: null, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false }) as unknown as MediaQueryList;
}

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('../lib/supabase', () => {
  // Hoisted into the factory: top-level fixtures trip vitest's mock hoisting.
  //
  // One conflict, deliberately shaped so the WRONG answer is the tempting one:
  // wikidata reports the higher confidence (99 vs 70) and still loses, because
  // the official website outranks it for `phone`.
  const rows = [
    {
      business_id: 'b1',
      field_name: 'phone',
      business_name: 'Duchess Clinic',
      current_value: '+234 700 0000',
      evidence_count: 2,
      distinct_values: 2,
      business_claimed: false,
      first_seen: '2026-09-14T00:00:00.000Z',
      candidates: [
        {
          evidence_id: 'ev-website', value: '+234 800 1111', source: 'official_website',
          source_url: 'https://duchess.example/contact', confidence: 70, method: 'structured_data',
          by_ai: false, authority: 20, observed_at: '2026-09-14T00:00:00.000Z',
        },
        {
          evidence_id: 'ev-wikidata', value: '+234 809 2222', source: 'wikidata',
          source_url: 'https://wikidata.example/Q1', confidence: 99, method: 'api',
          by_ai: false, authority: 65, observed_at: '2026-09-13T00:00:00.000Z',
        },
      ],
    },
  ];

  let currentError: { message: string } | null = null;
  let rpcSpy: ((fn: string, params: unknown) => void) | undefined;
  const result = () => ({ data: currentError ? null : rows, error: currentError });
  const chain = {
    select: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    then: (onF?: unknown, onR?: unknown) =>
      Promise.resolve(result()).then(onF as never, onR as never),
  };
  return {
    __setReadError: (m: string | null) => { currentError = m ? { message: m } : null; },
    __setRpcSpy: (spy: (fn: string, params: unknown) => void) => { rpcSpy = spy; },
    supabase: {
      from: vi.fn(() => chain),
      rpc: vi.fn(async (fn: string, params: unknown) => {
        rpcSpy?.(fn, params);
        return { data: { applied: true, superseded: 1, already_held: false }, error: null };
      }),
    },
  };
});

import ConflictsTab from '../components/admin/businessIntelligence/ConflictsTab';
import * as mocked from '../lib/supabase';

const mock = mocked as unknown as {
  __setReadError: (m: string | null) => void;
  __setRpcSpy: (spy: (fn: string, params: unknown) => void) => void;
};

describe('ConflictsTab', () => {
  beforeEach(() => {
    mock.__setReadError(null);
    mock.__setRpcSpy(() => {});
  });

  it('renders the conflicting values with the source that reported each', async () => {
    render(<ConflictsTab />);
    expect(await screen.findByText('+234 800 1111')).toBeTruthy();
    expect(screen.getByText('+234 809 2222')).toBeTruthy();
    expect(screen.getByText('official website')).toBeTruthy();
    expect(screen.getByText('wikidata')).toBeTruthy();
  });

  it('marks the higher-authority source as suggested, not the more confident one', async () => {
    render(<ConflictsTab />);
    await screen.findByText('+234 800 1111');
    // The "suggested" chip must sit in the website's row, not wikidata's.
    const suggested = screen.getByText('suggested');
    const row = suggested.closest('li');
    expect(row?.textContent).toContain('official website');
    expect(row?.textContent).not.toContain('wikidata');
  });

  it('explains that authority beat confidence, so the order does not look broken', async () => {
    render(<ConflictsTab />);
    expect(await screen.findByText(/authority beats confidence/i)).toBeTruthy();
  });

  it('shows what the profile currently holds, so the choice has a baseline', async () => {
    render(<ConflictsTab />);
    await screen.findByText('+234 800 1111');
    expect(screen.getByText('+234 700 0000')).toBeTruthy();
  });

  it('resolves through the database function, passing the chosen evidence id', async () => {
    const calls: Array<{ fn: string; params: unknown }> = [];
    mock.__setRpcSpy((fn, params) => calls.push({ fn, params }));
    render(<ConflictsTab />);
    await screen.findByText('+234 800 1111');

    const buttons = screen.getAllByRole('button', { name: /use this/i });
    await userEvent.click(buttons[0]);

    await waitFor(() => expect(calls.length).toBeGreaterThan(0));
    expect(calls[0].fn).toBe('resolve_field_conflict');
    // The winner's evidence id — never a proposal id, and never a raw write.
    expect((calls[0].params as { p_evidence: string }).p_evidence).toBe('ev-website');
  });

  it('dismisses through the database function, naming the business and field', async () => {
    const calls: Array<{ fn: string; params: unknown }> = [];
    mock.__setRpcSpy((fn, params) => calls.push({ fn, params }));
    render(<ConflictsTab />);
    await screen.findByText('+234 800 1111');

    await userEvent.click(screen.getByRole('button', { name: /none of these/i }));

    await waitFor(() => expect(calls.length).toBeGreaterThan(0));
    expect(calls[0].fn).toBe('dismiss_field_conflict');
    expect(calls[0].params).toMatchObject({ p_business: 'b1', p_field: 'phone' });
  });

  it('reports a read failure instead of rendering it as "no conflicts"', async () => {
    // supabase-js RESOLVES with { error }, so a failed read would otherwise
    // render as an empty list — the exact trap this codebase keeps hitting.
    mock.__setReadError('permission denied for view business_field_conflicts');
    render(<ConflictsTab />);
    expect(await screen.findByText(/permission denied/i)).toBeTruthy();
    expect(screen.queryByText(/No field has two sources disagreeing/i)).toBeNull();
  });
});
