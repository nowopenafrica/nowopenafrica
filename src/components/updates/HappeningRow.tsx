import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Megaphone } from 'lucide-react';

import { UPDATE_TYPES, postedAgoLabel, rankHappening } from '../../lib/businessUpdates';
import { fetchHappening, happeningHref, type HappeningItem } from '../../lib/publicUpdates';

/**
 * A row of live Business Updates across businesses: Discover's "Happening on
 * NowOpen" and Keeps' "New today".
 *
 * Newest first; relevance only breaks ties within the hour (rankHappening).
 * No counts, no "trending": nothing here is invented. When nothing is live, or
 * the read fails, the row is not shown at all, like every other Discover rail.
 * A card opens the update on the business's own profile, in the same viewer.
 */
interface Props {
  title: string;
  blurb: string;
  /** Only these businesses (Keeps). Omitted: every listable business (Discover). */
  businessIds?: string[];
  rankContext?: { keptIds: Set<string>; place: string; category: string };
  /**
   * At most this many updates from any one business (Discover), so a business
   * that posts twenty times cannot take over the row. Over-fetches to fill it.
   */
  perBusiness?: number;
}

/** How many cards the row shows at most. */
const ROW_SIZE = 24;

const typeLabel = (t: string) => UPDATE_TYPES.find((x) => x.key === t)?.label ?? 'Update';
const summary = (i: HappeningItem) => {
  if (i.update.title) return i.update.title;
  const chars = Array.from(i.update.body);
  return (chars.length > 80 ? `${chars.slice(0, 80).join('')}…` : i.update.body) || typeLabel(i.update.type);
};

export default function HappeningRow({ title, blurb, businessIds, rankContext, perBusiness }: Props) {
  const [items, setItems] = useState<HappeningItem[] | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const latest = useRef<HappeningItem[]>([]);
  const request = useRef(0);
  const idsKey = businessIds?.join(',');
  // An id built from the title would contain spaces, which aria-labelledby
  // reads as a list of ids; the section would then have no name.
  const headingId = useId();

  const load = useCallback(async () => {
    const mine = ++request.current;
    const opts = idsKey === undefined ? {} : { businessIds: idsKey ? idsKey.split(',') : [] };
    const r = await fetchHappening(perBusiness ? { ...opts, limit: 50 } : opts, latest.current);
    if (mine !== request.current) return;
    // A failed refresh keeps what was shown; only a failed first read shows nothing.
    if (r.ok) {
      latest.current = r.value;
      setItems(r.value);
    }
    setNow(Date.now());
  }, [idsKey, perBusiness]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 30_000);
    const refresh = setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 60_000);
    return () => { clearInterval(tick); clearInterval(refresh); };
  }, [load]);

  const shown = useMemo(() => {
    const live = (items ?? []).filter((i) => Date.parse(i.update.expires_at) > now);
    const ranked = rankContext ? rankHappening(live, rankContext) : live;
    if (!perBusiness) return ranked.slice(0, ROW_SIZE);
    const perBiz = new Map<string, number>();
    return ranked.filter((i) => {
      const n = (perBiz.get(i.business.id) ?? 0) + 1;
      perBiz.set(i.business.id, n);
      return n <= perBusiness;
    }).slice(0, ROW_SIZE);
  }, [items, now, rankContext, perBusiness]);

  if (shown.length === 0) return null;

  return (
    <section aria-labelledby={headingId} className="mb-10">
      <div className="mb-3">
        <h2 id={headingId} className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <Megaphone size={17} className="text-rose-600 dark:text-rose-400" aria-hidden="true" /> {title}
        </h2>
        <p className="text-xs text-gray-500 dark:text-gray-400">{blurb}</p>
      </div>
      <ul className="flex gap-3 overflow-x-auto pb-2">
        {shown.map((i) => {
          const ago = postedAgoLabel(i.update.published_at, new Date(now));
          return (
            <li key={i.update.id} className="shrink-0">
              <Link to={happeningHref(i)}
                aria-label={`${i.business.name}: ${typeLabel(i.update.type)}: ${summary(i)}, posted ${ago}`}
                className="block w-[220px] min-h-[44px] rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-rose-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose-600">
                <div className="aspect-video bg-gradient-to-br from-rose-500 to-amber-400 flex items-center justify-center">
                  {i.thumb
                    ? <img src={i.thumb.url} alt="" loading="lazy" className="w-full h-full object-cover" />
                    : <Megaphone size={28} className="text-white/90" aria-hidden="true" />}
                </div>
                <div className="p-3 space-y-1" aria-hidden="true">
                  <p className="text-xs font-bold text-gray-900 dark:text-white truncate">{i.business.name}</p>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-rose-600 dark:text-rose-400">{typeLabel(i.update.type)}</p>
                  <p className="text-sm text-gray-800 dark:text-gray-100 line-clamp-2 break-words">{summary(i)}</p>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">{ago}</p>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
