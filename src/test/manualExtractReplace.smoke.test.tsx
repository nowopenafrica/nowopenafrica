import { describe, it, vi, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * Re-reading a page that is already published.
 *
 * THE DEFAULT IS A REFUSAL, AND THAT IS RIGHT. Re-importing must not quietly
 * undo a decision somebody made. But the refusal on its own left an operator
 * with nowhere to go when a business had genuinely changed its phone number or
 * its opening hours, so there is now a deliberate override.
 *
 * Three things have to hold, and each is a way this could do real damage:
 *
 *   1. The choice appears BEFORE the work, not as an error afterwards.
 *   2. A claimed profile offers no override at all. The database refuses it
 *      anyway — guard_claimed_profile_edits blocks content edits from anyone
 *      but the owner, admins included — so a toggle there would be a control
 *      that cannot work, and the panel says why instead.
 *   3. A replace never blanks a field. Only values the page actually publishes
 *      are written, so a profile keeps its address when a redesigned site stops
 *      printing one.
 */

vi.mock('../lib/supabase', () => {
  const state: {
    candidate: Record<string, unknown> | null;
    business: Record<string, unknown> | null;
    businessUpdate: Record<string, unknown> | null;
    candidateUpdate: Record<string, unknown> | null;
  } = { candidate: null, business: null, businessUpdate: null, candidateUpdate: null };

  const chain = (table: string) => {
    const c: Record<string, unknown> = {};
    const self = () => c;
    Object.assign(c, {
      select: vi.fn(self),
      eq: vi.fn(self),
      order: vi.fn(self),
      limit: vi.fn(self),
      in: vi.fn(self),
      maybeSingle: vi.fn(async () => ({
        data: table === 'radar_candidates' ? state.candidate : state.business,
        error: null,
      })),
      update: vi.fn((patch: Record<string, unknown>) => {
        if (table === 'businesses') state.businessUpdate = patch;
        else state.candidateUpdate = patch;
        return c;
      }),
      insert: vi.fn(() => c),
      then: (f?: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(f),
    });
    return c;
  };

  return {
    __state: state,
    supabase: {
      from: vi.fn((t: string) => chain(t)),
      functions: {
        invoke: vi.fn(async () => ({
          data: {
            ok: true,
            url: 'https://duchess.example/',
            host: 'duchess.example',
            robots: 'allowed by robots.txt',
            extracted: ['name', 'phone'],
            note: null,
            rights: 'This page was readable. That is not a licence.',
            candidate: {
              name: 'Duchess Hotel', phone: '+2348021112222',
              email: null, website: 'https://duchess.example/',
              address: '12 Allen Avenue', city: 'Ikeja', description: 'Rooms in Ikeja.',
              category: 'Hotel',
            },
            details: {
              facts: { openingHours: 'Mon-Fri: 09:00-17:00', latitude: null, longitude: null, phones: ['+2348021112222'], whatsapp: null, socials: {} },
              owned: { services: [], products: [], about: null, slogan: null, logoUrl: null, coverImageUrl: null, galleryUrls: [] },
            },
          },
          error: null,
        })),
      },
    },
  };
});

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
  Toaster: () => null,
}));

import ManualExtractTab from '../components/admin/businessIntelligence/ManualExtractTab';
import { supabase } from '../lib/supabase';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const state = (await import('../lib/supabase') as any).__state;

const readPage = async () => {
  const user = userEvent.setup();
  render(<ManualExtractTab />);
  await user.type(screen.getByPlaceholderText('https://example.com/about'), 'https://duchess.example/');
  await user.click(screen.getByRole('button', { name: /read this page/i }));
  await waitFor(() => expect(screen.getByText(/fields published by the page/i)).toBeTruthy());
  return user;
};

beforeEach(() => {
  state.candidate = null;
  state.business = null;
  state.businessUpdate = null;
  state.candidateUpdate = null;
  vi.clearAllMocks();
});

describe('re-reading a page already on file', () => {
  it('says nothing when the page is new', async () => {
    await readPage();
    expect(screen.queryByText(/already on file/i)).toBeNull();
    expect(screen.getByRole('button', { name: /add to review queue/i })).toBeTruthy();
  });

  it('warns before the work, not after it', async () => {
    state.candidate = { id: 'c1', status: 'published', published_business_id: 'b1' };
    state.business = { id: 'b1', name: 'Duchess Hotel', claim_status: 'unclaimed', user_id: null };

    await readPage();
    // The warning is on screen the moment the page is read.
    await waitFor(() => expect(screen.getByText(/already on file/i)).toBeTruthy());
    expect(screen.getByText(/Replace the published record/i)).toBeTruthy();
  });

  it('offers no override on a profile its owner has claimed', async () => {
    /*
     * guard_claimed_profile_edits refuses the write anyway. A toggle here would
     * be a control that cannot work, so the panel explains instead.
     */
    state.candidate = { id: 'c1', status: 'published', published_business_id: 'b1' };
    state.business = { id: 'b1', name: 'Duchess Hotel', claim_status: 'claimed', user_id: 'u1' };

    await readPage();
    await waitFor(() => expect(screen.getByText(/already on file/i)).toBeTruthy());
    expect(screen.queryByText(/Replace the published record/i)).toBeNull();
    expect(screen.getByText(/owner has claimed this profile/i)).toBeTruthy();
  });

  it('writes the live profile only once the toggle is on', async () => {
    state.candidate = { id: 'c1', status: 'published', published_business_id: 'b1' };
    state.business = { id: 'b1', name: 'Duchess Hotel', claim_status: 'unclaimed', user_id: null };

    const user = await readPage();
    await waitFor(() => expect(screen.getByText(/Replace the published record/i)).toBeTruthy());

    await user.click(screen.getByLabelText(/Replace the published record/i, { selector: 'input' })
      ?? screen.getByRole('checkbox', { name: /Replace the published record/i }));
    // The rights attestation is still required — the override does not skip it.
    await user.click(screen.getByRole('checkbox', { name: /I have checked that this information/i }));
    await user.click(screen.getByRole('button', { name: /replace the published profile/i }));

    await waitFor(() => expect(state.businessUpdate).not.toBeNull());

    // Only what the page published, and nothing blanked.
    expect(state.businessUpdate?.phone).toBe('+2348021112222');
    expect(state.businessUpdate?.opening_hours).toBe('Mon-Fri: 09:00-17:00');
    expect(state.businessUpdate).not.toHaveProperty('logo_url');
    for (const [, v] of Object.entries(state.businessUpdate ?? {})) {
      expect(v == null || String(v).trim() !== '').toBe(true);
    }
  });

  it('touches no live profile when the toggle is off', async () => {
    state.candidate = { id: 'c1', status: 'published', published_business_id: 'b1' };
    state.business = { id: 'b1', name: 'Duchess Hotel', claim_status: 'unclaimed', user_id: null };

    const user = await readPage();
    await waitFor(() => expect(screen.getByText(/Replace the published record/i)).toBeTruthy());
    await user.click(screen.getByRole('checkbox', { name: /I have checked that this information/i }));
    await user.click(screen.getByRole('button', { name: /add to review queue/i }));

    expect(state.businessUpdate).toBeNull();
  });

  it('never calls businesses at all for a page that is not published', async () => {
    await readPage();
    const tables = (supabase.from as unknown as { mock: { calls: string[][] } }).mock.calls.map((c) => c[0]);
    expect(tables).not.toContain('businesses');
  });
});
