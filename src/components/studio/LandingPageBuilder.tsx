import { useState } from 'react';
import toast from 'react-hot-toast';
import { LayoutTemplate, Eye, Share2, Download, Plus, ChevronDown, ChevronUp, Check, Link2, Smartphone, X } from 'lucide-react';
import { Business } from '../../types';
import {
  LandingPage, LandingSection, LandingTheme,
  SECTION_LABELS, LANDING_ACCENTS, generateLanding,
  landingUrl, landingShareText, renderLandingHtml,
  loadLanding, saveLanding, ctaFor,
} from '../../lib/landing';
import { downloadText, slugForFile } from '../../lib/studio';

interface Props {
  business: Business;
}

export default function LandingPageBuilder({ business }: Props) {
  const [page, setPage] = useState<LandingPage>(() => loadLanding(business.id) ?? generateLanding(business));
  const [openSection, setOpenSection] = useState<string | null>('hero');
  const [saved, setSaved] = useState(true);

  const persist = (next: LandingPage) => {
    setPage(next);
    setSaved(false);
  };

  const save = () => {
    const next = { ...page, updatedAt: new Date().toISOString() };
    setPage(next);
    saveLanding(business.id, next);
    setSaved(true);
    toast.success('Landing page saved');
  };

  const updateSection = (id: string, patch: Partial<LandingSection>) => {
    persist({ ...page, sections: page.sections.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  };

  const copyLink = () => {
    navigator.clipboard?.writeText(landingUrl(business));
    toast.success('Link copied');
  };

  const share = () => {
    const text = landingShareText(business, page);
    if (business.phone) {
      const digits = business.phone.replace(/[^\d]/g, '').replace(/^0/, '234');
      window.open(`https://wa.me/${digits}?text=${encodeURIComponent(text)}`, '_blank');
    } else toast.success('Link copied — share it anywhere.');
  };

  const downloadHtml = () => downloadText(renderLandingHtml(business, page), `${slugForFile(business.name)}-landing.html`, 'text/html');

  const preview = (s: LandingSection) => (
    <section key={s.id} className="px-6 py-5 border-b border-purple-100 dark:border-gray-700/50">
      <h3 className="text-base font-extrabold text-gray-900 dark:text-white" style={{ color: page.theme === 'dark' ? '#f9fafb' : undefined }}>{s.title}</h3>
      {s.subtitle && <p className="text-xs mt-0.5 text-gray-500 dark:text-gray-400">{s.subtitle}</p>}
      {s.body && <p className="text-xs mt-2 text-gray-600 dark:text-gray-300 whitespace-pre-line">{s.body}</p>}
      {s.items.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {s.items.map((i, idx) => (
            <li key={idx} className="text-xs px-3 py-2 rounded-lg bg-purple-50 dark:bg-gray-800 text-gray-700 dark:text-gray-200">{i}</li>
          ))}
        </ul>
      )}
      {s.ctaLabel && (
        <a href="#preview" onClick={(e) => e.preventDefault()} className="mt-3 inline-block px-4 py-1.5 rounded-full text-xs font-bold text-white"
          style={{ backgroundColor: page.accent }}>
          {s.ctaLabel}
        </a>
      )}
    </section>
  );

  const frameTheme: LandingTheme = page.theme;

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 flex flex-wrap items-center gap-2">
        <LayoutTemplate size={16} className="text-purple-600 dark:text-purple-400" />
        <span className="text-sm font-bold text-gray-900 dark:text-white mr-2">Landing page</span>
        <button onClick={save} disabled={saved}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${saved ? 'bg-gray-100 dark:bg-gray-700 text-gray-400 cursor-default' : 'bg-purple-600 text-white hover:bg-purple-700'}`}>
          <Check size={13} /> {saved ? 'Saved' : 'Save changes'}
        </button>
        <button onClick={copyLink} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 transition">
          <Link2 size={13} /> Copy link
        </button>
        <button onClick={share} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-green-600 text-white hover:bg-green-700 transition">
          <Share2 size={13} /> Share on WhatsApp
        </button>
        <button onClick={downloadHtml} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 transition">
          <Download size={13} /> Download HTML
        </button>
      </div>

      {/* Page settings */}
      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Page settings</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <input value={page.title} onChange={(e) => persist({ ...page, title: e.target.value })}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" placeholder="Page title" />
          <input value={page.tagline} onChange={(e) => persist({ ...page, tagline: e.target.value })}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" placeholder="Tagline" />
          <select value={page.theme} onChange={(e) => persist({ ...page, theme: e.target.value as LandingTheme })}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg text-sm">
            <option value="light">Light theme</option>
            <option value="dark">Dark theme</option>
          </select>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              {LANDING_ACCENTS.map((c) => (
                <button key={c} onClick={() => persist({ ...page, accent: c })}
                  className={`w-6 h-6 rounded-full transition ${page.accent === c ? 'ring-2 ring-offset-2 ring-gray-400 dark:ring-gray-500' : ''}`}
                  style={{ backgroundColor: c }} aria-label={`Accent ${c}`} />
              ))}
            </div>
            <label className="ml-auto inline-flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300 cursor-pointer">
              <input type="checkbox" checked={page.showLogo} onChange={(e) => persist({ ...page, showLogo: e.target.checked })} className="accent-purple-600" /> Logo
            </label>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Editor */}
        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Sections</h3>
          <div className="space-y-2">
            {page.sections.map((s) => {
              const open = openSection === s.id;
              return (
                <div key={s.id} className={`rounded-xl border ${s.visible ? 'border-purple-200 dark:border-purple-800' : 'border-gray-200 dark:border-gray-700'} bg-gray-50 dark:bg-gray-900 overflow-hidden`}>
                  <button onClick={() => setOpenSection(open ? null : s.id)}
                    className="w-full flex items-center justify-between px-3.5 py-2.5 text-left">
                    <span className="flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-gray-100">
                      <span className={`w-2 h-2 rounded-full ${s.visible ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`} />
                      {SECTION_LABELS[s.type]}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <button onClick={(e) => { e.stopPropagation(); updateSection(s.id, { visible: !s.visible }); }}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold uppercase text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition">
                        {s.visible ? <Eye size={12} /> : <X size={12} />} {s.visible ? 'On' : 'Off'}
                      </button>
                      {open ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
                    </span>
                  </button>
                  {open && (
                    <div className="px-3.5 pb-3.5 space-y-2.5 border-t border-gray-200 dark:border-gray-700 pt-3">
                      <input value={s.title} onChange={(e) => updateSection(s.id, { title: e.target.value })}
                        className="w-full px-2.5 py-1.5 text-sm border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500" placeholder="Title" />
                      <input value={s.subtitle} onChange={(e) => updateSection(s.id, { subtitle: e.target.value })}
                        className="w-full px-2.5 py-1.5 text-sm border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500" placeholder="Subtitle" />
                      <textarea value={s.body} onChange={(e) => updateSection(s.id, { body: e.target.value })} rows={2}
                        className="w-full px-2.5 py-1.5 text-sm border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500" placeholder="Body text" />
                      <div>
                        <label className="block text-[10px] font-semibold text-gray-500 dark:text-gray-400 mb-1">Bullet points / list items (one per line)</label>
                        <textarea value={s.items.join('\n')} onChange={(e) => updateSection(s.id, { items: e.target.value.split('\n').filter(Boolean) })} rows={2}
                          className="w-full px-2.5 py-1.5 text-sm border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500" />
                      </div>
                      <div className="flex items-center gap-2">
                        <input value={s.ctaLabel} onChange={(e) => updateSection(s.id, { ctaLabel: e.target.value })}
                          className="flex-1 px-2.5 py-1.5 text-sm border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500" placeholder="Button label" />
                        <button onClick={() => updateSection(s.id, { ctaLabel: ctaFor(business.category) })}
                          className="px-2.5 py-1.5 text-xs font-medium text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/30 rounded-lg hover:bg-purple-100 dark:hover:bg-purple-900/50 transition">
                          <Plus size={12} /> Reset
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Live preview */}
        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3 flex items-center gap-1.5">
            <Smartphone size={13} /> Live preview
          </h3>
          <div className="mx-auto max-w-xs rounded-[2rem] border-[6px] border-gray-900 dark:border-gray-600 overflow-hidden shadow-xl bg-white dark:bg-slate-900"
            style={frameTheme === 'dark' ? { backgroundColor: '#0f172a' } : undefined}>
            <div className="h-5 flex items-center justify-center bg-gray-900 dark:bg-gray-600">
              <span className="w-12 h-1.5 rounded-full bg-gray-600 dark:bg-gray-400" />
            </div>
            <div className="max-h-[420px] overflow-y-auto">
              <header className="text-center px-6 py-5" style={{ backgroundColor: frameTheme === 'dark' ? '#111c33' : '#faf5ff' }}>
                {page.showLogo && business.logo_url && (
                  <img src={business.logo_url} alt="" className="w-10 h-10 rounded-xl object-cover mx-auto mb-2" />
                )}
                <h2 className="text-lg font-extrabold text-gray-900 dark:text-gray-100">{page.title}</h2>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">{page.tagline}</p>
              </header>
              <div className="divide-y divide-gray-100 dark:divide-gray-700/50">
                {page.sections.filter((s) => s.visible).map(preview)}
              </div>
              <footer className="px-6 py-4 text-center text-[10px] text-gray-400 dark:text-gray-500">
                {business.name} · {business.location} · Find us on NowOpen Africa
              </footer>
            </div>
          </div>
        </div>
      </div>

      <p className="text-[11px] text-gray-400">
        Your landing page publishes at <span className="font-mono text-gray-500 dark:text-gray-400">{landingUrl(business)}</span> — share that link on WhatsApp, in your bio and in campaigns.
      </p>
    </div>
  );
}
