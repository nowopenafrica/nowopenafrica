import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams, useNavigate, Link } from 'react-router-dom';
import {
  Loader2, Undo2, Redo2, Save, ArrowLeft, Trash2, Copy, Download, ImagePlus,
  Eye, EyeOff, Lock, Unlock, ChevronUp, ChevronDown,
  Plus, Files, FileX, FileText, Group, Ungroup, ZoomIn, ZoomOut, Maximize2, Ruler, Check, Wand2,
  AlertTriangle, X,
  Type, Square, FileUp,
  AlignStartVertical, AlignCenterVertical, AlignEndVertical,
  AlignStartHorizontal, AlignCenterHorizontal, AlignEndHorizontal,
} from 'lucide-react';
import toast from 'react-hot-toast';

import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { applySeo } from '../lib/seo';
import DesignCanvas from '../components/studio/DesignCanvas';
import DesignSurface from '../components/studio/DesignSurface';
import {
  blankDocument, documentFromTemplate, objectId, readDocument, SCHEMA_VERSION,
  type DesignDocument, type DesignObject, type DesignPage, type ImageObject, type TextObject,
} from '../lib/studio/designDocument';
import { topZ, withObject } from '../lib/studio/editorGeometry';
import {
  SHAPE_CHOICES, clampRadius, clampStroke, newShape, supportsRadius,
  type ShapeKind,
} from '../lib/studio/shapes';
import type { ShapeObject } from '../lib/studio/designDocument';
import { applyPatch, type PatchOp } from '../lib/studio/designPatch';
import PromptComposer from '../components/studio/PromptComposer';
import type { PromptVariant } from '../lib/studio/promptOps';
import { useFeatureFlags } from '../hooks/useFeatureFlags';
import { isEnabled } from '../lib/featureFlags';
import {
  emptyHistory, record, redo as redoStep, undo as undoStep, type History,
} from '../lib/studio/history';
import { templateByKeyAnywhere } from '../lib/create/templateCatalogue';
import { formatForTemplate } from '../lib/design/deliverables';
import { DESIGN_FORMATS } from '../data/studioPresets';
import { sampleFor } from '../lib/create/sampleCopy';
import { lookFromParam } from '../lib/design/lookParam';
import { previewPhotoFor } from '../lib/design/previewMedia';
import { describeExport, pdfPlan } from '../lib/studio/exportDesign';
import {
  autosaveDecision, AUTOSAVE_DELAY_MS, SAVE_LABEL, type SaveState,
} from '../lib/studio/autosave';
import {
  alignObjects, distributeObjects, moveSelection, toggleSelection, type Align,
} from '../lib/studio/selection';
import {
  expandSelection, groupObjects, groupOf, membersOf, syncGroups, topLevel, ungroup,
} from '../lib/studio/groups';
import {
  clampPageSize, describeSize, PRESET_GROUPS, PRESETS, presetPixels, PRINT_DPI,
  refitPage, shapeChangesMuch, toPixels, type RefitMode, type Unit,
} from '../lib/studio/formats';
import { dataUrlToBlob, downloadNodePng, exportNodeToPng } from '../lib/studio';
import { planReturnPath, readPlanReturn, withPlanReturn } from '../lib/promote/planReturn';
import { setLineArtwork, uploadLineArtworkBlob } from '../lib/promote/campaigns';
import {
  ACCEPTED_IMAGE_TYPES, assetPath, checkImageFile, imageTypeOf, placeImage, STUDIO_BUCKET,
} from '../lib/studio/designAssets';
import { placeDroppedImage } from '../lib/studio/dropImage';
import { compressImage } from '../lib/imageCompression';
import { documentFromReference, planReconstruction, type ReferencePlan } from '../lib/studio/reference';
import {
  documentFromPdf, faithfulPage, pageHasText, pdfFailure, pdfSummary, renderPdf,
} from '../lib/studio/importPdf';
import { embeddedPdf, isPdfBytes, NO_EMBEDDED_PDF } from '../lib/studio/importEps';
import { importSummary, importSvg } from '../lib/studio/importSvg';
import { documentFromPptx, importPptx, pptxSummary, WANTED_PART } from '../lib/studio/importPptx';
import { asText, readZip } from '../lib/studio/zip';
import {
  clampDim, exportNote, isUsableUrl, kindOfUrl,
} from '../lib/studio/pageBackground';
import {
  clampLineHeight, clampTracking, FONT_CHOICES, opacityToPercent, percentToOpacity,
  percentToSize, resolveWeight, safeColour, sizeToPercent, weightsFor,
} from '../lib/studio/textStyle';
import type { FontKey } from '../lib/design/typefaces';
import {
  canMove, layerLabel, layerList, moveLayer, renameLayer, setLocked, setVisible,
} from '../lib/studio/layers';
import {
  addPage, canRemovePage, clampPageIndex, duplicatePage, movePage, pageLabel, removePage,
  variantPage,
} from '../lib/studio/pages';

/**
 * NowOpen Creative Studio — the editing workspace.
 *
 * ── WHAT THIS RELEASE DOES AND DOES NOT DO ───────────────────────────────
 *
 * Does: open a blank page or any of the catalogue designs as a real editable
 * document, select objects, move and resize them, nudge with the keyboard,
 * duplicate, delete, undo, redo, and save to the owner's account.
 *
 * Does NOT: groups, image upload, rotation handles, multiple pages, export,
 * or AI reconstruction. Those are in the schema and not in this UI, and the
 * screen says so rather than showing controls that do nothing.
 */


