import type { SlotRole } from '../designTemplates';

/**
 * The single-line text roles the Create customiser lets a visitor change, with
 * the label each field carries (its aria-label and placeholder).
 *
 * TemplateCustomiser.tsx renders one field per entry and routes in-place edits
 * on the design to the same five roles. It is a constant rather than a field
 * per template because the customiser edits by ROLE: any template's headline is
 * edited by the one Headline field.
 *
 * `meta` (the small print: an address, terms, a web address) has its own
 * "Small print" field since Ruling Z (Task 13 fix round 1). Before that the
 * customiser fixed it to one web address, so every template with a meta line
 * failed C7. List roles (services, stats, contact, price) are not single-line
 * fields and are out of scope for C7.
 */
export const CUSTOMISER_TEXT_FIELDS = {
  brand: 'Business name',
  eyebrow: 'Small line above',
  headline: 'Headline',
  subline: 'Supporting line',
  cta: 'Button or badge text',
  meta: 'Small print',
} as const satisfies Partial<Record<SlotRole, string>>;

export type CustomiserTextRole = keyof typeof CUSTOMISER_TEXT_FIELDS;

export const isCustomiserTextRole = (role: SlotRole): role is CustomiserTextRole =>
  Object.prototype.hasOwnProperty.call(CUSTOMISER_TEXT_FIELDS, role);
