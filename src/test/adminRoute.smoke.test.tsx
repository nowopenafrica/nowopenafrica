import { describe, it, vi, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('../contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../hooks/useRole', () => ({
  useRole: vi.fn(),
}));

import AdminRoute from '../components/AdminRoute';
import { useAuth } from '../contexts/AuthContext';
import { useRole } from '../hooks/useRole';

const mockedUseAuth = vi.mocked(useAuth);
const mockedUseRole = vi.mocked(useRole);

const adminContent = <div>admin content</div>;

function renderAtAdmin(adminOnly = false, editorPlus = false) {
  return render(
    <MemoryRouter initialEntries={['/admin']}>
      <Routes>
        <Route path="/admin" element={<AdminRoute adminOnly={adminOnly} editorPlus={editorPlus}>{adminContent}</AdminRoute>} />
        <Route path="/login" element={<div>login page</div>} />
        <Route path="/dashboard" element={<div>dashboard page</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('AdminRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders children for a signed-in admin', () => {
    mockedUseAuth.mockReturnValue({ user: { id: 'u1' }, loading: false } as never);
    mockedUseRole.mockReturnValue({ role: 'admin', checking: false });
    renderAtAdmin();
    expect(screen.getByText('admin content')).toBeInTheDocument();
    expect(screen.queryByText('login page')).not.toBeInTheDocument();
    expect(screen.queryByText('dashboard page')).not.toBeInTheDocument();
  });

  it('shows a spinner while auth or role is still loading', () => {
    mockedUseAuth.mockReturnValue({ user: null, loading: true } as never);
    mockedUseRole.mockReturnValue({ role: null, checking: true });
    renderAtAdmin();
    expect(document.querySelector('.animate-spin')).toBeInTheDocument();
    expect(screen.queryByText('admin content')).not.toBeInTheDocument();
  });

  it('redirects signed-out users to /login', () => {
    mockedUseAuth.mockReturnValue({ user: null, loading: false } as never);
    mockedUseRole.mockReturnValue({ role: null, checking: false });
    renderAtAdmin();
    expect(screen.getByText('login page')).toBeInTheDocument();
    expect(screen.queryByText('admin content')).not.toBeInTheDocument();
  });

  it('redirects signed-in non-admins to /dashboard', () => {
    mockedUseAuth.mockReturnValue({ user: { id: 'u1' }, loading: false } as never);
    mockedUseRole.mockReturnValue({ role: 'business', checking: false });
    renderAtAdmin();
    expect(screen.getByText('dashboard page')).toBeInTheDocument();
    expect(screen.queryByText('admin content')).not.toBeInTheDocument();
  });

  it('admits a signed-in editor to the admin console', () => {
    mockedUseAuth.mockReturnValue({ user: { id: 'u1' }, loading: false } as never);
    mockedUseRole.mockReturnValue({ role: 'editor', checking: false });
    renderAtAdmin();
    expect(screen.getByText('admin content')).toBeInTheDocument();
    expect(screen.queryByText('dashboard page')).not.toBeInTheDocument();
  });

  it('keeps the Admin Creator admin-only even for an editor', () => {
    mockedUseAuth.mockReturnValue({ user: { id: 'u1' }, loading: false } as never);
    mockedUseRole.mockReturnValue({ role: 'editor', checking: false });
    renderAtAdmin(true);
    expect(screen.getByText('dashboard page')).toBeInTheDocument();
    expect(screen.queryByText('admin content')).not.toBeInTheDocument();
  });

  it('admits an admin through the Admin Creator gate', () => {
    mockedUseAuth.mockReturnValue({ user: { id: 'u1' }, loading: false } as never);
    mockedUseRole.mockReturnValue({ role: 'admin', checking: false });
    renderAtAdmin(true);
    expect(screen.getByText('admin content')).toBeInTheDocument();
    expect(screen.queryByText('dashboard page')).not.toBeInTheDocument();
  });

  it('admits an editor through the Business Intelligence gate', () => {
    mockedUseAuth.mockReturnValue({ user: { id: 'u1' }, loading: false } as never);
    mockedUseRole.mockReturnValue({ role: 'editor', checking: false });
    renderAtAdmin(false, true);
    expect(screen.getByText('admin content')).toBeInTheDocument();
    expect(screen.queryByText('dashboard page')).not.toBeInTheDocument();
  });

  it('admits an admin through the Business Intelligence gate', () => {
    mockedUseAuth.mockReturnValue({ user: { id: 'u1' }, loading: false } as never);
    mockedUseRole.mockReturnValue({ role: 'admin', checking: false });
    renderAtAdmin(false, true);
    expect(screen.getByText('admin content')).toBeInTheDocument();
    expect(screen.queryByText('dashboard page')).not.toBeInTheDocument();
  });

  it('keeps a business curator out of the Business Intelligence gate', () => {
    mockedUseAuth.mockReturnValue({ user: { id: 'u1' }, loading: false } as never);
    mockedUseRole.mockReturnValue({ role: 'business_curator', checking: false });
    renderAtAdmin(false, true);
    expect(screen.getByText('dashboard page')).toBeInTheDocument();
    expect(screen.queryByText('admin content')).not.toBeInTheDocument();
  });
});
