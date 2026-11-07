// Who can see and do what in the Admin Console.
//
// One module so the answer is written once and can be tested. The alternative —
// `role === 'admin'` sprinkled through a 1500-line page — is how a new role ends
// up with more access than intended, because nobody can enumerate the checks.
//
// IMPORTANT, AND NOT OPTIONAL: everything here is user experience, not
// security. It decides which tabs render and which buttons exist. The real
// boundary is Postgres RLS. An editor who calls the REST API directly is
// stopped by policies, not by this file — every privileged table is
// `USING (public.is_admin())`, so an editor reading `payments` gets an empty
// result whether or not the tab is hidden. Hiding the tab is honesty about what
// they can do; the policy is what makes it true.

export type AppRole = 'business' | 'media_service' | 'personal' | 'business_curator' | 'editor' | 'admin';

/** Roles that may open the Admin Console at all. */
export const STAFF_ROLES: AppRole[] = ['admin', 'editor', 'business_curator'];

/** Assignable from the Users panel. Order is the order shown in the dropdown. */
export const ASSIGNABLE_ROLES: AppRole[] = ['business', 'media_service', 'personal', 'business_curator', 'editor', 'admin'];

export const ROLE_LABELS: Record<AppRole, string> = {
  business: 'Business',
  media_service: 'Media service',
  personal: 'Personal',
  business_curator: 'Business curator',
  editor: 'Editor',
  admin: 'Admin',
};

export const ROLE_DESCRIPTIONS: Record<AppRole, string> = {
  business: 'Owns business listings. No admin access.',
  media_service: 'Offers creative services. No admin access.',
  personal: 'Personal profile. No business listing, no admin access.',
  business_curator: 'Adds and edits UNCLAIMED business listings. Cannot edit claimed listings, users, payments, verification, moderation or deletion — and no homepage, page or advertising access.',
  editor: 'Creates and edits UNCLAIMED business listings, plus homepage and page content. Cannot see users, payments or verification, and cannot delete or touch moderation.',
  admin: 'Full access, including roles, billing, verification and deletion.',
};

/**
 * What each role is trusted to do, shown in the Roles definition section of
 * the Admin Console. Descriptive — the enforced boundary is RLS.
 */
export const ROLE_CAPABILITIES: Record<AppRole, string[]> = {
  business: ['Owns and updates its claimed listing', 'Dashboard, bookings and trust tools', 'No admin access'],
  media_service: ['Offers creative services', 'Dashboard tools', 'No admin access'],
  personal: ['Personal profile', 'No business listing', 'No admin access'],
  business_curator: [
    'Admin Console (Overview + Businesses only)',
    'Add new unclaimed businesses',
    'Edit unclaimed businesses until an owner claims them',
    'Cannot edit claimed listings, users, payments, verification, moderation or deletion',
    'No homepage, page content or advertising access',
  ],
  editor: [
    'Admin Console (limited to content tabs)',
    'Add new unclaimed businesses',
    'Edit unclaimed businesses until an owner claims them',
    'Homepage and page content',
    'Business Intelligence (discovery, review and campaigns)',
    'Cannot edit claimed listings, users, payments, verification, moderation or deletion',
  ],
  admin: ['Full Admin Console', 'Roles, plans, billing and verification', 'Moderation and deletion'],
};

export type AdminTabId =
  | 'overview' | 'users' | 'roles' | 'businesses' | 'verification' | 'subscriptions'
  | 'requests' | 'adverts' | 'media' | 'bookings' | 'payments' | 'waitlist'
  | 'registrations' | 'applications' | 'enquiries' | 'audit' | 'hero-videos'
  | 'review-queue' | 'imports' | 'switches' | 'pages' | 'activation'
  | 'profile-requests' | 'create-orders' | 'claimreach' | 'claims' | 'onboarding'
  // Admin only: posting as the brand is the founder's call, and every
  // brand_social_* table is is_admin()-gated, so an editor would see nothing.
  | 'brand-social'
  // Admin only: verifying a media owner is a trust decision, and every table behind it is is_admin()-gated.
  | 'media-owners'
  | 'business-intel' | 'service-catalogue';

