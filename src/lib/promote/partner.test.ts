import { describe, it, vi, expect, beforeEach } from 'vitest';

/**
 * partner.ts against a fake supabase client. Nothing here reaches a database.
 * The fake records every call so a refused input can be shown to make none.
 */

const rpc = vi.fn();
const from = vi.fn();
const upload = vi.fn();
const createSignedUrl = vi.fn();
const getPublicUrl = vi.fn((path: string) => ({ data: { publicUrl: `https://abc.supabase.co/storage/v1/object/public/business-images/${path}` } }));
const storageFrom = vi.fn(() => ({ upload, createSignedUrl, getPublicUrl }));

vi.mock('../supabase', () => ({
  supabase: {
    from: (...a: unknown[]) => from(...a),
    rpc: (...a: unknown[]) => rpc(...a),
    storage: { from: (...a: unknown[]) => storageFrom(...(a as [])) },
  },
}));

import {
  enableMediaOwner, getMyMediaOwner, uploadOwnerDocument, listOwnerDocuments, submitVerification,
  verificationStatusText, signedDocumentUrl, adminRejectOwner, missingDocuments,
  createPlacement, updatePlacement, recordAvailability, uploadPlacementPhoto, listMyPlacements, listPendingPlacements, adminReviewPlacement, readPlacementLifecycle, placementSavedText,
  ownerRateText, savedWithProblem,
  OWNER_EDITABLE_FIELDS, PARTNER_MESSAGES, type MyMediaOwner, type OwnerDocument, type PlacementInput,
} from './partner';

/** A thenable query chain that records its filters and resolves to `result`. */
function chain(result: { data: unknown; error: unknown }) {
  const calls: unknown[][] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: any = {};
  for (const m of ['select', 'eq', 'in', 'order', 'range', 'limit', 'insert']) {
    c[m] = vi.fn((...args: unknown[]) => { calls.push([m, ...args]); return c; });
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  c.then = (f?: any, r?: any) => Promise.resolve(result).then(f, r);
  return { c, calls };
}

const owner = (over: Partial<MyMediaOwner> = {}): MyMediaOwner => ({
  id: 'o1', name: 'Lagos Boards', website: null, country_codes: [],
  verification: 'unverified', verified_at: null, verification_note: null, ...over,
});
const doc = (kind: OwnerDocument['kind'], id = kind): OwnerDocument => ({
  id, owner_id: 'o1', kind, storage_path: `media-owners/o1/${kind}-1.pdf`, uploaded_at: '2026-11-01T10:00:00Z',
});
const file = (name: string, type: string, size = 1000) => {
  const f = new File(['x'], name, { type });
  Object.defineProperty(f, 'size', { value: size });
  return f;
};

beforeEach(() => {
  rpc.mockReset(); from.mockReset(); upload.mockReset(); createSignedUrl.mockReset(); storageFrom.mockClear(); getPublicUrl.mockClear();
});

describe('enableMediaOwner / getMyMediaOwner', () => {
  it('calls enable_media_owner with the business id', async () => {
    rpc.mockResolvedValue({ data: 'o1', error: null });
    expect(await enableMediaOwner('b1')).toEqual({ ok: true, ownerId: 'o1' });
    expect(rpc).toHaveBeenCalledWith('enable_media_owner', { p_business_id: 'b1' });
  });

  it('reads the owner through get_my_media_owner, never the table', async () => {
    rpc.mockResolvedValue({ data: [owner()], error: null });
    const r = await getMyMediaOwner('b1');
    expect(r).toEqual({ ok: true, owner: owner(), rejectReason: null });
    expect(rpc).toHaveBeenCalledWith('get_my_media_owner', { p_business_id: 'b1' });
    expect(from).not.toHaveBeenCalled();
  });

  it('no row means no owner yet', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    expect(await getMyMediaOwner('b1')).toEqual({ ok: true, owner: null, rejectReason: null });
  });

  it('reads the rejection reason only when rejected', async () => {
    rpc.mockImplementation(async (name: string) => name === 'get_my_media_owner'
      ? { data: [owner({ verification: 'rejected' })], error: null }
      : { data: 'Registration was illegible', error: null });
    const r = await getMyMediaOwner('b1');
    expect(r).toMatchObject({ ok: true, rejectReason: 'Registration was illegible' });
    expect(rpc).toHaveBeenCalledWith('owner_verification_reason', { p_owner_id: 'o1' });
  });

  it('a failed reason read degrades to no reason rather than failing the owner', async () => {
    rpc.mockImplementation(async (name: string) => name === 'get_my_media_owner'
      ? { data: [owner({ verification: 'rejected' })], error: null }
      : { data: null, error: { message: 'permission denied' } });
    const r = await getMyMediaOwner('b1');
    expect(r).toEqual({ ok: true, owner: owner({ verification: 'rejected' }), rejectReason: null });
    expect(verificationStatusText(owner({ verification: 'rejected' }), [], null)).toBe('Not approved: no reason was recorded');
  });

  it('returns the database error and never throws', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'Only a member of this business can read its media owner' } });
    expect(await getMyMediaOwner('b1')).toEqual({ ok: false, error: 'Only a member of this business can read its media owner' });
    rpc.mockRejectedValue(new Error('network down'));
    expect(await enableMediaOwner('b1')).toEqual({ ok: false, error: 'network down' });
  });
});

