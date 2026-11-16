import type { DesignTemplate } from '../../lib/designTemplates';
import { typefaceOf, type TypefaceKey } from '../../lib/design/typefaces';
import { pairingOf } from '../../lib/design/typefaces';
import { styleOf } from '../../lib/design/styles';
import { DESIGN_FORMATS } from '../studioPresets';
import { DIVISIONS, type BankSample, type BankTemplate, type DivisionKey } from '../../lib/templateBank/package';

/**
 * Authoring helper for the official Template Bank.
 *
 * A bank entry is written as the layout plus the decisions only a person can
 * make (concept, sample copy). Everything that can be derived from the
 * layout — id, typography list, dimensions, aspect ratio — is derived, so the
 * metadata cannot drift from the definition it describes.
 *
 * There is deliberately no score here. The bank's quality gate is a reviewer's
 * score recorded in admin; an author scoring their own layouts is not that.
 */

export const BANK_LICENCE =
  'Original layout by NowOpen Africa. Typefaces are SIL OFL 1.1, self-hosted. Contains no third-party imagery.';

export interface Draft {
  n: number;
  division: DivisionKey;
  category: string;
  subcategory: string;
  designStyle: string;
  concept: string;
  description: string;
  formats: string[];
  medium: BankTemplate['medium'];
  difficulty: BankTemplate['difficulty'];
  imagery: string;
  style: string;
  accent: string;
  sample: BankSample;
  definition: DesignTemplate;
}

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

export function entry(d: Draft): BankTemplate {
  const division = DIVISIONS.find((x) => x.key === d.division);
  if (!division) throw new Error(`Unknown division ${d.division}`);
  const format = DESIGN_FORMATS.find((f) => f.key === d.formats[0]);
  if (!format) throw new Error(`${d.definition.key}: unknown format ${d.formats[0]}`);

  const pairing = pairingOf(styleOf(d.style).pairing);
  const faces: TypefaceKey[] = [pairing.display, pairing.text, pairing.accent];
  const typography = [...new Set(faces.map((k) => typefaceOf(k).family))];

  const g = gcd(format.w, format.h);

  // Shared placeholder identity is spread into every draft; keep only the copy
  // this layout has a slot for, so the package never ships words nothing draws.
  const roles = new Set<string>(d.definition.slots.map((slot) => slot.role));
  const sample = Object.fromEntries(
    Object.entries(d.sample).filter(([field]) => roles.has(field)),
  ) as BankSample;

  return {
    id: `NOTB-${division.code}-${String(d.n).padStart(3, '0')}`,
    key: d.definition.key,
    version: 1,
    name: d.definition.label,
    division: d.division,
    category: d.category,
    subcategory: d.subcategory,
    industries: d.definition.industries ?? [],
    designStyle: d.designStyle,
    concept: d.concept,
    description: d.description,
    formats: d.formats,
    dimensions: { width: format.w, height: format.h, unit: 'px' },
    aspectRatio: `${format.w / g}:${format.h / g}`,
    medium: d.medium,
    typography,
    palette: 'Built from the business’s own brand colour by the selected style; no fixed palette.',
    imageRequirements: d.imagery,
    tags: d.definition.tags ?? [],
    difficulty: d.difficulty,
    licence: BANK_LICENCE,
    recommendedStyle: d.style,
    previewAccent: d.accent,
    sample,
    definition: d.definition,
  };
}