/**
 * What an editor may open.
 *
 * Chosen so the list matches what the database will actually return. Anything
 * gated on is_admin() is left out — showing an editor a Payments tab that can
 * only ever render an empty table would look like a bug and teach them to
 * distrust the console.
 *
 * Excluded deliberately: users and audit (account administration), payments,
 * subscriptions and bookings (money), verification and registrations
 * (identity documents), waitlist and applications (personal contact details),
 * requests (approves destructive deletions).
 *
 * Also excluded: imports and review-queue. Both write to the public directory
 * in bulk — one file can create thousands of listings, and a rollback only
 * reaches the ones nobody has claimed yet. That is an admin decision.
 *
 * And switches: a kill switch takes a feature away from every customer at once.
 * Whoever holds it should be the person accountable for the platform being up.
 */
export const EDITOR_TABS: AdminTabId[] = [
  'overview',
  // Whether the platform is working is not privileged information — an editor
  // writing listing content should be able to see whether it earns anything.
  'activation',
  // Owners asking to be listed. Content work, and the queue only pays off if
  // somebody actually works it — so an editor can.
  'profile-requests',
  'claims',
  // Create orders carry a customer's contact and what they want made. Content
  // work, and the queue only pays off if somebody actually prices it.
  'create-orders',
  // The Page Editor is the editor role's actual remit: marketing copy on pages
  // that have been adopted. It cannot reach business records, verification,
  // prices or customer data — those are not editable by anyone, through it.
  'pages',
  'businesses',
  'adverts',
  'media',
  'enquiries',
  'hero-videos',
  // Business Intelligence, embedded in the console as a tab. Every table it
  // reads is `is_staff()`-gated in the database, so an editor gets real data,
  // and the narrowest staff role misses out: its RLS only covers `businesses`.
  'business-intel',
];

/**
 * What a business curator may open.
 *
 * The narrowest staff role: overview for context, and the Businesses tab where
 * the job happens (add unclaimed listings, edit them until claimed). Everything
 * else — users, payments, verification, moderation, adverts, hero videos or
 * pages — is deliberately absent. This matches the database: 20260919020000
 * gives curators RLS only on `businesses`, and they are not recognised by
 * `is_staff()` there, so nothing else returns data or accepts writes.
 */
export const CURATOR_TABS: AdminTabId[] = ['overview', 'businesses'];

export const isStaff = (role: string | null | undefined): boolean =>
  STAFF_ROLES.includes(role as AppRole);

export const isAdmin = (role: string | null | undefined): boolean => role === 'admin';

export const isEditor = (role: string | null | undefined): boolean => role === 'editor';

export const isCurator = (role: string | null | undefined): boolean => role === 'business_curator';

/**
 * Who may open Business Intelligence (/admin/business-intelligence).
 *
 * The internal discovery/ops area: radar candidates, source rights, campaign
 * management, compliance toggles. The database gates every table it reads on
 * `is_staff()` (businesses, radar_candidates, radar_sources, radar_config,
 * business_discovery_campaigns, candidate evidence, suppressions), so the
 * frontend gate is admin + editor — staff minus the narrowest role, whose RLS
 * only covers `businesses`.
 */
export const canAccessIntelligence = (role: string | null | undefined): boolean =>
  isAdmin(role) || isEditor(role);

export function canAccessTab(role: string | null | undefined, tab: AdminTabId): boolean {
  if (isAdmin(role)) return true;
  if (isEditor(role)) return EDITOR_TABS.includes(tab);
  if (isCurator(role)) return CURATOR_TABS.includes(tab);
  return false;
}

/**
 * Deletion is admin-only, without exception.
 *
 * Rows here are businesses, users and payment records — the parts of the
 * platform with no undo. An editor's job is content, and content mistakes are
 * recoverable; a deleted listing is not.
 */
