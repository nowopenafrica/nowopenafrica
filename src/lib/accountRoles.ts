/**
 * What someone says they are when they register.
 *
 * This is a description, not a permission. Nothing in the app grants access
 * from this value — business ownership is `businesses.user_id = auth.uid()`,
 * and admin is granted by an admin, never claimed at signup. Keeping that true
 * is what lets one person be a customer and an owner at the same time.
 *
 * The database keeps its own allowlist in handle_new_user(); this list must
 * stay a subset of it, which is what the test asserts.
 */
export type SignupRole = 'personal' | 'business' | 'media_service';

export interface AccountKind {
  value: SignupRole;
  label: string;
  blurb: string;
}

/**
 * Ordered as offered. Personal is first and is the default, because most
 * people arriving at a directory are looking for a business, not listing one —
 * and because Keep, reviews and saved places all require an account that a
 * shopper was previously unable to create.
 */
export const ACCOUNT_KINDS: AccountKind[] = [
  {
    value: 'personal',
    label: 'Personal',
    blurb: 'Discover businesses, keep the ones you like, and hear when they have something new.',
  },
  {
    value: 'business',
    label: 'Business',
    blurb: 'List a business, reach customers and manage it from your dashboard.',
  },
  {
    value: 'media_service',
    label: 'Creative service',
    blurb: 'Publish creative or media services and take bookings.',
  },
];

export const DEFAULT_SIGNUP_ROLE: SignupRole = 'personal';

/** A personal account can add a business later; nothing needs to change first. */
export function canListBusinessLater(_role: SignupRole): boolean {
  return true;
}
