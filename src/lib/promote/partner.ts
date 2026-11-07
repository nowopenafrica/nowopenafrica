import { supabase } from '../supabase';
import { formatLocalDate } from '../dates';
import { isStockPlaceholder } from '../stockImage';
import { compressImage } from '../imageCompression';
import { sizeSummary, type RatePeriod, type SizeSpec } from './sizeSpec';
import { trustLabelText } from './trust';
import type { Result, Verification } from './mediaOwners';

/**
 * The media-owner side of the Partner portal: a business turns on Media owner
 * mode, files its verification documents, and sends them for review.
 *
 * THE RULES THIS FILE HOLDS
 *
 * - Every function returns `{ ok: true, ... } | { ok: false, error }` and never
 *   throws (same contract as mediaOwners.ts). supabase-js resolves with
 *   `{ data, error }`, so the error is read off the result; the try/catch only
 *   covers a client that genuinely throws.
 * - Members have NO select policy on media_owners. The owner row is read only
 *   through get_my_media_owner, which returns the columns a member may see
 *   (never relationship or verified_by).
 * - Documents go to the private verification-docs bucket under
 *   media-owners/{owner_id}/{kind}-{timestamp}.{ext}. There is no member UPDATE
 *   policy on that bucket (evidence stays as filed), so uploads use
 *   upsert: false and a unique path; upsert: true would fail on any clash.
 * - No `.select()` after the media_owner_documents insert: if RLS refused the
 *   write the chained select would turn it into a confusing failure.
 *   uploaded_by is filled by the column default auth.uid().
 * - File type and size are checked BEFORE any call, so a refused file costs
 *   nothing and the person reads why in plain words.
 *
 * PLACEMENTS
 *
 * - An owner's placements are written only through owner_create_placement,
 *   owner_update_placement and owner_record_availability. The database sets
 *   the lifecycle from the owner's verification (pending_review or
 *   partner_verified), composes location as "City, Country" from city and
 *   country_code, and stamps method 'portal' and confirmed_by_owner. So the
 *   client sends city, country_code and site_address, never a free location.
 * - owner_update_placement refuses any key outside its list rather than
 *   ignoring it. OWNER_EDITABLE_FIELDS mirrors that list and is checked here
 *   first, so a client bug reads as a plain refusal before any call.
 * - A stock photo is refused here, in the database's own words, before the
 *   database refuses it (is_stock_image_url mirrors isStockPlaceholder).
 * - Photos go to the public business-images bucket under
 *   placements/{advert_id}/. The storage policy lets only members of the
 *   placement's owner write there and checks the advert's owner_id, so a
 *   placement is created first and its photos are uploaded after. Unique
 *   path, upsert: false: a clash fails instead of replacing a photo.
 */

export type DocumentKind = 'registration' | 'signage_permit' | 'rate_card' | 'authorisation_letter';
export type SiteProofKind = Exclude<DocumentKind, 'registration'>;

export const SITE_PROOF_KINDS: SiteProofKind[] = ['signage_permit', 'rate_card', 'authorisation_letter'];

export const DOCUMENT_LABELS: Record<DocumentKind, string> = {
  registration: 'Company registration',
  signage_permit: 'Signage permit',
  rate_card: 'Rate card',
  authorisation_letter: 'Authorisation letter',
};

/** The owner row as a business member sees it (get_my_media_owner). */
export interface MyMediaOwner {
  id: string;
  name: string;
  website: string | null;
  country_codes: string[] | null;
  verification: Verification;
  verified_at: string | null;
  verification_note: string | null;
}

export interface OwnerDocument {
  id: string;
  owner_id: string;
  kind: DocumentKind;
  storage_path: string;
  uploaded_at: string;
}

