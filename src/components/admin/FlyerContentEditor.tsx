import { Plus, Trash2, ListChecks, BarChart3, Phone, Info } from 'lucide-react';

import type { MotionConfig } from '../../lib/motionGraphics';
import type { SlotRole } from '../../lib/designTemplates';

// The editor for the repeating parts of a business flyer.
//
// Only the sections the chosen template actually uses are rendered. A template
// with no proof-point strip should not offer a proof-point editor — showing
// every field for every template is what turns a design tool into a form, and
// it was the reason the old studio could only edit four strings.
//
// Rows are added and removed inline rather than through a modal: the preview is
// beside this panel, so an edit should cost one click and repaint immediately.

const ROW_INPUT =
  'w-full px-2.5 min-h-[44px] rounded-lg border border-gray-200 dark:border-gray-700 ' +
  'bg-gray-50 dark:bg-gray-900 text-xs text-gray-900 dark:text-white ' +
  'focus:outline-none focus:ring-2 focus:ring-purple-500';

const ICON_BTN =
  'inline-flex items-center justify-center w-[44px] min-h-[44px] rounded-lg border ' +
  'border-gray-200 dark:border-gray-700 text-gray-500 hover:text-red-600 ' +
  'hover:border-red-300 dark:hover:border-red-800 transition';

const ADD_BTN =
  'inline-flex items-center gap-1.5 px-3 min-h-[44px] rounded-lg border border-dashed ' +
  'border-gray-300 dark:border-gray-600 text-[11px] font-semibold text-gray-600 ' +
  'dark:text-gray-300 hover:border-purple-400 hover:text-purple-600 transition';

/** Above this a list stops being scannable and starts overflowing the layout. */
const MAX_ROWS = 6;

interface Props {
  brief: MotionConfig;
  onChange: (partial: Partial<MotionConfig>) => void;
  /** Which list sections this template needs. */
  roles: SlotRole[];
}

function SectionHead({
  icon,
  title,
  hint,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
}) {
  return (
    <div className="space-y-0.5">
      <h5 className="text-[11px] font-bold text-gray-900 dark:text-white inline-flex items-center gap-1.5">
        {icon} {title}
      </h5>
      <p className="text-[10px] text-gray-500 dark:text-gray-400 leading-snug">{hint}</p>
    </div>
  );
}

export default function FlyerContentEditor({ brief, onChange, roles }: Props) {
  if (roles.length === 0) return null;

  const services = brief.services ?? [];
  const stats = brief.stats ?? [];
  const contact = brief.contact ?? [];

  const setStrings = (
    field: 'services' | 'contact',
    list: string[],
    index: number,
    value: string,
  ) => onChange({ [field]: list.map((v, i) => (i === index ? value : v)) } as Partial<MotionConfig>);

  return (
    <div className="space-y-4">
      {roles.includes('services') && (
        <section className="pt-2 border-t border-gray-100 dark:border-gray-700 space-y-2">
          <SectionHead
            icon={<ListChecks size={12} className="text-purple-500" />}
            title="Services"
            hint="One line each — what you sell, in the customer's words. The template draws the bullets."
          />
          {services.map((value, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <input
                value={value}
                onChange={(e) => setStrings('services', services, i, e.target.value)}
                aria-label={`Service ${i + 1}`}
                placeholder={`Service ${i + 1}`}
                className={ROW_INPUT}
              />
              <button
                type="button"
                onClick={() => onChange({ services: services.filter((_, j) => j !== i) })}
                aria-label={`Remove service ${i + 1}`}
                className={ICON_BTN}
              >
                <Trash2 size={13} aria-hidden="true" />
              </button>
            </div>
          ))}
          {services.length < MAX_ROWS && (
            <button
              type="button"
              onClick={() => onChange({ services: [...services, ''] })}
              className={ADD_BTN}
            >
              <Plus size={13} aria-hidden="true" /> Add service
            </button>
          )}
        </section>
      )}

      {roles.includes('stats') && (
        <section className="pt-2 border-t border-gray-100 dark:border-gray-700 space-y-2">
          <SectionHead
            icon={<BarChart3 size={12} className="text-purple-500" />}
            title="Proof points"
            hint="The number leads and the label sits under it."
          />
          {/* Said plainly, because these ship on a flyer a customer will read as
              fact. The seeded values are placeholders, not anything measured. */}
          <p className="flex items-start gap-1.5 text-[10px] leading-snug text-amber-700 dark:text-amber-400">
            <Info size={12} className="mt-px flex-shrink-0" aria-hidden="true" />
            Sample figures — replace them with numbers you can stand behind.
          </p>
          {stats.map((stat, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <input
                value={stat.value}
                onChange={(e) =>
                  onChange({
                    stats: stats.map((s, j) => (j === i ? { ...s, value: e.target.value } : s)),
                  })
                }
                aria-label={`Proof point ${i + 1} number`}
                placeholder="250+"
                className={`${ROW_INPUT} w-[38%] font-semibold`}
              />
              <input
                value={stat.label}
                onChange={(e) =>
                  onChange({
                    stats: stats.map((s, j) => (j === i ? { ...s, label: e.target.value } : s)),
                  })
                }
                aria-label={`Proof point ${i + 1} label`}
                placeholder="Projects"
                className={ROW_INPUT}
              />
              <button
                type="button"
                onClick={() => onChange({ stats: stats.filter((_, j) => j !== i) })}
                aria-label={`Remove proof point ${i + 1}`}
                className={ICON_BTN}
              >
                <Trash2 size={13} aria-hidden="true" />
              </button>
            </div>
          ))}
          {stats.length < 4 && (
            <button
              type="button"
              onClick={() => onChange({ stats: [...stats, { value: '', label: '' }] })}
              className={ADD_BTN}
            >
              <Plus size={13} aria-hidden="true" /> Add proof point
            </button>
          )}
        </section>
      )}

      {roles.includes('contact') && (
        <section className="pt-2 border-t border-gray-100 dark:border-gray-700 space-y-2">
          <SectionHead
            icon={<Phone size={12} className="text-purple-500" />}
            title="Contact strip"
            hint="Phone, email, website — however many you want along the footer."
          />
          {contact.map((value, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <input
                value={value}
                onChange={(e) => setStrings('contact', contact, i, e.target.value)}
                aria-label={`Contact detail ${i + 1}`}
                placeholder="+234 708 154 7726"
                className={ROW_INPUT}
              />
              <button
                type="button"
                onClick={() => onChange({ contact: contact.filter((_, j) => j !== i) })}
                aria-label={`Remove contact detail ${i + 1}`}
                className={ICON_BTN}
              >
                <Trash2 size={13} aria-hidden="true" />
              </button>
            </div>
          ))}
          {contact.length < 4 && (
            <button
              type="button"
              onClick={() => onChange({ contact: [...contact, ''] })}
              className={ADD_BTN}
            >
              <Plus size={13} aria-hidden="true" /> Add contact detail
            </button>
          )}
        </section>
      )}
    </div>
  );
}
