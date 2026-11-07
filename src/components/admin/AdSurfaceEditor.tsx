import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { CheckCircle2, Loader2, RotateCcw, Send, Trash2 } from 'lucide-react';

import { supabase } from '../../lib/supabase';
import {
  DEFAULT_QUAD, fetchAllSurfaces, isPublishable, isStale, quadColumns,
  type AdSurface,
} from '../../lib/promote/adSurfaces';
import { clipPathFor, matrix3dFor, type Corner, type Quad } from '../../lib/promote/surface';
import { describeDimensions, readAdDimensions } from '../../lib/promote/adDimensions';

/**
 * Marking where the advertising surface is, on a real placement photograph.
 *
 * ── THE ONE FACT THE DATABASE WAS MISSING ────────────────────────────────
 *
 * Every placement carries a photograph. None of them said where the board
 * is inside it, so a preview could only ever use a drawn scene and had to
 * caption itself "illustrative". Four corners, placed by a person looking
 * at the picture, is the whole difference — and it is not something that
 * can be inferred, which is why this is an editor and not a script.
 *
 * ── WHY DRAGGING, AND NOT A FORM OF NUMBERS ──────────────────────────────
 *
 * The thing being specified is a position in an image. Typing 0.182 into a
 * box and reloading to see where it landed is how you get surfaces that are
 * nearly right, and nearly right is the one outcome worse than none: an
 * advert across a lamppost looks deliberate.
 *
 * So the corners are dragged, the artwork test-fits live, and nothing is
 * published until somebody has seen it sitting on the board.
 */
