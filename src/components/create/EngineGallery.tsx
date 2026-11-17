import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

import DesignSurface from '../studio/DesignSurface';
import { useOptionalAuth } from '../../contexts/AuthContext';
import { SUBCATEGORIES } from '../../lib/create/catalogueTaxonomy';
import { galleryCovers, galleryFor } from '../../lib/create/compose/gallery';
import { saveConceptAsProject } from '../../lib/create/compose/openConcept';
import { PHOTO_BASE } from '../../lib/create/compose/photoSet';
import { INDUSTRIES } from '../../lib/create/intel';
import { formatOf } from '../../lib/design/formats';
import { paletteOf } from '../../lib/design/palettes';

const FIRST = 8;
const MORE = 16;
/* Browse by category shows a denser grid (6-7 a row on a wide screen): two rows first, then a third. */
const DENSE_FIRST = 14;
const DENSE_MORE = 21;

/**
 * Designs for one item, composed by the engine (lib/create/compose/gallery.ts).
 *
 * It sits above the older templates in a category. Every design here has
 * passed the measured checks (contrast, minimum type, safe margin, no cut
 * copy, type used for its job), is drawn at the item's real format, and says
 * only what any honest business could: the "Your ..." lines wait for the
 * customer's own details. Picking a trade swaps in that trade's own words.
 *
 * Editing saves the design as the customer's own project and opens the
 * Studio editor there, the same path the concepts under a brief use.
 */
function gridCols(wide: boolean, dense: boolean): string {
  if (dense) return wide ? 'grid-cols-2 lg:grid-cols-3 xl:grid-cols-4' : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7';
  return wide ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4';
}

export default function EngineGallery({ deliverables, dense = false }: { deliverables: string[]; dense?: boolean }) {
  const first = dense ? DENSE_FIRST : FIRST;
  const most = dense ? DENSE_MORE : MORE;
  const items = useMemo(() => deliverables.filter(galleryCovers), [deliverables]);
  const [item, setItem] = useState(items[0] ?? '');
  const [trade, setTrade] = useState('');
  const [count, setCount] = useState(first);
  const user = useOptionalAuth()?.user ?? null;
  const navigate = useNavigate();
  const [opening, setOpening] = useState<string | null>(null);

  const active = items.includes(item) ? item : items[0] ?? '';
  const sub = SUBCATEGORIES.find((s) => s.key === active);
  const designs = useMemo(() => (active ? galleryFor(active, { trade: trade || undefined, count: most, photos: PHOTO_BASE || undefined }) : []), [active, trade, most]);
  if (!active || !sub || designs.length === 0) return null;

  const format = formatOf(sub.formats[0]);
  const wide = format ? format.w / format.h > 1.6 : false;
  const shown = designs.slice(0, count);

  const open = async (id: string) => {
    const design = designs.find((d) => d.id === id);
    if (!user || !design || opening) return;
    setOpening(id);
    const result = await saveConceptAsProject(design.doc, user.id);
    if (result.ok) { navigate(result.path); return; }
    setOpening(null);
    toast.error(`Could not open that design: ${result.reason}`);
  };

  return (
    <section data-testid="engine-gallery" aria-labelledby="engine-gallery-heading" className="mb-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h3 id="engine-gallery-heading" className="font-coolvetica text-[1.25rem] leading-tight text-gray-900 dark:text-white">
            Designed for {sub.name.toLowerCase()}
          </h3>
          <p className="mt-1 max-w-[60ch] text-[13px] text-gray-600 dark:text-gray-400">
            Each one is drawn at the real {format?.label ?? 'size'} and checked for contrast, type size and print margins. The words are placeholders for yours.
          </p>
        </div>
        <label className="flex min-w-0 items-center gap-2 text-[13px] font-semibold text-gray-700 dark:text-gray-300">
          Designs for
          <select
            id="engine-gallery-trade"
            data-testid="engine-gallery-trade"
            value={trade}
            onChange={(e) => { setTrade(e.target.value); setCount(first); }}
            className="min-h-[44px] min-w-0 max-w-[15rem] rounded-xl border border-gray-300 bg-white px-3 text-[14px] font-normal text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
          >
            <option value="">Any business</option>
            {INDUSTRIES.map((i) => <option key={i.key} value={i.key}>{i.name}</option>)}
          </select>
        </label>
      </div>

      {items.length > 1 && (
        <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Item">
          {items.map((k) => {
            const name = SUBCATEGORIES.find((s) => s.key === k)?.name ?? k;
            const on = k === active;
            return (
              <button
                key={k}
                type="button"
                aria-pressed={on}
                onClick={() => { setItem(k); setCount(first); }}
                className={`min-h-[40px] rounded-full border px-4 text-[13px] font-semibold ${on ? 'border-gray-900 bg-gray-900 text-white dark:border-white dark:bg-white dark:text-gray-900' : 'border-gray-300 text-gray-700 hover:border-gray-500 dark:border-gray-600 dark:text-gray-300'}`}
              >
                {name}
              </button>
            );
          })}
        </div>
      )}

      <ul data-dense={dense || undefined} className={`mt-5 grid ${dense ? 'gap-4' : 'gap-5'} ${gridCols(wide, dense)}`}>
        {shown.map((d) => (
          <li key={d.id} data-testid="engine-design" className="flex min-w-0 flex-col">
            <div className="overflow-hidden rounded-xl border border-gray-200 shadow-sm dark:border-gray-700">
              <DesignSurface page={d.doc.pages[0]} accent={paletteOf(d.palette)?.colours.primary ?? '#15803d'} />
            </div>
            <p className="mt-2 text-[13px] font-semibold text-gray-900 dark:text-white">{d.movement}</p>
            <p className="text-[12px] text-gray-600 dark:text-gray-400">{d.type}</p>
            {d.photo && d.preview && (
              <p data-testid="engine-design-photo" className="mt-1 text-[11px] text-amber-700 dark:text-amber-400">
                Preview: {d.photo.credit}. Usable once the photo is cleared for customers.
              </p>
            )}
            <div className="mt-2">
              {d.preview ? null : user ? (
                <button
                  type="button"
                  onClick={() => { void open(d.id); }}
                  disabled={opening !== null}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-green-700 px-3.5 text-[13px] font-bold text-white hover:bg-green-800 disabled:opacity-50"
                >
                  {opening === d.id ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : null}
                  {opening === d.id ? 'Opening…' : 'Edit'}
                </button>
              ) : (
                <Link to="/login" className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-gray-300 px-3.5 text-[13px] font-semibold text-gray-900 hover:bg-gray-50 dark:border-gray-600 dark:text-white dark:hover:bg-gray-800">
                  Sign in to edit <ArrowRight size={14} aria-hidden="true" />
                </Link>
              )}
            </div>
          </li>
        ))}
      </ul>

      {count < designs.length && (
        <button
          type="button"
          onClick={() => setCount(designs.length)}
          className="mt-5 inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-gray-300 px-4 text-sm font-semibold text-gray-800 hover:border-gray-500 dark:border-gray-600 dark:text-gray-200"
        >
          Show {designs.length - count} more
        </button>
      )}
    </section>
  );
}
