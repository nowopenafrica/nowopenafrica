import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

let audience: { topics: string[] }[] = [];
let rpcResult: { data: unknown; error: { message: string } | null } = { data: 0, error: null };
const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: async () => ({ data: audience }) }) }),
    rpc: async (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args });
      return rpcResult;
    },
  },
}));

const toasts: string[] = [];
vi.mock('react-hot-toast', () => {
  const fn = (m: string) => { toasts.push(m); };
  return { default: Object.assign(fn, {
    success: (m: string) => toasts.push(`success:${m}`),
    error: (m: string) => toasts.push(`error:${m}`),
  }) };
});

import KeepUpdates from '../components/studio/KeepUpdates';
import type { Business } from '../types';

const business = { id: 'b1', name: 'Mama Put Kitchen' } as unknown as Business;

beforeEach(() => {
  audience = [
    { topics: ['promotions', 'products'] },
    { topics: ['promotions'] },
    { topics: ['announcements'] },
  ];
  rpcResult = { data: 2, error: null };
  rpcCalls.length = 0;
  toasts.length = 0;
});

describe('KeepUpdates', () => {
  it('shows reach per topic, not one follower count', async () => {
    // The number that makes an owner write a better message is how many asked
    // for THIS, which is smaller than the audience.
    render(<KeepUpdates business={business} />);
    await screen.findByText(/Promotions and offers/);
    expect(screen.getByText(/Goes to 2 people who asked for this/)).toBeInTheDocument();
  });

  it('marks which topics send themselves', async () => {
    render(<KeepUpdates business={business} />);
    await screen.findByText(/Promotions and offers/);
    expect(screen.getAllByText('sends itself').length).toBe(4);
    expect(screen.getAllByText('you send').length).toBe(2);
  });

  it('sends the chosen topic through the ownership-checked function', async () => {
    render(<KeepUpdates business={business} />);
    fireEvent.change(await screen.findByLabelText('Headline'), { target: { value: '20% off this weekend' } });
    fireEvent.click(screen.getByRole('button', { name: /Send update/ }));
    await waitFor(() => expect(rpcCalls).toHaveLength(1));
    expect(rpcCalls[0].fn).toBe('send_keep_update');
    expect(rpcCalls[0].args.p_topic).toBe('promotions');
    expect(rpcCalls[0].args.p_business_id).toBe('b1');
  });

  it('refuses to send without a headline', async () => {
    render(<KeepUpdates business={business} />);
    await screen.findByText(/Promotions and offers/);
    fireEvent.click(screen.getByRole('button', { name: /Send update/ }));
    await waitFor(() => expect(toasts.some((t) => /headline/i.test(t))).toBe(true));
    expect(rpcCalls).toHaveLength(0);
  });

  it('does not claim a send when the throttle returned nobody', async () => {
    // The function returns 0 inside the window. "Sent to 0 people" would be a
    // lie about what happened.
    rpcResult = { data: 0, error: null };
    render(<KeepUpdates business={business} />);
    fireEvent.change(await screen.findByLabelText('Headline'), { target: { value: 'Test' } });
    fireEvent.click(screen.getByRole('button', { name: /Send update/ }));
    await waitFor(() => expect(toasts.length).toBeGreaterThan(0));
    expect(toasts.some((t) => t.startsWith('success:'))).toBe(false);
    expect(toasts.some((t) => /Nothing sent/.test(t))).toBe(true);
  });

  it('names the missing migration rather than showing a raw error', async () => {
    rpcResult = { data: null, error: { message: 'function send_keep_update does not exist' } };
    render(<KeepUpdates business={business} />);
    fireEvent.change(await screen.findByLabelText('Headline'), { target: { value: 'Test' } });
    fireEvent.click(screen.getByRole('button', { name: /Send update/ }));
    await waitFor(() => expect(toasts.some((t) => /migration/i.test(t))).toBe(true));
  });

  it('tells an owner with no audience how people opt in', async () => {
    audience = [];
    render(<KeepUpdates business={business} />);
    expect(await screen.findByText(/Nobody keeps you yet/)).toBeInTheDocument();
  });

  it('switches topic and reports that topic reach', async () => {
    render(<KeepUpdates business={business} />);
    fireEvent.click(await screen.findByRole('button', { name: /Important announcements/ }));
    await waitFor(() => expect(screen.getByText(/Goes to 1 person who asked for this/)).toBeInTheDocument());
  });
});
