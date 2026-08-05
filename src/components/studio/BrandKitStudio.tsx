import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { Check, Copy, Download, FileText, Image as ImageIcon, Loader2, Palette, PenLine, RefreshCw, Sparkles, Type, PackageOpen, Gauge, Wand2 } from 'lucide-react';
import { Business } from '../../types';
import { downloadRemoteUrl, downloadText, slugForFile } from '../../lib/studio';
import { BrandPalette, BrandDNA, PERSONALITIES, personalityByKey, paletteFromImage, brandGuidelinesText, downloadBrandGuidelinesPdf } from '../../lib/studioBrand';
import { useBrandIdentity } from '../../hooks/useBrandIdentity';
import { computeBrandHealth } from '../../lib/brandHealth';
import BrandIdentityPanel from './BrandIdentityPanel';
import AiBrandKitPanel from './AiBrandKitPanel';
import BrandHealthPanel from './BrandHealthPanel';

function Swatch({ label, hex, onCopied }: { label: string; hex: string; onCopied: (hex: string) => void }) {
  return (
    <button
      onClick={() => {
        navigator.clipboard?.writeText(hex).catch(() => {});
        onCopied(hex);
      }}
      className="group rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden text-left"
      title={`Copy ${hex}`}
    >
      <div className="h-14 w-full transition group-hover:scale-[1.03]" style={{ background: hex }} />
      <div className="px-2 py-1.5">
        <p className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</p>
        <p className="font-mono text-xs font-semibold text-gray-900 dark:text-white">{hex}</p>
      </div>
    </button>
  );
}

