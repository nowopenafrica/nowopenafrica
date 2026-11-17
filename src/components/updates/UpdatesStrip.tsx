import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { List, Megaphone } from 'lucide-react';

import UpdateViewer from './UpdateViewer';
import { UPDATE_TYPES, postedAgoLabel } from '../../lib/businessUpdates';
import { fetchActiveUpdates, type PublicUpdate } from '../../lib/publicUpdates';

/**
 * "Updates · last 24 hours" on a business profile.
 *
 * Shown only when the business has something live. A failed first read
 * renders nothing: the strip makes no claim about the business, so silence is
 * the honest outcome. A failed REFRESH keeps what was already shown, because a
 * network blip is not news about the business.
 *
 * The server returns the live set; this re-reads every minute while the page
 * is visible and drops an update from view when its time ends. An open viewer
 * keeps the list it was opened with and is told which ids are still live, so
 * an update that ends, is ended early or is hidden says so on screen instead
 * of vanishing under the person reading it.
 *
 * The parent owns ?update=<id>, so a shared link opens that update here. The
 * parent also keys this component by business, so nothing carries over when
 * someone moves from one profile to another.
 */
interface Props {
  businessId: string;
  businessName: string;
  slug: string;
  openUpdateId: string | null;
  onOpenChange: (id: string | null) => void;
}

const typeLabel = (t: string) => UPDATE_TYPES.find((x) => x.key === t)?.label ?? 'Update';
const summary = (u: PublicUpdate) => {
  if (u.title) return u.title;
  const chars = Array.from(u.body);
  return (chars.length > 60 ? `${chars.slice(0, 60).join('')}…` : u.body) || 'Update';
};

type ViewerState = { index: number; mode: 'focus' | 'list'; updates: PublicUpdate[] };

export default function UpdatesStrip({ businessId, businessName, slug, openUpdateId, onOpenChange }: Props) {
  // null: not read yet. Otherwise the last SUCCESSFUL read.
  const [updates, setUpdates] = useState<PublicUpdate[] | null>(null);
  const [firstReadFailed, setFirstReadFailed] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [viewer, setViewer] = useState<ViewerState | null>(null);
  const [endedNotice, setEndedNotice] = useState(false);
  const handledLink = useRef<string | null>(null);
  const latest = useRef<PublicUpdate[]>([]);
  const request = useRef(0);

  const load = useCallback(async () => {
    const mine = ++request.current;
    const r = await fetchActiveUpdates(businessId, latest.current);
    // A slower, older response must not overwrite a newer one.
    if (mine !== request.current) return;
    if (r.ok) {
      latest.current = r.value;
      setUpdates(r.value);
      setFirstReadFailed(false);
    } else if (latest.current.length === 0) {
      setFirstReadFailed(true);
    }
    setNow(Date.now());
  }, [businessId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 30_000);
    const refresh = setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 60_000);
    return () => { clearInterval(tick); clearInterval(refresh); };
  }, [load]);

  const live = useMemo(
    () => (updates ?? []).filter((u) => Date.parse(u.expires_at) > now),
    [updates, now],
  );
  const liveIds = useMemo(() => new Set(live.map((u) => u.id)), [live]);

  // A shared link: open that update, or say it has ended. Once per id, and
  // only after a successful read, so a failing connection never claims it ended.
  useEffect(() => {
    if (!openUpdateId || updates === null || handledLink.current === openUpdateId) return;
    handledLink.current = openUpdateId;
    const index = live.findIndex((u) => u.id === openUpdateId);
    if (index >= 0) {
      setViewer({ index, mode: 'focus', updates: live });
    } else {
      setEndedNotice(true);
      onOpenChange(null);
    }
  }, [openUpdateId, updates, live, onOpenChange]);

  const openAt = (index: number) => {
    setEndedNotice(false);
    setViewer({ index, mode: 'focus', updates: live });
    handledLink.current = live[index].id;
    onOpenChange(live[index].id);
  };
  const close = () => {
    setViewer(null);
    onOpenChange(null);
  };

  const viewerEl = viewer && (
    <UpdateViewer
      key={`${viewer.mode}-${viewer.index}-${viewer.updates[viewer.index]?.id ?? ''}`}
      updates={viewer.updates}
      liveIds={liveIds}
      businessId={businessId}
      startIndex={viewer.index}
      businessName={businessName}
      slug={slug}
      mode={viewer.mode}
      onClose={close}
      onIndexChange={(id) => { handledLink.current = id; onOpenChange(id); }}
    />
  );

  const notice = endedNotice && (
    <p role="status" className="mb-4 rounded-xl bg-amber-50 dark:bg-amber-900/30 text-amber-900 dark:text-amber-100 text-sm px-4 py-3">
      This update has ended.
    </p>
  );

  // Nothing live (or never readable): no strip. The viewer is always rendered
  // in the same place, after the strip, so it is never remounted (and never
  // loses the reader's place) when the strip appears or disappears.
  const showStrip = !firstReadFailed && live.length > 0;
  if (!showStrip && !notice && !viewerEl) return null;

  return (
    <>
      {notice}
      {showStrip && (
    <section aria-labelledby="business-updates-heading" className="mb-6">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 id="business-updates-heading" className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Megaphone size={16} className="text-rose-600 dark:text-rose-400" aria-hidden="true" />
            Updates · last 24 hours
          </h2>
          <button type="button" onClick={() => setViewer({ index: 0, mode: 'list', updates: live })}
            className="inline-flex items-center gap-1.5 px-3 min-h-[44px] text-sm font-semibold text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
            <List size={15} aria-hidden="true" /> View as list
          </button>
        </div>
        <ul className="flex gap-3 overflow-x-auto pb-1">
          {live.map((u, i) => {
            const thumb = u.media.find((m) => m.kind === 'image' && m.url);
            const label = `${typeLabel(u.type)}: ${summary(u)}, posted ${postedAgoLabel(u.published_at, new Date(now))}`;
            return (
              <li key={u.id} className="shrink-0">
                <button type="button" onClick={() => openAt(i)} aria-label={label}
                  className="w-[88px] flex flex-col items-center gap-1.5 rounded-xl p-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose-600">
                  <span className="w-[72px] h-[72px] rounded-full p-[3px] bg-gradient-to-tr from-rose-500 to-amber-400">
                    <span className="w-full h-full rounded-full overflow-hidden bg-white dark:bg-gray-900 flex items-center justify-center">
                      {thumb?.url
                        ? <img src={thumb.url} alt="" className="w-full h-full object-cover" />
                        : <Megaphone size={22} className="text-rose-600" aria-hidden="true" />}
                    </span>
                  </span>
                  <span aria-hidden="true" className="text-[11px] leading-tight text-gray-700 dark:text-gray-200 line-clamp-2 text-center">
                    {summary(u)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
      )}
      {viewerEl}
    </>
  );
}