/** The words a person reads when a file is refused, in one place. */
export const PARTNER_MESSAGES = {
  wrongType: 'This file type is not accepted. Upload a PDF, JPG or PNG.',
  tooLarge: 'This file is larger than 10MB. Upload a smaller file.',
  reasonRequired: 'A reason is required to reject a media owner',
  stockPhoto: 'Upload a photo of the actual site.',
  cityComma: 'Enter the city on its own; put the street or landmark in the address',
  fromDateRequired: 'Choose the date this starts.',
  bookedUntilRequired: 'Choose the date it is booked until.',
  photoType: 'This file type is not accepted. Upload a JPG, PNG or WebP photo.',
  photoTooLarge: 'This photo is larger than 10MB. Upload a smaller photo.',
  placementReasonRequired: 'A reason is required to reject a placement',
  toBeforeFrom: 'The end date is before the start date. Choose an end date on or after the start.',
  /** The same words owner_update_placement and owner_record_availability use. */
  ownerRejected: "Your media-owner account was not approved, so placements can't be changed. Contact NowOpen.",
} as const;

const BUCKET = 'verification-docs';
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_EXT = ['pdf', 'jpg', 'jpeg', 'png'];
const ALLOWED_MIME = ['application/pdf', 'image/jpeg', 'image/png'];
const SIGNED_URL_SECONDS = 120;
/** PostgREST caps a response silently at 1,000 rows; never rely on a bare limit. */
const PAGE_END = 999;

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const messageOf = (e: unknown): string => (e instanceof Error ? e.message : String(e));

async function guarded<T>(run: () => Promise<Result<T>>): Promise<Result<T>> {
  try {
    return await run();
  } catch (e) {
    return fail(messageOf(e));
  }
}

/** Turn on Media owner mode. Idempotent in the database: one owner per business. */
export function enableMediaOwner(businessId: string): Promise<Result<{ ownerId: string }>> {
  return guarded(async () => {
    const { data, error } = await supabase.rpc('enable_media_owner', { p_business_id: businessId });
    if (error) return fail(error.message);
    return { ok: true, ownerId: String(data) };
  });
}

/**
 * This business's media owner, or null when Media owner mode is off. When the
 * owner stands rejected, the latest rejection reason comes with it (read from
 * the audit log by owner_verification_reason; null in every other state).
 */
export function getMyMediaOwner(businessId: string): Promise<Result<{ owner: MyMediaOwner | null; rejectReason: string | null }>> {
  return guarded(async () => {
    const { data, error } = await supabase.rpc('get_my_media_owner', { p_business_id: businessId });
    if (error) return fail(error.message);
    const owner = ((data ?? []) as MyMediaOwner[])[0] ?? null;
    if (!owner || owner.verification !== 'rejected') return { ok: true, owner, rejectReason: null };
    // The reason is a detail of the status, not the owner itself: a failed
    // read degrades to "no reason was recorded" rather than hiding the whole
    // tab (documents, re-upload, resubmit) behind an error.
    const reason = await supabase.rpc('owner_verification_reason', { p_owner_id: owner.id });
    if (reason.error) return { ok: true, owner, rejectReason: null };
    return { ok: true, owner, rejectReason: (reason.data as string | null) ?? null };
  });
}

/** PDF, JPG or PNG, 10MB or less. Returns the refusal, or null when acceptable. */
export function checkDocumentFile(file: File): string | null {
  const ext = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : '';
  // The extension decides; a MIME type, when the browser supplies one, must
  // agree. Some systems hand over an empty type for a perfectly good PDF.
  if (!ALLOWED_EXT.includes(ext) || (file.type && !ALLOWED_MIME.includes(file.type))) return PARTNER_MESSAGES.wrongType;
  if (file.size > MAX_BYTES) return PARTNER_MESSAGES.tooLarge;
  return null;
}