function Section({ num, icon: Icon, title, subtitle, children }: {
  num: string; icon: typeof Palette; title: string; subtitle?: string; children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
      <div className="flex items-center gap-2 mb-1">
        <span className="w-6 h-6 rounded-full bg-purple-600 text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0">{num}</span>
        <Icon size={18} className="text-purple-600 dark:text-purple-400" />
        <h2 className="font-bold text-gray-900 dark:text-white">{title}</h2>
      </div>
      {subtitle && <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">{subtitle}</p>}
      <div className={subtitle ? '' : 'mt-4'}>{children}</div>
    </div>
  );
}

export default function BrandKitStudio({ business }: { business: Business }) {
  const { identity, update, toggleVoice, reset } = useBrandIdentity(business.id);
  const [personalityKey, setPersonalityKey] = useState('friendly');
  const [palette, setPalette] = useState<BrandPalette | null>(null);
  const [source, setSource] = useState<'image' | 'default'>('default');
  const [extracting, setExtracting] = useState(false);
  const [copied, setCopied] = useState('');

  const imageToScan = business.logo_url || business.image_url;
  const logo = business.logo_url;
  const cover = business.image_url;

  const extract = useCallback(async () => {
    if (!imageToScan) return;
    setExtracting(true);
    const p = await paletteFromImage(imageToScan);
    if (p) { setPalette(p); setSource('image'); }
    setExtracting(false);
  }, [imageToScan]);

  useEffect(() => {
    setPalette(null);
    setSource('default');
    setExtracting(false);
    if (imageToScan) extract();
  }, [imageToScan, extract]);

  const personality = personalityByKey(personalityKey);
  const dna: BrandDNA = {
    personality,
    palette: palette ?? personality.palette,
    source,
  };
  const health = computeBrandHealth(business, identity);

  const copyHex = (hex: string) => { setCopied(hex); setTimeout(() => setCopied(''), 1200); };

  const swatches: [string, string][] = [
    ['Primary', dna.palette.primary],
    ['Secondary', dna.palette.secondary],
    ['Accent', dna.palette.accent],
    ['Neutral', dna.palette.neutral],
  ];

  return (
    <div className="space-y-6">
      {/* Header — the brand at a glance */}
      <div className="rounded-2xl p-6 text-white relative overflow-hidden" style={{ background: 'linear-gradient(120deg,#1e1b4b,#4c1d95 55%,#831843)' }}>
        <div className="absolute inset-0 opacity-[0.06]" style={{ backgroundImage: 'linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)', backgroundSize: '40px 40px' }} />
        <div className="relative flex flex-wrap items-center gap-6">
          <div className="flex-1 min-w-56">
            <div className="flex items-center gap-2">
              <Sparkles size={20} />
              <h1 className="text-2xl font-black tracking-tight">Brand OS</h1>
            </div>
            <p className="text-sm text-white/80 mt-1">How your entire brand works — identity, voice, colours, assets, health and stationery in one place.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {business.category && (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold bg-white/10 border border-white/20 px-3 py-1.5 rounded-full">{business.category}</span>
            )}
            {identity.tagline && (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold bg-white/10 border border-white/20 px-3 py-1.5 rounded-full">“{identity.tagline}”</span>
            )}
            <span className="inline-flex items-center gap-1.5 text-xs font-bold bg-white px-3 py-1.5 rounded-full text-gray-900">
              <Gauge size={13} className="text-purple-600" /> Brand health {health.score}%
            </span>
          </div>
        </div>
      </div>

      {/* 1. Brand Identity & Voice */}
      <Section num="1" icon={PenLine} title="Brand Identity & Voice" subtitle="Who you are and how you speak — Studio references these everywhere, from captions to invoices.">
        <BrandIdentityPanel business={business} identity={identity} update={update} toggleVoice={toggleVoice} reset={reset} />
      </Section>

      {/* 2. Brand DNA */}
      <Section num="2" icon={Wand2} title="Brand DNA" subtitle="Pick a personality and every asset Studio generates follows it — colours, fonts, tone of voice and photography style.">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {PERSONALITIES.map((p) => (
            <button key={p.key} onClick={() => setPersonalityKey(p.key)}
              className={`text-left px-3 py-2 rounded-lg text-xs font-medium border transition ${personalityKey === p.key ? 'border-transparent text-white' : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
              style={personalityKey === p.key ? { background: p.palette.primary } : undefined}>
              {p.label}
            </button>
          ))}
        </div>
      </Section>

      {/* 3. Brand Colours */}
      <Section num="3" icon={Palette} title="Brand Colours" subtitle={source === 'image' ? 'Extracted automatically from your logo. Click a swatch to copy the HEX code.' : 'Add a logo to extract your real colours — for now we use your personality defaults.'}>
        <div className="flex items-center justify-between mb-3">
          <span>
            {source === 'image' ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30 px-2 py-0.5 rounded-full"><Check size={10} /> Extracted from your logo</span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 px-2 py-0.5 rounded-full">Personality defaults</span>
            )}
          </span>
          {imageToScan && (
            <button onClick={extract} disabled={extracting}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50">
              {extracting ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Re-scan logo
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {swatches.map(([label, hex]) => (
            <Swatch key={label} label={label} hex={hex} onCopied={copyHex} />
          ))}
        </div>
        {copied && <p className="mt-3 inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400"><Check size={13} /> Copied {copied}</p>}
      </Section>

      {/* 4. Typography */}
      <Section num="4" icon={Type} title="Typography" subtitle="Recommended fonts for your brand voice.">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="rounded-xl bg-gray-50 dark:bg-gray-900 p-4">
            <p className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">Headings</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white" style={{ fontFamily: `"${personality.headingFont}", system-ui` }}>{personality.headingFont}</p>
          </div>
          <div className="rounded-xl bg-gray-50 dark:bg-gray-900 p-4">
            <p className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">Body</p>
            <p className="text-lg text-gray-900 dark:text-white" style={{ fontFamily: `"${personality.bodyFont}", system-ui` }}>{personality.bodyFont}</p>
          </div>
        </div>
      </Section>

      {/* 5. Brand Assets & Guidelines */}
      <Section num="5" icon={FileText} title="Brand Assets & Guidelines" subtitle="Download the files Studio uses for your brand, plus the full brand manual.">
        <div className="flex flex-wrap gap-2 mb-4">
          {logo ? (
            <button onClick={() => downloadRemoteUrl(logo, `${slugForFile(business.name)}-logo.png`)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-gray-900 dark:bg-gray-700 text-white hover:opacity-90">
              <Download size={15} /> Original logo
            </button>
          ) : (
            <p className="text-xs text-gray-400">No logo uploaded yet — add one from your dashboard to unlock the pack.</p>
          )}
          {cover && (
            <button onClick={() => downloadRemoteUrl(cover, `${slugForFile(business.name)}-cover.png`)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
              <Download size={15} /> Profile cover
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => { downloadBrandGuidelinesPdf(business, dna, identity); toast.success('Brand guidelines PDF downloaded'); }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-purple-600 text-white hover:bg-purple-700">
            <Download size={15} /> Download PDF
          </button>
          <button onClick={() => { downloadText(brandGuidelinesText(business, dna, identity), `${slugForFile(business.name)}-brand-guidelines.txt`); toast.success('Brand guidelines text downloaded'); }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
            <Copy size={15} /> Download .txt
          </button>
          <span className="inline-flex items-center gap-1.5 text-[11px] text-gray-400"><ImageIcon size={12} /> Your digital business card, Smart ID, QR and brand-kit downloads live in Export Centre.</span>
        </div>
      </Section>

      {/* 6. AI Brand Kit */}
      <Section num="6" icon={PackageOpen} title="AI Brand Kit — one-click stationery" subtitle="Business cards, ID cards and QR live in Export Centre. Here are the everyday files your brand needs to look consistent everywhere.">
        <AiBrandKitPanel business={business} identity={identity} palette={dna.palette} />
      </Section>

      {/* 7. Brand Consistency Score */}
      <Section num="7" icon={Gauge} title="Brand Consistency Score & AI Recommendations" subtitle="A live 0–100 health check of your brand. Complete the recommendations to raise the score — every point counts.">
        <BrandHealthPanel business={business} identity={identity} />
      </Section>
    </div>
  );
}
