import { describe, it, vi, expect, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';

/**
 * The Media owners admin tab, rendered against a fake supabase client.
 *
 * Nothing here can reach a database: the client is mocked, and every write the
 * panel attempts is recorded so a test can assert that a refused action (no
 * source URL, no reason, no method) made NO call at all. supabase-js resolves
 * with `{ data, error }` rather than throwing, so the error case returns an
 * error object and asserts the text reaches the screen.
 */

interface Call { table?: string; op: string; payload?: unknown; filters: unknown[]; rpc?: string }
const calls: Call[] = [];
const state: {
  owners: unknown[];
  placements: unknown[];
  contacts: unknown[];
  documents: unknown[];
  writeError: { message: string } | null;
  auditError: { message: string } | null;
} = { owners: [], placements: [], contacts: [], documents: [], writeError: null, auditError: null };
const openSpy = vi.fn();

vi.mock('../lib/supabase', () => {
  const chainFor = (table: string) => {
    const call: Call = { table, op: 'select', filters: [] };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chain: any = {};
    const passthrough = (name: string) => vi.fn((...args: unknown[]) => {
      call.filters.push([name, ...args]);
      return chain;
    });
    for (const m of ['eq', 'in', 'order', 'limit', 'range']) chain[m] = passthrough(m);
    chain.select = vi.fn((...args: unknown[]) => { call.filters.push(['select', ...args]); return chain; });
    for (const m of ['insert', 'update', 'upsert']) {
      chain[m] = vi.fn((payload: unknown) => { call.op = m; call.payload = payload; return chain; });
    }
    const result = () => {
      calls.push(call);
      if (call.op !== 'select') {
        const err = table === 'audit_log' ? state.auditError : state.writeError;
        return err ? { data: null, error: err } : { data: [{ id: 'p1' }], error: null };
      }
      const rows = table === 'media_owners' ? state.owners
        : table === 'advertisements' ? state.placements
        : table === 'media_owner_contacts' ? state.contacts
        : table === 'media_owner_documents' ? state.documents : [];
      return { data: rows, error: null };
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    chain.then = (f?: any, r?: any) => Promise.resolve(result()).then(f, r);
    return chain;
  };
  return {
    supabase: {
      from: vi.fn((t: string) => chainFor(t)),
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'admin-1', email: 'admin@nowopen.africa' } }, error: null })) },
      rpc: vi.fn(async (name: string, args: unknown) => {
        calls.push({ op: 'rpc', rpc: name, payload: args, filters: [] });
        return state.writeError ? { data: null, error: state.writeError } : { data: null, error: null };
      }),
      storage: {
        from: vi.fn((bucket: string) => ({
          createSignedUrl: vi.fn(async (path: string, secs: number) => {
            calls.push({ op: 'sign', table: bucket, payload: { path, secs }, filters: [] });
            return { data: { signedUrl: `https://signed.example/${path}` }, error: null };
          }),
        })),
      },
    },
  };
});

import MediaOwnersPanel from '../components/admin/MediaOwnersPanel';
import { canAccessTab } from '../lib/permissions';

const writes = () => calls.filter((c) => c.op !== 'select' && c.op !== 'sign');

beforeEach(() => {
  calls.length = 0;
  state.writeError = null;
  state.auditError = null;
  state.owners = [
    { id: 'o1', name: 'Lagos Billboards Ltd', website: 'https://lagosboards.example', country_codes: ['NG'], business_id: null, verification: 'unverified', verification_note: null, relationship: 'prospect' },
    { id: 'o2', name: 'Accra Outdoor', website: null, country_codes: ['GH'], business_id: null, verification: 'verified', verification_note: 'CAC certificate seen', relationship: 'active' },
  ];
  state.placements = [
    { id: 'p1', title: 'Third Mainland Bridge board', lifecycle: 'imported', owner_id: null, owner_role: null },
  ];
  state.contacts = [];
  state.documents = [];
  openSpy.mockReset();
  vi.stubGlobal('open', openSpy);
});

async function open(name = 'Lagos Billboards Ltd') {
  render(<MediaOwnersPanel />);
  await screen.findByText(name);
}

