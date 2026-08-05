import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { Copy, Download, Link as LinkIcon, QrCode, Loader2, Globe, MessageCircle, Phone, Mail, MapPin, Store } from 'lucide-react';
import { Business } from '../../types';
import { profileUrl, generateQr, downloadUrl, slugForFile } from '../../lib/studio';
import { deriveTier, TIERS } from '../../lib/trust';

type QrTarget =
  | 'profile' | 'website' | 'whatsapp' | 'call' | 'sms' | 'email' | 'location';

const TARGETS: { key: QrTarget; label: string; icon: typeof Store; build: (b: Business, url: string) => string }[] = [
  { key: 'profile', label: 'Business Profile', icon: Store, build: (_b, url) => url },
  { key: 'website', label: 'Website', icon: Globe, build: (b) => b.website || '' },
  { key: 'whatsapp', label: 'WhatsApp', icon: MessageCircle, build: (b) => `https://wa.me/${String(b.phone || '').replace(/[^\d]/g, '').replace(/^0/, '234')}` },
  { key: 'call', label: 'Call', icon: Phone, build: (b) => `tel:${b.phone || ''}` },
  { key: 'sms', label: 'SMS', icon: MessageCircle, build: (b) => `sms:${String(b.phone || '').replace(/[^\d]/g, '')}` },
  { key: 'email', label: 'Email', icon: Mail, build: (b) => `mailto:${b.email || ''}` },
  { key: 'location', label: 'Directions', icon: MapPin, build: (b) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(b.location || b.name)}` },
];

export default function QrStudio({ business }: { business: Business }) {
  const [targetKey, setTargetKey] = useState<QrTarget>('profile');
  const [size, setSize] = useState(1024);
  const [dark, setDark] = useState('#0f172a');
  const [qr, setQr] = useState('');
  const [downloading, setDownloading] = useState(false);

  const url = profileUrl(business);
  const target = TARGETS.find((t) => t.key === targetKey)!;
  const destination = target.build(business, url);
  const usable = destination || targetKey === 'profile';

  useEffect(() => {
    if (!usable) { setQr(''); return; }
    generateQr(destination, { size, dark }).then(setQr).catch(() => setQr(''));
  }, [destination, size, dark, usable]);

  const download = async () => {
    if (!qr) return;
    setDownloading(true);
    try {
      downloadUrl(qr, `${slugForFile(business.name)}-qr-${targetKey}.png`);
      toast.success('QR code downloaded');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
      {/* Controls */}
      <div className="lg:col-span-2 space-y-5">
        <div>
          <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">What does it link to?</label>
          <div className="grid grid-cols-2 gap-2">
            {TARGETS.map((t) => (
              <button key={t.key} onClick={() => setTargetKey(t.key)}
                className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border transition ${targetKey === t.key ? 'border-transparent text-white bg-gray-900 dark:bg-gray-700' : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
                <t.icon size={14} /> {t.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Destination</label>
          <div className="flex items-center gap-2 rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-900">
            <LinkIcon size={14} className="flex-shrink-0 text-gray-400" />
            <span className="truncate">{usable ? destination : 'Add this contact in your dashboard first'}</span>
            {usable && (
              <button onClick={() => { navigator.clipboard?.writeText(destination); toast.success('Link copied'); }} className="ml-auto text-gray-400 hover:text-gray-700 dark:hover:text-white">
                <Copy size={14} />
              </button>
            )}
          </div>
          {targetKey === 'profile' && (
            <p className="mt-1 text-[11px] text-gray-400">A Live QR — it always points to your current profile, forever.</p>
          )}
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Size</label>
          <select value={size} onChange={(e) => setSize(Number(e.target.value))}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg text-sm">
            <option value={1024}>Print quality (1024 px) — recommended</option>
            <option value={512}>Standard (512 px)</option>
            <option value={256}>Small (256 px)</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Colour</label>
          <div className="flex items-center gap-2">
            {['#0f172a', '#16a34a', '#7c3aed', '#dc2626', '#2563eb'].map((c) => (
              <button key={c} onClick={() => setDark(c)}
                className="w-8 h-8 rounded-lg border border-gray-200 dark:border-gray-600"
                style={{ background: c, boxShadow: dark === c ? '0 0 0 2px white, 0 0 0 4px #7c3aed' : undefined }} />
            ))}
            <input type="color" value={dark} onChange={(e) => setDark(e.target.value)}
              className="w-10 h-8 rounded border border-gray-200 dark:border-gray-600 bg-transparent cursor-pointer" title="Custom colour" />
          </div>
        </div>

        <button onClick={download} disabled={!qr || downloading}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-40">
          {downloading ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />} Download QR
        </button>

        {deriveTier(business as any) !== 'none' && (
          <p className="text-[11px] text-gray-400 flex items-center gap-1">
            <QrCode size={12} /> {TIERS[deriveTier(business as any)].label} businesses get scan analytics in the app soon.
          </p>
        )}
      </div>

      {/* Preview */}
      <div className="lg:col-span-3 flex flex-col items-center justify-start pt-2">
        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-8">
          {qr
            ? <img src={qr} alt={`${target.label} QR code`} className="w-64 h-64 rounded-lg" />
            : <div className="w-64 h-64 bg-gray-100 dark:bg-gray-900 rounded-lg animate-pulse" />}
        </div>
        <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">
          <span className="font-semibold text-gray-900 dark:text-white">{target.label}</span> — scans open {usable ? destination : '—'} directly
        </p>
        <p className="mt-1 text-[11px] text-gray-400">Print on flyers, posters, menus, receipts and packaging.</p>
      </div>
    </div>
  );
}
