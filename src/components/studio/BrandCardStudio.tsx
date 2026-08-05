import toast from 'react-hot-toast';
import { useRef } from 'react';
import { Download, Printer, Share2, Link as LinkIcon, QrCode, Loader2, Contact, SlidersHorizontal, RotateCcw, User, Upload, X } from 'lucide-react';
import { Business } from '../../types';
import { profileUrl, shareLinks } from '../../lib/studio';
import { useBrandExports } from '../../hooks/useBrandExports';
import { useCardSettings } from '../../hooks/useCardSettings';
import { CARD_ACCENTS, compressImageFile } from '../../lib/cardSettings';
import { CardExportNode, QrLockupNode, SmartIdNode, SmartIdFrontNode } from './BrandCardNodes';

export default function BrandCardStudio({ business }: { business: Business }) {
  const {
    qr, cardRef, qrRef, smartIdRef, smartIdFrontRef,
    exporting, exportingQr, exportingKit, exportingSmartId, exportingSmartIdFront,
    exportingSmartIdPdf, exportingSmartIdFrontPdf,
    exportCardPng, exportQrPng, exportCardKit, exportSmartIdPng, exportSmartIdPdf,
    exportSmartIdFrontPng, exportSmartIdFrontPdf,
  } = useBrandExports(business);
  const { settings, update, reset } = useCardSettings(business.id);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const url = profileUrl(business);

  const uploadPhoto = async (file: File) => {
    try {
      const dataUrl = await compressImageFile(file);
      update({ holderPhoto: dataUrl });
      toast.success('Photo added to your Smart ID');
    } catch {
      toast.error('Could not read that image — try a JPG or PNG.');
    }
  };

  const printCard = () => {
    if (!cardRef.current) return;
    const w = window.open('', '_blank', 'width=900,height=650');
    if (!w) { toast.error('Please allow pop-ups to print.'); return; }
    w.document.write(`<!doctype html><html><head><title>${business.name} — Business card</title>
      <meta charset="utf-8"><style>body{margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;font-family:system-ui,Arial,sans-serif}@media print{@page{margin:12mm}}</style>
      </head><body>${cardRef.current.outerHTML}<script>window.onload=()=>{setTimeout(()=>{window.print();},300)}</script></body></html>`);
    w.document.close();
  };

  const nativeShare = async () => {
    if (navigator.share) {
      try { await navigator.share({ title: business.name, text: `Check out ${business.name} on NowOpen Africa`, url }); } catch { /* cancelled */ }
    } else {
      navigator.clipboard?.writeText(url);
      toast.success('Profile link copied');
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
      {/* Business card + actions */}
      <div className="lg:col-span-3 space-y-4">
        <h2 className="text-sm font-bold text-gray-900 dark:text-white">Digital Business Card</h2>
        <CardExportNode ref={cardRef} business={business} qr={qr} settings={settings} />

        <div className="flex flex-wrap gap-2">
          <button onClick={exportCardKit} disabled={exportingKit}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50">
            {exportingKit ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />} Download card + QR
          </button>
          <button onClick={exportCardPng} disabled={exporting} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
            {exporting ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />} Card PNG
          </button>
          <button onClick={printCard} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
            <Printer size={15} /> Print / Save as PDF
          </button>
          <button onClick={nativeShare} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
            <Share2 size={15} /> Share
          </button>
        </div>

        {/* Smart ID card */}
        <div className="space-y-3 pt-1">
          <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Contact size={15} className="text-purple-500" /> Smart ID Card
          </h3>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold tracking-wider text-gray-400">FRONT</span>
              <span className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
            </div>
            <SmartIdFrontNode ref={smartIdFrontRef} business={business} settings={settings} />
            <div className="flex flex-wrap gap-2">
              <button onClick={exportSmartIdFrontPng} disabled={exportingSmartIdFront}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium bg-gray-900 dark:bg-gray-700 text-white hover:opacity-90 disabled:opacity-50">
                {exportingSmartIdFront ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} Front PNG
              </button>
              <button onClick={exportSmartIdFrontPdf} disabled={exportingSmartIdFrontPdf}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50">
                {exportingSmartIdFrontPdf ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} Front PDF
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold tracking-wider text-gray-400">BACK</span>
              <span className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
            </div>
            <SmartIdNode ref={smartIdRef} business={business} qr={qr} settings={settings} />
            <div className="flex flex-wrap gap-2">
              <button onClick={exportSmartIdPng} disabled={exportingSmartId}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium bg-gray-900 dark:bg-gray-700 text-white hover:opacity-90 disabled:opacity-50">
                {exportingSmartId ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} Back PNG
              </button>
              <button onClick={exportSmartIdPdf} disabled={exportingSmartIdPdf}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50">
                {exportingSmartIdPdf ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} Back PDF
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Smart QR + Share Center */}
      <div className="lg:col-span-2 space-y-6">
        {/* Customise cards */}
        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
          <div className="flex items-center gap-2 mb-1">
            <SlidersHorizontal size={18} className="text-purple-600 dark:text-purple-400" />
            <h2 className="font-bold text-gray-900 dark:text-white">Customise your cards</h2>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">Edits apply live to both the business card and the Smart ID card — and to every download.</p>

          <div className="space-y-4">
            <div>
              <label className="block text-[11px] font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Accent colour</label>
              <div className="flex flex-wrap items-center gap-2">
                {CARD_ACCENTS.map((a) => (
                  <button key={a.value} onClick={() => update({ accentColor: settings.accentColor === a.value ? '' : a.value })}
                    title={a.name}
                    className={`w-7 h-7 rounded-full transition ${settings.accentColor === a.value ? 'ring-2 ring-offset-2 ring-purple-500 scale-110' : 'hover:scale-110'}`}
                    style={{ background: a.value }} />
                ))}
                <button onClick={() => update({ accentColor: '' })}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
                  Auto
                </button>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Tagline</label>
              <input value={settings.tagline} onChange={(e) => update({ tagline: e.target.value })}
                placeholder="e.g. Your neighbourhood bakery"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Category label</label>
              <input value={settings.categoryLabel} onChange={(e) => update({ categoryLabel: e.target.value })}
                placeholder={business.category || 'Business'}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
            </div>

            <div>
              <p className="text-[11px] font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Show on the cards</p>
              <div className="grid grid-cols-2 gap-2">
                {([
                  ['showPhone', 'Phone'],
                  ['showWhatsApp', 'WhatsApp'],
                  ['showLocation', 'Location'],
                  ['showWebsite', 'Website'],
                  ['showHours', 'Hours'],
                ] as const).map(([key, label]) => (
                  <label key={key} className="inline-flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
                    <input type="checkbox" checked={settings[key]} onChange={(e) => update({ [key]: e.target.checked })}
                      className="rounded border-gray-300 text-purple-600 focus:ring-purple-500" />
                    {label}
                  </label>
                ))}
              </div>
            </div>

            <div className="border-t border-gray-100 dark:border-gray-700 pt-4">
              <div className="flex items-center gap-2 mb-1">
                <User size={15} className="text-purple-600 dark:text-purple-400" />
                <p className="text-sm font-bold text-gray-900 dark:text-white">Smart ID holder</p>
              </div>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-3">Shown on the front of the card. Leave blank to use the business name.</p>

              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Holder name</label>
                  <input value={settings.holderName} onChange={(e) => update({ holderName: e.target.value })}
                    placeholder={business.name}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Role / title</label>
                  <input value={settings.holderRole} onChange={(e) => update({ holderRole: e.target.value })}
                    placeholder={business.category || 'e.g. Founder'}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Photograph</label>
                  <div className="flex items-center gap-3">
                    {settings.holderPhoto
                      ? <img src={settings.holderPhoto} alt="Holder" className="w-14 h-14 rounded-xl object-cover border border-gray-200 dark:border-gray-600" />
                      : <div className="w-14 h-14 rounded-xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-400"><User size={20} /></div>}
                    <input ref={photoInputRef} type="file" accept="image/*" className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) uploadPhoto(file);
                        e.target.value = '';
                      }} />
                    <button onClick={() => photoInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
                      <Upload size={13} /> {settings.holderPhoto ? 'Replace' : 'Upload'}
                    </button>
                    {settings.holderPhoto && (
                      <button onClick={() => update({ holderPhoto: '' })}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30">
                        <X size={13} /> Remove
                      </button>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-gray-700 dark:text-gray-300 mb-1.5">ID number</label>
                  <input value={settings.holderId} onChange={(e) => update({ holderId: e.target.value })}
                    placeholder="Auto-generated"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-purple-500" />
                </div>
              </div>
            </div>

            <button onClick={reset} className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition">
              <RotateCcw size={12} /> Reset to defaults
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
          <div className="flex items-center gap-2 mb-3"><QrCode size={18} className="text-gray-500 dark:text-gray-400" /><h2 className="font-bold text-gray-900 dark:text-white">Smart QR</h2></div>

          <QrLockupNode ref={qrRef} business={business} qr={qr} />

          <button onClick={exportQrPng} disabled={exportingQr} className="mt-3 w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-gray-900 dark:bg-gray-700 text-white hover:opacity-90 disabled:opacity-50">
            {exportingQr ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />} Download Smart QR
          </button>
        </div>

        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
          <div className="flex items-center gap-2 mb-3"><Share2 size={18} className="text-gray-500 dark:text-gray-400" /><h2 className="font-bold text-gray-900 dark:text-white">Share Center</h2></div>
          <div className="grid grid-cols-3 gap-2">
            {shareLinks(url, `Check out ${business.name} on NowOpen Africa`).map((s) => (
              <a key={s.key} href={s.href} target="_blank" rel="noopener noreferrer"
                className="text-center px-2 py-2 rounded-lg text-xs font-medium border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
                {s.label}
              </a>
            ))}
          </div>
          <button onClick={() => { navigator.clipboard?.writeText(url); toast.success('Profile link copied'); }}
            className="mt-2 w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
            <LinkIcon size={15} /> Copy profile link
          </button>
        </div>
      </div>
    </div>
  );
}