export default function AdSurfaceEditor() {
  const [adverts, setAdverts] = useState<Advert[]>([]);
  const [surfaces, setSurfaces] = useState<Map<string, AdSurface>>(new Map());
  const [selected, setSelected] = useState<Advert | null>(null);
  const [quad, setQuad] = useState<Quad>(DEFAULT_QUAD);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('advertisements')
      .select('id,title,type,category,location,dimensions,image_url,status')
      .not('image_url', 'is', null)
      .order('type')
      .limit(500);

    /*
     * The error is read. supabase-js resolves with { data, error }, so
     * dropping it here would show an empty picker and read as "there is no
     * inventory" on a platform whose inventory is the product.
     */
    if (error) {
      setProblem(`We could not load the placements: ${error.message}`);
      setAdverts([]);
    } else {
      setProblem(null);
      setAdverts((data ?? []) as Advert[]);
    }
    setSurfaces(await fetchAllSurfaces());
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const open = (advert: Advert) => {
    const existing = surfaces.get(advert.id);
    setSelected(advert);
    setQuad(existing?.quad ?? DEFAULT_QUAD);
    setNote(existing?.note ?? '');
  };

  const save = async (status: 'draft' | 'published') => {
    if (!selected) return;

    if (status === 'published') {
      const check = isPublishable(quad);
      if (!check.ok) { toast.error(check.why); return; }
    }

    setBusy(true);
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || !auth.user?.id) {
      setBusy(false);
      toast.error('We could not confirm who you are signed in as. Sign in again.');
      return;
    }

    /* No `.select()` after the write — on an RLS table that turns a
       successful write into a failed read and blames the write. */
    const { error } = await supabase.from('ad_mockup_surfaces').upsert({
      advert_id: selected.id,
      image_url: selected.image_url,
      ...quadColumns(quad),
      note: note.trim() || null,
      status,
      created_by: auth.user.id,
      published_at: status === 'published' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'advert_id' });

    setBusy(false);
    if (error) { toast.error(`Could not save that: ${error.message}`); return; }
    toast.success(status === 'published' ? 'Published — this placement now previews on its own photo.' : 'Saved as a draft.');
    void load();
  };

  const remove = async () => {
    if (!selected) return;
    const { error } = await supabase.from('ad_mockup_surfaces').delete().eq('advert_id', selected.id);
    if (error) { toast.error(`Could not remove that: ${error.message}`); return; }
    toast.success('Removed. This placement falls back to the drawn scene.');
    void load();
  };

  const done = surfaces.size;
  const published = [...surfaces.values()].filter((s) => s.status === 'published').length;

  if (loading) {
    return <div className="py-12 text-center"><Loader2 className="mx-auto animate-spin text-gray-400" size={22} /></div>;
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
        <p className="text-sm font-bold text-gray-900 dark:text-white">
          {published} of {adverts.length} placements preview on their own photograph
        </p>
        <p className="mt-1 max-w-2xl text-xs text-gray-500 dark:text-gray-400">
          Pick a placement, drag the four handles onto its advertising surface, and publish. The
          corners are solved into the same perspective transform the drawn scenes use — so a
          published placement shows a customer their artwork on the actual board, and stops
          calling itself illustrative.
          {done > published && ` ${done - published} saved as drafts.`}
        </p>
        {problem && <p className="mt-2 text-xs font-semibold text-amber-700 dark:text-amber-400">{problem}</p>}
      </div>

      {selected ? (
        <Editor
          advert={selected}
          quad={quad}
          onQuad={setQuad}
          note={note}
          onNote={setNote}
          existing={surfaces.get(selected.id) ?? null}
          busy={busy}
          onClose={() => setSelected(null)}
          onSave={save}
          onRemove={remove}
        />
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {adverts.map((a) => {
            const s = surfaces.get(a.id);
            return (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => open(a)}
                  className="flex w-full items-center gap-3 rounded-xl border border-gray-200 bg-white p-2.5 text-left transition hover:border-gray-400 dark:border-gray-700 dark:bg-gray-800"
                >
                  <img src={a.image_url} alt="" className="h-14 w-20 shrink-0 rounded-lg object-cover" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-gray-900 dark:text-white">{a.title}</p>
                    <p className="truncate text-[11px] text-gray-500">
                      {a.type}{a.location ? ` · ${a.location}` : ''}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${
                    s?.status === 'published'
                      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                      : s
                        ? 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                        : 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                  }`}
                  >
                    {s?.status === 'published' ? 'Live' : s ? 'Draft' : 'Not set'}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

interface Advert {
  id: string;
  title: string;
  type: string | null;
  category: string | null;
  location: string | null;
  dimensions: string | null;
  image_url: string;
  status: string | null;
}

const HANDLES: (keyof Quad)[] = ['tl', 'tr', 'br', 'bl'];
const HANDLE_LABEL: Record<keyof Quad, string> = {
  tl: 'Top left', tr: 'Top right', br: 'Bottom right', bl: 'Bottom left',
};

function Editor({
  advert, quad, onQuad, note, onNote, existing, busy, onClose, onSave, onRemove,
}: {
  advert: Advert;
  quad: Quad;
  onQuad: (q: Quad) => void;
  note: string;
  onNote: (s: string) => void;
  existing: AdSurface | null;
  busy: boolean;
  onClose: () => void;
  onSave: (status: 'draft' | 'published') => void;
  onRemove: () => void;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<keyof Quad | null>(null);

  const dims = useMemo(() => readAdDimensions(advert.dimensions), [advert.dimensions]);
  const check = isPublishable(quad);
  const stale = existing ? isStale(existing, advert.image_url) : false;

  /* A sample artwork, so the surface is judged with something on it. */
  const SURFACE_W = 1000;
  const SURFACE_H = Math.round(SURFACE_W / (dims.kind === 'size' ? dims.ratio : 2));
  const transform = matrix3dFor(SURFACE_W, SURFACE_H, quad, 1000, 1000);

  const place = useCallback((corner: keyof Quad, clientX: number, clientY: number) => {
    const box = frame.current?.getBoundingClientRect();
    if (!box) return;
    const next: Corner = {
      x: Math.min(1, Math.max(0, (clientX - box.left) / box.width)),
      y: Math.min(1, Math.max(0, (clientY - box.top) / box.height)),
    };
    onQuad({ ...quad, [corner]: next });
  }, [onQuad, quad]);

  useEffect(() => {
    if (!dragging) return undefined;
    const move = (e: PointerEvent) => { e.preventDefault(); place(dragging, e.clientX, e.clientY); };
    const up = () => setDragging(null);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [dragging, place]);

  /* The keyboard path, because a corner is a position and a mouse is not
     the only way to specify one. */
  const nudge = (corner: keyof Quad, dx: number, dy: number) => {
    const c = quad[corner];
    onQuad({
      ...quad,
      [corner]: {
        x: Math.min(1, Math.max(0, c.x + dx)),
        y: Math.min(1, Math.max(0, c.y + dy)),
      },
    });
  };

  return (
    <div className="space-y-4 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-gray-900 dark:text-white">{advert.title}</p>
          <p className="truncate text-[11px] text-gray-500">
            {advert.type}{advert.location ? ` · ${advert.location}` : ''} · {describeDimensions(dims)}
          </p>
        </div>
        <button type="button" onClick={onClose} className="text-xs font-semibold text-gray-500 hover:text-gray-900">
          Back to placements
        </button>
      </div>

      {stale && (
        /* Corners are only correct for the picture they were drawn on. */
        <p className="rounded-lg bg-amber-50 p-2.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
          This placement’s photograph has changed since these corners were set. Re-check them before publishing.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr,260px]">
        <div
          ref={frame}
          className="relative w-full select-none overflow-hidden rounded-xl bg-gray-900"
          style={{ aspectRatio: '1 / 1', touchAction: 'none' }}
        >
          <img src={advert.image_url} alt="" className="absolute inset-0 h-full w-full object-cover" />

          {/* The test artwork, projected exactly as the public preview will. */}
          {transform && (
            <div className="absolute inset-0" style={{ clipPath: clipPathFor(quad) }}>
              <div
                className="absolute left-0 top-0 grid place-items-center bg-blue-600/85"
                style={{
                  width: `${(SURFACE_W / 1000) * 100}%`,
                  height: `${(SURFACE_H / 1000) * 100}%`,
                  transform,
                  transformOrigin: '0 0',
                }}
              >
                <span className="text-4xl font-black tracking-tight text-white">YOUR ADVERT</span>
              </div>
            </div>
          )}

          {/* The outline, so the shape is readable even before artwork. */}
          <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            <polygon
              points={HANDLES.map((h) => `${quad[h].x * 100},${quad[h].y * 100}`).join(' ')}
              fill="none"
              stroke="#22d3ee"
              strokeWidth="0.4"
              vectorEffect="non-scaling-stroke"
            />
          </svg>

          {HANDLES.map((h) => (
            <button
              key={h}
              type="button"
              aria-label={`${HANDLE_LABEL[h]} corner`}
              onPointerDown={(e) => { e.preventDefault(); setDragging(h); }}
              onKeyDown={(e) => {
                const step = e.shiftKey ? 0.05 : 0.005;
                const moves: Record<string, [number, number]> = {
                  ArrowLeft: [-step, 0], ArrowRight: [step, 0],
                  ArrowUp: [0, -step], ArrowDown: [0, step],
                };
                const move = moves[e.key];
                if (move) { e.preventDefault(); nudge(h, move[0], move[1]); }
              }}
              className="absolute grid h-7 w-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-cyan-400 text-[9px] font-bold text-gray-900 shadow ring-2 ring-white focus:outline-none focus:ring-4 focus:ring-cyan-300"
              style={{ left: `${quad[h].x * 100}%`, top: `${quad[h].y * 100}%`, cursor: 'grab' }}
            >
              {h.toUpperCase()}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          <p className="text-[11px] leading-snug text-gray-500">
            Drag each handle onto a corner of the advertising surface. Arrow keys nudge the
            focused handle; hold shift to move further.
          </p>

          <label className="block">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500">
              Note for the next person
            </span>
            <input
              value={note}
              onChange={(e) => onNote(e.target.value)}
              placeholder="e.g. left face only"
              className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-xs dark:border-gray-600 dark:bg-gray-900 dark:text-white"
            />
          </label>

          {!check.ok && (
            <p className="rounded-lg bg-amber-50 p-2 text-[11px] text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
              {check.why}
            </p>
          )}

          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => onSave('published')}
              disabled={busy || !check.ok}
              className="inline-flex min-h-[36px] flex-1 items-center justify-center gap-1.5 rounded-lg bg-gray-900 px-3 text-xs font-bold text-white disabled:opacity-40 dark:bg-white dark:text-gray-900"
            >
              {busy ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Publish
            </button>
            <button
              type="button"
              onClick={() => onSave('draft')}
              disabled={busy}
              className="min-h-[36px] rounded-lg border border-gray-300 px-3 text-xs font-semibold text-gray-700 disabled:opacity-40 dark:border-gray-600 dark:text-gray-200"
            >
              Draft
            </button>
            <button
              type="button"
              onClick={() => onQuad(DEFAULT_QUAD)}
              aria-label="Reset the corners"
              className="grid h-9 w-9 place-items-center rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <RotateCcw size={14} />
            </button>
            {existing && (
              <button
                type="button"
                onClick={onRemove}
                aria-label="Remove this surface"
                className="grid h-9 w-9 place-items-center rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>

          {check.ok && (
            <p className="flex items-start gap-1.5 text-[11px] text-gray-500">
              <CheckCircle2 size={12} className="mt-0.5 shrink-0 text-emerald-600" />
              Published, this placement previews on its own photograph instead of a drawn scene.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
