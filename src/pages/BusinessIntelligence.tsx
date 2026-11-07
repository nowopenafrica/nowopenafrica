import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import BusinessIntelligencePanel from '../components/admin/BusinessIntelligencePanel';
import { canAccessIntelligence } from '../lib/permissions';
import { applySeo } from '../lib/seo';

// Internal operations area. Same gates as the Admin Creator: role re-check on
// the users table, RLS behind every read, dev-only preview bypass compiled out
// of production builds.
const DEV_PREVIEW =
  import.meta.env.MODE === 'development' ||
  (import.meta.env.DEV && new URLSearchParams(window.location.search).has('preview'));

export default function BusinessIntelligence() {
  const { user: authUser, loading: authLoading } = useAuth();
  const [role, setRole] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    return applySeo({
      title: 'Business Intelligence — NowOpen Africa',
      description: 'NowOpen Africa business discovery and claim engine.',
      path: '/admin/business-intelligence',
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

  if (!canAccessIntelligence(role)) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Internal team only</h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Business Intelligence is the acquisition operations area for the NowOpen Africa team.
          </p>
        </div>
      </div>
    );
  }

  return <BusinessIntelligencePanel />;
}