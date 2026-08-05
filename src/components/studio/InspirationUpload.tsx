import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Sparkles, Upload, X, Loader2, Check, Info, Wand2 } from 'lucide-react';
import {
  analyseInspiration, inspirationPlan,
  type InspirationAnalysis, type InspirationPlan,
} from '../../lib/designInspiration';

// AI Design Inspiration — upload a design you like, get an editable NowOpen
// design in your own brand.
//
// The panel reports only the steps that actually ran. There is no vision model
// wired up, so it does not claim to read text, identify fonts or find logos —
// see the header of lib/designInspiration.ts. Each finding is shown with the
// evidence it came from, which is also what keeps the copyright position honest:
// four colours and a composition label cross over, never the artwork.

/**
 * Formats a browser can actually decode to pixels. HEIC, PDF and PSD are in the
 * brief but no browser decodes them natively — offering them would produce a
 * silent failure, so they're refused with a reason instead.
 */
const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,image/avif';
const UNSUPPORTED = /\.(heic|heif|pdf|psd|ai|eps|tiff?)$/i;
const MAX_BYTES = 25 * 1024 * 1024;

export default function InspirationUpload({
  brandAccent,
  onApply,
}: {
  brandAccent?: string;
  onApply: (plan: InspirationPlan) => void;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [analysis, setAnalysis] = useState<InspirationAnalysis | null>(null);
  const [plan, setPlan] = useState<InspirationPlan | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const objectUrl = useRef<string | null>(null);

  // Object URLs are revoked on replace/unmount — a studio session can otherwise
  // leak every image the merchant tries.
  const setObjectUrl = (url: string | null) => {
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = url;
    setPreview(url);
  };
  useEffect(() => () => { if (objectUrl.current) URL.revokeObjectURL(objectUrl.current); }, []);

  const handleFile = useCallback(async (file: File) => {
    if (UNSUPPORTED.test(file.name)) {
      toast.error(`${file.name.split('.').pop()?.toUpperCase()} can't be read in the browser — export a PNG or JPEG first.`);
      return;
    }
    if (!file.type.startsWith('image/')) {
      toast.error('That is not an image file.');
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error(`That file is ${(file.size / 1024 / 1024).toFixed(0)} MB — keep it under 25 MB.`);
      return;
    }

    setBusy(true);
    setAnalysis(null);
    setPlan(null);
    try {
      const url = URL.createObjectURL(file);
      setObjectUrl(url);
      const result = await analyseInspiration(url);
      if (!result) {
        toast.error("Couldn't read that image — try a PNG or JPEG.");
        return;
      }
      setAnalysis(result);
      setPlan(inspirationPlan(result, brandAccent));
    } finally {
      setBusy(false);
    }
  }, [brandAccent]);

  // Paste an image straight from the clipboard — the fastest path from a
  // screenshot to a design.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const item = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith('image/'));
      const file = item?.getAsFile();
      if (file) { e.preventDefault(); void handleFile(file); }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [handleFile]);

  const clear = () => {
    setObjectUrl(null);
    setAnalysis(null);
    setPlan(null);
  };

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 text-xs font-extrabold uppercase tracking-wide text-gray-700 dark:text-gray-200">
          <Sparkles size={15} className="text-purple-600 dark:text-purple-400" /> AI Design Inspiration
        </span>
        {preview && (
          <button type="button" onClick={clear} aria-label="Remove upload"
            className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <X size={15} />
          </button>
        )}
      </div>

      {!preview && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const f = e.dataTransfer.files?.[0];
            if (f) void handleFile(f);
          }}
          className={`rounded-xl border-2 border-dashed p-5 text-center transition ${
            dragOver ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20' : 'border-gray-300 dark:border-gray-600'
          }`}
        >
          <Upload size={20} className="mx-auto text-gray-400" />
          <p className="mt-2 text-xs font-semibold text-gray-700 dark:text-gray-200">
            Drop a design you like, or paste a screenshot
          </p>
          <p className="mt-0.5 text-[11px] text-gray-400">PNG, JPEG, WebP · up to 25 MB</p>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="mt-3 inline-flex items-center gap-1.5 min-h-[44px] px-4 rounded-lg text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
          >
            <Upload size={13} /> Browse files
          </button>
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); e.target.value = ''; }}
          />
        </div>
      )}

      {preview && (
        <div className="flex gap-3">
          <img src={preview} alt="Your uploaded inspiration" className="w-20 h-20 rounded-lg object-cover border border-gray-200 dark:border-gray-700 flex-shrink-0" />
          <div className="min-w-0 flex-1">
            {busy && (
              <p className="inline-flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-gray-400">
                <Loader2 size={12} className="animate-spin" /> Reading colours and composition…
              </p>
            )}
            {analysis && (
              <>
                <div className="flex items-center gap-1 mb-1.5">
                  {(['primary', 'secondary', 'accent', 'neutral'] as const).map((k) => (
                    <span key={k} title={`${k} ${analysis.palette[k]}`}
                      className="w-5 h-5 rounded border border-black/10 dark:border-white/20"
                      style={{ background: analysis.palette[k] }} />
                  ))}
                  <span className="ml-1 text-[11px] font-semibold text-gray-700 dark:text-gray-200 capitalize">
                    {analysis.archetype.replace('-', ' ')}
                  </span>
                </div>
                {/* Only what actually ran — no fake checklist. */}
                <ul className="space-y-0.5">
                  {analysis.evidence.map((e) => (
                    <li key={e} className="flex items-start gap-1 text-[10px] text-gray-500 dark:text-gray-400">
                      <Check size={10} className="text-emerald-500 mt-0.5 flex-shrink-0" /> {e}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      )}

      {plan && (
        <>
          <ul className="space-y-1 rounded-lg bg-gray-50 dark:bg-gray-900 p-2.5">
            {plan.notes.map((n) => (
              <li key={n} className="flex items-start gap-1.5 text-[11px] text-gray-600 dark:text-gray-300">
                <Info size={11} className="text-purple-500 mt-0.5 flex-shrink-0" /> {n}
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => { onApply(plan); toast.success('Applied — edit anything you like.'); }}
            className="w-full inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-lg text-xs font-bold text-white bg-gradient-to-r from-purple-600 to-fuchsia-600 hover:from-purple-700 hover:to-fuchsia-700 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
          >
            <Wand2 size={14} /> Build my version
          </button>
          <p className="text-[10px] text-gray-400">
            We never reproduce your upload. Only its colours and composition guide the result —
            the design is a NowOpen layout with your own brand, text and QR.
          </p>
        </>
      )}
    </div>
  );
}