describe('uploadOwnerDocument', () => {
  it('refuses a .docx before any call', async () => {
    const r = await uploadOwnerDocument('o1', 'registration',
      file('cac.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'));
    expect(r).toEqual({ ok: false, error: PARTNER_MESSAGES.wrongType });
    expect(storageFrom).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  it('refuses a 12MB file before any call', async () => {
    const r = await uploadOwnerDocument('o1', 'registration', file('cac.pdf', 'application/pdf', 12 * 1024 * 1024));
    expect(r).toEqual({ ok: false, error: PARTNER_MESSAGES.tooLarge });
    expect(storageFrom).not.toHaveBeenCalled();
  });

  it('uploads to media-owners/{owner}/{kind}-{timestamp}.{ext} with upsert false, then records it without .select()', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1700000000000);
    upload.mockResolvedValue({ data: {}, error: null });
    const ins = chain({ data: null, error: null });
    from.mockReturnValue(ins.c);
    const r = await uploadOwnerDocument('o1', 'rate_card', file('Rates.PNG', 'image/png'));
    expect(r).toEqual({ ok: true, path: 'media-owners/o1/rate_card-1700000000000.png' });
    expect(storageFrom).toHaveBeenCalledWith('verification-docs');
    expect(upload).toHaveBeenCalledWith('media-owners/o1/rate_card-1700000000000.png', expect.any(File), { upsert: false });
    expect(from).toHaveBeenCalledWith('media_owner_documents');
    expect(ins.calls).toEqual([['insert', { owner_id: 'o1', kind: 'rate_card', storage_path: 'media-owners/o1/rate_card-1700000000000.png' }]]);
    vi.restoreAllMocks();
  });

  it('accepts .jpg and .jpeg', async () => {
    upload.mockResolvedValue({ data: {}, error: null });
    from.mockReturnValue(chain({ data: null, error: null }).c);
    expect(await uploadOwnerDocument('o1', 'signage_permit', file('p.jpg', 'image/jpeg'))).toMatchObject({ ok: true });
    expect(await uploadOwnerDocument('o1', 'signage_permit', file('p.jpeg', ''))).toMatchObject({ ok: true });
  });

  it('says the file is stored but not recorded when the insert fails', async () => {
    upload.mockResolvedValue({ data: {}, error: null });
    from.mockReturnValue(chain({ data: null, error: { message: 'new row violates row-level security policy' } }).c);
    const r = await uploadOwnerDocument('o1', 'registration', file('cac.pdf', 'application/pdf'));
    expect(r).toMatchObject({ ok: false });
    expect((r as { error: string }).error).toContain('new row violates row-level security policy');
  });

  it('returns a storage error as text', async () => {
    upload.mockResolvedValue({ data: null, error: { message: 'The resource already exists' } });
    expect(await uploadOwnerDocument('o1', 'registration', file('cac.pdf', 'application/pdf')))
      .toEqual({ ok: false, error: 'The resource already exists' });
    expect(from).not.toHaveBeenCalled();
  });
});

