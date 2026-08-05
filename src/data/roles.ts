// Business team roles. The DB is the hard boundary (an active member can manage
// the business's content via RLS); these definitions drive labels, the invite
// UI, and — where used — client-side hints about what each role is for.

export type BusinessRole =
  | 'owner'
  | 'manager'
  | 'marketing'
  | 'support'
  | 'finance'
  | 'content_editor'
  | 'booking_manager'
  | 'staff'
  | 'viewer';

export interface RoleDef {
  key: BusinessRole;
  label: string;
  description: string;
}

// 'owner' is implicit (the business creator) and not assignable here.
export const ASSIGNABLE_ROLES: RoleDef[] = [
  { key: 'manager', label: 'Manager', description: 'Full access to run the business day to day' },
  { key: 'marketing', label: 'Marketing', description: 'Adverts, promotions and campaigns' },
  { key: 'content_editor', label: 'Content Editor', description: 'Edit services, products, gallery and profile content' },
  { key: 'booking_manager', label: 'Booking Manager', description: 'Manage bookings, orders and reservations' },
  { key: 'support', label: 'Customer Support', description: 'Respond to enquiries and bookings' },
  { key: 'finance', label: 'Finance', description: 'View payments, subscriptions and reports' },
  { key: 'staff', label: 'Staff', description: 'General team member access' },
  { key: 'viewer', label: 'Viewer', description: 'Read-only access' },
];

export const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner',
  ...Object.fromEntries(ASSIGNABLE_ROLES.map((r) => [r.key, r.label])),
};

export const roleLabel = (role?: string | null) => (role && ROLE_LABELS[role]) || 'Staff';
