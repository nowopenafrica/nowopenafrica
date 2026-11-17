import {
  SAMPLE_LIST_ROLES, SAMPLE_TEXT_ROLES, type DesignTemplate, type SampleCopy,
} from '../../lib/designTemplates';
import { CATEGORIES, SUBCATEGORIES } from '../../lib/create/catalogueTaxonomy';
import { DIRECTIONS, type DirectionKey } from '../../lib/design/directions';
import { pagesOf } from '../../lib/design/quality/checks/copy';
import { SAMPLE_MAX_CHARS, SAMPLE_MAX_ROWS } from '../../lib/create/templateUpload';

export type TemplateDetails = Pick<DesignTemplate, 'subcategory' | 'direction' | 'sample'>;

const ROLE_LABEL: Record<string, string> = {
  brand: 'Name', eyebrow: 'Eyebrow', headline: 'Headline', subline: 'Line', meta: 'Small print', cta: 'Call to action',
  services: 'List rows', contact: 'Contact rows',
};

/** The demo-copy roles this layout actually draws, on any side. */
function sampleRolesOf(template: DesignTemplate): { text: string[]; lists: string[] } {
  const used = new Set(pagesOf(template).flatMap((p) => p.slots.map((s) => s.role as string)));
  return {
    text: SAMPLE_TEXT_ROLES.filter((r) => used.has(r)),
    lists: SAMPLE_LIST_ROLES.filter((r) => used.has(r)),
  };
}

/**
 * The three things the catalogue needs from an upload and cannot work out:
 * which product it is, which art direction, and the words its gallery card
 * shows. Shared by the import card and the review panel, so both ask the same
 * questions in the same words.
 *
 * Demo copy follows the sampleCopy.ts rule: each line names what goes there
 * ("Your opening date", "Your menu"), never a business, a price someone
 * charges or a claim. The house checks refuse "Your headline here" (C9).
 */
export default function TemplateDetailsFields({
  template, onChange, idPrefix, compact = false,
}: {
  template: DesignTemplate;
  onChange: (next: TemplateDetails) => void;
  /** Unique per card, so labels point at their own inputs. */
  idPrefix: string;
  compact?: boolean;
}) {
  const field = 'w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-[11px] dark:border-gray-600 dark:bg-gray-800 dark:text-white';
  const label = 'block text-[10px] font-semibold text-gray-600 dark:text-gray-300';
  const details: TemplateDetails = {
    subcategory: template.subcategory, direction: template.direction, sample: template.sample,
  };
  const roles = sampleRolesOf(template);

  const setSample = (role: string, value: string | string[]) => {
    const next: SampleCopy = { ...(template.sample ?? {}) };
    const empty = Array.isArray(value) ? value.length === 0 : !value;
    if (empty) delete (next as Record<string, unknown>)[role];
    else (next as Record<string, unknown>)[role] = value;
    onChange({ ...details, sample: Object.keys(next).length ? next : undefined });
  };

  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-2 gap-1.5">
        <label className={label}>
          Product
          <select
            value={template.subcategory ?? ''}
            onChange={(e) => onChange({ ...details, subcategory: e.target.value || undefined })}
            className={`${field} mt-0.5`}
          >
            <option value="">Choose…</option>
            {CATEGORIES.map((c) => {
              const subs = SUBCATEGORIES.filter((s) => s.category === c.key);
              return subs.length ? (
                <optgroup key={c.key} label={c.name}>
                  {subs.map((s) => <option key={s.key} value={s.key}>{s.name}</option>)}
                </optgroup>
              ) : null;
            })}
          </select>
        </label>
        <label className={label}>
          Direction
          <select
            value={template.direction ?? ''}
            onChange={(e) => onChange({ ...details, direction: (e.target.value || undefined) as DirectionKey | undefined })}
            className={`${field} mt-0.5`}
          >
            <option value="">Choose…</option>
            {DIRECTIONS.map((d) => <option key={d.key} value={d.key} title={d.intent}>{d.name}</option>)}
          </select>
        </label>
      </div>

      <fieldset className="space-y-1">
        <legend className={label}>
          Demo copy {compact ? '' : <span className="font-normal text-gray-400">· name what goes there, never a business</span>}
        </legend>
        {roles.text.map((role) => (
          <label key={role} htmlFor={`${idPrefix}-${role}`} className="flex items-center gap-1.5">
            <span className="w-20 shrink-0 text-[10px] text-gray-500">{ROLE_LABEL[role] ?? role}</span>
            <input
              id={`${idPrefix}-${role}`}
              aria-label={`Demo ${ROLE_LABEL[role] ?? role}`}
              value={(template.sample as Record<string, string | undefined> | undefined)?.[role] ?? ''}
              maxLength={SAMPLE_MAX_CHARS}
              onChange={(e) => setSample(role, e.target.value)}
              className={field}
            />
          </label>
        ))}
        {roles.lists.map((role) => (
          <label key={role} htmlFor={`${idPrefix}-${role}`} className="flex items-start gap-1.5">
            <span className="w-20 shrink-0 pt-1 text-[10px] text-gray-500">{ROLE_LABEL[role] ?? role}</span>
            <textarea
              id={`${idPrefix}-${role}`}
              aria-label={`Demo ${ROLE_LABEL[role] ?? role}, one per line`}
              rows={3}
              value={((template.sample as Record<string, string[] | undefined> | undefined)?.[role] ?? []).join('\n')}
              /* Lines are kept as typed, blanks included, so Enter works; cleanSample tidies on save. */
              onChange={(e) => setSample(role, e.target.value ? e.target.value.split('\n').map((s) => s.slice(0, SAMPLE_MAX_CHARS)).slice(0, SAMPLE_MAX_ROWS) : [])}
              className={field}
              placeholder="One per line"
            />
          </label>
        ))}
      </fieldset>
    </div>
  );
}
