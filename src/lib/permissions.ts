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

export type AppRole = 'business' | 'media_service' | 'editor' | 'admin';

/** Roles that may open the Admin Console at all. */
export const STAFF_ROLES: AppRole[] = ['admin', 'editor'];

/** Assignable from the Users panel. Order is the order shown in the dropdown. */
export const ASSIGNABLE_ROLES: AppRole[] = ['business', 'media_service', 'editor', 'admin'];

export const ROLE_LABELS: Record<AppRole, string> = {
  business: 'Business',
  media_service: 'Media service',
  editor: 'Editor',
  admin: 'Admin',
};

export const ROLE_DESCRIPTIONS: Record<AppRole, string> = {
  business: 'Owns business listings. No admin access.',
  media_service: 'Offers creative services. No admin access.',
  editor: 'Homepage and listing content. Cannot see users, payments or verification, and cannot delete.',
  admin: 'Full access, including roles, billing and deletion.',
};

export type AdminTabId =
  | 'overview' | 'users' | 'businesses' | 'verification' | 'subscriptions'
  | 'requests' | 'adverts' | 'media' | 'bookings' | 'payments' | 'waitlist'
  | 'registrations' | 'applications' | 'enquiries' | 'audit' | 'hero-videos'
  | 'review-queue' | 'imports' | 'switches';

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
  'businesses',
  'adverts',
  'media',
  'enquiries',
  'hero-videos',
];

export const isStaff = (role: string | null | undefined): boolean =>
  STAFF_ROLES.includes(role as AppRole);

export const isAdmin = (role: string | null | undefined): boolean => role === 'admin';

export const isEditor = (role: string | null | undefined): boolean => role === 'editor';

export function canAccessTab(role: string | null | undefined, tab: AdminTabId): boolean {
  if (isAdmin(role)) return true;
  if (isEditor(role)) return EDITOR_TABS.includes(tab);
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

/** Granting a role is granting the platform. Admin only, forever. */
export const canManageRoles = (role: string | null | undefined): boolean => isAdmin(role);

/** Plans are revenue. Admin only. */
export const canManagePlans = (role: string | null | undefined): boolean => isAdmin(role);

/** Approving a verification badge is a trust claim to the public. Admin only. */
export const canVerify = (role: string | null | undefined): boolean => isAdmin(role);

/** The homepage banner and its videos — the editor's actual remit. */
export const canManageHero = (role: string | null | undefined): boolean => isStaff(role);