export default function StudioEditor() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [doc, setDocState] = useState<DesignDocument | null>(null);

  /*
   * The same document, readable synchronously.
   *
   * Event handlers need the CURRENT document, and reading it from a state
   * updater is not allowed to have side effects — see lib/studio/history.ts
   * for what that cost. The ref is written in the same breath as the state,
   * so the two can never disagree.
   */
  const docRef = useRef<DesignDocument | null>(null);
  const setDoc = useCallback((next: DesignDocument | null) => {
    docRef.current = next;
    setDocState(next);
  }, []);
  const [projectId, setProjectIdState] = useState<string | null>(id ?? null);
  /*
   * Also a ref, so the loader can recognise the id THIS component just saved
   * under and not refetch a document it is already holding.
   */
  const projectIdRef = useRef<string | null>(id ?? null);
  const setProjectId = useCallback((next: string | null) => {
    projectIdRef.current = next;
    setProjectIdState(next);
  }, []);
  const [version, setVersion] = useState(1);
  const [loading, setLoading] = useState(true);
  const [problem, setProblem] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const { flags } = useFeatureFlags();
  /*
   * The single-object case, named separately because most of the properties
   * panel only makes sense for one object. With several selected this is
   * null, and the panel offers aligning and distributing instead of controls
   * that would have to guess which object they meant.
   */
  const selectedId = selectedIds.length === 1 ? selectedIds[0] : null;
  const setSelectedId = useCallback((id: string | null) => setSelectedIds(id ? [id] : []), []);
  const onCanvasSelect = useCallback(
    (id: string | null, additive: boolean) =>
      setSelectedIds((prev) => {
        if (id === null) return [];
        const next = toggleSelection(prev, id, additive);
        /*
         * Clicking one member selects every member — that is the whole point
         * of having made a group.
         */
        const current = docRef.current?.pages[pageIndexRef.current];
        return current ? expandSelection(current, next) : next;
      }),
    [],
  );
  const [saveState, setSaveState] = useState<SaveState>('idle');

  /*
   * Undo history. Snapshots, because a document this size is cheap to copy
   * and an operation log would need an inverse for every future operation.
   *
   * The history itself is a ref — rewriting it must not cause a render in the
   * middle of a drag — and `steps` mirrors only how deep it is, because the
   * buttons have to know whether there is anything to go back to. An undo
   * button that is always enabled and sometimes does nothing is the kind of
   * dead control this editor is not allowed to have.
   */
  const history = useRef<History<DesignDocument>>(emptyHistory());
  const [steps, setSteps] = useState({ back: 0, forward: 0 });
  const remember = useCallback((next: History<DesignDocument>) => {
    history.current = next;
    setSteps({ back: next.past.length, forward: next.future.length });
  }, []);

  useEffect(() => { applySeo({ title: 'NowOpen Studio', description: 'Create and edit your designs.' }); }, []);

  /* ── opening ─────────────────────────────────────────────────────────── */

  useEffect(() => {
    let cancelled = false;
    const open = async () => {
      setLoading(true);
      setProblem(null);

      /*
       * The id this component navigated to after its own first save. The
       * document is already in hand, so refetching it would only throw away
       * the selection and flash a spinner.
       */
      if (id && id === projectIdRef.current && docRef.current) {
        setLoading(false);
        return;
      }

      if (id) {
        const { data, error } = await supabase
          .from('design_projects').select('id, document, version, title').eq('id', id).maybeSingle();
        if (cancelled) return;
        if (error) { setProblem(`Could not open that project: ${error.message}`); setLoading(false); return; }
        if (!data) { setProblem('That project does not exist, or it is not yours.'); setLoading(false); return; }
        const read = readDocument((data as { document: unknown }).document);
        if (!read.ok) { setProblem(read.reason); setLoading(false); return; }
        setDoc(read.doc);
        setProjectId((data as { id: string }).id);
        setVersion((data as { version: number }).version);
        setLoading(false);
        return;
      }

      /*
       * A new project. `?template=` opens one of the catalogue designs as a
       * real editable document — the join that means none of the 47 layouts
       * had to be re-authored for this editor.
       */
      const key = params.get('template');
      /*
       * Looks in the bundle first and only then at the published uploads,
       * so the 66 code layouts still cost no round trip and a template a
       * creative manager published opens too.
       */
      const template = key ? await templateByKeyAnywhere(key) : null;

      /*
       * The canvas: the one asked for, else the one this design belongs on,
       * else a square.
       *
       * The Create page sends `w`/`h` because its customiser already resolved
       * the format. A bare link does not — and it was landing every template
       * on 1080x1080 regardless, so a business card opened square and a 4:5
       * poster opened square. The deliverable has carried a format all along;
       * reading it here is what makes that column load-bearing on every path
       * rather than only the one the gallery happens to use.
       */
      const canvas = template ? DESIGN_FORMATS.find((f) => f.key === formatForTemplate(template)) : undefined;
      const width = Number(params.get('w')) || canvas?.w || 1080;
      const height = Number(params.get('h')) || canvas?.h || 1080;

      /*
       * `text` carries the words the person typed in quotes on the Create
       * screen. They are used EXACTLY as written — the product's rule is that
       * it never invents a business fact, and a headline the owner typed is a
       * fact. Everything else stays placeholder copy they can replace.
       */
      const headline = params.get('text');
      const copy = template ? { ...sampleFor(template), ...(headline ? { headline } : {}) } : null;

      /*
       * The style and brand colour the design was customised with.
       *
       * Without these, pressing "Open in Studio" after choosing Luxury and a
       * green brand colour arrived on an indigo default — the editor threw
       * away two decisions the person had just made.
       */
      const styleKey = params.get('style') ?? undefined;
      const accent = safeColour(params.get('accent') ?? undefined) ?? '#4f46e5';

      /*
       * The look the customer made on the Create page (`?look=`). It is
       * validated and rebuilt for this template by lookFromParam, so a pasted
       * or hand-edited value can only ever select things that exist.
       */
      const chosenLook = template ? lookFromParam(template, params.get('look')) : {};

      const opened = template && copy
        ? documentFromTemplate(template, copy, { width, height, styleKey, accent, ...chosenLook })
        : blankDocument(width, height);

      /*
       * A photo-led layout opens WITH its photograph.
       *
       * The gallery previews these over a picture and the editor opened the
       * same template on flat colour — so the design you clicked was not the
       * design you got, and the first thing it needed was the very thing the
       * preview had already shown you. The picture is a licensed Pexels
       * placeholder behind placeholder copy; the owner replaces it with their
       * own from the Background panel, which is the point of that panel.
       */
      if (template?.photoLed && opened.pages[0]) {
        opened.pages[0].backgroundMedia = {
          assetId: previewPhotoFor(template.key),
          kind: 'image',
          fit: 'cover',
          /* Enough veil that the headline stays readable on any photograph. */
          dim: 0.35,
        };
      }

      setDoc(opened);
      setLoading(false);
    };
    void open();
    return () => { cancelled = true; };
  }, [id, params]);

  /* ── editing ─────────────────────────────────────────────────────────── */

  /*
   * Which page is being edited.
   *
   * Held in a ref as well as state because the mutation helpers read it
   * synchronously from event handlers, the same reason the document is —
   * see lib/studio/history.ts for what reading it out of a state updater
   * cost the first time.
   */
  const [pageIndex, setPageIndexState] = useState(0);
  const pageIndexRef = useRef(0);
  /* `runPatch` is declared above `mutate` so it can sit beside the other
     document actions; the ref is how it reaches the later definition
     without either of them depending on the order they are written in. */
  const mutateRef = useRef<((change: (p: DesignPage) => DesignPage) => void) | null>(null);
  const setPageIndex = useCallback((i: number) => {
    pageIndexRef.current = i;
    setPageIndexState(i);
    setSelectedId(null);
  }, []);

  /*
   * Clamped DURING the render, not after it.
   *
   * Undo can restore a document with fewer pages than the screen is showing.
   * Correcting that in an effect still lets one render happen with an index
   * past the end, and that render has no page — so the editor flashes
   * "Nothing to edit" on a document that is perfectly fine. Measured on
   * 2026-10-14 by undoing across a page insertion.
   */
  const safePageIndex = clampPageIndex(doc, pageIndex);
  const page: DesignPage | null = doc?.pages[safePageIndex] ?? null;

  /* Put the state and the ref back in step once the render has settled. */
  useEffect(() => {
    const safe = clampPageIndex(doc, pageIndexRef.current);
    if (safe !== pageIndexRef.current) setPageIndex(safe);
  }, [doc, setPageIndex]);

  /** A live change during a drag. Not a history entry — see commit(). */
  const setPage = useCallback((next: DesignPage) => {
    const d = docRef.current;
    if (!d) return;
    setDoc({ ...d, pages: d.pages.map((pg, i) => (i === pageIndexRef.current ? next : pg)) });
    setSaveState('unsaved');
  }, [setDoc]);

  /**
   * Close the current gesture.
   *
   * The snapshot was already taken when the gesture STARTED — taking it here
   * would record the document the drag just produced, and undo would appear
   * to do nothing.
   */
  const commit = useCallback(() => { setSaveState('unsaved'); }, []);

  /** Take the snapshot BEFORE a change, so undo returns to what preceded it. */
  const snapshot = useCallback(() => {
    const d = docRef.current;
    if (d) remember(record(history.current, d));
  }, [remember]);

  const undo = useCallback(() => {
    const d = docRef.current;
    if (!d) return;
    const step = undoStep(history.current, d);
    if (!step) return;
    remember(step.history);
    setDoc(step.present);
    setSaveState('unsaved');
  }, [remember, setDoc]);

  const redo = useCallback(() => {
    const d = docRef.current;
    if (!d) return;
    const step = redoStep(history.current, d);
    if (!step) return;
    remember(step.history);
    setDoc(step.present);
    setSaveState('unsaved');
  }, [remember, setDoc]);

  /**
   * Apply a typed instruction to the page.
   *
   * It goes through `mutate` like every other edit, so it lands in the same
   * history the drag handles write to — a typed change and a dragged one
   * undo in the same order, which is the whole reason not to give the
   * composer a history of its own.
   *
   * The rejections are collected and handed back rather than toasted here:
   * the composer is the thing with a sentence to put them in, and a toast
   * for "it is already that colour" is noise.
   */
  const runPatch = useCallback((ops: PatchOp[]): { rejected: string[] } => {
    const reasons: string[] = [];
    mutateRef.current?.((pg) => {
      const result = applyPatch(pg, ops);
      reasons.push(...result.rejected.map((r) => r.why));
      return result.page;
    });
    return { rejected: reasons };
  }, []);

  const mutate = useCallback((change: (p: DesignPage) => DesignPage) => {
    const d = docRef.current;
    if (!d) return;
    const current = d.pages[pageIndexRef.current];
    if (!current) return;
    const nextPage = change(current);
    /*
     * Nothing changed, so there is no edit and — the part that matters — no
     * history entry. Recording one would hand the user an undo that restores
     * an identical document and appears broken. Every change function in
     * lib/studio returns the SAME page object when it does nothing, which is
     * what makes this check possible.
     */
    if (nextPage === current) return;
    /*
     * Groups are brought back in step after every change: bounds recomputed,
     * groups left with one member dissolved, orphaned children freed. Doing
     * it here means no individual operation has to remember groups exist.
     */
    const settled = syncGroups(nextPage);
    snapshot();
    setDoc({ ...d, pages: d.pages.map((pg, i) => (i === pageIndexRef.current ? settled : pg)) });
    setSaveState('unsaved');
  }, [snapshot, setDoc]);

  /*
   * A new object arrives SELECTED.
   *
   * It was not, and the result was quietly broken: adding text left nothing
   * selected, so Duplicate and Delete sat disabled over the thing that had
   * just been created, and the properties panel showed nothing to edit. The
   * first thing anyone does after adding text is type into it.
   */
  const addText = () => {
    const id = objectId('t');
    mutate((p) => ({
      ...p,
      objects: [...p.objects, {
        id, type: 'text', name: 'Text',
        x: 0.1, y: 0.45, w: 0.8, h: 0.12,
        rotation: 0, opacity: 1, visible: true, locked: false, z: topZ(p),
        text: 'Your text', size: 0.08, weight: 700,
      } as TextObject],
    }));
    setSelectedIds([id]);
  };

  /*
   * Four shapes, not one.
   *
   * The rail offered a rectangle with a fixed 2% corner radius, so a sharp
   * corner, a circle and a rule were all undrawable — while the renderer had
   * been drawing ellipses, strokes and any radius since it was written. The
   * catalogue lives in lib/studio/shapes.ts so the rail and the properties
   * panel read one list.
   */
  const [shapeMenu, setShapeMenu] = useState(false);
  const addShape = (kind: ShapeKind) => {
    if (!page) return;
    const shape = newShape(kind, page, doc?.accent ?? '#4f46e5');
    mutate((p) => ({ ...p, objects: [...p.objects, shape as DesignObject] }));
    setSelectedIds([shape.id]);
    setShapeMenu(false);
  };

  const duplicate = () => {
    if (!selectedId || !page) return;
    const source = page.objects.find((o) => o.id === selectedId);
    if (!source) return;
    const copy = { ...source, id: objectId('c'), name: `${source.name} copy`, x: Math.min(source.x + 0.03, 1 - source.w), y: Math.min(source.y + 0.03, 1 - source.h), z: topZ(page) };
    mutate((p) => ({ ...p, objects: [...p.objects, copy] }));
    setSelectedId(copy.id);
  };

  const remove = () => {
    if (selectedIds.length === 0) return;
    mutate((p) => ({ ...p, objects: p.objects.filter((o) => !selectedIds.includes(o.id)) }));
    setSelectedId(null);
  };

  /* Arrow keys, because a drag target is unusable without a pointer. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement | null)?.tagName;
      if (typing === 'INPUT' || typing === 'TEXTAREA') return;

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
        return;
      }
      if (selectedIds.length === 0) return;
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); remove(); return; }

      const step = e.shiftKey ? 0.05 : 0.005;
      const moves: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step],
      };
      const d = moves[e.key];
      if (!d) return;
      e.preventDefault();
      /* The selection moves as one, clamped on its own bounds. */
      mutate((p) => moveSelection(p, selectedIds, d[0], d[1]));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  /* ── how big the canvas may be ───────────────────────────────────────── */

  /*
   * The preview sizes itself to the room it actually has.
   *
   * A design is a fixed shape, so filling the width alone is wrong: a square
   * document in a wide column becomes as tall as it is wide and runs off the
   * bottom of the screen, and the user scrolls to see a design that would
   * have fitted. The canvas therefore takes the SMALLER of the width
   * available and the width that would fit the height — the same rule a
   * lightbox uses — and zoom multiplies the result.
   *
   * Measured rather than assumed: the toolbars above and below differ in
   * height between phone and desktop, and a constant would be wrong on one
   * of them the first time either changed.
   */
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [stage, setStage] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const measure = () => {
      const el = stageRef.current;
      if (!el) return;
      const box = el.getBoundingClientRect();
      const w = Math.round(box.width);
      /* Whatever is left between the top of the stage and the window floor. */
      const h = Math.round(Math.max(240, window.innerHeight - box.top - 16));
      setStage((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
    };

    measure();
    /*
     * Observing the stage is safe: the canvas is sized INSIDE it and the
     * stage scrolls rather than growing, so this cannot feed itself.
     */
    const observer = new ResizeObserver(measure);
    if (stageRef.current) observer.observe(stageRef.current);
    window.addEventListener('resize', measure);
    return () => { observer.disconnect(); window.removeEventListener('resize', measure); };
    /*
     * Re-run when the editor actually appears. While the project is loading
     * this component renders a spinner, so the stage does not exist yet and
     * an effect that ran only on mount attached its observer to nothing —
     * leaving the canvas at its fallback full width, overflowing the window
     * by exactly the height of the toolbars.
     */
  }, [loading, problem]);

  /* ── page background ─────────────────────────────────────────────────── */

  const backgroundInput = useRef<HTMLInputElement | null>(null);
  const [bgUrl, setBgUrl] = useState('');
  const [bgBusy, setBgBusy] = useState(false);

  const setBackgroundMedia = (media: { assetId: string; kind: 'image' | 'video' } | null) => {
    mutate((pg) => (media
      ? { ...pg, backgroundMedia: { ...media, fit: 'cover' as const, dim: pg.backgroundMedia?.dim ?? 0 } }
      : { ...pg, backgroundMedia: undefined }));
  };

  /** A pasted address. Refused unless it is fetchable and says what it is. */
  const applyBackgroundUrl = () => {
    const url = bgUrl.trim();
    if (!isUsableUrl(url)) {
      toast.error('That address cannot be loaded. Use an http or https link to an image or video file.');
      return;
    }
    const kind = kindOfUrl(url);
    if (!kind) {
      toast.error('That link does not say whether it is an image or a video. Use one ending in .jpg, .png, .webp or .mp4.');
      return;
    }
    setBackgroundMedia({ assetId: url, kind });
    setBgUrl('');
  };

  const onBackgroundChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!user) { toast.error('Sign in to upload a background.'); return; }
    const check = checkImageFile(file);
    if (!check.ok) { toast.error(check.reason); return; }
    setBgBusy(true);
    try {
      const compressed = await compressImage(file);
      const path = assetPath(user.id, compressed.type || file.type);
      const { error } = await supabase.storage.from(STUDIO_BUCKET)
        .upload(path, compressed, { cacheControl: '3600', upsert: false });
      if (error) throw new Error(error.message);
      setBackgroundMedia({ assetId: path, kind: 'image' });
    } catch (err) {
      toast.error(err instanceof Error ? `Could not set that background: ${err.message}` : 'Could not set that background.');
    } finally {
      setBgBusy(false);
    }
  };

  /* ── recreate from a reference ───────────────────────────────────────── */

  const referenceInput = useRef<HTMLInputElement | null>(null);
  const [recreating, setRecreating] = useState(false);

  /**
   * Turn a picture of a design into an editable one.
   *
   * The analysis is deterministic and runs in this browser: proportions,
   * background, palette and the areas where the picture is busy. It does NOT
   * read the words — see lib/studio/reference.ts. The reference is kept as a
   * locked bottom layer so the rebuild can be aligned against it.
   */
  const onReferenceChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!user) { toast.error('Sign in to recreate a design from a reference.'); return; }

    const check = checkImageFile(file);
    if (!check.ok) { toast.error(check.reason); return; }

    setRecreating(true);
    try {
      const compressed = await compressImage(file);

      /* Decode to pixels so the analysis has something to measure. */
      const bitmap = await createImageBitmap(compressed);
      const scratch = document.createElement('canvas');
      scratch.width = bitmap.width;
      scratch.height = bitmap.height;
      const ctx = scratch.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw new Error('This browser would not let the picture be read.');
      ctx.drawImage(bitmap, 0, 0);
      const pixels = ctx.getImageData(0, 0, scratch.width, scratch.height);
      bitmap.close?.();

      const plan = planReconstruction(pixels);

      const path = assetPath(user.id, compressed.type || file.type);
      const { error } = await supabase.storage.from(STUDIO_BUCKET)
        .upload(path, compressed, { cacheControl: '3600', upsert: false });
      if (error) throw new Error(error.message);

      const title = file.name.replace(/\.[^.]+$/, '').slice(0, 40) || 'Recreated design';
      const rebuilt = documentFromReference(plan, path, title);

      snapshot();
      setDoc(rebuilt);
      setSelectedIds([]);
      setPageIndex(0);
      /*
       * A recreation is a NEW design. Keeping the old project id would make
       * the next save overwrite the design the user was working on with a
       * different one.
       */
      setProjectId(null);
      setSaveState('unsaved');

      toast.success(
        plan.regions.length > 0
          ? `Rebuilt with ${plan.regions.length} editable text ${plan.regions.length === 1 ? 'area' : 'areas'}. The words were not read from the picture — type them in.`
          : 'Rebuilt with the reference, its size and its colours. No clear text areas were found, so add text where you need it.',
      );
    } catch (err) {
      toast.error(err instanceof Error ? `Could not use that reference: ${err.message}` : 'Could not use that reference.');
    } finally {
      setRecreating(false);
    }
  };

  /* ── page size ───────────────────────────────────────────────────────── */

  const [sizeOpen, setSizeOpen] = useState(false);
  const [unit, setUnit] = useState<Unit>('px');
  const [dpi, setDpi] = useState(PRINT_DPI);
  const [customW, setCustomW] = useState('');
  const [customH, setCustomH] = useState('');
  /*
   * How a design is carried into a new shape. Offered rather than guessed:
   * see lib/studio/formats.ts — stretching a square into a story turns a
   * round logo into an oval, and fitting leaves deliberate empty space. Only
   * the user knows which they want.
   */
  const [refitMode, setRefitMode] = useState<RefitMode>('fit');

  mutateRef.current = mutate;

  const applySize = (width: number, height: number) => {
    const size = clampPageSize(width, height);
    mutate((pg) => refitPage(
      pg, size.width, size.height,
      /* A small adjustment never needs the distortion question asked. */
      shapeChangesMuch(pg, size.width, size.height) ? refitMode : 'stretch',
    ));
    setSizeOpen(false);
  };

  const applyCustomSize = () => {
    const width = toPixels(Number(customW), unit, dpi);
    const height = toPixels(Number(customH), unit, dpi);
    if (width <= 0 || height <= 0) {
      toast.error('Enter a width and a height greater than zero.');
      return;
    }
    applySize(width, height);
  };

  /* ── zoom ────────────────────────────────────────────────────────────── */

  /*
   * Zoom is the canvas's LAYOUT width, not a CSS transform.
   *
   * The pointer maths converts screen pixels to the document's 0..1 space
   * using the surface's own bounding rectangle, so a surface that is really
   * wider needs no changes anywhere: clicks, drags, handles and snapping stay
   * correct by construction. A transform would scale the painted result while
   * the layout box stayed put, and every coordinate would need dividing by
   * the zoom — in several places, each one a chance to be wrong.
   *
   * Panning is then just the scroll bars the browser already provides.
   */
  const [zoom, setZoom] = useState(1);
  const ZOOM_STEPS = [0.5, 0.75, 1, 1.5, 2, 3];
  const zoomBy = (direction: 1 | -1) => {
    const i = ZOOM_STEPS.findIndex((z) => Math.abs(z - zoom) < 0.01);
    const at = i < 0 ? ZOOM_STEPS.indexOf(1) : i;
    setZoom(ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, Math.max(0, at + direction))]);
  };

  const canvasWidth = (() => {
    if (!page || stage.w === 0) return undefined;
    const ratio = page.width / page.height;
    const fits = Math.min(stage.w, stage.h * ratio);
    return Math.max(160, Math.round(fits * zoom));
  })();


  /* ── grouping ────────────────────────────────────────────────────────── */

  const selectedGroup = page && selectedIds.length > 0 ? groupOf(page, selectedIds[0]) : null;

  const onGroup = () => {
    mutate((pg) => groupObjects(pg, selectedIds));
  };

  const onUngroup = () => {
    if (!selectedGroup) return;
    const members = page ? membersOf(page, selectedGroup.id).map((m) => m.id) : [];
    mutate((pg) => ungroup(pg, selectedGroup.id));
    setSelectedIds(members);
  };

  /* ── pages ───────────────────────────────────────────────────────────── */

  /**
   * A change to the SHAPE of the document rather than to one page.
   *
   * Separate from `mutate` because these alter the page array itself, and
   * because each one decides where the user should be left afterwards —
   * adding a page should show it, deleting one should not leave the editor
   * pointing past the end.
   */
  const mutateDoc = useCallback((change: (d: DesignDocument) => DesignDocument, land: (d: DesignDocument) => number) => {
    const d = docRef.current;
    if (!d) return;
    const next = change(d);
    if (next === d) return;
    snapshot();
    setDoc(next);
    setPageIndex(clampPageIndex(next, land(next)));
    setSaveState('unsaved');
  }, [snapshot, setDoc, setPageIndex]);

  /*
   * "Make a Story version" — a new page beside this one, not a change to it.
   *
   * Through `mutateDoc` like the other page actions, so it takes one history
   * entry and lands the user on the page they just asked for.
   */
  const runVariant = (v: PromptVariant) => mutateDoc(
    (d) => variantPage(d, pageIndexRef.current, v.width, v.height, v.label),
    () => pageIndexRef.current + 1,
  );

  const onAddPage = () => mutateDoc((d) => addPage(d, pageIndexRef.current), () => pageIndexRef.current + 1);
  const onDuplicatePage = () => mutateDoc((d) => duplicatePage(d, pageIndexRef.current), () => pageIndexRef.current + 1);
  const onRemovePage = () => mutateDoc((d) => removePage(d, pageIndexRef.current), () => pageIndexRef.current - 1);
  const onMovePage = (to: number) => mutateDoc((d) => movePage(d, pageIndexRef.current, to), () => to);

  /* ── importing a design ──────────────────────────────────────────────── */

  const importInput = useRef<HTMLInputElement | null>(null);
  const [importing, setImporting] = useState(false);

  /**
   * Bring an SVG in as editable objects.
   *
   * What arrives editable and what stays as artwork is decided in
   * lib/studio/importSvg.ts, and the result SAYS which is which — "imported
   * successfully" tells somebody nothing about whether they can retype their
   * own logo.
   */
  /**
   * Bring a PowerPoint deck in as editable pages.
   *
   * The archive is read and the slides parsed in this browser — see
   * lib/studio/zip.ts and lib/studio/importPptx.ts. Nothing is uploaded
   * except the pictures the slides actually use, and the deck REPLACES the
   * open design, because a deck is a document of its own rather than
   * something to drop onto the current page.
   */
  const importDeck = async (file: File) => {
    if (!user) { toast.error('Sign in to import a PowerPoint deck.'); return; }

    const archive = await readZip(new Uint8Array(await file.arrayBuffer()), WANTED_PART);
    if ('error' in archive) { toast.error(archive.error); return; }

    const xml = new Map<string, string>();
    for (const [part, data] of archive) {
      if (part.endsWith('.xml') || part.endsWith('.rels')) xml.set(part, asText(data));
    }

    const result = importPptx(xml, (t) => new DOMParser().parseFromString(t, 'application/xml'));
    if ('error' in result) { toast.error(result.error); return; }

    /*
     * Upload each picture once, however many slides use it. A part whose
     * format this app does not accept — PowerPoint still emits EMF and WMF —
     * is left out and counted by documentFromPptx, never kept as an image
     * object pointing at nothing.
     */
    const assets = new Map<string, string>();
    const byPart = new Map<string, string>();
    for (const page of result.pages) {
      for (const picture of page.pictures) {
        const already = byPart.get(picture.part);
        if (already) { assets.set(picture.objectId, already); continue; }

        const data = archive.get(picture.part);
        const type = imageTypeOf(picture.part);
        if (!data || !type) continue;

        try {
          const source = new File([data as BlobPart], picture.part.split('/').pop() ?? 'image', { type });
          const compressed = await compressImage(source);
          const check = checkImageFile(compressed);
          if (!check.ok) continue;

          const path = assetPath(user.id, compressed.type || type);
          const { error } = await supabase.storage.from(STUDIO_BUCKET)
            .upload(path, compressed, { cacheControl: '3600', upsert: false });
          if (error) continue;

          byPart.set(picture.part, path);
          assets.set(picture.objectId, path);
        } catch {
          /* One picture failing must not cost the user the whole deck. */
        }
      }
    }

    const title = file.name.replace(/\.[^.]+$/, '').slice(0, 60) || 'Imported deck';
    const { doc: imported, droppedPictures } = documentFromPptx(result, assets, title);

    snapshot();
    setDoc(imported);
    setSelectedIds([]);
    setPageIndex(0);
    /* A deck is a NEW design; keeping the project id would overwrite the one
     * the user was working on with something else entirely. */
    setProjectId(null);
    setSaveState('unsaved');

    const lost = droppedPictures > 0
      ? ` ${droppedPictures} ${droppedPictures === 1 ? 'picture was' : 'pictures were'} in a format that could not be brought over.`
      : '';
    toast.success(`${pptxSummary(result)}${lost}`);
  };

  /**
   * Open a PDF as a reference to draw over.
   *
   * Deliberately NOT called importing it as editable vectors — a PDF is a
   * page description and its layers are gone before the file exists. See
   * lib/studio/importPdf.ts. Each page goes through the same reconstruction
   * as a photographed design, and the toast says plainly what happened.
   */
  const importPdfFile = async (file: File) => {
    if (!user) { toast.error('Sign in to open a PDF in the Studio.'); return; }

    const raw = new Uint8Array(await file.arrayBuffer());

    /*
     * An EPS is PostScript — a program, which nothing here is going to run.
     * What it usually carries is a complete PDF alongside it; that is what
     * gets opened. See lib/studio/importEps.ts, including why a file without
     * one is refused rather than opened blank.
     */
    let data: ArrayBuffer;
    if (isPdfBytes(raw)) {
      data = raw.buffer as ArrayBuffer;
    } else {
      const inner = embeddedPdf(raw);
      if (!inner) { toast.error(NO_EMBEDDED_PDF); return; }
      data = inner.buffer as ArrayBuffer;
    }

    let rendered;
    try {
      rendered = await renderPdf(data);
    } catch (err) {
      toast.error(pdfFailure(err));
      return;
    }
    if (rendered.pages.length === 0) { toast.error('That PDF has no pages in it.'); return; }

    /*
     * ── TWO KINDS OF PDF, AND THEY ARE NOT THE SAME FILE ────────────────
     *
     * A born-digital PDF carries every string with its position, size and
     * font. A scan carries a photograph. The importer used to render BOTH
     * to pixels and then guess at the words from blocks of contrast — which
     * is the only option for a photograph and indefensible for a document,
     * because it throws away perfect data and replaces it with an
     * approximation of itself.
     *
     * The choice is made per PAGE, not per file: a report with a scanned
     * signature page is both.
     */
    const faithful: { page: DesignPage }[] = [];
    const guessed: { plan: ReferencePlan; assetId: string }[] = [];
    let linesRead = 0;

    for (const [index, page] of rendered.pages.entries()) {
      const source = new File([page.blob], 'page.png', { type: 'image/png' });
      const compressed = await compressImage(source);
      const path = assetPath(user.id, compressed.type || 'image/png');
      const { error } = await supabase.storage.from(STUDIO_BUCKET)
        .upload(path, compressed, { cacheControl: '3600', upsert: false });
      if (error) throw new Error(error.message);

      if (pageHasText(page)) {
        linesRead += page.lines.length;
        faithful.push({ page: faithfulPage(page, path, `Page ${index + 1}`) });
      } else {
        guessed.push({ plan: planReconstruction(page.pixels), assetId: path });
      }
    }

    const title = file.name.replace(/\.[^.]+$/, '').slice(0, 60) || 'Imported PDF';
    snapshot();

    if (faithful.length) {
      /*
       * Any page whose words were read leads. The reconstructed pages are
       * appended after it so a mixed file still opens whole, rather than
       * silently dropping whichever kind came second.
       */
      const rest = guessed.length ? documentFromPdf(guessed, title).pages : [];
      setDoc({
        schemaVersion: SCHEMA_VERSION,
        title,
        pages: [...faithful.map((f) => f.page), ...rest],
      });
    } else {
      setDoc(documentFromPdf(guessed, title));
    }

    setSelectedIds([]);
    setPageIndex(0);
    setProjectId(null);
    setSaveState('unsaved');

    toast.success(pdfSummary(
      faithful.length + guessed.length,
      rendered.pageCount,
      guessed.reduce((n, p) => n + p.plan.regions.length, 0),
      linesRead,
    ));
  };

  const onDesignChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const name = file.name.toLowerCase();
    if (name.endsWith('.pdf') || name.endsWith('.eps') || name.endsWith('.ai')) {
      setImporting(true);
      try {
        await importPdfFile(file);
      } catch (err) {
        toast.error(err instanceof Error ? `Could not open that file: ${err.message}` : 'Could not open that file.');
      } finally {
        setImporting(false);
      }
      return;
    }

    if (name.endsWith('.pptx')) {
      setImporting(true);
      try {
        await importDeck(file);
      } catch (err) {
        toast.error(err instanceof Error ? `Could not import that deck: ${err.message}` : 'Could not import that deck.');
      } finally {
        setImporting(false);
      }
      return;
    }

    if (!name.endsWith('.svg')) {
      toast.error('Import takes SVG, PowerPoint (.pptx), PDF, EPS and Illustrator files. A photograph of a design can be opened with "Recreate from a reference" instead.');
      return;
    }

    setImporting(true);
    try {
      const text = await file.text();
      const result = importSvg(text, (t) => new DOMParser().parseFromString(t, 'image/svg+xml'));
      if ('error' in result) { toast.error(result.error); return; }

      if (result.objects.length === 0) {
        toast.error('Nothing in that file could be made editable — it is all paths or grouped artwork.');
        return;
      }

      mutate((pg) => ({
        ...pg,
        objects: [...pg.objects, ...result.objects.map((ob, i) => ({ ...ob, z: topZ(pg) + i }))],
      }));
      setSelectedIds(result.objects.map((ob) => ob.id));
      toast.success(importSummary(result));
    } catch (err) {
      toast.error(err instanceof Error ? `Could not import that file: ${err.message}` : 'Could not import that file.');
    } finally {
      setImporting(false);
    }
  };

  /* ── images ──────────────────────────────────────────── */

  const fileInput = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  /** Set when the picker was opened to REPLACE a picture rather than add one. */
  const replacing = useRef<string | null>(null);

  const chooseImage = (replaceId: string | null) => {
    replacing.current = replaceId;
    fileInput.current?.click();
  };

  /**
   * The natural size, used only to place the picture without stretching it.
   *
   * A failure here is not a failure of the upload — placeImage copes with an
   * unknown size — so it returns zeros rather than throwing.
   */
  const measure = async (blob: Blob): Promise<{ width: number; height: number }> => {
    try {
      const bitmap = await createImageBitmap(blob);
      const size = { width: bitmap.width, height: bitmap.height };
      bitmap.close?.();
      return size;
    } catch {
      return { width: 0, height: 0 };
    }
  };

  /**
   * Put a picture in the design, however it arrived.
   *
   * One body for three doorways — the rail button, the replace button, and a
   * file dragged onto the canvas. They were going to diverge the moment the
   * third existed: the drop path needs a position and the picker path does
   * not, and that is the only difference between them.
   *
   * `replaceId` keeps an existing frame exactly where it is and swaps what
   * is inside it. `at` places a NEW picture under the pointer. They are
   * mutually exclusive by construction: you cannot replace a frame and also
   * choose where it goes.
   */
  const addImageFile = async (
    file: File,
    replaceId: string | null,
    at?: { x: number; y: number },
  ) => {
    /*
     * The bucket only accepts writes from a signed-in account, so saying this
     * here is the difference between an explanation and a failed upload.
     */
    if (!user) { toast.error('Sign in to put your own pictures in a design.'); return; }

    const check = checkImageFile(file);
    if (!check.ok) { toast.error(check.reason); return; }

    setUploading(true);
    try {
      const compressed = await compressImage(file);
      const natural = await measure(compressed);
      const path = assetPath(user.id, compressed.type || file.type);
      const { error } = await supabase.storage.from(STUDIO_BUCKET)
        .upload(path, compressed, { cacheControl: '3600', upsert: false });
      if (error) throw new Error(error.message);

      if (replaceId) {
        mutate((pg) => withObject(pg, replaceId, (ob) => ({ ...ob, assetId: path } as ImageObject)));
        toast.success('Picture replaced.');
        return;
      }

      const newId = objectId('i');
      mutate((pg) => ({
        ...pg,
        objects: [...pg.objects, {
          id: newId, type: 'image', name: file.name.replace(/\.[^.]+$/, '').slice(0, 40) || 'Image',
          /* Dropped pictures land under the pointer; picked ones are centred. */
          ...(at ? placeDroppedImage(natural, pg, at) : placeImage(natural, pg)),
          rotation: 0, opacity: 1, visible: true, locked: false, z: topZ(pg),
          assetId: path, fit: 'cover',
        } as ImageObject],
      }));
      setSelectedId(newId);
      toast.success('Picture added.');
    } catch (err) {
      toast.error(err instanceof Error ? `Could not add that picture: ${err.message}` : 'Could not add that picture.');
    } finally {
      setUploading(false);
    }
  };

  const onImageChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    /* Cleared immediately, or choosing the same file twice fires nothing. */
    e.target.value = '';
    const replaceId = replacing.current;
    replacing.current = null;
    if (!file) return;
    await addImageFile(file, replaceId);
  };

  /**
   * A picture dragged straight onto the design.
   *
   * Only the first is used. A multi-file drop onto a canvas has no obvious
   * meaning — five pictures stacked on one spot is not what anybody wanted —
   * and saying so is better than inventing a layout for them.
   */
  const onDropFiles = (files: File[], at: { x: number; y: number }, overImageId: string | null) => {
    const file = files[0];
    if (!file) return;
    if (files.length > 1) toast('Added the first picture. Drop them one at a time to place each.');
    void addImageFile(file, overImageId, overImageId ? undefined : at);
  };

  /* ── export ──────────────────────────────────────────────────────────── */

  /*
   * A hidden copy of the page, drawn by the same component as the canvas.
   *
   * It is captured instead of the live canvas for two reasons: the live one
   * carries a selection box and eight resize handles that must not appear in
   * a customer's file, and it is laid out at whatever width the screen gives
   * it, which would make the export size depend on the window. This node is
   * forced to the document's own width at capture time, so a 1080px design
   * produces a 1080px file from a phone and from a desktop alike.
   */
  const exportNodes = useRef<(HTMLDivElement | null)[]>([]);
  const [exporting, setExporting] = useState<'png' | 'pdf' | null>(null);

  const plan = useMemo(
    () => (doc && page ? describeExport(doc, page, 2) : null),
    [doc, page],
  );

  const exportPng = async () => {
    const node = exportNodes.current[safePageIndex];
    if (!node || !plan) return;
    setExporting('png');
    try {
      await downloadNodePng(node, plan.filename, {
        pixelRatio: plan.scale,
        designWidth: page?.width,
        backgroundColor: page?.background ?? '#ffffff',
      });
      /*
       * Says the size it actually produced. When the limit forced a smaller
       * file than the button offered, the message says so rather than letting
       * someone send a reduced image to a printer believing it is full size.
       */
      toast.success(plan.reduced
        ? `Saved ${plan.filename} at ${plan.label} — reduced so the file is not blank on mobile browsers.`
        : `Saved ${plan.filename} (${plan.label})`);
    } catch (e) {
      toast.error(e instanceof Error ? `Could not export: ${e.message}` : 'Could not export this design.');
    } finally {
      setExporting(null);
    }
  };

  /**
   * Every page, as pictures inside one PDF.
   *
   * Each page is captured and measured on its own terms, because pages in one
   * document may differ in size. See exportDesign.ts for what this PDF is and
   * is not — in short, it is an image PDF, not a prepress file.
   */
  const exportPdf = async () => {
    if (!doc) return;
    const sheets = pdfPlan(doc, doc.pages, 2);
    setExporting('pdf');
    try {
      const { jsPDF } = await import('jspdf');
      let pdf: InstanceType<typeof jsPDF> | null = null;

      for (let i = 0; i < doc.pages.length; i += 1) {
        const node = exportNodes.current[i];
        const sheet = sheets.pages[i];
        if (!node) throw new Error(`Page ${i + 1} was not ready to export.`);

        const dataUrl = await exportNodeToPng(node, {
          pixelRatio: sheet.scale,
          designWidth: doc.pages[i].width,
          backgroundColor: doc.pages[i].background ?? '#ffffff',
        });
        const format: [number, number] = [doc.pages[i].width, doc.pages[i].height];
        /*
         * `compress` is not optional in practice. Without it jsPDF stores each
         * page as raw bitmap: a two-page square design measured 27,341 kB
         * against 142 kB with it — 192 times larger, and far beyond what this
         * product's audience can send over mobile data or attach to an email.
         */
        if (!pdf) pdf = new jsPDF({ orientation: sheet.orientation, unit: 'px', format, compress: true });
        else pdf.addPage(format, sheet.orientation);
        pdf.addImage(dataUrl, 'PNG', 0, 0, format[0], format[1], undefined, 'FAST');
      }

      if (!pdf) throw new Error('There was nothing to export.');
      pdf.save(sheets.filename);
      toast.success(`Saved ${sheets.filename} — ${doc.pages.length} page${doc.pages.length === 1 ? '' : 's'}, images not print-ready artwork.`);
    } catch (e) {
      toast.error(e instanceof Error ? `Could not export the PDF: ${e.message}` : 'Could not export the PDF.');
    } finally {
      setExporting(null);
    }
  };

  /* ── saving ──────────────────────────────────────────────────────────── */

  const save = async (): Promise<boolean> => {
    if (!doc || !user) return false;
    setSaveState('saving');
    try {
      if (!projectId) {
        const { data, error } = await supabase.from('design_projects')
          .insert({ user_id: user.id, title: doc.title, document: doc, source_template_key: doc.sourceTemplateKey ?? null })
          .select('id, version').single();
        if (error) throw new Error(error.message);
        const savedId = (data as { id: string }).id;
        setProjectId(savedId);
        setVersion((data as { version: number }).version);
        /*
         * The address has to become the project's own.
         *
         * Until it did, a save left the browser on `?template=…`: reloading
         * started a brand new document from that template, the saved work was
         * unreachable from where the user was standing, and the next save
         * inserted a SECOND row. The work was never lost from the database,
         * which is exactly why nobody would have noticed.
         *
         * Replaced rather than pushed, so Back does not return to a stale
         * template URL that would open yet another copy.
         */
        navigate(withPlanReturn(`/media/studio/${savedId}`, params), { replace: true });
      } else {
        /*
         * Version-checked. Two tabs autosaving is how work disappears: the
         * function refuses a stale write and returns null rather than
         * overwriting whatever the other tab saved.
         */
        const { data, error } = await supabase.rpc('save_design_project', {
          p_id: projectId, p_document: doc, p_expected_version: version, p_title: doc.title, p_thumbnail_path: null,
        });
        if (error) throw new Error(error.message);
        if (data === null) {
          /*
           * Another tab or device holds something newer. This is NOT an
           * error to retry: retrying either fails forever or eventually wins
           * and overwrites work this tab cannot see.
           */
          setSaveState('conflict');
          toast.error('This design was saved somewhere else since you opened it. Reload to get the newer version.');
          return false;
        }
        setVersion(data as number);
      }
      setSaveState('saved');
      return true;
    } catch (e) {
      setSaveState('error');
      toast.error(e instanceof Error ? e.message : 'Could not save.');
      return false;
    }
  };

  /* ── attach to a media plan ──────────────────────────────────────────── */

  /*
   * Present only when Studio was opened from a plan line. Both ids are
   * validated as UUIDs (planReturn.ts) because they are written to the
   * database below.
   */
  const planReturn = useMemo(() => readPlanReturn(params), [params]);
  const [attaching, setAttaching] = useState(false);

  const attachToPlan = async () => {
    if (!planReturn || !user || !docRef.current || attaching) return;
    setAttaching(true);
    try {
      const needsSave = !projectIdRef.current || ['unsaved', 'error', 'conflict'].includes(saveState);
      if (needsSave && !(await save())) return;
      const current = docRef.current;
      const pg = current?.pages[0];
      const node = exportNodes.current[0];
      if (!current || !pg || !node) throw new Error('The design was not ready to export. Try again.');

      const dataUrl = await exportNodeToPng(node, {
        pixelRatio: describeExport(current, pg, 2).scale,
        designWidth: pg.width,
        backgroundColor: pg.background ?? '#ffffff',
      });
      /* Measured through an element, never by fetching the image back. */
      const size = await new Promise<{ w: number; h: number }>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
        img.onerror = () => reject(new Error('The exported image could not be read.'));
        img.src = dataUrl;
      });
      const blob = dataUrlToBlob(dataUrl);

      const up = await uploadLineArtworkBlob(
        planReturn.campaignId, planReturn.lineId, blob, `${current.title || 'design'}.png`,
      );
      if ('error' in up) throw new Error(up.error);
      const ok = await setLineArtwork(planReturn.lineId, {
        path: up.path, width: size.w, height: size.h, designId: projectIdRef.current,
      });
      if (!ok) throw new Error('The artwork uploaded but could not be attached to the plan line.');

      toast.success('Artwork attached.');
      navigate(planReturnPath(planReturn.campaignId));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not attach the artwork.');
    } finally {
      setAttaching(false);
    }
  };

  /* ── autosave ────────────────────────────────────────────────────────── */

  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);

  const autosave = autosaveDecision({ signedIn: !!user, projectId, state: saveState, online });

  /*
   * `save` is rebuilt on every render, so the timer reads it from a ref. Put
   * it in the effect's dependencies instead and any unrelated re-render would
   * restart the countdown — on a busy editor it would never reach the end,
   * and autosave would quietly never happen.
   */
  const saveRef = useRef(save);
  saveRef.current = save;

  useEffect(() => {
    if (!autosave.save) return undefined;
    const timer = setTimeout(() => { void saveRef.current(); }, AUTOSAVE_DELAY_MS);
    /* Each edit restarts the wait, so a sentence is one save and not forty. */
    return () => clearTimeout(timer);
  }, [autosave.save, doc]);

  /* Warn before losing work. Only when there is work to lose. */
  useEffect(() => {
    const atRisk: SaveState[] = ['unsaved', 'error', 'conflict'];
    if (!atRisk.includes(saveState)) return undefined;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [saveState]);

  const selected = useMemo(
    () => page?.objects.find((o) => o.id === selectedId) ?? null,
    [page, selectedId],
  );

  /* ── render ──────────────────────────────────────────────────────────── */

  if (loading) {
    return <div className="min-h-screen grid place-items-center"><Loader2 className="animate-spin text-gray-400" /></div>;
  }

  if (problem || !doc || !page) {
    return (
      <div className="min-h-screen grid place-items-center p-6">
        <div className="max-w-md text-center">
          <p className="text-sm text-gray-700 dark:text-gray-300">{problem ?? 'Nothing to edit.'}</p>
          <Link to="/media" className="mt-4 inline-block text-sm font-semibold text-blue-600">Back to NowOpen Create</Link>
        </div>
      </div>
    );
  }


  return (
    <div className="flex min-h-screen flex-col bg-slate-200/70 dark:bg-gray-950">
      <header className="sticky top-0 z-20 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <div className="flex items-center gap-2 px-3 py-2 flex-wrap">
          <Link to="/media" className="p-2 min-h-[44px] inline-flex items-center text-gray-500" aria-label="Back to NowOpen Create">
            <ArrowLeft size={18} />
          </Link>
          <input
            value={doc.title}
            onChange={(e) => { setDoc({ ...doc, title: e.target.value }); setSaveState('unsaved'); }}
            aria-label="Project title"
            className="min-w-0 flex-1 rounded-lg px-2 py-1.5 text-sm font-semibold bg-transparent text-gray-900 dark:text-white focus:bg-gray-50 dark:focus:bg-gray-800 outline-none"
          />
          {/*
            * Says what is true. "Saved" never appears before the write came
            * back, because a save indicator that lies is worse than none.
            */}
          <span
            title={autosave.reason}
            className={`text-[11px] ${saveState === 'error' || saveState === 'conflict' ? 'text-rose-600' : 'text-gray-500'}`}
          >
            {SAVE_LABEL[saveState]}
          </span>
          <button onClick={undo} disabled={steps.back === 0} aria-label="Undo" className="p-2 min-h-[44px] text-gray-600 dark:text-gray-300 disabled:opacity-30"><Undo2 size={16} /></button>
          <button onClick={redo} disabled={steps.forward === 0} aria-label="Redo" className="p-2 min-h-[44px] text-gray-600 dark:text-gray-300 disabled:opacity-30"><Redo2 size={16} /></button>
          <button
            onClick={() => void exportPng()}
            disabled={exporting !== null}
            title={plan ? `PNG of this page, ${plan.label}` : undefined}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 min-h-[44px] text-sm font-semibold disabled:opacity-50"
          >
            {exporting === 'png' ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} PNG
          </button>
          {/*
            * Labelled "image PDF" on purpose. The pages are pictures: no
            * selectable text, no embedded fonts, no CMYK and no bleed. A
            * printer discovers that, not the customer after paying.
            */}
          <button
            onClick={() => void exportPdf()}
            disabled={exporting !== null}
            title="Every page in one PDF. The pages are images, not print-ready artwork."
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 min-h-[44px] text-sm font-semibold disabled:opacity-50"
          >
            {exporting === 'pdf' ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />} image PDF
          </button>
          {user ? (
            <button
              onClick={() => void save()}
              disabled={saveState === 'saving'}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 min-h-[44px] text-sm font-bold text-white disabled:opacity-50"
            >
              {saveState === 'saving' ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save
            </button>
          ) : (
            <Link to={`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`}
              className="rounded-lg bg-blue-600 px-3 min-h-[44px] inline-flex items-center text-sm font-bold text-white">
              Sign in to save
            </Link>
          )}
        </div>
      </header>

      {planReturn && user && (
        <div className="flex flex-wrap items-center gap-3 border-b border-blue-200 bg-blue-50 px-3 py-2 dark:border-blue-900 dark:bg-blue-950">
          <p className="min-w-0 flex-1 text-sm font-semibold text-blue-900 dark:text-blue-100">Making artwork for your plan</p>
          <button
            onClick={() => void attachToPlan()}
            disabled={attaching}
            style={{ minHeight: 44 }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 text-sm font-bold text-white disabled:opacity-50"
          >
            {attaching && <Loader2 size={14} className="animate-spin" />} Attach to plan
          </button>
        </div>
      )}

      {/*
        * Off-screen, not hidden. html-to-image can only capture a node the
        * browser has actually laid out, so `display: none` or `visibility:
        * hidden` would produce an empty file.
        */}
      <div aria-hidden style={{ position: 'fixed', top: 0, left: -20000, pointerEvents: 'none' }}>
        {doc.pages.map((pg, i) => (
          <div key={pg.id} style={{ width: pg.width }}>
            <DesignSurface
              ref={(el) => { exportNodes.current[i] = el; }}
              page={pg}
              accent={doc.accent ?? '#4f46e5'}
            />
          </div>
        ))}
      </div>

      {/*
        * Full width, and a column that owns the rest of the height. The old
        * layout was capped at a fixed maximum, so on a wide screen most of
        * the desk was empty while the design itself stayed small.
        */}
      <div className="flex min-h-0 flex-1 flex-col gap-3 p-3 lg:flex-row lg:gap-4 lg:p-4">
        {/*
          * The tool rail.
          *
          * These were a horizontal row above the canvas. On a screen where
          * the design is limited by HEIGHT — which is every desktop — a row
          * is 40px taken directly out of the thing being designed, while the
          * column beside it had room to spare. Standing them up costs
          * nothing and gives it back.
          *
          * It runs along the top on a phone, where width is the scarce axis
          * instead, and scrolls rather than hiding anything.
          */}
        <div className="flex shrink-0 flex-row gap-1 overflow-x-auto rounded-xl border border-gray-200 bg-white p-1 dark:border-gray-800 dark:bg-gray-900 lg:flex-col lg:overflow-visible [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <RailButton onClick={addText} icon={Type} label="Add text" />
          <div className="relative">
            <RailButton onClick={() => setShapeMenu((v) => !v)} icon={Square} label="Add a shape" />
            {shapeMenu && (
              <div
                className="absolute left-full top-0 z-30 ml-1 w-56 rounded-xl border border-gray-200 bg-white p-1 shadow-lg dark:border-gray-700 dark:bg-gray-900"
                role="menu"
              >
                {SHAPE_CHOICES.map((choice) => (
                  <button
                    key={choice.kind}
                    type="button"
                    role="menuitem"
                    onClick={() => addShape(choice.kind)}
                    className="block w-full rounded-lg px-2.5 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-800"
                  >
                    <span className="block text-xs font-semibold text-gray-900 dark:text-gray-100">{choice.label}</span>
                    <span className="block text-[11px] text-gray-500">{choice.hint}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <RailButton onClick={() => chooseImage(null)} disabled={uploading} busy={uploading} icon={ImagePlus} label="Add picture" />
          <RailButton
            onClick={() => referenceInput.current?.click()}
            disabled={recreating}
            busy={recreating}
            icon={Wand2}
            label="Recreate from a reference"
          />
          <RailButton
            onClick={() => importInput.current?.click()}
            disabled={importing}
            busy={importing}
            icon={FileUp}
            label="Import a design: SVG, PowerPoint, PDF or EPS"
          />
          <input
            ref={importInput}
            type="file"
            accept=".svg,.pptx,.pdf,.eps,.ai,image/svg+xml,application/pdf,application/postscript,application/vnd.openxmlformats-officedocument.presentationml.presentation"
            onChange={(e) => void onDesignChosen(e)}
            className="hidden"
          />

          <span aria-hidden className="my-0.5 hidden h-px w-full bg-gray-200 dark:bg-gray-800 lg:block" />

          <RailButton onClick={duplicate} disabled={!selected} icon={Copy} label="Duplicate" />
          <RailButton onClick={onGroup} disabled={selectedIds.length < 2 || !!selectedGroup} icon={Group} label="Group" />
          <RailButton onClick={onUngroup} disabled={!selectedGroup} icon={Ungroup} label="Ungroup" />
          <RailButton onClick={remove} disabled={selectedIds.length === 0} icon={Trash2} label="Delete" danger />

            <input
              ref={fileInput}
              type="file"
              accept={ACCEPTED_IMAGE_TYPES.join(',')}
              onChange={(e) => void onImageChosen(e)}
              className="hidden"
            />
            <input
              ref={referenceInput}
              type="file"
              accept={ACCEPTED_IMAGE_TYPES.join(',')}
              onChange={(e) => void onReferenceChosen(e)}
              className="hidden"
            />
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {/*
            * One scrolling row on a phone, wrapping only from `sm` up.
            *
            * MEASURED on a 375x812 screen: wrapped, these buttons took 134px
            * and left the canvas 44% of the display. The brief asks for a
            * practical editing experience on a phone rather than a dense
            * desktop one squeezed onto it, and the first thing a phone needs
            * is for the design itself to be big enough to work on. Nothing is
            * hidden here — the row scrolls.
            */}

          {/*
            * Pages.
            *
            * Shown whenever the document has more than one, and always
            * reachable through "Add page" — a single-page design should not
            * have to look at a page strip it is not using.
            */}
          <div className="mt-2 sm:mt-3 flex items-center gap-2 overflow-x-auto flex-nowrap pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:flex-wrap sm:overflow-visible sm:pb-0">
            {doc.pages.length > 1 && (
              <div className="flex items-center gap-1 flex-wrap">
                {doc.pages.map((pg, i) => (
                  <button
                    key={pg.id}
                    onClick={() => setPageIndex(i)}
                    aria-current={i === safePageIndex}
                    className={`rounded-lg border px-2 min-h-[36px] text-[11px] font-semibold ${
                      i === safePageIndex
                        ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
                        : 'border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900'
                    }`}
                  >
                    {pageLabel(pg, i)}
                  </button>
                ))}
              </div>
            )}
            <button onClick={onAddPage} className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 min-h-[36px] text-[11px] font-semibold">
              <Plus size={12} /> Add page
            </button>
            <button onClick={onDuplicatePage} className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 min-h-[36px] text-[11px] font-semibold">
              <Files size={12} /> Duplicate page
            </button>
            <button
              onClick={onRemovePage}
              disabled={!doc || !canRemovePage(doc, safePageIndex)}
              title={doc.pages.length <= 1 ? 'A design must keep at least one page.' : undefined}
              className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 min-h-[36px] text-[11px] font-semibold text-rose-600 disabled:opacity-40"
            >
              <FileX size={12} /> Delete page
            </button>
            {doc.pages.length > 1 && (
              <>
                <button onClick={() => onMovePage(safePageIndex - 1)} disabled={safePageIndex === 0} aria-label="Move page earlier" className="shrink-0 grid h-9 w-9 place-items-center rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 disabled:opacity-30">
                  <ChevronUp size={13} className="-rotate-90" />
                </button>
                <button onClick={() => onMovePage(safePageIndex + 1)} disabled={safePageIndex === doc.pages.length - 1} aria-label="Move page later" className="shrink-0 grid h-9 w-9 place-items-center rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 disabled:opacity-30">
                  <ChevronDown size={13} className="-rotate-90" />
                </button>
              </>
            )}
            {/* One control bar instead of two.
                MEASURED: the zoom row cost the preview 48px of height on a
                desktop, where the canvas is limited by height, not width —
                so a row removed is a bigger design, not just a tidier page. */}
            <span aria-hidden className="shrink-0 mx-1 h-6 w-px bg-gray-200 dark:bg-gray-700" />

            <button onClick={() => zoomBy(-1)} disabled={zoom <= ZOOM_STEPS[0]} aria-label="Zoom out"
              className="shrink-0 grid h-9 w-9 place-items-center rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 disabled:opacity-30">
              <ZoomOut size={14} />
            </button>
            <span className="shrink-0 min-w-[3.5rem] text-center text-[11px] font-semibold text-gray-600 dark:text-gray-300">
              {Math.round(zoom * 100)}%
            </span>
            <button onClick={() => zoomBy(1)} disabled={zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1]} aria-label="Zoom in"
              className="shrink-0 grid h-9 w-9 place-items-center rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 disabled:opacity-30">
              <ZoomIn size={14} />
            </button>
            <button onClick={() => setZoom(1)} disabled={zoom === 1} aria-label="Fit the canvas"
              className="shrink-0 grid h-9 w-9 place-items-center rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 disabled:opacity-30">
              <Maximize2 size={14} />
            </button>

            <div className="relative ml-auto">
              <button
                onClick={() => setSizeOpen((v) => !v)}
                aria-expanded={sizeOpen}
                className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 min-h-[36px] text-[11px] font-semibold"
              >
                <Ruler size={13} /> {page.width} × {page.height} px
              </button>

              {sizeOpen && (
                <div className="absolute right-0 z-30 mt-1 max-h-[70vh] w-[320px] overflow-y-auto rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3 shadow-xl">
                  {/*
                    * Said plainly: these are sizes in common use, written
                    * down here. They are not read from any platform's API,
                    * and a network can change its specification tomorrow —
                    * which is exactly why the custom fields are not an
                    * afterthought at the bottom of the list.
                    */}
                  <p className="text-[11px] text-gray-500">
                    Common sizes, and your own. Platforms change their specifications, so check
                    anything critical against the platform or your printer.
                  </p>

                  <div className="mt-3 rounded-lg border border-gray-200 dark:border-gray-800 p-2">
                    <p className="text-[11px] font-semibold text-gray-700 dark:text-gray-200">When the shape changes</p>
                    <div className="mt-1 flex gap-1">
                      {([['fit', 'Keep proportions'], ['stretch', 'Fill the new page']] as [RefitMode, string][]).map(([mode, label]) => (
                        <button
                          key={mode}
                          onClick={() => setRefitMode(mode)}
                          aria-pressed={refitMode === mode}
                          className={`flex-1 rounded-lg border px-2 min-h-[32px] text-[11px] font-semibold ${
                            refitMode === mode
                              ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
                              : 'border-gray-300 dark:border-gray-700'
                          }`}
                        >
                          {refitMode === mode ? <Check size={11} className="inline mr-1" /> : null}{label}
                        </button>
                      ))}
                    </div>
                    <p className="mt-1 text-[10px] leading-snug text-gray-500">
                      {refitMode === 'fit'
                        ? 'Nothing is distorted; there will be space to fill along the longer side.'
                        : 'Everything keeps its share of the page, so shapes change with it.'}
                    </p>
                  </div>

                  <div className="mt-3 rounded-lg border border-gray-200 dark:border-gray-800 p-2">
                    <p className="text-[11px] font-semibold text-gray-700 dark:text-gray-200">Your own size</p>
                    <div className="mt-1 flex items-center gap-1">
                      <input
                        value={customW} onChange={(e) => setCustomW(e.target.value)}
                        inputMode="decimal" placeholder="Width" aria-label="Custom width"
                        className="w-0 flex-1 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1.5 text-xs"
                      />
                      <span className="text-[11px] text-gray-400">×</span>
                      <input
                        value={customH} onChange={(e) => setCustomH(e.target.value)}
                        inputMode="decimal" placeholder="Height" aria-label="Custom height"
                        className="w-0 flex-1 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1.5 text-xs"
                      />
                      <select
                        value={unit} onChange={(e) => setUnit(e.target.value as Unit)} aria-label="Unit"
                        className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-1 py-1.5 text-xs"
                      >
                        <option value="px">px</option>
                        <option value="mm">mm</option>
                        <option value="cm">cm</option>
                        <option value="in">in</option>
                      </select>
                    </div>
                    {unit !== 'px' && (
                      <label className="mt-1 flex items-center gap-2 text-[10px] text-gray-500">
                        Resolution
                        <input
                          type="number" min={72} max={600} value={dpi}
                          onChange={(e) => setDpi(Math.min(600, Math.max(72, Number(e.target.value) || PRINT_DPI)))}
                          aria-label="Resolution in dots per inch"
                          className="w-16 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-1 py-1 text-[11px]"
                        />
                        dpi — 300 is the usual minimum for printing
                      </label>
                    )}
                    <button
                      onClick={applyCustomSize}
                      className="mt-2 w-full rounded-lg bg-blue-600 px-2 min-h-[32px] text-[11px] font-bold text-white"
                    >
                      Use this size
                    </button>
                  </div>

                  {PRESET_GROUPS.map((group) => (
                    <div key={group} className="mt-3">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{group}</p>
                      <div className="mt-1 space-y-0.5">
                        {PRESETS.filter((preset) => preset.group === group).map((preset) => {
                          const size = presetPixels(preset);
                          const current = size.width === page.width && size.height === page.height;
                          return (
                            <button
                              key={preset.id}
                              onClick={() => applySize(size.width, size.height)}
                              title={preset.note}
                              className={`flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-[11px] ${
                                current ? 'bg-blue-50 font-semibold text-blue-700 dark:bg-blue-950/40 dark:text-blue-300' : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                              }`}
                            >
                              <span className="min-w-0 truncate">{preset.label}</span>
                              <span className="shrink-0 text-[10px] text-gray-400">
                                {describeSize(size.width, size.height, preset.unit, preset.dpi)}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>


          {/*
            * Scrolls when zoomed in; that scrolling IS the pan. DesignSurface
            * declares its own container, so `cqw` still means "of this page"
            * at any zoom and the type scales with the canvas.
            */}
          <div
            ref={stageRef}
            className="flex min-h-0 flex-1 items-start justify-center overflow-auto"
          >
            <div style={{ width: canvasWidth ? `${canvasWidth}px` : '100%' }}>
            <DesignCanvas
              onDropFiles={onDropFiles}
              page={page}
              selectedIds={selectedIds}
              onSelect={onCanvasSelect}
              onChange={setPage}
              onGestureStart={snapshot}
              onCommit={commit}
              accent={doc.accent ?? '#4f46e5'}
            />
            </div>
          </div>

          {/*
            Say what you want changed, in words.

            Under the canvas rather than in the right-hand panel: it is about
            the design, not about the selected object's properties, and a
            person reaches for it while looking at the artwork.
          */}
          {/*
            Behind an operator switch, like every other surface.

            `isEnabled` answers true for a flag that has not been created
            yet, so an older database does not silently remove a working
            feature — the failure mode of a typo is a bar that stays, not
            one that disappears with no error anywhere.
          */}
          {isEnabled(flags, 'editor_prompt') && (
            <PromptComposer
              page={page}
              selectedId={selectedIds.length === 1 ? selectedIds[0] : null}
              onApply={runPatch}
              onVariant={runVariant}
            />
          )}
        </div>

        <aside className="w-full shrink-0 overflow-y-auto rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3 lg:w-[320px]">
          {/*
            * The page itself: what sits behind the design.
            *
            * Above Properties because it applies with nothing selected — a
            * control you can only reach by first selecting an object is a
            * control for something else.
            */}
          <section className="mb-3 rounded-lg border border-gray-200 dark:border-gray-800 p-2">
            <h2 className="text-xs font-bold uppercase tracking-wide text-gray-500">Background</h2>

            <div className="mt-2 flex items-center gap-2">
              <label className="flex-1">
                <span className="block text-[11px] text-gray-500 mb-1">Colour</span>
                <input
                  type="color"
                  value={safeColour(page.background) ?? '#ffffff'}
                  onChange={(e) => mutate((pg) => ({ ...pg, background: safeColour(e.target.value) ?? '#ffffff' }))}
                  aria-label="Page colour"
                  className="h-[34px] w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800"
                />
              </label>
              <button
                onClick={() => backgroundInput.current?.click()}
                disabled={bgBusy}
                className="mt-4 inline-flex items-center gap-1 rounded-lg border border-gray-300 dark:border-gray-700 px-2 min-h-[34px] text-[11px] font-semibold disabled:opacity-40"
              >
                {bgBusy ? <Loader2 size={12} className="animate-spin" /> : <ImagePlus size={12} />} Upload
              </button>
              <input
                ref={backgroundInput}
                type="file"
                accept={ACCEPTED_IMAGE_TYPES.join(',')}
                onChange={(e) => void onBackgroundChosen(e)}
                className="hidden"
              />
            </div>

            <div className="mt-2 flex items-center gap-1">
              <input
                value={bgUrl}
                onChange={(e) => setBgUrl(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') applyBackgroundUrl(); }}
                placeholder="Paste an image or video link"
                aria-label="Background image or video link"
                className="min-w-0 flex-1 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1.5 text-[11px]"
              />
              <button
                onClick={applyBackgroundUrl}
                disabled={!bgUrl.trim()}
                className="shrink-0 rounded-lg border border-gray-300 dark:border-gray-700 px-2 min-h-[32px] text-[11px] font-semibold disabled:opacity-40"
              >
                Use
              </button>
            </div>

            {page.backgroundMedia?.assetId && (
              <div className="mt-2 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[11px] text-gray-500">
                    {page.backgroundMedia.kind === 'video' ? 'Video' : 'Image'} background
                  </span>
                  <button
                    onClick={() => setBackgroundMedia(null)}
                    aria-label="Remove the background media"
                    className="inline-flex items-center gap-1 rounded-lg border border-gray-300 dark:border-gray-700 px-2 min-h-[30px] text-[11px] font-semibold"
                  >
                    <X size={11} /> Remove
                  </button>
                </div>

                <label className="block">
                  <span className="flex items-center justify-between text-[11px] text-gray-500 mb-1">
                    Darken <span>{Math.round(clampDim(page.backgroundMedia.dim ?? 0) * 100)}%</span>
                  </span>
                  {/* So words stay readable on a photograph. */}
                  <input
                    type="range" min={0} max={90} step={5}
                    value={Math.round(clampDim(page.backgroundMedia.dim ?? 0) * 100)}
                    onChange={(e) => mutate((pg) => (pg.backgroundMedia
                      ? { ...pg, backgroundMedia: { ...pg.backgroundMedia, dim: clampDim(Number(e.target.value) / 100) } }
                      : pg))}
                    aria-label="Darken the background"
                    className="w-full"
                  />
                </label>

                <div className="flex gap-1">
                  {(['cover', 'contain'] as const).map((fit) => (
                    <button
                      key={fit}
                      onClick={() => mutate((pg) => (pg.backgroundMedia ? { ...pg, backgroundMedia: { ...pg.backgroundMedia, fit } } : pg))}
                      aria-pressed={(page.backgroundMedia?.fit ?? 'cover') === fit}
                      className={`flex-1 rounded-lg border px-2 min-h-[30px] text-[11px] font-semibold ${
                        (page.backgroundMedia?.fit ?? 'cover') === fit
                          ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
                          : 'border-gray-300 dark:border-gray-700'
                      }`}
                    >
                      {fit === 'cover' ? 'Fill' : 'Fit inside'}
                    </button>
                  ))}
                </div>

                {/*
                  * Said BEFORE the export, not discovered after it. A playing
                  * video is not DOM, so the rasteriser cannot see it.
                  */}
                {exportNote(page.backgroundMedia) && (
                  <p className="flex gap-1.5 rounded-lg bg-amber-50 p-2 text-[10px] leading-snug text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                    <AlertTriangle size={12} className="mt-px shrink-0" />
                    {exportNote(page.backgroundMedia)}
                  </p>
                )}
              </div>
            )}
          </section>

          <h2 className="text-xs font-bold uppercase tracking-wide text-gray-500">Properties</h2>
          {selectedIds.length > 1 ? (
            <div className="mt-2">
              {/*
                * Aligning and distributing, offered only when there is more
                * than one object to align. Shown greyed-out with one selected
                * it would be a control that cannot work, and distributing
                * needs three — with two, the ends are already the ends.
                */}
              {selectedIds.length > 1 && (
                <div className="space-y-2">
                  <p className="text-[11px] text-gray-500">{selectedIds.length} objects selected</p>
                  <div className="flex flex-wrap gap-1">
                    {([
                      ['left', AlignStartVertical, 'Align left'],
                      ['centre', AlignCenterVertical, 'Align centres'],
                      ['right', AlignEndVertical, 'Align right'],
                      ['top', AlignStartHorizontal, 'Align tops'],
                      ['middle', AlignCenterHorizontal, 'Align middles'],
                      ['bottom', AlignEndHorizontal, 'Align bottoms'],
                    ] as [Align, typeof AlignStartVertical, string][]).map(([how, Icon, label]) => (
                      <button
                        key={how}
                        onClick={() => mutate((pg) => alignObjects(pg, selectedIds, how))}
                        aria-label={label}
                        title={label}
                        className="grid h-9 w-9 place-items-center rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900"
                      >
                        <Icon size={14} />
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => mutate((pg) => distributeObjects(pg, selectedIds, 'h'))}
                      disabled={selectedIds.length < 3}
                      title={selectedIds.length < 3 ? 'Select three or more to space them evenly.' : undefined}
                      className="flex-1 rounded-lg border border-gray-300 dark:border-gray-700 px-2 min-h-[36px] text-[11px] font-semibold disabled:opacity-40"
                    >
                      Space across
                    </button>
                    <button
                      onClick={() => mutate((pg) => distributeObjects(pg, selectedIds, 'v'))}
                      disabled={selectedIds.length < 3}
                      title={selectedIds.length < 3 ? 'Select three or more to space them evenly.' : undefined}
                      className="flex-1 rounded-lg border border-gray-300 dark:border-gray-700 px-2 min-h-[36px] text-[11px] font-semibold disabled:opacity-40"
                    >
                      Space down
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : !selected ? (
            <p className="mt-2 text-xs text-gray-500">
              Select something on the canvas. Hold Shift to select more than one.
            </p>
          ) : (
            <div className="mt-2 space-y-3">
              <label className="block">
                <span className="block text-[11px] text-gray-500 mb-1">Name</span>
                <input
                  value={selected.name}
                  onChange={(e) => mutate((pg) => renameLayer(pg, selected.id, e.target.value))}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1.5 text-xs font-semibold"
                />
              </label>

              {selected.type === 'text' && (
                <label className="block">
                  <span className="block text-[11px] text-gray-500 mb-1">Text</span>
                  <textarea
                    value={(selected as TextObject).text}
                    onChange={(e) => mutate((p) => withObject(p, selected.id, (o) => ({ ...o, text: e.target.value } as TextObject)))}
                    rows={3}
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1.5 text-xs"
                  />
                </label>
              )}

              {/*
                Shape properties, which did not exist.

                A shape could be added and then never changed: no fill, no
                corner radius, no stroke anywhere in the editor, though the
                renderer drew all three. An ellipse is already fully round,
                so it is not offered a radius that would do nothing.
              */}
              {selected.type === 'shape' && (
                <div className="space-y-2.5">
                  <label className="block">
                    <span className="block text-[11px] text-gray-500 mb-1">Fill</span>
                    <input
                      type="color"
                      value={(selected as ShapeObject).fill ?? '#4f46e5'}
                      onChange={(e) => mutate((pg) => withObject(pg, selected.id, (ob) => ({ ...ob, fill: e.target.value } as ShapeObject)))}
                      className="h-9 w-full cursor-pointer rounded-lg border border-gray-300 bg-white dark:border-gray-700 dark:bg-gray-800"
                    />
                  </label>

                  {supportsRadius(selected as ShapeObject) && (
                    <label className="block">
                      <span className="block text-[11px] text-gray-500 mb-1">Corner rounding</span>
                      <input
                        type="range" min={0} max={50} step={1}
                        value={Math.round(((selected as ShapeObject).radius ?? 0) * 100)}
                        onChange={(e) => mutate((pg) => withObject(pg, selected.id, (ob) => ({ ...ob, radius: clampRadius(Number(e.target.value) / 100) } as ShapeObject)))}
                        className="w-full"
                      />
                    </label>
                  )}

                  <label className="block">
                    <span className="block text-[11px] text-gray-500 mb-1">Outline</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={(selected as ShapeObject).stroke ?? '#111827'}
                        onChange={(e) => mutate((pg) => withObject(pg, selected.id, (ob) => ({ ...ob, stroke: e.target.value } as ShapeObject)))}
                        className="h-9 w-12 shrink-0 cursor-pointer rounded-lg border border-gray-300 bg-white dark:border-gray-700 dark:bg-gray-800"
                      />
                      <input
                        type="range" min={0} max={20} step={1}
                        value={Math.round(((selected as ShapeObject).strokeWidth ?? 0) * 1000)}
                        /*
                          Thickness alone draws nothing.

                          DesignSurface only emits a border when `stroke` is
                          set, so a new shape — which has no stroke colour —
                          ignored this slider completely. MEASURED in the
                          browser: dragging it to 10 left borderWidth at 0px.
                          Raising the thickness therefore sets a colour too,
                          so the control does the thing it appears to do.
                        */
                        onChange={(e) => mutate((pg) => withObject(pg, selected.id, (ob) => {
                          const width = clampStroke(Number(e.target.value) / 1000);
                          const shape = ob as ShapeObject;
                          return {
                            ...shape,
                            strokeWidth: width,
                            stroke: width > 0 ? (shape.stroke ?? '#111827') : shape.stroke,
                          } as ShapeObject;
                        }))}
                        className="w-full"
                        aria-label="Outline thickness"
                      />
                    </div>
                    {/* Zero thickness is how you remove an outline, so say so. */}
                    <span className="mt-1 block text-[11px] text-gray-400">
                      Slide to nothing for no outline.
                    </span>
                  </label>
                </div>
              )}

              {selected.type === 'image' && (
                <div className="space-y-2">
                  <label className="block">
                    <span className="block text-[11px] text-gray-500 mb-1">How it fills its box</span>
                    <select
                      value={(selected as ImageObject).fit ?? 'cover'}
                      onChange={(e) => mutate((pg) => withObject(pg, selected.id, (ob) => ({ ...ob, fit: e.target.value } as ImageObject)))}
                      className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1.5 text-xs"
                    >
                      {/* Both keep the picture in proportion; neither stretches it. */}
                      <option value="cover">Fill the box (crops)</option>
                      <option value="contain">Fit inside (shows all of it)</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="block text-[11px] text-gray-500 mb-1">Corner rounding</span>
                    <input
                      type="range" min={0} max={50} step={1}
                      value={Math.round(((selected as ImageObject).radius ?? 0) * 100)}
                      onChange={(e) => mutate((pg) => withObject(pg, selected.id, (ob) => ({ ...ob, radius: Number(e.target.value) / 100 } as ImageObject)))}
                      className="w-full"
                    />
                  </label>
                  <button
                    onClick={() => chooseImage(selected.id)}
                    disabled={uploading}
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-700 px-2 min-h-[36px] text-xs font-semibold disabled:opacity-40"
                  >
                    Replace picture
                  </button>
                </div>
              )}

              {/*
                * Position and size in whole percents. Pixels would be a lie:
                * the document is normalised so one design renders at any
                * output size.
                */}
              {selected.type === 'text' && (
                <div className="space-y-2 rounded-lg border border-gray-200 dark:border-gray-800 p-2">
                  <p className="text-[11px] font-semibold text-gray-700 dark:text-gray-200">Type</p>

                  <label className="block">
                    <span className="block text-[11px] text-gray-500 mb-1">Typeface</span>
                    <select
                      value={(selected as TextObject).font ?? 'sans'}
                      onChange={(e) => {
                        const font = e.target.value as FontKey;
                        mutate((pg) => withObject(pg, selected.id, (ob) => ({
                          ...ob,
                          font,
                          /* Snap to a weight this face really ships. */
                          weight: resolveWeight(font, (ob as TextObject).weight ?? 600),
                        } as TextObject)));
                      }}
                      className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1.5 text-xs"
                    >
                      {FONT_CHOICES.map((face) => (
                        <option key={face.key} value={face.key} title={face.voice}>{face.label}</option>
                      ))}
                    </select>
                  </label>

                  <div className="grid grid-cols-2 gap-2">
                    <label className="block">
                      <span className="block text-[11px] text-gray-500 mb-1">Weight</span>
                      <select
                        value={resolveWeight((selected as TextObject).font, (selected as TextObject).weight ?? 600)}
                        onChange={(e) => mutate((pg) => withObject(pg, selected.id, (ob) => ({ ...ob, weight: Number(e.target.value) } as TextObject)))}
                        className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1.5 text-xs"
                      >
                        {/* Only the weights this face has — the rest would be synthesised. */}
                        {weightsFor((selected as TextObject).font).map((w) => (
                          <option key={w} value={w}>{w}</option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="block text-[11px] text-gray-500 mb-1">Colour</span>
                      <input
                        type="color"
                        value={safeColour((selected as TextObject).colour) ?? '#111827'}
                        onChange={(e) => mutate((pg) => withObject(pg, selected.id, (ob) => ({ ...ob, colour: safeColour(e.target.value) } as TextObject)))}
                        className="h-[34px] w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800"
                        aria-label="Text colour"
                      />
                    </label>
                  </div>

                  <label className="block">
                    <span className="flex items-center justify-between text-[11px] text-gray-500 mb-1">
                      Size <span>{sizeToPercent((selected as TextObject).size)}% of the page</span>
                    </span>
                    <input
                      type="range" min={0.8} max={40} step={0.1}
                      value={sizeToPercent((selected as TextObject).size)}
                      onChange={(e) => mutate((pg) => withObject(pg, selected.id, (ob) => ({ ...ob, size: percentToSize(Number(e.target.value)) } as TextObject)))}
                      className="w-full"
                      aria-label="Text size"
                    />
                  </label>

                  <div className="grid grid-cols-2 gap-2">
                    <label className="block">
                      <span className="block text-[11px] text-gray-500 mb-1">Letter spacing</span>
                      <input
                        type="range" min={-10} max={50} step={1}
                        value={Math.round(((selected as TextObject).tracking ?? 0) * 100)}
                        onChange={(e) => mutate((pg) => withObject(pg, selected.id, (ob) => ({ ...ob, tracking: clampTracking(Number(e.target.value) / 100) } as TextObject)))}
                        className="w-full"
                        aria-label="Letter spacing"
                      />
                    </label>
                    <label className="block">
                      <span className="block text-[11px] text-gray-500 mb-1">Line height</span>
                      <input
                        type="range" min={70} max={300} step={5}
                        value={Math.round(((selected as TextObject).lineHeight ?? 1.1) * 100)}
                        onChange={(e) => mutate((pg) => withObject(pg, selected.id, (ob) => ({ ...ob, lineHeight: clampLineHeight(Number(e.target.value) / 100) } as TextObject)))}
                        className="w-full"
                        aria-label="Line height"
                      />
                    </label>
                  </div>

                  <div className="flex gap-1">
                    {(['left', 'center', 'right'] as const).map((how) => (
                      <button
                        key={how}
                        onClick={() => mutate((pg) => withObject(pg, selected.id, (ob) => ({ ...ob, align: how } as TextObject)))}
                        aria-label={`Align text ${how}`}
                        aria-pressed={((selected as TextObject).align ?? 'left') === how}
                        className={`flex-1 rounded-lg border px-2 min-h-[32px] text-[11px] font-semibold ${
                          ((selected as TextObject).align ?? 'left') === how
                            ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
                            : 'border-gray-300 dark:border-gray-700'
                        }`}
                      >
                        {how === 'center' ? 'Centre' : how === 'left' ? 'Left' : 'Right'}
                      </button>
                    ))}
                    <button
                      onClick={() => mutate((pg) => withObject(pg, selected.id, (ob) => ({ ...ob, upper: !(ob as TextObject).upper } as TextObject)))}
                      aria-pressed={!!(selected as TextObject).upper}
                      aria-label="Capitals"
                      className={`rounded-lg border px-2 min-h-[32px] text-[11px] font-bold ${
                        (selected as TextObject).upper
                          ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
                          : 'border-gray-300 dark:border-gray-700'
                      }`}
                    >
                      AA
                    </button>
                  </div>
                </div>
              )}

              {/*
                * Transparency, for any object. Fully transparent is allowed —
                * it is a reasonable way to park a layer — which is why the
                * layers list shows every object whatever its opacity, so an
                * invisible one can still be found and brought back.
                */}
              <label className="block">
                <span className="flex items-center justify-between text-[11px] uppercase text-gray-500 mb-1">
                  Opacity <span className="normal-case">{opacityToPercent(selected.opacity)}%</span>
                </span>
                <input
                  type="range" min={0} max={100} step={1}
                  value={opacityToPercent(selected.opacity)}
                  onChange={(e) => mutate((pg) => withObject(pg, selected.id, (ob) => ({ ...ob, opacity: percentToOpacity(Number(e.target.value)) })))}
                  className="w-full"
                  aria-label="Opacity"
                />
              </label>

              {/*
                * Rotation by number as well as by handle. A control that can
                * only be reached by dragging cannot be reached by keyboard at
                * all, and this editor is meant to be operable without a mouse.
                */}
              <label className="block">
                <span className="block text-[11px] uppercase text-gray-500 mb-1">Rotation</span>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={0} max={359} step={1}
                    value={Math.round(selected.rotation ?? 0)}
                    onChange={(e) => mutate((pg) => withObject(pg, selected.id, (ob) => ({ ...ob, rotation: Number(e.target.value) })))}
                    className="min-w-0 flex-1"
                    aria-label="Rotation in degrees"
                  />
                  <input
                    type="number"
                    min={0} max={359}
                    value={Math.round(selected.rotation ?? 0)}
                    onChange={(e) => {
                      const deg = ((Math.round(Number(e.target.value)) % 360) + 360) % 360;
                      mutate((pg) => withObject(pg, selected.id, (ob) => ({ ...ob, rotation: deg })));
                    }}
                    className="w-16 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1.5 text-xs"
                    aria-label="Rotation, degrees"
                  />
                </div>
              </label>

              <div className="grid grid-cols-2 gap-2">
                {(['x', 'y', 'w', 'h'] as const).map((k) => (
                  <label key={k} className="block">
                    <span className="block text-[11px] uppercase text-gray-500 mb-1">{k}</span>
                    <input
                      type="number"
                      value={Math.round(selected[k] * 100)}
                      onChange={(e) => {
                        const v = Math.min(100, Math.max(0, Number(e.target.value))) / 100;
                        mutate((p) => withObject(p, selected.id, (o) => ({ ...o, [k]: v })));
                      }}
                      className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1.5 text-xs"
                    />
                  </label>
                ))}
              </div>
            </div>
          )}


          {/*
            * Layers.
            *
            * This list is the ONLY way to reach a hidden or locked object:
            * a click on the canvas deliberately passes straight through both.
            * Without it, hiding something would be indistinguishable from
            * deleting it, and locking it would be irreversible.
            */}
          <section className="mt-4 border-t border-gray-100 dark:border-gray-800 pt-3">
            <h2 className="text-xs font-bold uppercase tracking-wide text-gray-500">Layers</h2>
            <ul className="mt-2 space-y-1">
              {layerList({ ...page, objects: topLevel(page) }).map((layer) => {
                const label = layer.type === 'group'
                  ? `${layer.name || 'Group'} (${membersOf(page, layer.id).length})`
                  : layerLabel(layer);
                return (
                  <li
                    key={layer.id}
                    className={`flex items-center gap-0.5 rounded-lg border px-1 ${
                      selectedIds.includes(layer.id)
                        || (layer.type === 'group' && membersOf(page, layer.id).some((m) => selectedIds.includes(m.id)))
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40'
                        : 'border-transparent hover:bg-gray-50 dark:hover:bg-gray-800'
                    }`}
                  >
                    <button
                      onClick={() => setSelectedIds(
                        layer.type === 'group' ? membersOf(page, layer.id).map((m) => m.id) : [layer.id],
                      )}
                      title={label}
                      className={`min-w-0 flex-1 truncate py-2 text-left text-[11px] ${layer.visible ? '' : 'text-gray-400 line-through'}`}
                    >
                      {label}
                    </button>
                    <button
                      onClick={() => mutate((pg) => setVisible(pg, layer.id, !layer.visible))}
                      aria-label={layer.visible ? `Hide ${label}` : `Show ${label}`}
                      aria-pressed={!layer.visible}
                      className="grid h-8 w-8 place-items-center text-gray-500 hover:text-gray-900 dark:hover:text-white"
                    >
                      {layer.visible ? <Eye size={13} /> : <EyeOff size={13} />}
                    </button>
                    <button
                      onClick={() => mutate((pg) => setLocked(pg, layer.id, !layer.locked))}
                      aria-label={layer.locked ? `Unlock ${label}` : `Lock ${label}`}
                      aria-pressed={layer.locked}
                      className="grid h-8 w-8 place-items-center text-gray-500 hover:text-gray-900 dark:hover:text-white"
                    >
                      {layer.locked ? <Lock size={13} /> : <Unlock size={13} />}
                    </button>
                    <button
                      onClick={() => mutate((pg) => moveLayer(pg, layer.id, 'up'))}
                      disabled={!canMove(page, layer.id, 'up')}
                      aria-label={`Bring ${label} forward`}
                      className="grid h-8 w-8 place-items-center text-gray-500 disabled:opacity-25"
                    >
                      <ChevronUp size={13} />
                    </button>
                    <button
                      onClick={() => mutate((pg) => moveLayer(pg, layer.id, 'down'))}
                      disabled={!canMove(page, layer.id, 'down')}
                      aria-label={`Send ${label} backward`}
                      className="grid h-8 w-8 place-items-center text-gray-500 disabled:opacity-25"
                    >
                      <ChevronDown size={13} />
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>

          {/*
            * What is not built yet, said plainly rather than shown as
            * controls that do nothing.
            */}
          <p className="mt-4 border-t border-gray-100 dark:border-gray-800 pt-3 text-[11px] text-gray-400">
            Cropping is not in this release yet.
          </p>
        </aside>
      </div>
    </div>
  );
}

/**
 * One tool in the rail.
 *
 * The label is the accessible name AND the tooltip, so an icon-only control
 * is never a guess — for a screen reader or for anybody else.
 */
function RailButton({
  onClick, icon: Icon, label, disabled, busy, danger,
}: {
  onClick: () => void;
  icon: typeof Type;
  label: string;
  disabled?: boolean;
  busy?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-transparent transition hover:border-gray-300 hover:bg-gray-50 disabled:opacity-30 dark:hover:border-gray-700 dark:hover:bg-gray-800 ${
        danger ? 'text-rose-600' : 'text-gray-600 dark:text-gray-300'
      }`}
    >
      {busy ? <Loader2 size={16} className="animate-spin" /> : <Icon size={16} />}
    </button>
  );
}