export function uploadOwnerDocument(ownerId: string, kind: DocumentKind, file: File): Promise<Result<{ path: string }>> {
  return guarded(async () => {
    const refused = checkDocumentFile(file);
    if (refused) return fail(refused);
    const ext = file.name.split('.').pop()!.toLowerCase();
    const path = `media-owners/${ownerId}/${kind}-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false });
    if (upErr) return fail(upErr.message);
    const { error: insErr } = await supabase
      .from('media_owner_documents')
      .insert({ owner_id: ownerId, kind, storage_path: path });
    if (insErr) return fail(`The file was stored but could not be recorded: ${insErr.message}`);
    return { ok: true, path };
  });
}

export function listOwnerDocuments(ownerId: string): Promise<Result<{ documents: OwnerDocument[] }>> {
  return guarded(async () => {
    const { data, error } = await supabase
      .from('media_owner_documents')
      .select('id,owner_id,kind,storage_path,uploaded_at')
      .eq('owner_id', ownerId)
      .order('uploaded_at', { ascending: false })
      .range(0, PAGE_END);
    if (error) return fail(error.message);
    return { ok: true, documents: (data ?? []) as OwnerDocument[] };
  });
}

/** Both kinds present → "Under review". The database re-checks both. */
export function submitVerification(ownerId: string): Promise<Result> {
  return guarded(async () => {
    const { error } = await supabase.rpc('submit_owner_verification', { p_owner_id: ownerId });
    return error ? fail(error.message) : { ok: true };
  });
}

export function signedDocumentUrl(path: string): Promise<Result<{ url: string }>> {
  return guarded(async () => {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_SECONDS);
    if (error || !data) return fail(error?.message ?? 'Could not open the document');
    return { ok: true, url: data.signedUrl };
  });
}

/** Admin: reject with a reason. The RPC writes the audit row the owner's status reads. */
export function adminRejectOwner(ownerId: string, reason: string): Promise<Result> {
  return guarded(async () => {
    if (!reason.trim()) return fail(PARTNER_MESSAGES.reasonRequired);
    const { error } = await supabase.rpc('admin_reject_owner', { p_owner_id: ownerId, p_reason: reason.trim() });
    return error ? fail(error.message) : { ok: true };
  });
}

/** The documents still needed before review, in the words the status uses. */
export function missingDocuments(docs: Pick<OwnerDocument, 'kind'>[]): string[] {
  const missing: string[] = [];
  if (!docs.some((d) => d.kind === 'registration')) missing.push('company registration');
  if (!docs.some((d) => (SITE_PROOF_KINDS as string[]).includes(d.kind))) missing.push('a site proof');
  return missing;
}

/**
 * The status line the owner reads. Verbatim strings from the plan; no timing
 * promises. A rejected owner sees the reason even while re-uploading, until
 * they send again (owner_verification_reason returns null after that).
 */
export function verificationStatusText(
  owner: Pick<MyMediaOwner, 'verification' | 'verified_at'>,
  docs: Pick<OwnerDocument, 'kind'>[],
  lastRejectReason: string | null,
): string {
  switch (owner.verification) {
    case 'verified':
      return owner.verified_at ? `Verified on ${formatLocalDate(owner.verified_at)}` : 'Verified';
    case 'documents_submitted':
      return 'Under review';
    case 'rejected':
      return `Not approved: ${lastRejectReason?.trim() || 'no reason was recorded'}`;
    default: {
      const missing = missingDocuments(docs);
      // Both documents filed but not yet sent: none of the four plan strings
      // fits, and "Under review" would be untrue until they press send.
      if (missing.length === 0) return 'Not verified yet — send your documents for review';
      return `Not verified yet — add ${missing.join(' and ')}`;
    }
  }
}

// ---------------------------------------------------------------------------
// Placements
// ---------------------------------------------------------------------------

/*
 * The countries owner_create_placement accepts (placement_country_name in
 * 20261111010000_partner_portal.sql), with the currency an owner there most
 * likely quotes in. A currency NowOpen has no rate for falls back to USD.
 */
export const PLACEMENT_COUNTRIES: { code: string; name: string; currency: string }[] = [
  { code: 'NG', name: 'Nigeria', currency: 'NGN' },
  { code: 'GH', name: 'Ghana', currency: 'GHS' },
  { code: 'KE', name: 'Kenya', currency: 'KES' },
  { code: 'ZA', name: 'South Africa', currency: 'ZAR' },
  { code: 'EG', name: 'Egypt', currency: 'EGP' },
  { code: 'TZ', name: 'Tanzania', currency: 'TZS' },
  { code: 'UG', name: 'Uganda', currency: 'UGX' },
  { code: 'RW', name: 'Rwanda', currency: 'RWF' },
  { code: 'ET', name: 'Ethiopia', currency: 'ETB' },
  { code: 'MA', name: 'Morocco', currency: 'MAD' },
  { code: 'SN', name: 'Senegal', currency: 'XOF' },
  { code: 'CI', name: "Côte d'Ivoire", currency: 'XOF' },
  { code: 'CM', name: 'Cameroon', currency: 'USD' },
  { code: 'MZ', name: 'Mozambique', currency: 'USD' },
  { code: 'ZW', name: 'Zimbabwe', currency: 'USD' },
  { code: 'BW', name: 'Botswana', currency: 'USD' },
  { code: 'DZ', name: 'Algeria', currency: 'USD' },
  { code: 'NA', name: 'Namibia', currency: 'USD' },
  { code: 'TN', name: 'Tunisia', currency: 'USD' },
  { code: 'ZM', name: 'Zambia', currency: 'USD' },
  { code: 'CD', name: 'DR Congo', currency: 'USD' },
];

/** Exactly the keys owner_update_placement accepts (its v_allowed array). */
export const OWNER_EDITABLE_FIELDS = [
  'title', 'description', 'size_spec', 'dimensions', 'rate_amount', 'currency', 'rate_period', 'pricing',
  'image_url', 'media_urls', 'city', 'country_code', 'site_address',
] as const;
export type OwnerEditableField = (typeof OWNER_EDITABLE_FIELDS)[number];

/** What the placement form sends to owner_create_placement. */
export interface PlacementInput {
  category: string;
  title: string;
  description?: string | null;
  city: string;
  country_code: string;
  site_address?: string | null;
  size_spec: SizeSpec | null;
  /** The owner's own rate, in `currency` per `rate_period`. */
  rate_amount: number | null;
  currency: string;
  rate_period: RatePeriod | null;
  /** USD per day, derived from the rate with toUsdPerDay. */
  pricing: number | null;
  image_url?: string | null;
  media_urls?: string[] | null;
}

export type PlacementPatch = Partial<{
  title: string;
  description: string | null;
  size_spec: SizeSpec | null;
  dimensions: string | null;
  rate_amount: number | null;
  currency: string;
  rate_period: RatePeriod | null;
  pricing: number | null;
  image_url: string | null;
  media_urls: string[] | null;
  city: string;
  country_code: string;
  site_address: string | null;
}>;

/** A placement as its owner sees it in the Media owner tab. */
export interface OwnerPlacement {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  location: string | null;
  country_code: string | null;
  site_address: string | null;
  size_spec: SizeSpec | null;
  dimensions: string | null;
  rate_amount: number | null;
  currency: string | null;
  rate_period: RatePeriod | null;
  pricing: number | null;
  image_url: string | null;
  media_urls: string[] | null;
  lifecycle: string;
}

export type AvailabilityStatus = 'available' | 'booked' | 'unavailable' | 'maintenance';

/**
 * The owner's own rate as they stated it: "NGN 450,000 a month", or null when
 * they gave no rate or no period. One formatter for the owner's list and the
 * admin review queue, so both say the same thing about the same row. Visitor
 * surfaces never use this: they show the CurrencyProvider format.
 */
export function ownerRateText(p: Pick<OwnerPlacement, 'rate_amount' | 'currency' | 'rate_period'>): string | null {
  if (p.rate_amount === null || p.rate_amount === undefined || !p.rate_period) return null;
  return `${p.currency ?? ''} ${Number(p.rate_amount).toLocaleString('en')} a ${p.rate_period}`.trim();
}

const PHOTO_BUCKET = 'business-images';
const PHOTO_EXT = ['jpg', 'jpeg', 'png', 'webp'];
const PHOTO_MIME = ['image/jpeg', 'image/png', 'image/webp'];
const OWNER_PLACEMENT_COLUMNS =
  'id,title,description,category,location,country_code,site_address,size_spec,dimensions,rate_amount,currency,rate_period,pricing,image_url,media_urls,lifecycle';

const hasStockPhoto = (image: string | null | undefined, media: string[] | null | undefined): boolean =>
  isStockPlaceholder(image) || (media ?? []).some((u) => isStockPlaceholder(u));

/** The city as Promote reads it: the first comma segment of "City, Country". */
export function cityOf(location: string | null | undefined): string {
  return String(location ?? '').split(',')[0].trim();
}

/** List a placement. Returns its id; the database decides whether it is public yet. */
export function createPlacement(ownerId: string, input: PlacementInput): Promise<Result<{ advertId: string }>> {
  return guarded(async () => {
    if (hasStockPhoto(input.image_url, input.media_urls)) return fail(PARTNER_MESSAGES.stockPhoto);
    if (input.city.includes(',')) return fail(PARTNER_MESSAGES.cityComma);
    const p = {
      category: input.category,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      city: input.city.trim(),
      country_code: input.country_code.trim().toUpperCase(),
      site_address: input.site_address?.trim() || null,
      size_spec: input.size_spec,
      // The readable summary keeps every reader of the legacy column working.
      dimensions: input.size_spec ? sizeSummary(input.size_spec) || null : null,
      rate_amount: input.rate_amount,
      currency: input.currency.trim().toUpperCase(),
      // advertisements_rate_complete: a rate has a period, no rate has none.
      rate_period: input.rate_amount === null ? null : input.rate_period,
      pricing: input.pricing,
      image_url: input.image_url ?? null,
      media_urls: input.media_urls ?? null,
    };
    const { data, error } = await supabase.rpc('owner_create_placement', { p_owner_id: ownerId, p });
    if (error) return fail(error.message);
    return { ok: true, advertId: String(data) };
  });
}

/** Edit an owned placement. Sends exactly the keys given; any other key is refused. */
export function updatePlacement(advertId: string, patch: PlacementPatch): Promise<Result> {
  return guarded(async () => {
    const bad = Object.keys(patch).filter((k) => !(OWNER_EDITABLE_FIELDS as readonly string[]).includes(k)).sort();
    if (bad.length) return fail(`These fields cannot be changed here: ${bad.join(', ')}`);
    if (hasStockPhoto(patch.image_url, patch.media_urls)) return fail(PARTNER_MESSAGES.stockPhoto);
    if (typeof patch.city === 'string' && patch.city.includes(',')) return fail(PARTNER_MESSAGES.cityComma);
    const { error } = await supabase.rpc('owner_update_placement', { p_advert_id: advertId, p: patch });
    return error ? fail(error.message) : { ok: true };
  });
}

/**
 * "Available from / to", "Booked until", "Unavailable", "Maintenance". The
 * database stamps method 'portal' and the placement's own owner, which is what
 * the public line "Available · confirmed {date} by {owner}" is built from.
 */
export function recordAvailability(
  advertId: string,
  status: AvailabilityStatus,
  from: string,
  to: string | null,
): Promise<Result<{ availabilityId: string }>> {
  return guarded(async () => {
    if (!from) return fail(PARTNER_MESSAGES.fromDateRequired);
    if (status === 'booked' && !to) return fail(PARTNER_MESSAGES.bookedUntilRequired);
    // Both are yyyy-mm-dd from a date input, so text order is date order. The
    // table's CHECK would refuse it too, but in words no owner should read.
    if (to && to < from) return fail(PARTNER_MESSAGES.toBeforeFrom);
    const { data, error } = await supabase.rpc('owner_record_availability', {
      p_advert_id: advertId, p_status: status, p_from: from, p_to: to || null,
    });
    if (error) return fail(error.message);
    return { ok: true, availabilityId: String(data) };
  });
}

/** JPG, PNG or WebP, 10MB or less. Returns the refusal, or null when acceptable. */
export function checkPhotoFile(file: File): string | null {
  const ext = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : '';
  if (!PHOTO_EXT.includes(ext) || (file.type && !PHOTO_MIME.includes(file.type))) return PARTNER_MESSAGES.photoType;
  if (file.size > MAX_BYTES) return PARTNER_MESSAGES.photoTooLarge;
  return null;
}

/** Upload a site photo for a placement that already exists. Returns its public URL. */
export function uploadPlacementPhoto(advertId: string, file: File): Promise<Result<{ path: string; url: string }>> {
  return guarded(async () => {
    const refused = checkPhotoFile(file);
    if (refused) return fail(refused);
    // Resized and re-encoded (WebP where the browser can) before upload; a
    // small file, or one that would not shrink, goes up as it is.
    const body = await compressImage(file);
    const ext = body.name.includes('.') ? body.name.split('.').pop()!.toLowerCase() : 'jpg';
    const path = `placements/${advertId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(path, body, { upsert: false, contentType: body.type || undefined });
    if (error) return fail(error.message);
    const { data } = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path);
    return { ok: true, path, url: data.publicUrl };
  });
}

