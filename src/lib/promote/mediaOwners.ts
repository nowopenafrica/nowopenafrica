import { supabase } from '../supabase';

/**
 * Admin data functions for the placement trust model (media owners, contacts,
 * placement links, availability confirmations, lifecycle).
 *
 * THE RULES THIS FILE HOLDS
 *
 * - Every function returns `{ ok: true, ... } | { ok: false, error }` and never
 *   throws. supabase-js resolves with `{ data, error }` instead of throwing, so
 *   `.catch()` would never fire; the error is read off the result. The try/catch
 *   is only for a client that genuinely throws (network layer).
 * - Required inputs are checked BEFORE any call. The database enforces them as
 *   well, but a refused action should not cost a round trip, and the message
 *   here is the one the admin reads.
 * - Verification sends `verification` and `verification_note` and nothing else.
 *   `verified_by` / `verified_at` are stamped by the media_owners_before_write
 *   trigger from auth.uid(); sending them would be a claim the database
 *   overwrites anyway, and the one place that should never be client-asserted.
 * - Lifecycle changes go through the `set_placement_lifecycle` RPC, never a
 *   direct update: the RPC is what records the reason in the audit log.
 * - No `.select()` after an insert: if RLS refuses the write, the chained
 *   select turns it into a confusing failure (see the RLS insert-select trap).
 */

export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export type Verification = 'unverified' | 'documents_submitted' | 'verified' | 'rejected';

export interface MediaOwner {
  id: string;
  name: string;
  website: string | null;
  country_codes: string[];
  business_id: string | null;
  verification: Verification;
  verification_note: string | null;
  relationship: string;
}

export interface OwnerContact {
  id: string;
  owner_id: string;
  kind: ContactKind;
  value: string;
  source_url: string;
  confidence: 'high' | 'medium' | 'low';
  is_public_business_contact: boolean;
  found_at: string;
}

export interface PlacementRow {
  id: string;
  title: string;
  lifecycle: string;
  owner_id: string | null;
  owner_role: string | null;
}

export type ContactKind = 'email' | 'phone' | 'form' | 'social' | 'other';
export type OwnerRole = 'owner' | 'authorised_representative';
/**
 * Every lifecycle a placement can be in. pending_review is set only by
 * owner_create_placement and left only through admin_review_placement, so
 * set_placement_lifecycle refuses it: setLifecycle takes SettableLifecycle.
 */
export type Lifecycle = 'pending_review' | 'rejected' | 'archived' | 'imported' | 'partner_supplied' | 'partner_verified';
/** The lifecycles set_placement_lifecycle accepts from an admin. */
export type SettableLifecycle = Exclude<Lifecycle, 'pending_review'>;

/**
 * The validation words an admin reads, in one place. The panel checks the
 * same things before calling (so the message appears beside the field) and
 * must use these, so the two can never say different things.
 */
export const MEDIA_OWNER_MESSAGES = {
  contactValueRequired: 'Enter the contact detail',
  contactSourceRequired: 'Add where you found this contact',
  confirmationMethodAndFrom: 'Choose how this was confirmed and the from-date',
} as const;

