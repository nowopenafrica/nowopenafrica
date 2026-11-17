import type { DesignTemplate } from '../designTemplates';
import { directionOf } from '../design/directions';
import { needsReverify, type Format } from '../design/formats';
import { subcategoryFor } from './catalogueTaxonomy';
import { canvasOf, isPreviewOnly } from './templateDetail';

/**
 * What a catalogue card states about one design (spec §10, Cards), and the
 * badges it may carry. Pure and browser-safe: the editability rule is the
 * detail page's (`isPreviewOnly`, built on customiserFields), never
 * quality/critical.ts.
 */

export interface CardFacts {
  name: string;
  subcategory: string | null;
  /** Only when the template carries a direction. */
  direction: string | null;
  /** The format's label, or null when the design has no format of its own. */
  format: string | null;
  /** One practical line. */
  line: string;
}

export function cardFacts(tpl: DesignTemplate): CardFacts {
  const canvas = canvasOf(tpl);
  return {
    name: tpl.label,
    subcategory: subcategoryFor(tpl)?.name ?? null,
    direction: directionOf(tpl.direction)?.name ?? null,
    format: canvas.format ? canvas.format.label : null,
    line: tpl.desc.replace(/\s+/g, ' ').trim(),
  };
}

/**
 * Badges, each only when verified:
 *  - editable: C7 passes (every single-line text role has a customiser field);
 *  - platform-size: the format's `verifiedAt` is current (`needsReverify` false).
 *    No format is verified today, so this never shows yet.
 *
 * There is deliberately no print-ready badge: that waits for Phase 6's bleed
 * PDFs, and a type without the member cannot be shown by mistake.
 */
export type CardBadge = 'editable' | 'platform-size';

export const BADGE_LABELS: Record<CardBadge, string> = {
  editable: 'Editable',
  'platform-size': 'Platform size',
};

export function cardBadges(
  tpl: DesignTemplate,
  today: string,
  /* Seam for tests; production reads the template's own format. */
  format: Format | null = canvasOf(tpl).format,
): CardBadge[] {
  const out: CardBadge[] = [];
  if (!isPreviewOnly(tpl)) out.push('editable');
  if (format && !needsReverify(format, today)) out.push('platform-size');
  return out;
}