/** The placements linked to this owner, in every lifecycle (an owner sees their own pending ones). */
export function listMyPlacements(ownerId: string): Promise<Result<{ placements: OwnerPlacement[] }>> {
  return guarded(async () => {
    const { data, error } = await supabase
      .from('advertisements')
      .select(OWNER_PLACEMENT_COLUMNS)
      .eq('owner_id', ownerId)
      .order('created_at', { ascending: false })
      .order('id')
      .range(0, PAGE_END);
    if (error) return fail(error.message);
    return { ok: true, placements: (data ?? []) as unknown as OwnerPlacement[] };
  });
}

/**
 * Admin: decide a pending_review placement. Approve makes it partner_verified
 * when its owner is verified at that moment, partner_supplied otherwise (the
 * database decides; p_reason null records "Approved after review"). Reject
 * needs a reason, which is written to the audit log.
 */
export function adminReviewPlacement(advertId: string, approve: boolean, reason?: string): Promise<Result> {
  return guarded(async () => {
    if (!approve && !reason?.trim()) return fail(PARTNER_MESSAGES.placementReasonRequired);
    const { error } = await supabase.rpc('admin_review_placement', {
      p_advert_id: advertId, p_approve: approve, p_reason: approve ? null : reason!.trim(),
    });
    return error ? fail(error.message) : { ok: true };
  });
}

