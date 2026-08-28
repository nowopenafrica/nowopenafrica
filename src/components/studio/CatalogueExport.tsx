import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Download, FileText, Share2, Loader2, Images, RefreshCw } from 'lucide-react';

import { Business } from '../../types';
import { supabase } from '../../lib/supabase';
import { type CatalogueItem } from '../../lib/catalogue';
import {
  CATALOGUE_LAYOUTS, catalogueLayout, suggestLayout, paginate,
  buildSheetItems, sheetFileName, catalogueShareText,
  type CatalogueLayoutId, type ProductRow, type SheetItem,
} from '../../lib/catalogueSheets';
import {
  GridSheet, LookbookSheet, LineSheet, MenuSheet, SocialSheet, StorySheet,
  type SheetProps,
} from './CatalogueSheetNodes';
import {
  generateQr, profileUrl, exportNodeToPng, downloadUrl, downloadSheetsPdf,
  slugForFile, dataUrlToBlob,
} from '../../lib/studio';
import { canShareFiles } from '../../lib/reelShare';

/** Layout id → the component that draws it. Kept out of the node file so a
 *  non-component export does not break its fast refresh. */
const SHEETS: Record<CatalogueLayoutId, React.ForwardRefExoticComponent<SheetProps & React.RefAttributes<HTMLDivElement>>> = {
  grid: GridSheet,
  lookbook: LookbookSheet,
  linesheet: LineSheet,
  menu: MenuSheet,
  social: SocialSheet,
  story: StorySheet,
};

interface Props {
  business: Business;
  /** The Studio's hand-entered items, merged in behind the real products. */
  manualItems?: CatalogueItem[];
  accent?: string;
}

/**
 * Turn a business's actual products into a catalogue it can send.
 *
 * The products come from business_products — the same rows the profile shows —
 * rather than being retyped here, which is the whole point: a catalogue that
 * drifts from the listing is worse than no catalogue.
 *
 * Every page is rendered in the DOM, not just the visible one, because
 * html-to-image can only capture nodes that are actually laid out. They are all
 * in the preview strip, which doubles as a way to check the whole document
 * before sending it.
 */
