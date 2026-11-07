import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';

import { MediaField, MediaListField } from './MediaField';
import type {
  LabelledItem,
  ProjectSection,
  TimelineItem,
} from '../../../lib/projectStory';
import { SECTION_TYPES } from '../../../lib/projectStory';

const fieldClass =
  'w-full rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-xs text-gray-900 placeholder:text-gray-400 dark:border-gray-600 dark:bg-gray-800 dark:text-white';
const labelClass = 'mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400';

function HeadingField({
  value, onChange,
}: { value: string | null; onChange: (value: string | null) => void }) {
  return (
    <div>
      <label className={labelClass}>Heading (optional)</label>
      <input
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        placeholder="e.g. The approach"
        className={fieldClass}
      />
    </div>
  );
}

/** Up/down/remove controls shared by every repeatable list. */
function RowControls({
  index, count, onMove, onRemove,
}: {
  index: number;
  count: number;
  onMove: (delta: number) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex shrink-0 items-start gap-0.5 pt-1">
      <button
        type="button"
        onClick={() => onMove(-1)}
        disabled={index === 0}
        aria-label="Move up"
        className="grid h-7 w-7 place-items-center rounded-md text-gray-500 hover:bg-gray-100 disabled:opacity-30 dark:hover:bg-gray-800"
      >
        <ArrowUp size={13} />
      </button>
      <button
        type="button"
        onClick={() => onMove(1)}
        disabled={index === count - 1}
        aria-label="Move down"
        className="grid h-7 w-7 place-items-center rounded-md text-gray-500 hover:bg-gray-100 disabled:opacity-30 dark:hover:bg-gray-800"
      >
        <ArrowDown size={13} />
      </button>
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove"
        className="grid h-7 w-7 place-items-center rounded-md text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
}

function moveItem<T>(items: T[], index: number, delta: number): T[] {
  const target = index + delta;
  if (target < 0 || target >= items.length) return items;
  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

function TimelineRows({
  items, onChange,
}: { items: TimelineItem[]; onChange: (items: TimelineItem[]) => void }) {
  return (
    <div className="space-y-2">
      {items.map((item, index) => (
        <div key={index} className="flex items-start gap-1.5 rounded-lg border border-gray-200 p-2 dark:border-gray-700">
          <div className="min-w-0 flex-1 space-y-1.5">
            <input
              value={item.label}
              onChange={(e) => onChange(items.map((row, i) => (i === index ? { ...row, label: e.target.value } : row)))}
              placeholder="Step name"
              aria-label={`Step ${index + 1} name`}
              className={fieldClass}
            />
            <textarea
              value={item.body}
              onChange={(e) => onChange(items.map((row, i) => (i === index ? { ...row, body: e.target.value } : row)))}
              placeholder="What happened at this step?"
              aria-label={`Step ${index + 1} detail`}
              rows={2}
              className={fieldClass}
            />
          </div>
          <RowControls
            index={index}
            count={items.length}
            onMove={(delta) => onChange(moveItem(items, index, delta))}
            onRemove={() => onChange(items.filter((_, i) => i !== index))}
          />
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...items, { label: '', body: '' }])}
        className="inline-flex min-h-[32px] items-center gap-1 rounded-lg border border-gray-300 px-2.5 text-[11px] font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
      >
        <Plus size={12} /> Add step
      </button>
    </div>
  );
}

export function LabelledRows({
  items, onChange, valueLabel = 'Value',
}: {
  items: LabelledItem[];
  onChange: (items: LabelledItem[]) => void;
  valueLabel?: string;
}) {
  return (
    <div className="space-y-2">
      {items.map((item, index) => (
        <div key={index} className="flex items-start gap-1.5 rounded-lg border border-gray-200 p-2 dark:border-gray-700">
          <div className="grid min-w-0 flex-1 gap-1.5 sm:grid-cols-2">
            <input
              value={item.label}
              onChange={(e) => onChange(items.map((row, i) => (i === index ? { ...row, label: e.target.value } : row)))}
              placeholder="Label"
              aria-label={`Item ${index + 1} label`}
              className={fieldClass}
            />
            <input
              value={item.value}
              onChange={(e) => onChange(items.map((row, i) => (i === index ? { ...row, value: e.target.value } : row)))}
              placeholder={valueLabel}
              aria-label={`Item ${index + 1} value`}
              className={fieldClass}
            />
          </div>
          <RowControls
            index={index}
            count={items.length}
            onMove={(delta) => onChange(moveItem(items, index, delta))}
            onRemove={() => onChange(items.filter((_, i) => i !== index))}
          />
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...items, { label: '', value: '' }])}
        className="inline-flex min-h-[32px] items-center gap-1 rounded-lg border border-gray-300 px-2.5 text-[11px] font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
      >
        <Plus size={12} /> Add item
      </button>
    </div>
  );
}

/**
 * The fields for one story block.
 *
 * The type is fixed once the block exists. Changing a gallery into a quote
 * would silently discard everything in it, so the honest way to switch is to
 * remove the block and add the other one.
 */
export default function SectionEditor({
  section,
  onChange,
}: {
  section: ProjectSection;
  onChange: (section: ProjectSection) => void;
}) {
  const hint = SECTION_TYPES.find((type) => type.type === section.type)?.hint;

  return (
    <div className="space-y-2.5">
      {hint && <p className="text-[11px] text-gray-500 dark:text-gray-400">{hint}</p>}

      {section.type === 'text' && (
        <>
          <HeadingField value={section.heading} onChange={(heading) => onChange({ ...section, heading })} />
          <textarea
            value={section.body}
            onChange={(e) => onChange({ ...section, body: e.target.value })}
            placeholder="Tell the story behind this project. What were you trying to achieve, how did you approach it, and what was the result?"
            aria-label="Story text"
            rows={5}
            className={fieldClass}
          />
        </>
      )}

      {section.type === 'image' && (
        <MediaField
          media={section.media}
          label="Image"
          onChange={(media) => onChange({ ...section, media })}
        />
      )}

      {section.type === 'gallery' && (
        <>
          <HeadingField value={section.heading} onChange={(heading) => onChange({ ...section, heading })} />
          <MediaListField
            images={section.images}
            onChange={(images) => onChange({ ...section, images })}
            addLabel="Add images to the gallery"
            emptyLabel="Add a few images — they are shown as a set."
          />
        </>
      )}

      {section.type === 'split' && (
        <>
          <HeadingField value={section.heading} onChange={(heading) => onChange({ ...section, heading })} />
          <textarea
            value={section.body}
            onChange={(e) => onChange({ ...section, body: e.target.value })}
            placeholder="What does this image show, or how did this part work?"
            aria-label="Text beside the image"
            rows={4}
            className={fieldClass}
          />
          <div>
            <label className={labelClass} htmlFor="media-side">Image position</label>
            <select
              id="media-side"
              value={section.mediaSide}
              onChange={(e) => onChange({ ...section, mediaSide: e.target.value === 'left' ? 'left' : 'right' })}
              className={fieldClass}
            >
              <option value="right">Image on the right</option>
              <option value="left">Image on the left</option>
            </select>
          </div>
          <MediaField media={section.media} label="Image" onChange={(media) => onChange({ ...section, media })} />
        </>
      )}

      {section.type === 'video' && (
        <>
          <MediaField
            media={{ url: section.url, caption: section.caption, alt: null, credit: null }}
            kind="video"
            label="Video"
            onChange={(media) => onChange({ ...section, url: media.url, caption: media.caption })}
          />
          <div>
            <label className={labelClass}>Poster image URL (optional)</label>
            <input
              value={section.poster ?? ''}
              onChange={(e) => onChange({ ...section, poster: e.target.value || null })}
              placeholder="Shown before the video plays"
              className={fieldClass}
            />
          </div>
        </>
      )}

      {section.type === 'quote' && (
        <>
          <textarea
            value={section.quote}
            onChange={(e) => onChange({ ...section, quote: e.target.value })}
            placeholder="A line worth setting large — a client's words, or the idea behind the work."
            aria-label="Quote"
            rows={3}
            className={fieldClass}
          />
          <input
            value={section.attribution ?? ''}
            onChange={(e) => onChange({ ...section, attribution: e.target.value || null })}
            placeholder="Who said it (optional)"
            aria-label="Quote attribution"
            className={fieldClass}
          />
        </>
      )}

      {section.type === 'timeline' && (
        <>
          <HeadingField value={section.heading} onChange={(heading) => onChange({ ...section, heading })} />
          <TimelineRows items={section.items} onChange={(items) => onChange({ ...section, items })} />
        </>
      )}

      {section.type === 'beforeAfter' && (
        <>
          <HeadingField value={section.heading} onChange={(heading) => onChange({ ...section, heading })} />
          <div>
            <p className={labelClass}>Before</p>
            <MediaField media={section.before} label="Before image" onChange={(before) => onChange({ ...section, before })} />
          </div>
          <div>
            <p className={labelClass}>After</p>
            <MediaField media={section.after} label="After image" onChange={(after) => onChange({ ...section, after })} />
          </div>
        </>
      )}

      {section.type === 'results' && (
        <>
          <HeadingField value={section.heading} onChange={(heading) => onChange({ ...section, heading })} />
          <LabelledRows
            items={section.items}
            valueLabel="Outcome"
            onChange={(items) => onChange({ ...section, items })}
          />
          <p className="text-[11px] text-gray-400">
            Shown as reported by you. NowOpen does not verify these numbers.
          </p>
        </>
      )}

      {section.type === 'specs' && (
        <>
          <HeadingField value={section.heading} onChange={(heading) => onChange({ ...section, heading })} />
          <LabelledRows
            items={section.items}
            valueLabel="Detail"
            onChange={(items) => onChange({ ...section, items })}
          />
        </>
      )}

      {section.type === 'link' && (
        <>
          <HeadingField value={section.heading} onChange={(heading) => onChange({ ...section, heading })} />
          <textarea
            value={section.body}
            onChange={(e) => onChange({ ...section, body: e.target.value })}
            placeholder="Why is this link worth following?"
            aria-label="Link description"
            rows={2}
            className={fieldClass}
          />
          <input
            value={section.url}
            onChange={(e) => onChange({ ...section, url: e.target.value })}
            placeholder="https://…"
            aria-label="Link URL"
            className={fieldClass}
          />
          <input
            value={section.label}
            onChange={(e) => onChange({ ...section, label: e.target.value })}
            placeholder="Link text"
            aria-label="Link text"
            className={fieldClass}
          />
        </>
      )}
    </div>
  );
}