/** A placement waiting for an admin, with what the admin needs to judge it. */
export interface PendingPlacement {
  id: string;
  title: string;
  category: string | null;
  location: string | null;
  site_address: string | null;
  dimensions: string | null;
  rate_amount: number | null;
  currency: string | null;
  rate_period: RatePeriod | null;
  image_url: string | null;
  media_urls: string[] | null;
  owner_id: string | null;
  lifecycle: string;
  created_at: string;
}

/** Admin: every pending_review placement, oldest first (one queue, first come first decided). */
export function listPendingPlacements(): Promise<Result<{ placements: PendingPlacement[] }>> {
  return guarded(async () => {
    const { data, error } = await supabase
      .from('advertisements')
      .select('id,title,category,location,site_address,dimensions,rate_amount,currency,rate_period,image_url,media_urls,owner_id,lifecycle,created_at')
      .eq('lifecycle', 'pending_review')
      .order('created_at', { ascending: true })
      .order('id')
      .range(0, PAGE_END);
    if (error) return fail(error.message);
    return { ok: true, placements: (data ?? []) as unknown as PendingPlacement[] };
  });
}

/**
 * The lifecycle the database gave a placement, read back after creating it.
 * advertisements is publicly readable, so this works for any row; the
 * lifecycle is decided by owner_create_placement, never by the client.
 */