/** Never rely on a bare limit: PostgREST caps a response silently at 1,000 rows. */
const PAGE_END = 999;

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const messageOf = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export function isAbsoluteHttpUrl(value: string): boolean {
  try {
    const u = new URL(value.trim());
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

async function guarded<T>(run: () => Promise<Result<T>>): Promise<Result<T>> {
  try {
    return await run();
  } catch (e) {
    return fail(messageOf(e));
  }
}

export function listOwners(): Promise<Result<{ owners: MediaOwner[] }>> {
  return guarded(async () => {
    const { data, error } = await supabase
      .from('media_owners')
      .select('id,name,website,country_codes,business_id,verification,verification_note,relationship')
      .order('name')
      .range(0, PAGE_END);
    if (error) return fail(error.message);
    return { ok: true, owners: (data ?? []) as MediaOwner[] };
  });
}

export function listPlacements(): Promise<Result<{ placements: PlacementRow[] }>> {
  return guarded(async () => {
    const { data, error } = await supabase
      .from('advertisements')
      .select('id,title,lifecycle,owner_id,owner_role')
      .order('title')
      .range(0, PAGE_END);
    if (error) return fail(error.message);
    return { ok: true, placements: (data ?? []) as PlacementRow[] };
  });
}

export function listContacts(ownerId: string): Promise<Result<{ contacts: OwnerContact[] }>> {
  return guarded(async () => {
    const { data, error } = await supabase
      .from('media_owner_contacts')
      .select('id,owner_id,kind,value,source_url,confidence,is_public_business_contact,found_at')
      .eq('owner_id', ownerId)
      .order('found_at', { ascending: false })
      .range(0, PAGE_END);
    if (error) return fail(error.message);
    return { ok: true, contacts: (data ?? []) as OwnerContact[] };
  });
}

export function saveOwner(input: {
  id?: string;
  name: string;
  website?: string;
  countryCodes: string[];
  businessId?: string | null;
}): Promise<Result> {
  return guarded(async () => {
    const name = input.name.trim();
    if (!name) return fail('Give the media owner a name');
    const website = input.website?.trim() || null;
    if (website && !isAbsoluteHttpUrl(website)) return fail('The website must start with http:// or https://');
    const row = {
      name,
      website,
      country_codes: input.countryCodes.map((c) => c.trim().toUpperCase()).filter(Boolean),
      business_id: input.businessId ?? null,
    };
    const { error } = input.id
      ? await supabase.from('media_owners').update(row).eq('id', input.id)
      : await supabase.from('media_owners').insert(row);
    return error ? fail(error.message) : { ok: true };
  });
}

export function verifyOwner(id: string, note: string): Promise<Result> {
  return guarded(async () => {
    if (!note.trim()) return fail('Say which documents you checked before verifying');
    const { error } = await supabase
      .from('media_owners')
      .update({ verification: 'verified', verification_note: note.trim() })
      .eq('id', id);
    return error ? fail(error.message) : { ok: true };
  });
}

/**
 * Takes verification away. The database trigger also drops this owner's
 * `partner_verified` placements back to `partner_supplied`.
 *
 * `verification_note` is left untouched: it is the record of which documents
 * were seen, and overwriting it with the removal reason would destroy that.
 *
 * WHERE THE REASON GOES: the owner audit trigger (media_owner_after_write) has
 * no reason channel, so after the update succeeds this inserts one audit_log
 * row, action 'media_owner.unverify_reason', detail { reason }. The live policy
 * "Admins write audit log" allows it when is_admin() and actor_id = auth.uid(),
 * so actor_id is the current user's id. No .select() after the insert. If that
 * insert fails the owner IS already un-verified, and the error says exactly
 * that rather than reporting success.
 */
export function unverifyOwner(id: string, reason: string): Promise<Result> {
  return guarded(async () => {
    if (!reason.trim()) return fail('Say why verification is being removed');
    const { error } = await supabase
      .from('media_owners')
      .update({ verification: 'unverified' })
      .eq('id', id);
    if (error) return fail(error.message);

    const { data: auth, error: authError } = await supabase.auth.getUser();
    const user = auth?.user;
    if (authError || !user) {
      return fail('The owner was un-verified, but the reason could not be recorded: ' + (authError?.message ?? 'no signed-in user'));
    }
    const { error: auditError } = await supabase.from('audit_log').insert({
      actor_id: user.id,
      actor_email: user.email ?? null,
      action: 'media_owner.unverify_reason',
      entity_type: 'media_owner',
      entity_id: id,
      detail: { reason: reason.trim() },
    });
    if (auditError) {
      return fail('The owner was un-verified, but the reason could not be recorded: ' + auditError.message);
    }
    return { ok: true };
  });
}

export function addContact(
  ownerId: string,
  c: {
    kind: ContactKind;
    value: string;
    sourceUrl: string;
    confidence: 'high' | 'medium' | 'low';
    isPublicBusinessContact: boolean;
  },
): Promise<Result> {
  return guarded(async () => {
    if (!c.value.trim()) return fail(MEDIA_OWNER_MESSAGES.contactValueRequired);
    if (!isAbsoluteHttpUrl(c.sourceUrl)) return fail(MEDIA_OWNER_MESSAGES.contactSourceRequired);
    const { error } = await supabase.from('media_owner_contacts').insert({
      owner_id: ownerId,
      kind: c.kind,
      value: c.value.trim(),
      source_url: c.sourceUrl.trim(),
      found_at: new Date().toISOString(),
      confidence: c.confidence,
      is_public_business_contact: c.isPublicBusinessContact,
    });
    return error ? fail(error.message) : { ok: true };
  });
}

export function linkPlacements(ownerId: string, advertIds: string[], role: OwnerRole): Promise<Result<{ linked: number }>> {
  return guarded(async () => {
    if (advertIds.length === 0) return fail('Choose at least one placement');
    // select('id') is on an UPDATE, so it is safe, and it is how a refused
    // update is noticed: RLS filters rows silently and returns no error.
    const { data, error } = await supabase
      .from('advertisements')
      .update({ owner_id: ownerId, owner_role: role })
      .in('id', advertIds)
      .select('id');
    if (error) return fail(error.message);
    const linked = (data ?? []).length;
    if (linked === 0) return fail('No placements were updated. Check you are signed in as an admin.');
    return { ok: true, linked };
  });
}

export function recordConfirmation(
  advertId: string,
  c: {
    status: 'available' | 'booked' | 'unavailable' | 'maintenance';
    periodFrom: string;
    periodTo?: string;
    method: 'email' | 'phone' | 'document' | 'admin';
    ownerId?: string;
    note?: string;
  },
): Promise<Result> {
  return guarded(async () => {
    if (!c.method || !c.periodFrom) return fail(MEDIA_OWNER_MESSAGES.confirmationMethodAndFrom);
    if (c.periodTo && c.periodTo < c.periodFrom) return fail('The to-date cannot be before the from-date');
    const { error } = await supabase.from('placement_availability').insert({
      advert_id: advertId,
      status: c.status,
      period_from: c.periodFrom,
      period_to: c.periodTo || null,
      method: c.method,
      confirmed_by_owner: c.ownerId || null,
      note: c.note?.trim() || null,
    });
    return error ? fail(error.message) : { ok: true };
  });
}

export function setLifecycle(advertId: string, lifecycle: SettableLifecycle, reason: string): Promise<Result> {
  return guarded(async () => {
    if (!reason.trim()) return fail('A reason is required');
    const { error } = await supabase.rpc('set_placement_lifecycle', {
      p_advert_id: advertId,
      p_lifecycle: lifecycle,
      p_reason: reason.trim(),
    });
    return error ? fail(error.message) : { ok: true };
  });
}
