import { describe, it, vi, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * The Instagram line in the owner's story editor (spec phase 1).
 *
 * Pinned: the note shows only for a claimed business; the status of the
 * latest sync request is shown as the database reports it; and the "we are
 * bringing in your posts" toast appears only when the database actually
 * queued a request, never just because the handle changed on screen.
 */

const state: {
  requests: Array<Record<string, unknown>>;
  queuedAfterSave: boolean;
  saved: boolean;
} = { requests: [], queuedAfterSave: false, saved: false };

const toastSuccess = vi.fn();
vi.mock('react-hot-toast', () => ({
  default: Object.assign(vi.fn(), { success: (...a: unknown[]) => toastSuccess(...a), error: vi.fn() }),
}));

vi.mock('../lib/supabase', () => {
  const chain = (table: string) => {
    let mode: 'select' | 'update' = 'select';
    let statusFilter = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c: any = {
      select: vi.fn(() => c),
      update: vi.fn(() => { mode = 'update'; return c; }),
      eq: vi.fn(() => c),
      in: vi.fn(() => { statusFilter = true; return c; }),
      order: vi.fn(() => c),
      limit: vi.fn(() => c),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      then: (resolve?: any) => {
        if (mode === 'update') { state.saved = true; return Promise.resolve({ data: null, error: null }).then(resolve); }
        if (table === 'instagram_sync_requests') {
          if (statusFilter) {
            return Promise.resolve({ data: state.queuedAfterSave ? [{ status: 'pending' }] : [], error: null }).then(resolve);
          }
          return Promise.resolve({ data: state.requests, error: null }).then(resolve);
        }
        return Promise.resolve({ data: [], error: null }).then(resolve);
      },
    };
    return c;
  };
  return {
    supabase: {
      from: vi.fn((t: string) => chain(t)),
      functions: { invoke: vi.fn(async () => ({ data: null, error: null })) },
    },
  };
});

import BusinessStoryEditor from '../components/dashboard/BusinessStoryEditor';
import type { Business } from '../types';

const claimed = {
  id: 'b1', name: 'YemzoArts Studios', claim_status: 'claimed', user_id: 'u1',
  social_links: { instagram: 'https://instagram.com/yemzoarts' },
} as unknown as Business;

beforeEach(() => {
  state.requests = [];
  state.queuedAfterSave = false;
  state.saved = false;
  toastSuccess.mockClear();
});

describe('BusinessStoryEditor Instagram sync line', () => {
  it('explains the sync for a claimed business, honestly', () => {
    render(<BusinessStoryEditor business={claimed} onClose={() => {}} />);
    expect(screen.getByText(/we bring your latest Instagram posts into your gallery/i)).toBeTruthy();
    expect(screen.getByText(/checked every few hours/i)).toBeTruthy();
  });

  it('says nothing about syncing for an unclaimed listing', () => {
    const unclaimed = { ...claimed, claim_status: 'unclaimed', user_id: null } as unknown as Business;
    render(<BusinessStoryEditor business={unclaimed} onClose={() => {}} />);
    expect(screen.queryByText(/we bring your latest Instagram posts/i)).toBeNull();
  });

  it('shows the latest request as the database reports it', async () => {
    state.requests = [{
      status: 'done', handle: 'yemzoarts', requested_at: '2026-11-15T10:00:00Z',
      processed_at: '2026-11-15T10:01:00Z', posts_added: 12, note: null,
    }];
    render(<BusinessStoryEditor business={claimed} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/12 posts from @yemzoarts added/));
  });

  it('only announces a sync the database queued', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<BusinessStoryEditor business={claimed} onClose={() => {}} />);
    const ig = screen.getByLabelText('Instagram') as HTMLInputElement;
    await user.clear(ig);
    await user.type(ig, '@yemzo_new');

    // Nothing queued (e.g. the owner switched syncing off): no promise made.
    { const saves = screen.getAllByRole('button', { name: /save/i }); await user.click(saves[saves.length - 1]); }
    await waitFor(() => expect(state.saved).toBe(true));
    expect(toastSuccess).not.toHaveBeenCalledWith(expect.stringMatching(/Instagram posts/));
    unmount();

    state.queuedAfterSave = true;
    state.saved = false;
    render(<BusinessStoryEditor business={claimed} onClose={() => {}} />);
    const ig2 = screen.getByLabelText('Instagram') as HTMLInputElement;
    await user.clear(ig2);
    await user.type(ig2, '@yemzo_new');
    { const saves = screen.getAllByRole('button', { name: /save/i }); await user.click(saves[saves.length - 1]); }
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith(expect.stringMatching(/latest Instagram posts/)));
  });
});
