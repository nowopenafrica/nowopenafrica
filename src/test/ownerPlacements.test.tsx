import { describe, it, vi, expect, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';

/**
 * The owner's placements in the Media owner tab: the list, the placement form
 * (create and edit, photos) and availability, against a fake supabase client.
 *
 * Nothing here reaches a database or storage. rpc, from() and storage are
 * mocked and every call is recorded, so a refused input can be shown to make
 * no call at all. Rates are mocked too (loadRates would fetch).
 */

interface Call { op: string; name?: string; args?: unknown }
const calls: Call[] = [];
const state: {
  placements: Record<string, unknown>[];
  rpcError: { message: string } | null;
  /** The lifecycle the database gave the created row, read back after create. */
  created: string;
  readError: { message: string } | null;
} = { placements: [], rpcError: null, created: 'pending_review', readError: null };

vi.mock('../lib/supabase', () => {
  const chainFor = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c: any = {};
    for (const m of ['select', 'eq', 'order', 'range']) c[m] = vi.fn(() => c);
    c.maybeSingle = vi.fn(async () => {
      calls.push({ op: 'select' });
      return state.readError ? { data: null, error: state.readError } : { data: { lifecycle: state.created }, error: null };
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    c.then = (f?: any, r?: any) => {
      calls.push({ op: 'select' });
      return Promise.resolve({ data: state.placements, error: null }).then(f, r);
    };
    return c;
  };
  return {
    supabase: {
      from: vi.fn(() => chainFor()),
      rpc: vi.fn(async (name: string, args: unknown) => {
        calls.push({ op: 'rpc', name, args });
        if (state.rpcError) return { data: null, error: state.rpcError };
        if (name === 'owner_create_placement') return { data: 'ad-new', error: null };
        if (name === 'owner_record_availability') return { data: 'av1', error: null };
        return { data: null, error: null };
      }),
      storage: {
        from: vi.fn((bucket: string) => ({
          upload: vi.fn(async (path: string, _f: unknown, opts: unknown) => {
            calls.push({ op: 'upload', name: bucket, args: { path, opts } });
            return { data: {}, error: null };
          }),
          getPublicUrl: vi.fn((path: string) => ({ data: { publicUrl: `https://abc.supabase.co/storage/v1/object/public/${bucket}/${path}` } })),
        })),
      },
    },
  };
});

vi.mock('../lib/currency', async (importOriginal) => {
  const real = await importOriginal<typeof import('../lib/currency')>();
  return {
    ...real,
    loadRates: vi.fn(async () => ({ rates: { ...Object.fromEntries(real.CURRENCIES.map((c) => [c.code, c.fallbackRate])), NGN: 1500, KES: 130 }, fetchedAt: 0, live: true })),
  };
});

/* Pass-through spies, so a test can show the form refused before reaching partner.ts at all. */
vi.mock('../lib/promote/partner', async (importOriginal) => {
  const real = await importOriginal<typeof import('../lib/promote/partner')>();
  return { ...real, createPlacement: vi.fn(real.createPlacement), updatePlacement: vi.fn(real.updatePlacement) };
});

import OwnerPlacementList from '../components/dashboard/OwnerPlacementList';
import { createPlacement, updatePlacement } from '../lib/promote/partner';
import { OWNER_EDITABLE_FIELDS, PARTNER_MESSAGES, type MyMediaOwner } from '../lib/promote/partner';

const owner = (over: Partial<MyMediaOwner> = {}): MyMediaOwner => ({
  id: 'o1', name: 'Lagos Boards', website: null, country_codes: ['NG'],
  verification: 'unverified', verified_at: null, verification_note: null, ...over,
});

const LIVE = {
  id: 'ad1', title: 'Ikeja unipole', description: null, category: 'Billboard', location: 'Lagos, Nigeria',
  country_code: 'NG', site_address: 'Opposite Ikeja City Mall', size_spec: { kind: 'area', widthM: 12, heightM: 6 },
  dimensions: '12m × 6m', rate_amount: 450000, currency: 'NGN', rate_period: 'month', pricing: 10,
  image_url: 'https://abc.supabase.co/storage/v1/object/public/business-images/placements/ad1/1.jpg',
  media_urls: ['https://abc.supabase.co/storage/v1/object/public/business-images/placements/ad1/1.jpg'],
  lifecycle: 'partner_verified',
};

const rpcs = (name: string) => calls.filter((c) => c.op === 'rpc' && c.name === name);
const writes = () => calls.filter((c) => c.op !== 'select');

beforeEach(() => {
  calls.length = 0;
  state.placements = [];
  state.rpcError = null;
  state.created = 'pending_review';
  state.readError = null;
  vi.mocked(createPlacement).mockClear();
  vi.mocked(updatePlacement).mockClear();
});

async function openForm(o = owner()) {
  render(<OwnerPlacementList owner={o} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Add a placement' }));
  return screen.getByRole('form', { name: 'Placement' });
}

function fillRequired(form: HTMLElement) {
  const f = within(form);
  fireEvent.change(f.getByLabelText('Type of placement'), { target: { value: 'Billboard' } });
  fireEvent.change(f.getByLabelText('Site name'), { target: { value: 'Ikeja unipole' } });
  fireEvent.change(f.getByLabelText('City'), { target: { value: 'Lagos' } });
  fireEvent.change(f.getByLabelText('Country'), { target: { value: 'NG' } });
  fireEvent.change(f.getByLabelText('Address or landmark'), { target: { value: 'Opposite Ikeja City Mall' } });
  fireEvent.change(f.getByLabelText('Size'), { target: { value: 'area' } });
  fireEvent.change(f.getByLabelText('Width (m)'), { target: { value: '12' } });
  fireEvent.change(f.getByLabelText('Height (m)'), { target: { value: '6' } });
  fireEvent.change(f.getByLabelText('Price'), { target: { value: '450000' } });
  fireEvent.change(f.getByLabelText('Per'), { target: { value: 'month' } });
}

describe('placement form', () => {
  it('refuses a pexels photo URL before any call', async () => {
    const form = await openForm();
    fillRequired(form);
    fireEvent.change(within(form).getByLabelText('Photo link (optional)'), { target: { value: 'https://images.pexels.com/photos/1/board.jpg' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Save placement' }));
    expect(await within(form).findByRole('alert')).toHaveTextContent('Upload a photo of the actual site.');
    expect(writes()).toHaveLength(0);
    // The form's own check, not partner.ts's: createPlacement is never reached.
    expect(createPlacement).not.toHaveBeenCalled();
  });

  it('refuses a stock photo link on edit before reaching partner.ts', async () => {
    state.placements = [LIVE];
    render(<OwnerPlacementList owner={owner({ verification: 'verified' })} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Ikeja unipole' }));
    const form = screen.getByRole('form', { name: 'Placement' });
    fireEvent.change(within(form).getByLabelText('Photo link (optional)'), { target: { value: 'https://images.unsplash.com/photo-1' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Save changes' }));
    expect(await within(form).findByRole('alert')).toHaveTextContent('Upload a photo of the actual site.');
    expect(updatePlacement).not.toHaveBeenCalled();
  });

  it('an unverified owner sees "Sent for review"; the RPC gets city, country code and address, never location', async () => {
    const form = await openForm();
    fillRequired(form);
    // The currency follows the country.
    expect((within(form).getByLabelText('Currency') as HTMLSelectElement).value).toBe('NGN');
    fireEvent.click(within(form).getByRole('button', { name: 'Save placement' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Sent for review');
    const args = rpcs('owner_create_placement')[0].args as { p_owner_id: string; p: Record<string, unknown> };
    expect(args.p_owner_id).toBe('o1');
    expect(args.p).toMatchObject({
      category: 'Billboard', title: 'Ikeja unipole', city: 'Lagos', country_code: 'NG', site_address: 'Opposite Ikeja City Mall',
      size_spec: { kind: 'area', widthM: 12, heightM: 6 }, dimensions: '12m × 6m',
      rate_amount: 450000, currency: 'NGN', rate_period: 'month', pricing: 10,
    });
    expect(args.p).not.toHaveProperty('location');
  });

  it('a verified owner sees "Live as Partner verified"', async () => {
    state.created = 'partner_verified';
    const form = await openForm(owner({ verification: 'verified', verified_at: '2026-10-05T12:00:00Z' }));
    fillRequired(form);
    fireEvent.click(within(form).getByRole('button', { name: 'Save placement' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Live as Partner verified');
  });

  it("the message follows the created row's lifecycle, not the owner held by the page", async () => {
    // The page loaded the owner as unverified; an admin verified them since.
    state.created = 'partner_verified';
    const form = await openForm(owner());
    fillRequired(form);
    fireEvent.click(within(form).getByRole('button', { name: 'Save placement' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Live as Partner verified');
  });

  it('says only "Saved." when the lifecycle cannot be read back', async () => {
    state.readError = { message: 'network' };
    const form = await openForm(owner({ verification: 'verified' }));
    fillRequired(form);
    fireEvent.click(within(form).getByRole('button', { name: 'Save placement' }));
    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent(/^Saved\.$/);
  });

  it('a photo failure after an unread lifecycle reads "Saved. The photos ..." with one full stop', async () => {
    state.readError = { message: 'network' };
    const form = await openForm(owner({ verification: 'verified' }));
    fillRequired(form);
    fireEvent.change(within(form).getByLabelText('Upload photos'), { target: { files: [new File(['x'], 'site.jpg', { type: 'image/jpeg' })] } });
    vi.mocked(updatePlacement).mockResolvedValueOnce({ ok: false, error: 'storage is down' });
    fireEvent.click(within(form).getByRole('button', { name: 'Save placement' }));
    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent('Saved. The photos could not be added: storage is down');
    expect(status.textContent).not.toMatch(/\.\./);
  });

  it('creates first, then uploads photos under placements/{advert_id}/ and records them', async () => {
    const form = await openForm();
    fillRequired(form);
    const photo = new File(['x'], 'site.jpg', { type: 'image/jpeg' });
    fireEvent.change(within(form).getByLabelText('Upload photos'), { target: { files: [photo] } });
    fireEvent.click(within(form).getByRole('button', { name: 'Save placement' }));
    await screen.findByRole('status');
    const order = writes().map((c) => c.name === 'business-images' ? 'upload' : c.name);
    expect(order).toEqual(['owner_create_placement', 'upload', 'owner_update_placement']);
    const up = writes()[1].args as { path: string; opts: { upsert: boolean } };
    expect(up.path).toMatch(/^placements\/ad-new\/\d+-[a-z0-9]+\.jpg$/);
    expect(up.opts.upsert).toBe(false);
    const upd = rpcs('owner_update_placement')[0].args as { p_advert_id: string; p: Record<string, unknown> };
    expect(upd.p_advert_id).toBe('ad-new');
    expect(Object.keys(upd.p).sort()).toEqual(['image_url', 'media_urls']);
    expect(upd.p.image_url).toContain(`/business-images/${up.path}`);
  });

  it('a missing field is named before any call', async () => {
    const form = await openForm();
    fireEvent.click(within(form).getByRole('button', { name: 'Save placement' }));
    expect(await within(form).findByRole('alert')).toHaveTextContent('Choose the type of placement');
    expect(writes()).toHaveLength(0);
  });

  it('shows the database refusal as text', async () => {
    const form = await openForm();
    fillRequired(form);
    state.rpcError = { message: 'NowOpen does not list placements in that country yet' };
    fireEvent.click(within(form).getByRole('button', { name: 'Save placement' }));
    expect(await within(form).findByRole('alert')).toHaveTextContent('NowOpen does not list placements in that country yet');
    expect(screen.queryByRole('status')).toBeNull();
  });
});

describe('owner edits', () => {
  it('a price edit calls owner_update_placement with only the price fields', async () => {
    state.placements = [LIVE];
    render(<OwnerPlacementList owner={owner({ verification: 'verified' })} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Ikeja unipole' }));
    const form = screen.getByRole('form', { name: 'Placement' });
    expect((within(form).getByLabelText('City') as HTMLInputElement).value).toBe('Lagos');
    fireEvent.change(within(form).getByLabelText('Price'), { target: { value: '900000' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Save changes' }));
    await screen.findByRole('status');
    const upd = rpcs('owner_update_placement');
    expect(upd).toHaveLength(1);
    const args = upd[0].args as { p_advert_id: string; p: Record<string, unknown> };
    expect(args.p_advert_id).toBe('ad1');
    expect(Object.keys(args.p).sort()).toEqual(['currency', 'pricing', 'rate_amount', 'rate_period']);
    for (const k of Object.keys(args.p)) expect(OWNER_EDITABLE_FIELDS as readonly string[]).toContain(k);
    expect(args.p).toEqual({ rate_amount: 900000, currency: 'NGN', rate_period: 'month', pricing: 20 });
    expect(rpcs('owner_create_placement')).toHaveLength(0);
  });

  it('in edit mode, changing the country keeps the currency and sends only the country', async () => {
    state.placements = [LIVE];
    render(<OwnerPlacementList owner={owner({ verification: 'verified' })} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Ikeja unipole' }));
    const form = screen.getByRole('form', { name: 'Placement' });
    fireEvent.change(within(form).getByLabelText('Country'), { target: { value: 'GH' } });
    expect((within(form).getByLabelText('Currency') as HTMLSelectElement).value).toBe('NGN');
    // The same price written differently is not a price change.
    fireEvent.change(within(form).getByLabelText('Price'), { target: { value: '450000.0' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Save changes' }));
    await screen.findByRole('status');
    const args = rpcs('owner_update_placement')[0].args as { p: Record<string, unknown> };
    expect(args.p).toEqual({ country_code: 'GH' });
  });

  it('on create, the currency follows the country', async () => {
    const form = await openForm();
    fireEvent.change(within(form).getByLabelText('Country'), { target: { value: 'KE' } });
    expect((within(form).getByLabelText('Currency') as HTMLSelectElement).value).toBe('KES');
  });

  it('lists pending placements as waiting for review', async () => {
    state.placements = [{ ...LIVE, id: 'ad2', title: 'Yaba screen', lifecycle: 'pending_review' }];
    render(<OwnerPlacementList owner={owner()} />);
    const item = await screen.findByTestId('owner-placement-ad2');
    expect(within(item).getByText('Waiting for review')).toBeInTheDocument();
  });
});

describe('list labels and rates', () => {
  it('partner_supplied reads "Live · Partner supplied", like partner_verified names its basis', async () => {
    state.placements = [
      { ...LIVE, id: 'ad3', title: 'Lekki screen', lifecycle: 'partner_supplied' },
      { ...LIVE, id: 'ad4', title: 'Ikoyi board', lifecycle: 'partner_verified' },
    ];
    render(<OwnerPlacementList owner={owner({ verification: 'verified' })} />);
    expect(within(await screen.findByTestId('owner-placement-ad3')).getByText('Live · Partner supplied')).toBeInTheDocument();
    expect(within(screen.getByTestId('owner-placement-ad4')).getByText('Live · Partner verified')).toBeInTheDocument();
    expect(within(screen.getByTestId('owner-placement-ad3')).getByText(/NGN 450,000 a month/)).toBeInTheDocument();
  });

  it('the owner list and the admin queue share partner.ts ownerRateText', () => {
    for (const f of ['src/components/dashboard/OwnerPlacementList.tsx', 'src/components/admin/MediaOwnersPanel.tsx']) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).toMatch(/ownerRateText/);
      expect(src, f).not.toMatch(/toLocaleString\('en'\)\} a \$\{/);
    }
  });
});

describe('a rejected owner', () => {
  it('cannot open Edit or Availability, and is told why', async () => {
    state.placements = [LIVE];
    render(<OwnerPlacementList owner={owner({ verification: 'rejected' })} />);
    const item = await screen.findByTestId('owner-placement-ad1');
    const edit = within(item).getByRole('button', { name: 'Edit Ikeja unipole' });
    const avail = within(item).getByRole('button', { name: 'Availability for Ikeja unipole' });
    expect(edit).toBeDisabled();
    expect(avail).toBeDisabled();
    expect(screen.getByText(PARTNER_MESSAGES.ownerRejected)).toBeInTheDocument();
    fireEvent.click(edit);
    fireEvent.click(avail);
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
    expect(writes()).toHaveLength(0);
  });
});

describe('availability', () => {
  const openAvailability = async () => {
    state.placements = [LIVE];
    render(<OwnerPlacementList owner={owner({ verification: 'verified' })} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Availability for Ikeja unipole' }));
    return screen.getByRole('form', { name: 'Availability for Ikeja unipole' });
  };

  it('requires a from date', async () => {
    const form = await openAvailability();
    fireEvent.click(within(form).getByRole('button', { name: 'Save availability' }));
    expect(await within(form).findByRole('alert')).toHaveTextContent('Choose the date this starts.');
    expect(writes()).toHaveLength(0);
  });

  it('"To" before "From" is refused in plain words, with no call', async () => {
    const form = await openAvailability();
    fireEvent.change(within(form).getByLabelText('From'), { target: { value: '2026-11-10' } });
    fireEvent.change(within(form).getByLabelText('To (optional)'), { target: { value: '2026-11-01' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Save availability' }));
    expect(await within(form).findByRole('alert')).toHaveTextContent(PARTNER_MESSAGES.toBeforeFrom);
    expect(writes()).toHaveLength(0);
  });

  it('"Booked until" requires a to date, then records it', async () => {
    const form = await openAvailability();
    fireEvent.change(within(form).getByLabelText('Status'), { target: { value: 'booked' } });
    fireEvent.change(within(form).getByLabelText('From'), { target: { value: '2026-11-01' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Save availability' }));
    expect(await within(form).findByRole('alert')).toHaveTextContent('Choose the date it is booked until.');
    expect(writes()).toHaveLength(0);
    fireEvent.change(within(form).getByLabelText('Booked until'), { target: { value: '2026-12-15' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Save availability' }));
    await waitFor(() => expect(rpcs('owner_record_availability')).toHaveLength(1));
    expect(rpcs('owner_record_availability')[0].args).toEqual({ p_advert_id: 'ad1', p_status: 'booked', p_from: '2026-11-01', p_to: '2026-12-15' });
    expect(await screen.findByRole('status')).toHaveTextContent('Availability saved');
  });
});

describe('expiry notice', () => {
  it('links to /dashboard?tab=media-owner, which the Dashboard opens', () => {
    const sql = readFileSync('supabase/migrations/20261111010000_partner_portal.sql', 'utf8');
    const fn = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.dispatch_confirmation_expiry_notices()'));
    expect(fn).toMatch(/'placement_confirmation_expiring',\s*'\/dashboard\?tab=media-owner'/);
    const dash = readFileSync('src/pages/Dashboard.tsx', 'utf8');
    expect(dash).toContain("{ id: 'media-owner', label: 'Media owner'");
  });
});