describe('Media owners panel', () => {
  it('lists owners with their verification badge', async () => {
    await open();
    const lagos = screen.getByTestId('owner-o1');
    const accra = screen.getByTestId('owner-o2');
    expect(within(lagos).getByText('Unverified')).toBeInTheDocument();
    expect(within(accra).getByText('Verified')).toBeInTheDocument();
  });

  it('keeps Verify disabled until a documents note is typed', async () => {
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'Manage Lagos Billboards Ltd' }));
    const verify = screen.getByRole('button', { name: 'Verify' });
    expect(verify).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Documents checked'), { target: { value: '   ' } });
    expect(verify).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Documents checked'), { target: { value: 'CAC certificate and lease seen' } });
    expect(verify).toBeEnabled();
    fireEvent.click(verify);
    await waitFor(() => expect(writes()).toHaveLength(1));
    // Only the verification and its note: the database stamps who and when.
    expect(writes()[0]).toMatchObject({
      table: 'media_owners',
      op: 'update',
      payload: { verification: 'verified', verification_note: 'CAC certificate and lease seen' },
    });
    expect(Object.keys(writes()[0].payload as object).sort()).toEqual(['verification', 'verification_note']);
  });

  it('refuses a contact with no source URL and calls nothing', async () => {
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'Manage Lagos Billboards Ltd' }));
    fireEvent.change(screen.getByLabelText('Contact value'), { target: { value: 'sales@lagosboards.example' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add contact' }));
    expect(await screen.findByText('Add where you found this contact')).toBeInTheDocument();
    expect(writes()).toHaveLength(0);
  });

  it('adds a contact with its source', async () => {
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'Manage Lagos Billboards Ltd' }));
    fireEvent.change(screen.getByLabelText('Contact value'), { target: { value: 'sales@lagosboards.example' } });
    fireEvent.change(screen.getByLabelText('Source URL'), { target: { value: 'https://lagosboards.example/contact' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add contact' }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toMatchObject({
      table: 'media_owner_contacts',
      op: 'insert',
      payload: { owner_id: 'o1', value: 'sales@lagosboards.example', source_url: 'https://lagosboards.example/contact' },
    });
  });

  it('sends the chosen role when linking placements', async () => {
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'Manage Lagos Billboards Ltd' }));
    fireEvent.click(screen.getByLabelText('Select placement Third Mainland Bridge board'));
    fireEvent.change(screen.getByLabelText('Link role'), { target: { value: 'authorised_representative' } });
    fireEvent.click(screen.getByRole('button', { name: 'Link placements' }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toMatchObject({
      table: 'advertisements',
      op: 'update',
      payload: { owner_id: 'o1', owner_role: 'authorised_representative' },
    });
    expect(writes()[0].filters).toContainEqual(['in', 'id', ['p1']]);
  });

  it('requires a method and a from-date to record a confirmation', async () => {
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm availability for Third Mainland Bridge board' }));
    fireEvent.click(screen.getByRole('button', { name: 'Record confirmation' }));
    expect(await screen.findByText('Choose how this was confirmed and the from-date')).toBeInTheDocument();
    expect(writes()).toHaveLength(0);

    fireEvent.change(screen.getByLabelText('Method'), { target: { value: 'email' } });
    fireEvent.change(screen.getByLabelText('From date'), { target: { value: '2026-11-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Record confirmation' }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toMatchObject({
      table: 'placement_availability',
      op: 'insert',
      payload: { advert_id: 'p1', method: 'email', period_from: '2026-11-01', status: 'available' },
    });
  });

  it.each([['Archive'], ['Reject']])('%s needs a reason and goes through the lifecycle RPC', async (verb) => {
    await open();
    fireEvent.click(screen.getByRole('button', { name: `${verb} Third Mainland Bridge board` }));
    const confirm = screen.getByRole('button', { name: `${verb} placement` });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Board was taken down' } });
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toMatchObject({
      op: 'rpc',
      rpc: 'set_placement_lifecycle',
      payload: {
        p_advert_id: 'p1',
        p_lifecycle: verb === 'Archive' ? 'archived' : 'rejected',
        p_reason: 'Board was taken down',
      },
    });
  });

  it('unverify needs a reason, keeps the documents note, and reopens empty', async () => {
    await open('Accra Outdoor');
    fireEvent.click(screen.getByRole('button', { name: 'Manage Accra Outdoor' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove verification' }));
    const confirm = () => screen.getAllByRole('button', { name: 'Remove verification' }).slice(-1)[0];
    expect(confirm()).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Lease lapsed' } });
    expect(confirm()).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove verification' }));
    expect(screen.getByLabelText('Reason')).toHaveValue('');
    expect(confirm()).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Lease lapsed' } });
    fireEvent.click(confirm());
    await waitFor(() => expect(writes()).toHaveLength(2));
    expect(writes()[0].payload).toEqual({ verification: 'unverified' });
    expect(writes()[1]).toMatchObject({
      table: 'audit_log',
      op: 'insert',
      payload: {
        actor_id: 'admin-1',
        actor_email: 'admin@nowopen.africa',
        action: 'media_owner.unverify_reason',
        entity_type: 'media_owner',
        entity_id: 'o2',
        detail: { reason: 'Lease lapsed' },
      },
    });
    expect(writes()[1].filters.some((f) => (f as unknown[])[0] === 'select')).toBe(false);
  });

  it('says so when the owner was un-verified but the reason could not be recorded', async () => {
    await open('Accra Outdoor');
    state.auditError = { message: 'permission denied for audit_log' };
    fireEvent.click(screen.getByRole('button', { name: 'Manage Accra Outdoor' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove verification' }));
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Lease lapsed' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove verification' }).slice(-1)[0]);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The owner was un-verified, but the reason could not be recorded');
    expect(alert).toHaveTextContent('permission denied for audit_log');
  });

  it.each([['ftp://x'], ['example.com']])('refuses contact source %s and calls nothing', async (url) => {
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'Manage Lagos Billboards Ltd' }));
    fireEvent.change(screen.getByLabelText('Contact value'), { target: { value: 'sales@lagosboards.example' } });
    fireEvent.change(screen.getByLabelText('Source URL'), { target: { value: url } });
    fireEvent.click(screen.getByRole('button', { name: 'Add contact' }));
    expect(await screen.findByText('Add where you found this contact')).toBeInTheDocument();
    expect(writes()).toHaveLength(0);
  });

  it('shows a database error as text instead of a silent success', async () => {
    await open();
    state.writeError = { message: "Only an admin can change a media owner's verification" };
    fireEvent.click(screen.getByRole('button', { name: 'Manage Lagos Billboards Ltd' }));
    fireEvent.change(screen.getByLabelText('Documents checked'), { target: { value: 'seen' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("Only an admin can change a media owner's verification");
    expect(screen.queryByText(/saved|verified successfully/i)).not.toBeInTheDocument();
  });

  it('warns before re-linking a placement that already belongs to another owner', async () => {
    state.placements = [
      { id: 'p1', title: 'Third Mainland Bridge board', lifecycle: 'imported', owner_id: null, owner_role: null },
      { id: 'p2', title: 'Ikeja gantry', lifecycle: 'imported', owner_id: 'o2', owner_role: 'owner' },
      { id: 'p3', title: 'Lekki screen', lifecycle: 'imported', owner_id: 'o1', owner_role: 'owner' },
    ];
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'Manage Lagos Billboards Ltd' }));
    const manage = screen.getByRole('region', { name: 'Manage Lagos Billboards Ltd' });
    // Linked to Accra Outdoor: the move is said before it happens.
    const p2 = within(manage).getByLabelText('Select placement Ikeja gantry').closest('li') as HTMLElement;
    expect(p2).toHaveTextContent('Already linked to Accra Outdoor — linking moves it');
    // Unlinked, or already this owner's: no warning.
    const p1 = within(manage).getByLabelText('Select placement Third Mainland Bridge board').closest('li') as HTMLElement;
    const p3 = within(manage).getByLabelText('Select placement Lekki screen').closest('li') as HTMLElement;
    expect(p1).not.toHaveTextContent(/Already linked/);
    expect(p3).not.toHaveTextContent(/Already linked/);
  });

  it('shows the same validation words as the data layer (one constants object)', async () => {
    const { MEDIA_OWNER_MESSAGES } = await import('../lib/promote/mediaOwners');
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'Manage Lagos Billboards Ltd' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add contact' }));
    expect(await screen.findByText(MEDIA_OWNER_MESSAGES.contactSourceRequired)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Source URL'), { target: { value: 'https://lagosboards.example/contact' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add contact' }));
    expect(await screen.findByText(MEDIA_OWNER_MESSAGES.contactValueRequired)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm availability for Third Mainland Bridge board' }));
    fireEvent.click(screen.getByRole('button', { name: 'Record confirmation' }));
    expect(await screen.findByText(MEDIA_OWNER_MESSAGES.confirmationMethodAndFrom)).toBeInTheDocument();
    expect(writes()).toHaveLength(0);
    // No copy of those words left in the panel's own source.
    const src = readFileSync('src/components/admin/MediaOwnersPanel.tsx', 'utf8');
    for (const words of Object.values(MEDIA_OWNER_MESSAGES)) expect(src).not.toContain(`'${words}'`);
  });
});

describe('Waiting for verification', () => {
  beforeEach(() => {
    state.owners = [
      ...state.owners,
      { id: 'o3', name: 'Kano Screens', website: null, country_codes: ['NG'], business_id: 'b9', verification: 'documents_submitted', verification_note: null, relationship: 'onboarding' },
    ];
    state.documents = [
      { id: 'd1', owner_id: 'o3', kind: 'registration', storage_path: 'media-owners/o3/registration-1.pdf', uploaded_at: '2026-11-01T10:00:00Z' },
      { id: 'd2', owner_id: 'o3', kind: 'signage_permit', storage_path: 'media-owners/o3/signage_permit-2.jpg', uploaded_at: '2026-11-01T10:05:00Z' },
    ];
  });

  const waiting = async () => {
    render(<MediaOwnersPanel />);
    return screen.findByRole('region', { name: 'Waiting for verification' });
  };

  it('lists only owners who sent documents', async () => {
    const list = await waiting();
    expect(await within(list).findByText('Kano Screens')).toBeInTheDocument();
    expect(within(list).queryByText('Lagos Billboards Ltd')).not.toBeInTheDocument();
    expect(within(list).queryByText('Accra Outdoor')).not.toBeInTheDocument();
  });

  it('opens each document through a 120-second signed URL', async () => {
    const list = await waiting();
    fireEvent.click(await within(list).findByRole('button', { name: 'Open Signage permit for Kano Screens' }));
    await waitFor(() => expect(openSpy).toHaveBeenCalledWith('https://signed.example/media-owners/o3/signage_permit-2.jpg', '_blank', 'noopener'));
    expect(calls.find((c) => c.op === 'sign')).toMatchObject({ table: 'verification-docs', payload: { path: 'media-owners/o3/signage_permit-2.jpg', secs: 120 } });
  });

  it('Verify needs a note and sends only the verification and the note', async () => {
    const list = await waiting();
    const verify = await within(list).findByRole('button', { name: 'Verify Kano Screens' });
    expect(verify).toBeDisabled();
    fireEvent.change(within(list).getByLabelText('Verification note for Kano Screens'), { target: { value: 'CAC certificate and permit match' } });
    expect(verify).toBeEnabled();
    fireEvent.click(verify);
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toMatchObject({
      table: 'media_owners', op: 'update',
      payload: { verification: 'verified', verification_note: 'CAC certificate and permit match' },
    });
    expect(writes()[0].filters).toContainEqual(['eq', 'id', 'o3']);
  });

  it('Reject needs a reason and calls admin_reject_owner', async () => {
    const list = await waiting();
    fireEvent.click(await within(list).findByRole('button', { name: 'Reject Kano Screens' }));
    const confirm = screen.getByRole('button', { name: 'Reject owner' });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Registration scan is unreadable' } });
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toMatchObject({
      op: 'rpc', rpc: 'admin_reject_owner',
      payload: { p_owner_id: 'o3', p_reason: 'Registration scan is unreadable' },
    });
  });

  it('shows a rejection error as text', async () => {
    const list = await waiting();
    state.writeError = { message: 'Only an admin can reject a media owner' };
    fireEvent.click(await within(list).findByRole('button', { name: 'Reject Kano Screens' }));
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'No' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reject owner' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Only an admin can reject a media owner');
  });

  it('says so when nobody is waiting', async () => {
    state.owners = state.owners.filter((o) => (o as { id: string }).id !== 'o3');
    const list = await waiting();
    expect(await within(list).findByText('Nobody is waiting for verification.')).toBeInTheDocument();
  });
});

describe('Media owners tab gating', () => {
  it('is available to admins only', () => {
    expect(canAccessTab('admin', 'media-owners')).toBe(true);
    expect(canAccessTab('editor', 'media-owners')).toBe(false);
    expect(canAccessTab('curator', 'media-owners')).toBe(false);
    expect(canAccessTab('business', 'media-owners')).toBe(false);
  });

  it('is wired into AdminDashboard next to ClaimReach', () => {
    const src = readFileSync('src/pages/AdminDashboard.tsx', 'utf8');
    expect(src).toMatch(/id: 'media-owners', label: 'Media owners', icon: Building2/);
    expect(src).toMatch(/activeTab === 'media-owners' && <MediaOwnersPanel \/>/);
  });
});

describe('Placements waiting for review', () => {
  const PENDING = {
    id: 'p9', title: 'Yaba LED screen', lifecycle: 'pending_review', owner_id: 'o1', owner_role: 'owner',
    category: 'Digital Screen', location: 'Lagos, Nigeria', site_address: 'Herbert Macaulay Way',
    dimensions: '1920x1080 screen · landscape', rate_amount: 300000, currency: 'NGN', rate_period: 'month',
    image_url: 'https://abc.supabase.co/storage/v1/object/public/business-images/placements/p9/1.jpg',
    media_urls: ['https://abc.supabase.co/storage/v1/object/public/business-images/placements/p9/1.jpg'],
    created_at: '2026-11-01T09:00:00Z',
  };
  beforeEach(() => { state.placements = [...state.placements, PENDING]; });

  const review = async () => {
    render(<MediaOwnersPanel />);
    const region = await screen.findByRole('region', { name: 'Placements waiting for review' });
    await within(region).findByText('Yaba LED screen');
    return region;
  };

  it('lists only pending_review placements, with the owner and the details to judge', async () => {
    const region = await review();
    expect(within(region).queryByText('Third Mainland Bridge board')).not.toBeInTheDocument();
    expect(within(region).getByText(/Lagos Billboards Ltd/)).toBeInTheDocument();
    expect(within(region).getByText(/Herbert Macaulay Way/)).toBeInTheDocument();
    expect(within(region).getByRole('link', { name: 'Photo 1 of Yaba LED screen' })).toHaveAttribute('href', PENDING.image_url);
  });

  it('Approve calls admin_review_placement(id, true, null)', async () => {
    const region = await review();
    fireEvent.click(within(region).getByRole('button', { name: 'Approve Yaba LED screen' }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toMatchObject({ op: 'rpc', rpc: 'admin_review_placement', payload: { p_advert_id: 'p9', p_approve: true, p_reason: null } });
  });

  it('Reject needs a reason and calls admin_review_placement with it', async () => {
    const region = await review();
    fireEvent.click(within(region).getByRole('button', { name: 'Reject Yaba LED screen' }));
    const confirm = screen.getByRole('button', { name: 'Reject placement' });
    expect(confirm).toBeDisabled();
    expect(writes()).toHaveLength(0);
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Photo shows a different site' } });
    fireEvent.click(confirm);
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toMatchObject({
      op: 'rpc', rpc: 'admin_review_placement',
      payload: { p_advert_id: 'p9', p_approve: false, p_reason: 'Photo shows a different site' },
    });
  });

  it('says so when nothing is waiting', async () => {
    state.placements = state.placements.filter((p) => (p as { id: string }).id !== 'p9');
    render(<MediaOwnersPanel />);
    const region = await screen.findByRole('region', { name: 'Placements waiting for review' });
    expect(await within(region).findByText('No placements are waiting for review.')).toBeInTheDocument();
  });
});