export function readPlacementLifecycle(advertId: string): Promise<Result<{ lifecycle: string | null }>> {
  return guarded(async () => {
    const { data, error } = await supabase.from('advertisements').select('lifecycle').eq('id', advertId).maybeSingle();
    if (error) return fail(error.message);
    return { ok: true, lifecycle: (data as { lifecycle?: string | null } | null)?.lifecycle ?? null };
  });
}

/**
 * The sentence an owner reads after listing a placement, from the created
 * row's REAL lifecycle (not the verification the page loaded, which can be
 * out of date). Unknown or unread: a neutral "Saved." that claims nothing.
 * The labels come from trustLabelText (one string source).
 */
export function placementSavedText(lifecycle: string | null): string {
  switch (lifecycle) {
    case 'pending_review':
      return 'Sent for review';
    case 'partner_verified':
    case 'partner_supplied':
      return `Live as ${trustLabelText(lifecycle)}`;
    default:
      return 'Saved.';
  }
}

/**
 * The saved sentence followed by what went wrong after saving, with exactly
 * one full stop between them ("Saved." already ends in one).
 */
export function savedWithProblem(saved: string, problem: string): string {
  return `${saved.replace(/\.+$/, '')}. ${problem}`;
}

// ---------------------------------------------------------------------------
// Claims: "Is this your site?"
// ---------------------------------------------------------------------------

