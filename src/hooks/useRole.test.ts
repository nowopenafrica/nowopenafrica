import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

/**
 * The hook behind the admin gate.
 *
 * WHY THIS FILE EXISTS
 *
 * A full page load of `/admin` redirected a genuine admin to `/dashboard`,
 * every time, on production. In-app navigation worked — so the console looked
 * fine until somebody bookmarked it or pressed reload.
 *
 * `adminRoute.smoke.test.tsx` could never have caught it: it mocks `useRole`
 * and hands `AdminRoute` a role directly, which tests the gate in isolation
 * from the thing that was actually wrong. The bug lived one layer down, in the
 * moment between `user` arriving and the role being fetched.
 *
 * So these tests drive the real hook through the real transition.
 */

const maybeSingle = vi.fn();
vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }),
  },
}));

const useAuthMock = vi.fn();
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => useAuthMock(),
}));

import { useRole } from './useRole';

beforeEach(() => {
  vi.clearAllMocks();
  maybeSingle.mockResolvedValue({ data: { role: 'admin' } });
});

describe('it never reports a resolved non-admin while the lookup is pending', () => {
  it('is still checking on the render where the user first appears', async () => {
    /*
     * THE BUG, reproduced.
     *
     * `checking` used to be a boolean set inside the effect. On a cold load:
     *
     *   1. `user` is null → the effect's early return sets checking = false.
     *   2. Auth resolves. React RENDERS with `user` truthy, `checking` false
     *      and `role` null.
     *   3. AdminRoute evaluates on exactly that render, sees a signed-in user
     *      with a non-admin role and nothing pending, and navigates away.
     *   4. The effect then sets checking = true. Too late.
     *
     * The assertion that matters is the one on the render immediately after
     * `user` appears: it must NOT look like a settled "not an admin".
     */
    useAuthMock.mockReturnValue({ user: null, loading: true });
    const { result, rerender } = renderHook(() => useRole());

    // Signed out is a resolved state, not a pending one — otherwise the login
    // redirect would never fire.
    expect(result.current.checking).toBe(false);
    expect(result.current.role).toBeNull();

    // Auth resolves. This is the render that used to redirect.
    useAuthMock.mockReturnValue({ user: { id: 'u1' }, loading: false });
    rerender();

    expect(
      result.current.checking,
      'a user with no role yet must read as pending, not as "not an admin"',
    ).toBe(true);

    await waitFor(() => expect(result.current.role).toBe('admin'));
    expect(result.current.checking).toBe(false);
  });

  it('goes back to checking when the user changes', async () => {
    // Otherwise a second account briefly inherits the first one's role — which
    // on this hook would mean briefly inheriting admin.
    useAuthMock.mockReturnValue({ user: { id: 'u1' }, loading: false });
    const { result, rerender } = renderHook(() => useRole());
    await waitFor(() => expect(result.current.role).toBe('admin'));

    maybeSingle.mockResolvedValue({ data: { role: 'business' } });
    useAuthMock.mockReturnValue({ user: { id: 'u2' }, loading: false });
    rerender();

    expect(result.current.checking, 'the stale role must not be trusted').toBe(true);
    await waitFor(() => expect(result.current.role).toBe('business'));
  });
});

describe('it always settles', () => {
  it('resolves a user with no profile row', async () => {
    maybeSingle.mockResolvedValue({ data: null });
    useAuthMock.mockReturnValue({ user: { id: 'u1' }, loading: false });
    const { result } = renderHook(() => useRole());
    await waitFor(() => expect(result.current.checking).toBe(false));
    expect(result.current.role).toBeNull();
  });

  it('resolves when the lookup throws', async () => {
    // A failed lookup is an answer — no role. Leaving it pending would spin
    // the gate's loading state forever, which is worse than a redirect.
    maybeSingle.mockRejectedValue(new Error('network'));
    useAuthMock.mockReturnValue({ user: { id: 'u1' }, loading: false });
    const { result } = renderHook(() => useRole());
    await waitFor(() => expect(result.current.checking).toBe(false));
    expect(result.current.role).toBeNull();
  });

  it('reports a non-admin role plainly once resolved', async () => {
    maybeSingle.mockResolvedValue({ data: { role: 'business' } });
    useAuthMock.mockReturnValue({ user: { id: 'u1' }, loading: false });
    const { result } = renderHook(() => useRole());
    await waitFor(() => expect(result.current.checking).toBe(false));
    expect(result.current.role).toBe('business');
  });

  it('clears the role on sign-out', async () => {
    useAuthMock.mockReturnValue({ user: { id: 'u1' }, loading: false });
    const { result, rerender } = renderHook(() => useRole());
    await waitFor(() => expect(result.current.role).toBe('admin'));

    useAuthMock.mockReturnValue({ user: null, loading: false });
    rerender();
    await waitFor(() => expect(result.current.role).toBeNull());
    expect(result.current.checking).toBe(false);
  });
});
