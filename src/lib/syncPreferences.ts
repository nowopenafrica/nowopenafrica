// SyncPreferences — pure decisions for the owner sync-preferences surface
// (business_sync_preferences). It is the owner-side copy of what the database
// decides: which field families auto-apply, under what confidence bar, and
// whether the business is on for enrichment at all. No React, no supabase —
// unit-testable, and the family↔column mapping mirrors the applier in
// 20260912020000_enrichment_auto_apply.sql so the UI and the SQL cannot drift.

export interface SyncPreferences {
  id: string;
  business_id: string;
  sync_enabled: boolean;
  auto_apply_hours: boolean;
  auto_apply_source_images: boolean;
  auto_apply_discovery_fields: boolean;
  notify_on_change: boolean;
  approval_threshold: number;
  confirm_24_hours: boolean;
  hours_override_reason: string | null;
}

export type AutoApplyFamily = 'hours' | 'images' | 'discovery';

export interface FamilyMeta {
  key: AutoApplyFamily;
  flag: keyof Pick<SyncPreferences, 'auto_apply_hours' | 'auto_apply_source_images' | 'auto_apply_discovery_fields'>;
  label: string;
  blurb: string;
}

/** The field families an owner can switch on, in the order shown. */
export const SYNC_FAMILIES: FamilyMeta[] = [
  {
    key: 'hours',
    flag: 'auto_apply_hours',
    label: 'Opening hours',
    blurb: 'Adopt hours a verified source (like OpenStreetMap) says, without asking.',
  },
  {
    key: 'images',
    flag: 'auto_apply_source_images',
    label: 'Logo & cover images',
    blurb: 'Adopt clearly-licensed source logos and covers without asking.',
  },
  {
    key: 'discovery',
    flag: 'auto_apply_discovery_fields',
    label: 'Discovery fields',
    blurb: 'Adopt address, phone, website and social links a source confirms.',
  },
];

/** The default confidence bar below which nothing auto-applies. */
export const DEFAULT_APPROVAL_THRESHOLD = 80;

/** The family a proposal field belongs to — the SQL applier's mapping,
 *  mirrored exactly. Unknown fields are discovery (safe direction). */
export function fieldFamily(fieldName: string): AutoApplyFamily {
  if (fieldName === 'opening_hours') return 'hours';
  if (fieldName === 'logo_url' || fieldName === 'image_url') return 'images';
  return 'discovery';
}

/** The flag column governing a family — kept as a keyof so the UI writes the
 *  same column the SQL applier reads. */
export function flagForFamily(family: AutoApplyFamily): FamilyMeta['flag'] {
  const meta = SYNC_FAMILIES.find((f) => f.key === family);
  return meta ? meta.flag : 'auto_apply_discovery_fields';
}

export function flagForField(fieldName: string): FamilyMeta['flag'] {
  return flagForFamily(fieldFamily(fieldName));
}

/** Honest summary of what this preference set currently permits. */
export function postureMessage(prefs: Pick<SyncPreferences, 'sync_enabled' | 'auto_apply_hours' | 'auto_apply_source_images' | 'auto_apply_discovery_fields'>): string {
  if (!prefs.sync_enabled) return 'Enrichment is off for this business — the engine will not run it at all.';
  const on = SYNC_FAMILIES.filter((f) => prefs[f.flag]);
  if (on.length === 0) return 'Enrichment runs, but every change is proposed for you to review first.';
  const names = on.map((f) => f.label.toLowerCase()).join(', ');
  return `Enrichment runs. Auto-applied without asking: ${names}. Everything else stays proposals for you to review.`;
}