describe('documents, submit, signed URL, admin reject', () => {
  it('lists documents newest first, paged', async () => {
    const q = chain({ data: [doc('registration')], error: null });
    from.mockReturnValue(q.c);
    expect(await listOwnerDocuments('o1')).toEqual({ ok: true, documents: [doc('registration')] });
    expect(q.calls).toContainEqual(['eq', 'owner_id', 'o1']);
    expect(q.calls).toContainEqual(['order', 'uploaded_at', { ascending: false }]);
    expect(q.calls.some((c) => c[0] === 'range')).toBe(true);
  });

  it('submits through submit_owner_verification', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    expect(await submitVerification('o1')).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith('submit_owner_verification', { p_owner_id: 'o1' });
  });

  it('signs a document URL for 120 seconds', async () => {
    createSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://signed/x' }, error: null });
    expect(await signedDocumentUrl('media-owners/o1/registration-1.pdf')).toEqual({ ok: true, url: 'https://signed/x' });
    expect(storageFrom).toHaveBeenCalledWith('verification-docs');
    expect(createSignedUrl).toHaveBeenCalledWith('media-owners/o1/registration-1.pdf', 120);
  });

  it('admin reject needs a reason before calling admin_reject_owner', async () => {
    expect(await adminRejectOwner('o1', '  ')).toMatchObject({ ok: false });
    expect(rpc).not.toHaveBeenCalled();
    rpc.mockResolvedValue({ data: null, error: null });
    expect(await adminRejectOwner('o1', ' Blurry scan ')).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith('admin_reject_owner', { p_owner_id: 'o1', p_reason: 'Blurry scan' });
  });
});

describe('verificationStatusText', () => {
  it('names each missing document', () => {
    expect(missingDocuments([])).toEqual(['company registration', 'a site proof']);
    expect(verificationStatusText(owner(), [], null))
      .toBe('Not verified yet — add company registration and a site proof');
    expect(verificationStatusText(owner(), [doc('registration')], null))
      .toBe('Not verified yet — add a site proof');
    expect(verificationStatusText(owner(), [doc('authorisation_letter')], null))
      .toBe('Not verified yet — add company registration');
  });

  it('under review, verified on a date, not approved with the reason', () => {
    expect(verificationStatusText(owner({ verification: 'documents_submitted' }), [], null)).toBe('Under review');
    expect(verificationStatusText(owner({ verification: 'verified', verified_at: '2026-10-05T12:00:00Z' }), [], null))
      .toBe('Verified on 5 Oct 2026');
    expect(verificationStatusText(owner({ verification: 'rejected' }), [doc('registration')], 'Registration was illegible'))
      .toBe('Not approved: Registration was illegible');
  });
});

const placement = (over: Partial<PlacementInput> = {}): PlacementInput => ({
  category: 'Billboard', title: 'Ikeja unipole', description: '',
  city: 'Lagos', country_code: 'NG', site_address: 'Opposite Ikeja City Mall',
  size_spec: { kind: 'area', widthM: 12, heightM: 6 },
  rate_amount: 450000, currency: 'NGN', rate_period: 'month', pricing: 10,
  image_url: null, media_urls: null, ...over,
});