/*
 * A claim is filed only through owner_claim_placement and decided only through
 * admin_decide_claim; placement_claims has no member write policy. Members read
 * their own claims (status and reason) and nobody else's, so a pending claim by
 * ANOTHER owner is invisible here: that owner's attempt is refused by the
 * database's one-pending-claim index, and the refusal is shown in its words.
 *
 * A representative's authorisation letter goes through uploadOwnerDocument:
 * the same private bucket, the same own-folder path and upsert: false as the
 * verification documents. The claim row stores that path.
 */

export type ClaimRole = 'owner' | 'authorised_representative';
export type ClaimStatus = 'pending' | 'approved' | 'rejected';

export const CLAIM_MESSAGES = {
  statementRequired: 'Say how this site is yours.',
  letterRequired: "Upload the owner's signed authorisation letter.",
  reasonRequired: 'A reason is required to reject a claim',
} as const;

/** One of this owner's own claims, as a member reads it. */
export interface MyClaim {
  id: string;
  advert_id: string;
  status: ClaimStatus;
  reason: string | null;
}

/**
 * The viewer's media owner, found the way the Dashboard finds the businesses:
 * businesses they own plus active team memberships, then get_my_media_owner
 * for each until one turns out to be a media owner. Null when none is.
 */
export function findMyMediaOwner(userId: string): Promise<Result<{ owner: MyMediaOwner | null }>> {
  return guarded(async () => {
    const [owned, member] = await Promise.all([
      supabase.from('businesses').select('id').eq('user_id', userId).range(0, PAGE_END),
      supabase.from('business_members').select('business_id').eq('user_id', userId).eq('status', 'active').range(0, PAGE_END),
    ]);
    if (owned.error) return fail(owned.error.message);
    if (member.error) return fail(member.error.message);
    const ids = new Set<string>([
      ...((owned.data ?? []) as { id: string }[]).map((b) => String(b.id)),
      ...((member.data ?? []) as { business_id: string }[]).map((m) => String(m.business_id)),
    ]);
    for (const id of ids) {
      const r = await getMyMediaOwner(id);
      if (!r.ok) return fail(r.error);
      if (r.owner) return { ok: true, owner: r.owner };
    }
    return { ok: true, owner: null };
  });
}

/**
 * File a claim. Refused here, before any upload or call, when the statement is
 * empty or a representative has no letter; the database re-checks both. The
 * letter is uploaded first, then its path rides with the claim. A failed claim
 * after a successful upload leaves the file in the owner's own folder.
 */
export function claimPlacement(
  advertId: string,
  ownerId: string,
  role: ClaimRole,
  statement: string,
  letter: File | null,
): Promise<Result<{ claimId: string }>> {
  return guarded(async () => {
    if (!statement.trim()) return fail(CLAIM_MESSAGES.statementRequired);
    if (role === 'authorised_representative' && !letter) return fail(CLAIM_MESSAGES.letterRequired);
    let documentPath: string | null = null;
    if (role === 'authorised_representative' && letter) {
      const up = await uploadOwnerDocument(ownerId, 'authorisation_letter', letter);
      if (!up.ok) return fail(up.error);
      documentPath = up.path;
    }
    const { data, error } = await supabase.rpc('owner_claim_placement', {
      p_advert_id: advertId, p_owner_id: ownerId, p_role: role, p_statement: statement.trim(), p_document_path: documentPath,
    });
    if (error) return fail(error.message);
    return { ok: true, claimId: String(data) };
  });
}

/** This owner's claims, newest first. Another owner's claim is never returned (RLS). */
export function listMyClaims(ownerId: string): Promise<Result<{ claims: MyClaim[] }>> {
  return guarded(async () => {
    const { data, error } = await supabase
      .from('placement_claims')
      .select('id,advert_id,status,reason')
      .eq('owner_id', ownerId)
      .order('created_at', { ascending: false })
      .range(0, PAGE_END);
    if (error) return fail(error.message);
    return { ok: true, claims: (data ?? []) as MyClaim[] };
  });
}