export default function CatalogueExport({ business, manualItems = [], accent = '#4f46e5' }: Props) {
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [layoutId, setLayoutId] = useState<CatalogueLayoutId | null>(null);
  const [qr, setQr] = useState('');
  const [busy, setBusy] = useState<'png' | 'pdf' | 'share' | null>(null);
  const [progress, setProgress] = useState('');
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);

  const businessId = String(business.id);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('business_products')
      .select('id,name,description,price,image_url,is_featured')
      .eq('business_id', businessId)
      .order('created_at');
    setProducts((data as ProductRow[]) || []);
    setLoading(false);
  }, [businessId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    generateQr(profileUrl(business), { size: 320 }).then(setQr).catch(() => setQr(''));
  }, [business]);

  const items: SheetItem[] = useMemo(
    () => buildSheetItems(products, manualItems),
    [products, manualItems],
  );

  // Suggested once the items are known, then the owner's choice sticks.
  const layout = layoutId ? catalogueLayout(layoutId) : suggestLayout(business.category, items);
  const pages = useMemo(() => paginate(items, layout.perPage), [items, layout.perPage]);
  const Sheet = SHEETS[layout.id];
  const slug = slugForFile(business.name);

  pageRefs.current.length = pages.length;

  const nodes = () => pageRefs.current.filter((n): n is HTMLDivElement => !!n);

  const savePngs = async () => {
    const list = nodes();
    if (!list.length) return;
    setBusy('png');
    try {
      // One at a time: each capture holds a full-size bitmap, and a phone will
      // kill the tab if a dozen of them exist at once.
      for (let i = 0; i < list.length; i++) {
        setProgress(`${i + 1} of ${list.length}`);
        const dataUrl = await exportNodeToPng(list[i], {
          pixelRatio: 2,
          backgroundColor: '#ffffff',
          designWidth: layout.width,
        });
        downloadUrl(dataUrl, sheetFileName(slug, layout.id, i + 1, list.length, 'png'));
      }
      toast.success(list.length === 1 ? 'Catalogue image saved' : `${list.length} catalogue pages saved`);
    } catch {
      toast.error('Could not export the catalogue — try again.');
    } finally {
      setBusy(null);
      setProgress('');
    }
  };

  const savePdf = async () => {
    const list = nodes();
    if (!list.length) return;
    setBusy('pdf');
    try {
      await downloadSheetsPdf(list, `${slug}-catalogue.pdf`, {
        widthMm: layout.paper.widthMm,
        heightMm: layout.paper.heightMm,
        pixelRatio: 2,
        designWidth: layout.width,
        onProgress: (page, total) => setProgress(`${page} of ${total}`),
      });
      toast.success('Catalogue PDF saved');
    } catch {
      toast.error('Could not build the PDF — try again.');
    } finally {
      setBusy(null);
      setProgress('');
    }
  };

  const share = async () => {
    const url = profileUrl(business);
    const text = catalogueShareText(business, items.length, url);
    const list = nodes();
    setBusy('share');
    try {
      // Share the first page as a real image where the browser allows it: a
      // catalogue that arrives as a picture gets looked at, one that arrives as
      // a link gets scrolled past.
      if (list.length && canShareFiles('image/png')) {
        const dataUrl = await exportNodeToPng(list[0], {
          pixelRatio: 2, backgroundColor: '#ffffff', designWidth: layout.width,
        });
        const file = new File(
          [dataUrlToBlob(dataUrl)],
          sheetFileName(slug, layout.id, 1, 1, 'png'),
          { type: 'image/png' },
        );
        try {
          await navigator.share({ files: [file], text });
          return;
        } catch (err) {
          if (err instanceof DOMException && err.name === 'AbortError') return;
          // Anything else: fall through to the link.
        }
      }
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
    } catch {
      toast.error('Could not share the catalogue.');
    } finally {
      setBusy(null);
    }
  };

  const withPhotos = items.filter((i) => i.imageUrl).length;

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Images size={15} /> Catalogue designs
          </h3>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
            {loading
              ? 'Loading your products…'
              : `${items.length} item${items.length === 1 ? '' : 's'} · ${withPhotos} with photos · ${pages.length} page${pages.length === 1 ? '' : 's'}`}
          </p>
        </div>
        <button onClick={load} disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 rounded-lg text-xs font-medium border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 min-h-[44px] disabled:opacity-50">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh products
        </button>
      </div>

      {/* Layout picker */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {CATALOGUE_LAYOUTS.map((l) => (
          <button
            key={l.id}
            onClick={() => setLayoutId(l.id)}
            aria-pressed={layout.id === l.id}
            title={l.blurb}
            className={`text-left rounded-xl border p-2.5 min-h-[44px] transition ${
              layout.id === l.id
                ? 'border-purple-600 bg-purple-50 dark:bg-purple-900/30'
                : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
            }`}
          >
            <p className="text-xs font-semibold text-gray-900 dark:text-white">{l.label}</p>
            <p className="text-[10px] text-gray-500 dark:text-gray-400 line-clamp-2">{l.blurb}</p>
          </button>
        ))}
      </div>

      {/* An honest warning rather than a bad-looking export: these layouts are
          mostly photograph, and without any they are a page of coloured
          initials. */}
      {!loading && layout.needsImages && items.length > 0 && withPhotos === 0 && (
        <p className="text-[11px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-2">
          None of your products have photos yet, so this layout will show initials instead.
          The Menu and Line sheet designs read well without pictures.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button onClick={savePngs} disabled={busy !== null || loading}
          className="inline-flex items-center gap-2 px-4 rounded-lg text-sm font-bold bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 min-h-[44px]">
          {busy === 'png' ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
          {busy === 'png' && progress ? `Saving ${progress}` : pages.length > 1 ? `Images (${pages.length})` : 'Image'}
        </button>
        <button onClick={savePdf} disabled={busy !== null || loading}
          className="inline-flex items-center gap-2 px-4 rounded-lg text-sm font-medium bg-gray-900 dark:bg-gray-700 text-white hover:opacity-90 disabled:opacity-50 min-h-[44px]">
          {busy === 'pdf' ? <Loader2 size={15} className="animate-spin" /> : <FileText size={15} />}
          {busy === 'pdf' && progress ? `Building ${progress}` : 'PDF'}
        </button>
        <button onClick={share} disabled={busy !== null || loading}
          className="inline-flex items-center gap-2 px-4 rounded-lg text-sm font-medium bg-[#25D366] text-white hover:brightness-95 disabled:opacity-50 min-h-[44px]">
          {busy === 'share' ? <Loader2 size={15} className="animate-spin" /> : <Share2 size={15} />} Share
        </button>
      </div>

      {/* Every page is rendered — html-to-image can only capture what is laid
          out — and the strip doubles as a read-through of the whole document. */}
      <div className="rounded-xl bg-gray-100 dark:bg-gray-900 p-3 overflow-x-auto">
        <div className="flex gap-4" style={{ width: 'max-content' }}>
          {pages.map((pageItems, index) => (
            <div key={index} className="flex-shrink-0">
              <p className="text-[10px] text-gray-500 dark:text-gray-400 mb-1.5 text-center">
                Page {index + 1} of {pages.length}
              </p>
              {/* Scaled down for the strip only. The export lays the node back
                  out at its full design width, so this never costs resolution. */}
              <div
                style={{
                  width: layout.width * previewScale(layout.width),
                  height: layout.height * previewScale(layout.width),
                  overflow: 'hidden',
                }}
                className="rounded-lg shadow-lg bg-white"
              >
                {/* The inner box is the sheet's real size; only the transform
                    shrinks it, so the thumbnail is the document. */}
                <div style={{
                  width: layout.width,
                  transform: `scale(${previewScale(layout.width)})`,
                  transformOrigin: 'top left',
                }}>
                  <Sheet
                    ref={(el) => { pageRefs.current[index] = el; }}
                    business={business}
                    items={pageItems}
                    layout={layout}
                    accent={accent}
                    page={index + 1}
                    totalPages={pages.length}
                    qr={qr}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Fit a sheet into a readable thumbnail without changing its real size. */
function previewScale(width: number): number {
  return Math.min(1, 300 / width);
}
