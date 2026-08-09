import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import AdminCreatorShell from '../components/admin/AdminCreatorShell';
import { applySeo } from '../lib/seo';

// Internal-only. Same protection as the admin console: a role check on the
// users table, RLS backing every read underneath, and a dev-only bypass (the
// local dev server is mode 'development', so admin pages are reachable without
// signing in; vitest stays on 'test' and production on 'production'). The
// ?preview flag still works for non-dev previews. All compiled out of
// production builds.
const DEV_PREVIEW =
  import.meta.env.MODE === 'development' ||
  (import.meta.env.DEV && new URLSearchParams(window.location.search).has('preview'));

export default function AdminCreator() {
  const { user: authUser, loading: authLoading } = useAuth();
  const [role, setRole] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    return applySeo({
      title: 'Admin Creator OS — NowOpen Africa',
      description: 'NowOpen Africa internal growth operating system.',
      path: '/admin-creator',
      robots: 'noindex, nofollow',
    });
  }, []);

  useEffect(() => {
    if (DEV_PREVIEW) {
      setRole('admin');
      setChecking(false);
      return;
    }
    if (authLoading) return;
    const checkRole = async () => {
      if (!authUser) { setRole(null); setChecking(false); return; }
      const { data } = await supabase
        .from('users')
        .select('role')
        .eq('id', authUser.id)
        .maybeSingle();
      setRole(data?.role || 'business');
      setChecking(false);
    };
    void checkRole();
  }, [authUser, authLoading]);

  if (checking) {
    return <div className="min-h-[60vh] flex items-center justify-center text-sm text-gray-400">Checking access…</div>;
  }

  if (role !== 'admin') {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Internal team only</h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            NowOpen Admin Creator is the internal operating system for the NowOpen Africa team.
            Business tools live in NowOpen Studio.
          </p>
        </div>
      </div>
    );
  }

  return <AdminCreatorShell />;
}
