import { describe, it, vi, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// jsdom has no scrollIntoView — the embedded Studio tools call it on mount.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

vi.mock('../lib/supabase', () => {
  const tableData: Record<string, unknown[]> = {
    users: [{ id: 'u1', role: 'admin', created_at: new Date().toISOString(), plan_status: 'active' }],
    businesses: [
      { id: 'b1', name: 'Test Cafe', category: 'Restaurant', location: 'Lagos', description: 'A test cafe', verified: true, created_at: new Date().toISOString() },
      { id: 'b2', name: 'Tailor Spot', category: 'Fashion', location: 'Abuja', description: 'A tailor', verified: false, created_at: new Date().toISOString() },
    ],
    payment_intents: [{ status: 'paid', amount_local: 5000, currency: 'NGN', created_at: new Date().toISOString() }],
    verification_docs: [{ status: 'pending' }],
    business_registrations: [{ id: 'r1' }],
    platform_enquiries: [{ id: 'e1' }],
    waitlist: [{ invited: false }],
    social_publish_log: [{ status: 'ok' }, { status: 'simulated' }],
  };
  const q = (data: unknown) => {
    const result = { data, error: null };
    const chain: any = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      order: vi.fn(() => chain),
      maybeSingle: vi.fn(async () => ({
        data: Array.isArray(data) ? data[0] ?? null : data ?? null,
        error: null,
      })),
      then: (onF?: any, onR?: any) => Promise.resolve(result).then(onF, onR),
      catch: (onR?: any) => Promise.resolve(result).catch(onR),
      finally: (onF?: any) => Promise.resolve(result).finally(onF),
    };
    return chain;
  };
  return {
    supabase: {
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
        onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      },
      from: vi.fn((table: string) => q(tableData[table] ?? [])),
    },
  };
});

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'u1', email: 'admin@nowopen.africa' },
    session: null,
    loading: false,
    signOut: vi.fn().mockResolvedValue(undefined),
  }),
}));

import AdminCreatorShell from '../components/admin/AdminCreatorShell';
import { ADMIN_SECTIONS } from '../lib/adminCreator';

describe('AdminCreatorShell smoke', () => {
  it('renders the command center as the front door', async () => {
    render(
      <MemoryRouter>
        <AdminCreatorShell />
      </MemoryRouter>
    );
    expect(screen.getByRole('heading', { name: /Growth Command Center/i })).toBeInTheDocument();
    expect(await screen.findByText(/Today's briefing/)).toBeInTheDocument();
    expect(screen.getAllByText(/Revenue today/).length).toBeGreaterThan(0);
    expect(screen.getByText('Platform uptime')).toBeInTheDocument();
  });

  it('opens every roadmap section without crashing', async () => {
    render(
      <MemoryRouter>
        <AdminCreatorShell />
      </MemoryRouter>
    );
    for (const s of ADMIN_SECTIONS) {
      const sidebarButton = screen.getAllByRole('button', { name: new RegExp(s.label) })[0];
      fireEvent.click(sidebarButton);
      expect(screen.getAllByRole('heading', { name: s.label }).length).toBeGreaterThan(0);
    }
  });

  it('loads the live modules with their embedded Studio tools', async () => {
    render(
      <MemoryRouter>
        <AdminCreatorShell />
      </MemoryRouter>
    );

    // #5 Social Media Department embeds Schedule & Publish for a picked business.
    fireEvent.click(screen.getAllByRole('button', { name: /Social Media Department/ })[0]);
    expect(await screen.findByText(/Schedule & Publish — Test Cafe/)).toBeInTheDocument();

    // #6 Campaign Factory embeds the Campaign Manager.
    fireEvent.click(screen.getAllByRole('button', { name: /Campaign Factory/ })[0]);
    expect(await screen.findByText(/Campaign Manager — Test Cafe/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /One-Click Campaigns/ })).toBeInTheDocument();
  });

  it('renders every newly-live department with its embedded tool', async () => {
    render(
      <MemoryRouter>
        <AdminCreatorShell />
      </MemoryRouter>
    );

    const live: Record<string, RegExp> = {
      'Creative Studio': /Design Studio —/,
      'AI Video Studio': /AI Video Studio —/,
      'Content Factory': /Content Factory —/,
      'Brand Asset Manager': /Brand Assets —/,
      'AI Brand Director': /AI Brand Director —/,
      'Trend Discovery': /Trend Radar —/,
      'Analytics War Room': /Campaign Analytics —/,
    };

    for (const [label, title] of Object.entries(live)) {
      fireEvent.click(screen.getAllByRole('button', { name: new RegExp(label) })[0]);
      expect(await screen.findByText(title)).toBeInTheDocument();
    }

    // #8 Community Management reads the real platform enquiries.
    fireEvent.click(screen.getAllByRole('button', { name: /Community Management/ })[0]);
    expect(await screen.findByText('Total enquiries')).toBeInTheDocument();

    // The internal departments render their real pages too.
    const internal: Record<string, RegExp> = {
      'Founder Dashboard': /Company Health Score/,
      'Motion Studio': /Pick your format/,
      'Video Template Library': /Template library —/,
      'Design System': /Colour/,
      'AI Prompt Library': /Prompt library/,
      'Press Room': /^Press kit$/,
      'Partnership CRM': /Add a partner/,
      'Launch Control': /Open a launch/,
      'Internal Knowledge Base': /Knowledge base/,
    };
    for (const [label, title] of Object.entries(internal)) {
      fireEvent.click(screen.getAllByRole('button', { name: new RegExp(label) })[0]);
      expect(await screen.findByText(title)).toBeInTheDocument();
    }

    // Motion Studio: a template in Quick Create opens the shared project in the
    // Studio editor with the free-canvas ↔ AI video gen choice and live preview.
    fireEvent.click(screen.getAllByRole('button', { name: /Motion Studio/ })[0]);
    expect(screen.getByText('Template gallery')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Neo-Brutalism/ }));
    expect(await screen.findByRole('button', { name: 'Free canvas' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'AI video gen' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'AI video gen' }));
    // "Premium", not "Paid" — and its sibling is "Open-weight", not "Free".
    // Both tiers bill through the renderer, so a Free/Paid toggle was telling
    // owners one of them was free of charge when neither is.
    expect(await screen.findByRole('button', { name: 'Premium' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open-weight' })).toBeInTheDocument();
    expect(screen.getByText('Live preview')).toBeInTheDocument();
    // Captions live in the Text drawer of the editor shell.
    fireEvent.click(screen.getByRole('button', { name: 'Text' }));
    expect(screen.getByLabelText(/Headline/)).toHaveValue('BIG ENERGY');

    // The AI Video Studio exposes the AI video generation option with tiers.
    fireEvent.click(screen.getAllByRole('button', { name: /AI Video Studio/ })[0]);
    expect(await screen.findByRole('button', { name: /AI video generation/ })).toBeInTheDocument();
    // This tour clicks through ~20 departments with async finds; under the full
    // suite's parallel load the default 5s cap flakes. The budget is enlarged,
    // the assertions are unchanged.
  }, 60000);
});
