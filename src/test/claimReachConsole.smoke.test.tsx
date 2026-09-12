import { describe, it, vi, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

/**
 * The ClaimReach console, rendered.
 *
 * WHY A COMPONENT TEST AND NOT A CLICK-THROUGH
 *
 * The screen is only reachable behind an admin session, so the properties that
 * matter most cannot be checked by opening it locally. They are also exactly
 * the properties that must never regress:
 *
 *   IT SAYS IT CANNOT SEND, and offers no control that could be mistaken for
 *   a send. A screen full of green "would contact" rows next to a button is
 *   how a dry run becomes an accident.
 *
 *   A FAILED SUPPRESSION CHECK MAKES EVERYONE UNCONTACTABLE. supabase-js
 *   resolves with `{ data: null, error }` rather than throwing, so the
 *   plausible bug is an empty result read as "nobody has opted out". This
 *   asserts the opposite direction: unknown blocks.
 */

const state: {
  businesses: unknown[];
  businessesError: { message: string } | null;
  evidence: unknown[];
  outreach: unknown[];
  suppressed: { contact: string }[] | null;
  suppressionError: { message: string } | null;
} = {
  businesses: [],
  businessesError: null,
  evidence: [],
  outreach: [],
  suppressed: [],
  suppressionError: null,
};

vi.mock('../lib/supabase', () => {
  const q = (rows: unknown[], error: { message: string } | null = null) => {
    const result = { data: error ? null : rows, error };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chain: any = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      in: vi.fn(() => chain),
      neq: vi.fn(() => chain),
      order: vi.fn(() => chain),
      limit: vi.fn(() => chain),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      then: (onF?: any, onR?: any) => Promise.resolve(result).then(onF, onR),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      catch: (onR?: any) => Promise.resolve(result).catch(onR),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      finally: (onF?: any) => Promise.resolve(result).finally(onF),
    };
    return chain;
  };

  return {
    supabase: {
      from: vi.fn((table: string) => {
        if (table === 'businesses') return q(state.businesses, state.businessesError);
        if (table === 'business_evidence') return q(state.evidence);
        if (table === 'claimreach_outreach') return q(state.outreach);
        return q([]);
      }),
      rpc: vi.fn(async () => (state.suppressionError
        ? { data: null, error: state.suppressionError }
        : { data: state.suppressed, error: null })),
    },
  };
});

import ClaimReachConsole from '../components/admin/ClaimReachConsole';

const business = (over: Record<string, unknown> = {}) => ({
  id: 'b1',
  name: 'Zanzibar Coffee',
  claim_status: 'unclaimed',
  data_confidence: 'source_confirmed',
  phone: '+2348030000001',
  whatsapp: null,
  email: null,
  ...over,
});

beforeEach(() => {
  state.businesses = [business()];
  state.businessesError = null;
  state.evidence = [];
  state.outreach = [];
  state.suppressed = [];
  state.suppressionError = null;
});

describe('ClaimReach console', () => {
  it('says up front that it cannot send, and offers nothing that would', async () => {
    render(<ClaimReachConsole />);
    await waitFor(() => expect(screen.getByText(/ClaimReach dry run/i)).toBeInTheDocument());

    expect(screen.getByText(/It cannot send/i)).toBeInTheDocument();

    // No control anywhere that reads as dispatching a message.
    for (const button of screen.getAllByRole('button')) {
      expect(button.textContent ?? '').not.toMatch(/send|dispatch|launch|start campaign/i);
    }
  });

  it('contacts nobody when no contact has a recorded source', async () => {
    /*
     * The live state on 2026-09-08: 65 businesses have a phone number and
     * business_evidence holds no rows, so §7 refuses every one of them.
     */
    render(<ClaimReachConsole />);
    await waitFor(() => expect(screen.getByText(/No recorded source for this contact/i)).toBeInTheDocument());
    expect(screen.getByText(/Nothing can be sent/i)).toBeInTheDocument();
  });

  it('treats a failed suppression check as "nobody is contactable"', async () => {
    state.suppressionError = { message: 'permission denied' };
    state.evidence = [{ business_id: 'b1', field_name: 'phone', status: 'source_confirmed' }];

    render(<ClaimReachConsole />);
    await waitFor(() => expect(
      screen.getByText(/nothing is treated as contactable/i),
    ).toBeInTheDocument());

    // And the row itself is refused, not merely annotated.
    expect(screen.getByText(/Suppression was not checked/i)).toBeInTheDocument();
  });

  it('reports a failed read instead of rendering an empty plan', async () => {
    state.businessesError = { message: 'relation does not exist' };

    render(<ClaimReachConsole />);
    await waitFor(() => expect(
      screen.getByText(/Could not read businesses/i),
    ).toBeInTheDocument());

    /*
     * supabase-js resolves on failure, so the wrong behaviour here is a
     * confident, plausible plan built from nothing. There is no candidate
     * table at all: the screen reports the failure instead of describing an
     * empty platform.
     */
    expect(screen.queryAllByRole('table')).toHaveLength(0);
    expect(screen.queryByText(/candidates/i)).not.toBeInTheDocument();
  });

  it('would contact a business once its contact has a source and a provider is assumed', async () => {
    state.evidence = [{ business_id: 'b1', field_name: 'phone', status: 'source_confirmed' }];
    render(<ClaimReachConsole />);

    await waitFor(() => expect(screen.getByText(/No provider configured/i)).toBeInTheDocument());

    // The what-if toggle is the only thing standing between this and a plan,
    // which is the honest summary of ClaimReach's current state.
    const whatIf = screen.getByLabelText(/providers were configured/i);
    whatIf.click();

    await waitFor(() => expect(screen.getByText(/Would contact/i)).toBeInTheDocument());
  });
});