/** A claim waiting for an admin, with the placement it is about. */
export interface PendingClaim {
  id: string;
  advert_id: string;
  owner_id: string;
  role: ClaimRole;
  statement: string;
  document_path: string | null;
  created_at: string;
  /** From the advertisement, read separately; null when it could not be read. */
  advert_title: string | null;
  advert_location: string | null;
}

/** Admin: every pending claim, oldest first (first come first decided). */
export function listPendingClaims(): Promise<Result<{ claims: PendingClaim[] }>> {
  return guarded(async () => {
    const { data, error } = await supabase
      .from('placement_claims')
      .select('id,advert_id,owner_id,role,statement,document_path,created_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .order('id')
      .range(0, PAGE_END);
    if (error) return fail(error.message);
    const rows = (data ?? []) as Omit<PendingClaim, 'advert_title' | 'advert_location'>[];
    const titles = new Map<string, { title: string | null; location: string | null }>();
    const ids = [...new Set(rows.map((r) => r.advert_id))];
    if (ids.length) {
      const ads = await supabase.from('advertisements').select('id,title,location').in('id', ids).range(0, PAGE_END);
      // A failed title read degrades to "Placement", not a hidden queue.
      if (!ads.error) {
        for (const a of (ads.data ?? []) as { id: string; title: string | null; location: string | null }[]) {
          titles.set(String(a.id), { title: a.title, location: a.location });
        }
      }
    }
    return {
      ok: true,
      claims: rows.map((r) => ({
        ...r,
        advert_title: titles.get(r.advert_id)?.title ?? null,
        advert_location: titles.get(r.advert_id)?.location ?? null,
      })),
    };
  });
}

/**
 * Admin: approve (the database sets owner_id and the lifecycle) or reject
 * (a reason is required; the owner reads it).
 */
export function decideClaim(claimId: string, approve: boolean, reason?: string): Promise<Result> {
  return guarded(async () => {
    if (!approve && !reason?.trim()) return fail(CLAIM_MESSAGES.reasonRequired);
    const { error } = await supabase.rpc('admin_decide_claim', {
      p_claim_id: claimId, p_approve: approve, p_reason: approve ? null : reason!.trim(),
    });
    return error ? fail(error.message) : { ok: true };
  });
}

// ---------------------------------------------------------------------------
// Spreadsheet imports
// ---------------------------------------------------------------------------

/*
 * placement_imports has a member INSERT policy (created_by must be the caller;
 * the column default auth.uid() fills it) and a member SELECT policy, and no
 * member UPDATE or DELETE: an import's record is written once, after the rows,
 * and is history from then on. No `.select()` after the insert (an RLS refusal
 * would surface as a confusing read failure instead of the write's own error).
 *
 * The table has no rows_updated column. A row that updated one of the owner's
 * own placements is the remainder: rows_total - created - claimed - failed.
 */

export interface ImportErrorEntry { row: number; message: string }

export interface ImportCounts {
  rows_total: number;
  rows_created: number;
  rows_claimed: number;
  rows_failed: number;
}

export interface PlacementImportRecord extends ImportCounts {
  id: string;
  file_name: string;
  error_report: ImportErrorEntry[];
  created_at: string;
}

/** Write the import's record once its rows are done. */
export function recordImport(
  ownerId: string,
  fileName: string,
  counts: ImportCounts,
  errorReport: ImportErrorEntry[],
): Promise<Result<{ recorded: true }>> {
  return guarded(async () => {
    const { error } = await supabase.from('placement_imports').insert({
      owner_id: ownerId,
      file_name: fileName.trim() || 'spreadsheet',
      ...counts,
      error_report: errorReport,
    });
    if (error) return fail(error.message);
    return { ok: true, recorded: true };
  });
}

/** This owner's imports, newest first. */
export function listMyImports(ownerId: string): Promise<Result<{ imports: PlacementImportRecord[] }>> {
  return guarded(async () => {
    const { data, error } = await supabase
      .from('placement_imports')
      .select('id,file_name,rows_total,rows_created,rows_claimed,rows_failed,error_report,created_at')
      .eq('owner_id', ownerId)
      .order('created_at', { ascending: false })
      .order('id')
      .range(0, PAGE_END);
    if (error) return fail(error.message);
    return { ok: true, imports: (data ?? []) as PlacementImportRecord[] };
  });
}