describe('createPlacement', () => {
  it('calls owner_create_placement with city, country code and address, never a free location', async () => {
    rpc.mockResolvedValue({ data: 'ad1', error: null });
    expect(await createPlacement('o1', placement())).toEqual({ ok: true, advertId: 'ad1' });
    const [name, args] = rpc.mock.calls[0];
    expect(name).toBe('owner_create_placement');
    expect(args.p_owner_id).toBe('o1');
    expect(args.p).toMatchObject({
      category: 'Billboard', title: 'Ikeja unipole', city: 'Lagos', country_code: 'NG',
      site_address: 'Opposite Ikeja City Mall', size_spec: { kind: 'area', widthM: 12, heightM: 6 },
      dimensions: '12m × 6m', rate_amount: 450000, currency: 'NGN', rate_period: 'month', pricing: 10,
    });
    expect(args.p).not.toHaveProperty('location');
  });

  it('refuses a stock photo before any call', async () => {
    const r = await createPlacement('o1', placement({ image_url: 'https://images.pexels.com/photos/1/a.jpg' }));
    expect(r).toEqual({ ok: false, error: 'Upload a photo of the actual site.' });
    const r2 = await createPlacement('o1', placement({ media_urls: ['https://images.unsplash.com/x.jpg'] }));
    expect(r2).toEqual({ ok: false, error: PARTNER_MESSAGES.stockPhoto });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('refuses a city with a comma before any call', async () => {
    const r = await createPlacement('o1', placement({ city: 'Ikeja, Lagos' }));
    expect(r.ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('shows the database refusal', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'Choose the country' } });
    expect(await createPlacement('o1', placement())).toEqual({ ok: false, error: 'Choose the country' });
  });
});

describe('updatePlacement', () => {
  it('sends only the fields given, and only allowed ones', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    expect(await updatePlacement('ad1', { rate_amount: 500000, pricing: 11.11 })).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith('owner_update_placement', { p_advert_id: 'ad1', p: { rate_amount: 500000, pricing: 11.11 } });
  });

  it('refuses a field the database would refuse, before any call', async () => {
    const r = await updatePlacement('ad1', { lifecycle: 'partner_verified' } as never);
    expect(r).toEqual({ ok: false, error: 'These fields cannot be changed here: lifecycle' });
    const r2 = await updatePlacement('ad1', { location: 'Lagos, Nigeria' } as never);
    expect(r2.ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('refuses a stock photo', async () => {
    expect(await updatePlacement('ad1', { image_url: 'https://cdn.pixabay.com/a.jpg' })).toEqual({ ok: false, error: PARTNER_MESSAGES.stockPhoto });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('the allowed list mirrors owner_update_placement', () => {
    expect([...OWNER_EDITABLE_FIELDS].sort()).toEqual(
      ['title', 'description', 'size_spec', 'dimensions', 'rate_amount', 'currency', 'rate_period', 'pricing', 'image_url', 'media_urls', 'city', 'country_code', 'site_address'].sort(),
    );
  });
});

describe('recordAvailability', () => {
  it('requires a from date', async () => {
    expect(await recordAvailability('ad1', 'available', '', null)).toEqual({ ok: false, error: PARTNER_MESSAGES.fromDateRequired });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('booked needs an end date', async () => {
    expect(await recordAvailability('ad1', 'booked', '2026-11-01', null)).toEqual({ ok: false, error: PARTNER_MESSAGES.bookedUntilRequired });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('"To" before "From" is refused in plain words before any call; the same day is fine', async () => {
    expect(await recordAvailability('ad1', 'available', '2026-11-10', '2026-11-09')).toEqual({ ok: false, error: PARTNER_MESSAGES.toBeforeFrom });
    expect(await recordAvailability('ad1', 'booked', '2026-11-10', '2026-10-30')).toEqual({ ok: false, error: PARTNER_MESSAGES.toBeforeFrom });
    expect(rpc).not.toHaveBeenCalled();
    expect(PARTNER_MESSAGES.toBeforeFrom).not.toMatch(/check|constraint|violat/i);
    rpc.mockResolvedValue({ data: 'av1', error: null });
    expect(await recordAvailability('ad1', 'available', '2026-11-10', '2026-11-10')).toEqual({ ok: true, availabilityId: 'av1' });
  });

  it('calls owner_record_availability (the database records portal and the owner)', async () => {
    rpc.mockResolvedValue({ data: 'av1', error: null });
    expect(await recordAvailability('ad1', 'booked', '2026-11-01', '2026-12-01')).toEqual({ ok: true, availabilityId: 'av1' });
    expect(rpc).toHaveBeenCalledWith('owner_record_availability', { p_advert_id: 'ad1', p_status: 'booked', p_from: '2026-11-01', p_to: '2026-12-01' });
    await recordAvailability('ad1', 'maintenance', '2026-11-01', null);
    expect(rpc).toHaveBeenLastCalledWith('owner_record_availability', { p_advert_id: 'ad1', p_status: 'maintenance', p_from: '2026-11-01', p_to: null });
  });
});

describe('uploadPlacementPhoto', () => {
  it('uploads to business-images under placements/{advert_id}/ with upsert false and returns the public URL', async () => {
    upload.mockResolvedValue({ data: {}, error: null });
    const r = await uploadPlacementPhoto('ad1', file('site.jpg', 'image/jpeg'));
    expect(storageFrom).toHaveBeenCalledWith('business-images');
    const [path, , opts] = upload.mock.calls[0];
    expect(path).toMatch(/^placements\/ad1\/\d+-[a-z0-9]+\.jpg$/);
    expect(opts).toMatchObject({ upsert: false });
    expect(r).toEqual({ ok: true, path, url: `https://abc.supabase.co/storage/v1/object/public/business-images/${path}` });
  });

  it('refuses a non-photo or an oversized file before any call', async () => {
    expect(await uploadPlacementPhoto('ad1', file('site.pdf', 'application/pdf'))).toEqual({ ok: false, error: PARTNER_MESSAGES.photoType });
    expect(await uploadPlacementPhoto('ad1', file('site.jpg', 'image/jpeg', 11 * 1024 * 1024))).toEqual({ ok: false, error: PARTNER_MESSAGES.photoTooLarge });
    expect(upload).not.toHaveBeenCalled();
  });
});

describe('listMyPlacements', () => {
  it('reads advertisements by owner_id, paged', async () => {
    const { c, calls } = chain({ data: [{ id: 'ad1', title: 'Ikeja unipole', lifecycle: 'pending_review' }], error: null });
    from.mockReturnValue(c);
    const r = await listMyPlacements('o1');
    expect(r).toMatchObject({ ok: true, placements: [{ id: 'ad1' }] });
    expect(from).toHaveBeenCalledWith('advertisements');
    expect(calls).toContainEqual(['eq', 'owner_id', 'o1']);
    expect(calls.some((x) => x[0] === 'range')).toBe(true);
  });
});

describe('adminReviewPlacement', () => {
  it('approve calls admin_review_placement(id, true, null)', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    expect(await adminReviewPlacement('ad1', true)).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith('admin_review_placement', { p_advert_id: 'ad1', p_approve: true, p_reason: null });
  });

  it('reject needs a reason', async () => {
    expect(await adminReviewPlacement('ad1', false, '  ')).toEqual({ ok: false, error: PARTNER_MESSAGES.placementReasonRequired });
    expect(rpc).not.toHaveBeenCalled();
    rpc.mockResolvedValue({ data: null, error: null });
    await adminReviewPlacement('ad1', false, ' Photo shows a different site ');
    expect(rpc).toHaveBeenCalledWith('admin_review_placement', { p_advert_id: 'ad1', p_approve: false, p_reason: 'Photo shows a different site' });
  });
});

describe('listPendingPlacements', () => {
  it('reads only pending_review placements, oldest first, paged', async () => {
    const { c, calls } = chain({ data: [{ id: 'ad1', lifecycle: 'pending_review' }], error: null });
    from.mockReturnValue(c);
    expect(await listPendingPlacements()).toMatchObject({ ok: true, placements: [{ id: 'ad1' }] });
    expect(calls).toContainEqual(['eq', 'lifecycle', 'pending_review']);
    expect(calls.some((x) => x[0] === 'range')).toBe(true);
  });
});

describe('readPlacementLifecycle / placementSavedText', () => {
  it('reads the created row lifecycle by id', async () => {
    const { c, calls } = chain({ data: null, error: null });
    c.maybeSingle = vi.fn(async () => ({ data: { lifecycle: 'pending_review' }, error: null }));
    from.mockReturnValue(c);
    expect(await readPlacementLifecycle('ad1')).toEqual({ ok: true, lifecycle: 'pending_review' });
    expect(calls).toContainEqual(['eq', 'id', 'ad1']);
  });

  it('a failed read is an error, not a guess', async () => {
    const { c } = chain({ data: null, error: null });
    c.maybeSingle = vi.fn(async () => ({ data: null, error: { message: 'network' } }));
    from.mockReturnValue(c);
    expect(await readPlacementLifecycle('ad1')).toEqual({ ok: false, error: 'network' });
  });

  it('says what the row says, and only "Saved." otherwise', () => {
    expect(placementSavedText('pending_review')).toBe('Sent for review');
    expect(placementSavedText('partner_verified')).toBe('Live as Partner verified');
    expect(placementSavedText('partner_supplied')).toBe('Live as Partner supplied');
    expect(placementSavedText(null)).toBe('Saved.');
    expect(placementSavedText('imported')).toBe('Saved.');
  });
});

describe('ownerRateText (one formatter for the owner list and the admin queue)', () => {
  it('"NGN 450,000 a month", or null without a rate or a period', () => {
    expect(ownerRateText({ rate_amount: 450000, currency: 'NGN', rate_period: 'month' })).toBe('NGN 450,000 a month');
    expect(ownerRateText({ rate_amount: null, currency: 'NGN', rate_period: 'month' })).toBeNull();
    expect(ownerRateText({ rate_amount: 1000, currency: 'NGN', rate_period: null })).toBeNull();
    expect(ownerRateText({ rate_amount: 1000, currency: null, rate_period: 'day' })).toBe('1,000 a day');
  });
});

describe('savedWithProblem', () => {
  it('joins the saved sentence and the problem with one full stop', () => {
    expect(savedWithProblem('Saved.', 'The photos could not be added: x')).toBe('Saved. The photos could not be added: x');
    expect(savedWithProblem('Sent for review', 'A photo could not be uploaded: y')).toBe('Sent for review. A photo could not be uploaded: y');
    expect(savedWithProblem('Live as Partner verified', 'z')).not.toMatch(/\.\./);
  });
});