export const canDelete = (role: string | null | undefined): boolean => isAdmin(role);

/**
 * Editing a placement in the admin console.
 *
 * Admin only, because that is exactly what the database allows:
 * `Admins can manage advertisements` (20240701000000_admin_access.sql) is
 * `FOR ALL ... USING (is_admin())`, and no later migration widens it to
 * `is_staff()`. An editor can see the Adverts tab and read every row through
 * the public SELECT policy, but an edit saved from their session is refused by
 * RLS — so offering the button would produce a failure that looks like a bug.
 *
 * A placement is inventory with a price on it. The wrong price is a wrong
 * quote to a customer, which is why this is a considered write and every edit
 * is logged.
 */
export const canEditAdverts = (role: string | null | undefined): boolean => isAdmin(role);

/** Granting a role is granting the platform. Admin only, forever. */
export const canManageRoles = (role: string | null | undefined): boolean => isAdmin(role);
/** Plans are revenue. Admin only. */
export const canManagePlans = (role: string | null | undefined): boolean => isAdmin(role);

/** Approving a verification badge is a trust claim to the public. Admin only. */
export const canVerify = (role: string | null | undefined): boolean => isAdmin(role);

/**
 * Creating a listing from the console is content work until the business is
 * claimed — any staff member may open the "Add business" flow.
 */
export const canCreateBusiness = (role: string | null | undefined): boolean => isStaff(role);

/** The homepage banner and its videos — the editor's remit, not every staff role's. */
export const canManageHero = (role: string | null | undefined): boolean => isAdmin(role) || isEditor(role);

/* ---------------------------------------------------------------------------
 * Editing a business somebody else may one day own
 * ------------------------------------------------------------------------ */

/** What the rule needs to know about a business. */
export interface EditableBusiness {
  claim_status?: string | null;
  user_id?: string | null;
}

export interface EditVerdict {
  allowed: boolean;
  /** Shown to the admin, so a refusal is never a mystery. */
  reason: string;
}

/**
 * May staff edit this business's profile?
 *
 * ONLY UNTIL IT IS CLAIMED, and the boundary is the whole point.
 *
 * An unclaimed listing is NowOpen's own work — imported, or built for a
 * business that has not arrived yet — so somebody has to be able to fix a
 * wrong phone number, add the hours or replace a bad banner. Editors are
 * trusted with exactly this: the Businesses tab is their remit, and the
 * migration backing this (20260913020000) lets them create and maintain
 * unclaimed rows while blocking every moderation column.
 *
 * The moment an owner claims it, the page becomes theirs. An admin editing it
 * then is a stranger rewriting a business's own words, and the owner would
 * have no way to know it happened. Support requests are still answerable —
 * the owner makes the change, or an admin makes it in the SQL editor with
 * their name on it — but not silently through a console button.
 *
 * `user_id` is checked as well as `claim_status` because they can disagree:
 * a row with an owner and a stale status is claimed in every sense that
 * matters.
 */
export function canEditBusinessProfile(
  role: string | null | undefined,
  business: EditableBusiness,
): EditVerdict {
  if (!isStaff(role)) {
    return { allowed: false, reason: 'Only staff can edit a listing from the console.' };
  }
  if (business.user_id) {
    return { allowed: false, reason: 'An owner holds this profile. Only they can change it now.' };
  }
  if (business.claim_status === 'claimed') {
    return { allowed: false, reason: 'This profile has been claimed. Only its owner can change it now.' };
  }
  if (business.claim_status === 'claim_pending') {
    /*
     * Somebody is waiting on a decision. Editing underneath a pending claim
     * changes what the claimant is claiming, which is unfair to them and
     * confusing to whoever reviews it.
     */
    return { allowed: false, reason: 'A claim is pending on this profile. Decide the claim first.' };
  }
  return { allowed: true, reason: 'Unclaimed — NowOpen maintains this listing until its owner takes it over.' };
}
