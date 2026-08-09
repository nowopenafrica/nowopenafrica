import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useRole } from '../hooks/useRole';

// Route-level gate for the admin console and Admin Creator OS. Keeps the same
// dev-only ?preview flag as the pages themselves (compiled out of production
// builds) and additionally bypasses the login wall while the local dev server
// is running (mode 'development' only — vitest stays on 'test', production
// stays on 'production', so the gate is still exercised in tests and builds).
// Otherwise it requires a signed-in user with the admin role and redirects
// elsewhere. The pages still re-check the role and Supabase RLS backs every
// read — this is defence in depth, so /admin and /admin-creator are never
// reachable without a session in production.
const DEV_PREVIEW =
  import.meta.env.MODE === 'development' ||
  (import.meta.env.DEV && new URLSearchParams(window.location.search).has('preview'));

interface AdminRouteProps {
  children: React.ReactNode;
}

export default function AdminRoute({ children }: AdminRouteProps) {
  const { user, loading } = useAuth();
  const { role, checking } = useRole();
  const location = useLocation();

  if (DEV_PREVIEW) {
    return <>{children}</>;
  }

  if (loading || checking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (role !== 'admin') {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
