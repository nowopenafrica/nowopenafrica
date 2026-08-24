import { useState } from 'react';
import toast from 'react-hot-toast';
import { Download, FileText, Loader2, PackageOpen, PenLine, QrCode, CreditCard, Contact } from 'lucide-react';
import { Business } from '../../types';
import { downloadUrl, downloadText, downloadRemoteUrl, slugForFile, exportNodeToPng } from '../../lib/studio';
import { useBrandExports } from '../../hooks/useBrandExports';
import { useCardSettings } from '../../hooks/useCardSettings';
import { CardExportNode, QrLockupNode, SmartIdNode, SmartIdFrontNode } from './BrandCardNodes';
import { BrandDNA, personalityByKey, brandGuidelinesText, downloadBrandGuidelinesPdf } from '../../lib/studioBrand';
import { copyPack } from '../../lib/copywriter';

export default function ExportCentre({ business }: { business: Business }) {
  const {
    qr, cardRef, qrRef, smartIdRef, smartIdFrontRef,
    exporting, exportingQr, exportingSmartId, exportingSmartIdFront, exportingSmartIdPdf, exportingSmartIdFrontPdf,
    exportCardPng, exportQrPng, exportSmartIdPng, exportSmartIdPdf, exportSmartIdFrontPng, exportSmartIdFrontPdf,
  } = useBrandExports(business);
  const { settings } = useCardSettings(business.id);
  const [bundling, setBundling] = useState(false);

  // Export nodes must be in the DOM (offscreen) so html-to-image can capture them.
  const dna: BrandDNA = {
    personality: personalityByKey('friendly'),
    palette: personalityByKey('friendly').palette,
    source: 'default',
  };

  const packText = () => {
    const goals = copyPack(business, 'grand-opening')
      .map((p) => p.text)
      .join('\n\n');
    const extra = copyPack(business, 'flash-sale').map((p) => p.text).join('\n\n');
    return `NOWOPEN STUDIO — MARKETING COPY PACK\nBusiness: ${business.name}\n\n--- GRAND OPENING ---\n\n${goals}\n\n--- FLASH SALE ---\n\n${extra}`;
  };

  const downloadEverything = async () => {
    if (!cardRef.current || !qrRef.current || bundling) return;
    setBundling(true);
    try {
      const [card, qr] = await Promise.all([
        exportNodeToPng(cardRef.current, { pixelRatio: 2, backgroundColor: '#ffffff' }),
        exportNodeToPng(qrRef.current, { pixelRatio: 3, backgroundColor: '#ffffff' }),
      ]);
      downloadUrl(card, `${slugForFile(business.name)}-card.png`);
      downloadUrl(qr, `${slugForFile(business.name)}-qr.png`);
      downloadBrandGuidelinesPdf(business, dna);
      downloadText(packText(), `${slugForFile(business.name)}-marketing-copy.txt`);
      toast.success('Export bundle saved — card, QR, guidelines & copy');
    } catch {
      toast.error('Could not export everything — use the individual buttons.');
    } finally {
      setBundling(false);
    }
  };

  const rows: { icon: typeof CreditCard; label: string; detail: string; run: () => void; loading: boolean }[] = [
    { icon: CreditCard, label: 'Digital business card (PNG)', detail: 'Your card at 2× resolution', run: exportCardPng, loading: exporting },
    { icon: Contact, label: 'Smart ID front (PNG)', detail: 'Identity side — photo, name & ID number', run: exportSmartIdFrontPng, loading: exportingSmartIdFront },
    { icon: Contact, label: 'Smart ID front (PDF)', detail: 'Print-ready ID-card size', run: exportSmartIdFrontPdf, loading: exportingSmartIdFrontPdf },
    { icon: Contact, label: 'Smart ID back (PNG)', detail: 'Modern ID card with your live QR', run: exportSmartIdPng, loading: exportingSmartId },
    { icon: Contact, label: 'Smart ID back (PDF)', detail: 'Print-ready ID-card size', run: exportSmartIdPdf, loading: exportingSmartIdPdf },
    { icon: QrCode, label: 'Smart QR lockup (PNG)', detail: 'QR + NowOpen mark + your logo', run: exportQrPng, loading: exportingQr },
    {
      icon: FileText, label: 'Brand guidelines (PDF)', detail: 'Logo, colours, fonts, voice',
      run: () => { downloadBrandGuidelinesPdf(business, dna); toast.success('Brand guidelines PDF downloaded'); },
      loading: false,
    },
    {
      icon: FileText, label: 'Brand guidelines (.txt)', detail: 'Plain-text version',
      run: () => { downloadText(brandGuidelinesText(business, dna), `${slugForFile(business.name)}-brand-guidelines.txt`); toast.success('Brand guidelines text downloaded'); },
      loading: false,
    },
    {
      icon: PenLine, label: 'Marketing copy pack (.txt)', detail: 'Captions & ads for every channel',
      run: () => { downloadText(packText(), `${slugForFile(business.name)}-marketing-copy.txt`); toast.success('Marketing copy pack downloaded'); },
      loading: false,
    },
  ];
  if (business.logo_url) {
    rows.push({
      icon: FileText, label: 'Original logo', detail: 'Your uploaded logo file',
      run: async () => { await downloadRemoteUrl(business.logo_url!, `${slugForFile(business.name)}-logo.png`); toast.success('Logo downloaded'); },
      loading: false,
    });
  }

  return (
    <div className="space-y-6">
      {/* Offscreen export nodes */}
      <div aria-hidden style={{ position: 'absolute', left: -9999, top: 0, pointerEvents: 'none' }}>
        <CardExportNode ref={cardRef} business={business} qr={qr} settings={settings} />
        <SmartIdFrontNode ref={smartIdFrontRef} business={business} settings={settings} />
        <SmartIdNode ref={smartIdRef} business={business} qr={qr} settings={settings} />
        <QrLockupNode ref={qrRef} business={business} qr={qr} />
      </div>

      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
        <div className="flex items-center gap-2 mb-1">
          <PackageOpen size={18} className="text-purple-600 dark:text-purple-400" />
          <h2 className="font-bold text-gray-900 dark:text-white">Export Centre</h2>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
          Everything Studio has made for {business.name}, ready to download. Save them all with one click, or grab individual files.
        </p>

        <button onClick={downloadEverything} disabled={bundling}
          className="mb-5 inline-flex items-center gap-2 px-5 rounded-lg text-sm font-bold bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 min-h-[44px]">
          {bundling ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} Download everything
        </button>

        <div className="divide-y divide-gray-100 dark:divide-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
          {rows.map((r) => (
            <div key={r.label} className="flex items-center gap-3 px-4 py-3 bg-white dark:bg-gray-800">
              <r.icon size={17} className="text-gray-500 dark:text-gray-400 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{r.label}</p>
                <p className="text-[11px] text-gray-500 dark:text-gray-400">{r.detail}</p>
              </div>
              <button onClick={r.run} disabled={r.loading}
                className="ml-auto inline-flex items-center gap-1.5 px-3 rounded-lg text-xs font-medium bg-gray-900 dark:bg-gray-700 text-white hover:opacity-90 disabled:opacity-50 flex-shrink-0 min-h-[44px]">
                {r.loading ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} Save
              </button>
            </div>
          ))}
        </div>
      </div>

      <p className="text-[11px] text-gray-400">
        Need your social posts or flyers? Open the AI Marketing Department, Flyer or Poster Generator and hit "Download all formats".
      </p>
    </div>
  );
}
