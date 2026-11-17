import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const state = vi.hoisted(() => ({
  result: { data: null as unknown, error: null as unknown },
  calls: [] as { op: string; args: unknown[] }[],
  user: { id: 'me' } as { id: string } | null,
}));

vi.mock('../lib/supabase', () => {
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'order', 'limit']) {
    chain[m] = (...args: unknown[]) => { state.calls.push({ op: m, args }); return chain; };
  }
  chain.then = (onF?: (v: unknown) => unknown, onR?: (e: unknown) => unknown) => Promise.resolve(state.result).then(onF, onR);
  return { supabase: { from: vi.fn(() => chain) } };
});
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: state.user }) }));
vi.mock('../components/updates/HappeningRow', () => ({
  default: (p: { title: string; businessIds?: string[] }) => <div>row {p.title}: {p.businessIds?.join(',')}</div>,
}));

import KeptUpdates from '../components/updates/KeptUpdates';

beforeEach(() => {
  state.calls.length = 0;
  state.user = { id: 'me' };
});

describe('KeptUpdates', () => {
  it('reads only the signed-in person\'s own keeps, not the keepers of a business they own', async () => {
    state.result = { data: [{ business_id: 'b1' }, { business_id: 'b2' }], error: null };
    render(<KeptUpdates />);
    expect(await screen.findByText(/row New today from places you keep: b1,b2/)).toBeInTheDocument();
    expect(state.calls).toContainEqual({ op: 'eq', args: ['user_id', 'me'] });
  });

  it('shows nothing when the person keeps nothing', async () => {
    state.result = { data: [], error: null };
    const { container } = render(<KeptUpdates />);
    await waitFor(() => expect(state.calls.length).toBeGreaterThan(0));
    expect(container).toBeEmptyDOMElement();
  });

  it('shows nothing when the read fails', async () => {
    state.result = { data: null, error: { message: 'down' } };
    const { container } = render(<KeptUpdates />);
    await waitFor(() => expect(state.calls.length).toBeGreaterThan(0));
    expect(container).toBeEmptyDOMElement();
  });

  it('shows nothing, and reads nothing, when signed out', () => {
    state.user = null;
    const { container } = render(<KeptUpdates />);
    expect(container).toBeEmptyDOMElement();
    expect(state.calls).toHaveLength(0);
  });

  it('reads the newest 150 keeps, so a long list never overflows the request', async () => {
    state.result = { data: [{ business_id: 'b1' }], error: null };
    render(<KeptUpdates />);
    await screen.findByText(/row New today/);
    expect(state.calls).toContainEqual({ op: 'order', args: ['created_at', { ascending: false }] });
    expect(state.calls).toContainEqual({ op: 'limit', args: [150] });
  });
});
