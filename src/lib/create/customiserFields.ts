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
 * NOT here, deliberately read by the quality scorer (C7): `meta`. The
 * customiser sets it to a fixed address and offers no field for it, so a
 * template that shows a meta line is showing words the visitor cannot change.
 * List roles (services, stats, contact, price) are not single-line fields and
 * are out of scope for C7.
 */
export const CUSTOMISER_TEXT_FIELDS = {
  brand: 'Business name',
  eyebrow: 'Small line above',
  headline: 'Headline',
  subline: 'Supporting line',
  cta: 'Button or badge text',
} as const satisfies Partial<Record<SlotRole, string>>;

export type CustomiserTextRole = keyof typeof CUSTOMISER_TEXT_FIELDS;

export const isCustomiserTextRole = (role: SlotRole): role is CustomiserTextRole =>
  Object.prototype.hasOwnProperty.call(CUSTOMISER_TEXT_FIELDS, role);
