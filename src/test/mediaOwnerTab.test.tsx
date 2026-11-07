import { describe, it, vi, expect, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

/**
 * The business Dashboard's "Media owner" tab, against a fake supabase client.
 *
 * Nothing here reaches a database or storage: rpc, from() and storage are
 * mocked and every call is recorded, so a refused upload can be shown to make
 * no call at all. Members have no SELECT on media_owners; the owner is read
 * only through get_my_media_owner.
 */

interface Call { op: string; name?: string; args?: unknown; table?: string; payload?: unknown }
const calls: Call[] = [];
const state: {
  owner: Record<string, unknown> | null;
  docs: Record<string, unknown>[];
  reason: string | null;
  rpcError: { message: string } | null;
  reasonError: { message: string } | null;
} = { owner: null, docs: [], reason: null, rpcError: null, reasonError: null };

const openSpy = vi.fn();

vi.mock('../lib/supabase', () => {
  const chainFor = (table: string) => {
    const call: Call = { op: 'select', table };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c: any = {};
    for (const m of ['select', 'eq', 'order', 'range']) c[m] = vi.fn(() => c);
    c.insert = vi.fn((payload: unknown) => { call.op = 'insert'; call.payload = payload; return c; });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    c.then = (f?: any, r?: any) => {
      calls.push(call);
      if (call.op === 'insert') {
        state.docs = [...state.docs, { id: `d${state.docs.length + 1}`, owner_id: 'o1', uploaded_at: '2026-11-01T10:00:00Z', ...(call.payload as object) }];
        return Promise.resolve({ data: null, error: null }).then(f, r);
      }
      // The owner's placements list reads advertisements; none in these tests.
      // The import history reads placement_imports; none in these tests either.
      return Promise.resolve({ data: table === 'advertisements' || table === 'placement_imports' ? [] : state.docs, error: null }).then(f, r);
    };
    return c;
  };
  return {
    supabase: {
      from: vi.fn((t: string) => chainFor(t)),
      rpc: vi.fn(async (name: string, args: unknown) => {
        calls.push({ op: 'rpc', name, args });
        if (state.rpcError) return { data: null, error: state.rpcError };
        if (name === 'enable_media_owner') {
          state.owner = { id: 'o1', name: 'Test Cafe', website: null, country_codes: [], verification: 'unverified', verified_at: null, verification_note: null };
          return { data: 'o1', error: null };
        }
        if (name === 'get_my_media_owner') return { data: state.owner ? [state.owner] : [], error: null };
        if (name === 'owner_verification_reason') {
          return state.reasonError ? { data: null, error: state.reasonError } : { data: state.reason, error: null };
        }
        if (name === 'submit_owner_verification') {
          state.owner = { ...state.owner, verification: 'documents_submitted' };
          return { data: null, error: null };
        }
        return { data: null, error: null };
      }),
      storage: {
        from: vi.fn((bucket: string) => ({
          upload: vi.fn(async (path: string, _f: unknown, opts: unknown) => {
            calls.push({ op: 'upload', name: bucket, args: { path, opts } });
            return { data: {}, error: null };
          }),
          createSignedUrl: vi.fn(async (path: string, secs: number) => {
            calls.push({ op: 'sign', name: bucket, args: { path, secs } });
            return { data: { signedUrl: `https://signed.example/${path}` }, error: null };
          }),
        })),
      },
    },
  };
});

import MediaOwnerTab from '../components/dashboard/MediaOwnerTab';
import { PARTNER_MESSAGES } from '../lib/promote/partner';

const rpcs = (name: string) => calls.filter((c) => c.op === 'rpc' && c.name === name);
const nonReads = () => calls.filter((c) => !(c.op === 'select' || (c.op === 'rpc' && ['get_my_media_owner', 'owner_verification_reason'].includes(c.name!))));

const BUSINESSES = [{ id: 'b1', name: 'Test Cafe' }];
const verifiedOwner = { id: 'o1', name: 'Test Cafe', website: null, country_codes: [], verification: 'unverified', verified_at: null, verification_note: null };

const pdf = (name = 'cac.pdf', size = 1000, type = 'application/pdf') => {
  const f = new File(['x'], name, { type });
  Object.defineProperty(f, 'size', { value: size });
  return f;
};

beforeEach(() => {
  calls.length = 0;
  state.owner = null;
  state.docs = [];
  state.reason = null;
  state.rpcError = null;
  state.reasonError = null;
  openSpy.mockReset();
  vi.stubGlobal('open', openSpy);
});

describe('Media owner tab', () => {
  it('the toggle calls enable once and shows the verification panel', async () => {
    render(<MediaOwnerTab businesses={BUSINESSES} />);
    const toggle = await screen.findByRole('checkbox', { name: 'I sell advertising space' });
    expect(toggle).not.toBeChecked();
    expect(screen.queryByRole('region', { name: 'Verification' })).not.toBeInTheDocument();
    fireEvent.click(toggle);
    fireEvent.click(toggle);
    expect(await screen.findByRole('region', { name: 'Verification' })).toBeInTheDocument();
    expect(rpcs('enable_media_owner')).toHaveLength(1);
    expect(rpcs('enable_media_owner')[0].args).toEqual({ p_business_id: 'b1' });
    expect(screen.getByRole('checkbox', { name: 'I sell advertising space' })).toBeChecked();
    // Once on, the owner's placements show under verification.
    expect(await screen.findByRole('region', { name: 'Placements' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add a placement' })).toBeEnabled();
  });

  it('does not offer the spreadsheet import to a rejected owner', async () => {
    state.owner = { ...verifiedOwner, verification: 'rejected' };
    state.reason = 'Registration was illegible';
    render(<MediaOwnerTab businesses={BUSINESSES} />);
    expect(await screen.findByRole('region', { name: 'Placements' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Import from a spreadsheet' })).not.toBeInTheDocument();
  });

  it('offers the spreadsheet import to an owner who is not rejected', async () => {
    state.owner = { ...verifiedOwner };
    render(<MediaOwnerTab businesses={BUSINESSES} />);
    expect(await screen.findByRole('heading', { name: 'Import from a spreadsheet' })).toBeInTheDocument();
  });

  it('names each missing document, then submit unlocks when both kinds exist', async () => {
    state.owner = { ...verifiedOwner };
    render(<MediaOwnerTab businesses={BUSINESSES} />);
    expect(await screen.findByText('Not verified yet — add company registration and a site proof')).toBeInTheDocument();
    const submit = screen.getByRole('button', { name: 'Send for review' });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Upload company registration'), { target: { files: [pdf()] } });
    expect(await screen.findByText('Not verified yet — add a site proof')).toBeInTheDocument();
    expect(submit).toBeDisabled();
    const up = calls.find((c) => c.op === 'upload')!;
    expect(up.name).toBe('verification-docs');
    expect((up.args as { path: string }).path).toMatch(/^media-owners\/o1\/registration-\d+\.pdf$/);
    expect((up.args as { opts: unknown }).opts).toEqual({ upsert: false });

    fireEvent.change(screen.getByLabelText('Site proof type'), { target: { value: 'rate_card' } });
    fireEvent.change(screen.getByLabelText('Upload site proof'), { target: { files: [pdf('rates.png', 1000, 'image/png')] } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Send for review' })).toBeEnabled());
    expect(calls.filter((c) => c.op === 'insert').map((c) => (c.payload as { kind: string }).kind)).toEqual(['registration', 'rate_card']);

    fireEvent.click(screen.getByRole('button', { name: 'Send for review' }));
    expect(await screen.findByText('Under review')).toBeInTheDocument();
    expect(rpcs('submit_owner_verification')).toEqual([{ op: 'rpc', name: 'submit_owner_verification', args: { p_owner_id: 'o1' } }]);
  });

  it('refuses a .docx and a 12MB file with plain messages and calls nothing', async () => {
    state.owner = { ...verifiedOwner };
    render(<MediaOwnerTab businesses={BUSINESSES} />);
    const input = await screen.findByLabelText('Upload company registration');
    fireEvent.change(input, { target: { files: [pdf('cac.docx', 1000, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')] } });
    expect(await screen.findByText(PARTNER_MESSAGES.wrongType)).toBeInTheDocument();
    fireEvent.change(input, { target: { files: [pdf('cac.pdf', 12 * 1024 * 1024)] } });
    expect(await screen.findByText(PARTNER_MESSAGES.tooLarge)).toBeInTheDocument();
    expect(nonReads()).toHaveLength(0);
  });

  it('opens a document through a 120-second signed URL', async () => {
    state.owner = { ...verifiedOwner };
    state.docs = [{ id: 'd1', owner_id: 'o1', kind: 'registration', storage_path: 'media-owners/o1/registration-1.pdf', uploaded_at: '2026-11-01T10:00:00Z' }];
    render(<MediaOwnerTab businesses={BUSINESSES} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open Company registration' }));
    await waitFor(() => expect(openSpy).toHaveBeenCalledWith('https://signed.example/media-owners/o1/registration-1.pdf', '_blank', 'noopener'));
    expect(calls.find((c) => c.op === 'sign')).toMatchObject({ name: 'verification-docs', args: { path: 'media-owners/o1/registration-1.pdf', secs: 120 } });
  });

  it.each([
    [{ verification: 'documents_submitted' }, null, 'Under review'],
    [{ verification: 'verified', verified_at: '2026-10-05T12:00:00Z' }, null, 'Verified on 5 Oct 2026'],
    [{ verification: 'rejected' }, 'Registration was illegible', 'Not approved: Registration was illegible'],
  ])('renders the status for %o', async (over, reason, text) => {
    state.owner = { ...verifiedOwner, ...over };
    state.reason = reason;
    render(<MediaOwnerTab businesses={BUSINESSES} />);
    expect(await screen.findByText(text)).toBeInTheDocument();
  });

  it('falls back to "no reason was recorded" when the reason cannot be read', async () => {
    state.owner = { ...verifiedOwner, verification: 'rejected' };
    state.reasonError = { message: 'permission denied for function owner_verification_reason' };
    render(<MediaOwnerTab businesses={BUSINESSES} />);
    expect(await screen.findByText('Not approved: no reason was recorded')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Verification' })).toBeInTheDocument();
  });

  it('makes the Choose file label look disabled while uploading', async () => {
    state.owner = { ...verifiedOwner };
    render(<MediaOwnerTab businesses={BUSINESSES} />);
    const input = await screen.findByLabelText('Upload company registration');
    const label = input.closest('label') as HTMLElement;
    expect(label.className).toContain('cursor-pointer');
    fireEvent.change(input, { target: { files: [pdf()] } });
    expect(label).toHaveAttribute('aria-disabled', 'true');
    expect(label.className).toContain('opacity-50');
    expect(label.className).toContain('cursor-not-allowed');
    await waitFor(() => expect(label).not.toHaveAttribute('aria-disabled', 'true'));
  });

  it('shows a database error as text', async () => {
    state.rpcError = { message: 'Only a member of this business can read its media owner' };
    render(<MediaOwnerTab businesses={BUSINESSES} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Only a member of this business can read its media owner');
  });

  it('lets a member of several businesses choose which one', async () => {
    render(<MediaOwnerTab businesses={[...BUSINESSES, { id: 'b2', name: 'Second Shop' }]} />);
    await screen.findByRole('checkbox', { name: 'I sell advertising space' });
    fireEvent.change(screen.getByLabelText('Business'), { target: { value: 'b2' } });
    await waitFor(() => expect(rpcs('get_my_media_owner').map((c) => c.args)).toContainEqual({ p_business_id: 'b2' }));
  });
});

