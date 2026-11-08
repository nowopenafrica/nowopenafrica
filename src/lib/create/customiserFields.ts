import type { DesignTemplate, SlotRole } from '../designTemplates';

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

/*
 * ── THE PLATFORM ON A HANDLE ROW (Task 18b) ──────────────────────────────
 *
 * A handle row ("@yourhandle") leads with a platform's mark (design/icons.ts).
 * Which platform is the visitor's choice: one select, labelled this, shown
 * only for a design with such a row. The handle's words stay editable through
 * their own role's field above, so C7 is unchanged; the select picks the mark.
 */
export const CUSTOMISER_PLATFORM_FIELD = 'Social platform';

/** The default mark of the first handle row on any page, or null when the design has none. */
export function handlePlatformOf(tpl: Pick<DesignTemplate, 'slots' | 'extraPages'>): string | null {
  for (const slots of [tpl.slots, ...(tpl.extraPages ?? []).map((p) => p.slots)]) {
    for (const slot of slots) {
      const mark = slot.icons?.find((i) => i?.set === 'platform');
      if (mark) return mark.name;
    }
  }
  return null;
}
