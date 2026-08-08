import toast from 'react-hot-toast';
import { Newspaper, Download, FileText, ImageIcon, Megaphone, Building2, Copy } from 'lucide-react';

// The Press Room (#10) — the public face of NowOpen Africa. Press kit, founder
// bio, media assets, the news timeline and the investor deck, all in one
// download centre the team and journalists can pull from.

const FACTS = [
  { label: 'Headquarters', value: 'Lagos, Nigeria' },
  { label: 'Launched', value: '2024' },
  { label: 'Markets', value: 'Africa-wide' },
  { label: 'Mission', value: 'Every African business, open to the world' },
  { label: 'One-liner', value: 'The business operating system that gets local businesses found, trusted and profitable.' },
];

const NEWS = [
  { date: 'Aug 2026', title: 'NowOpen Africa launches the AI Video Studio', summary: 'Businesses now turn one idea into a full video campaign — script, voiceover, captions and export — without leaving the platform.' },
  { date: 'Jun 2026', title: 'Restaurant Week returns for its biggest run', summary: 'Hundreds of restaurants across Nigeria served record footfall through the platform\'s launch-week playbook.' },
  { date: 'Mar 2026', title: 'Verified badge rolls out nationwide', summary: 'Document-based verification now protects the trusted signal behind every NowOpen profile.' },
];

const copy = (text: string, label: string) => {
  navigator.clipboard?.writeText(text).then(() => toast.success(`${label} copied`)).catch(() => toast.error('Could not copy — select manually.'));
};

export default function PressRoom() {
  return (
    <div className="space-y-5">
      {/* Hero */}
      <div className="rounded-2xl bg-gradient-to-r from-purple-600 to-blue-600 p-6 text-white">
        <div className="flex items-start gap-3">
          <Megaphone size={20} className="mt-0.5 shrink-0" />
          <div>
            <h3 className="text-sm font-bold">Press kit</h3>
            <p className="text-sm mt-1.5 leading-relaxed opacity-95 max-w-3xl">
              NowOpen Africa is the operating system for African businesses — a profile, a design studio, a marketing brain and an open-to-the-world storefront in one place. Press assets below are free to use with credit.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Key facts + founder */}
        <div className="space-y-5 min-w-0">
          <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">At a glance</h3>
            <div className="space-y-3">
              {FACTS.map((f) => (
                <div key={f.label} className="border-b border-gray-100 dark:border-gray-800 pb-2 last:border-0 last:pb-0">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{f.label}</p>
                  <p className="text-sm text-gray-800 dark:text-gray-200">{f.value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Founder bio</h3>
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center text-white font-black text-lg shrink-0">Y</div>
              <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                Yemzo started NowOpen Africa to close the gap between local businesses and the people who want to find them. Two lines of summary for journalists:
                <span className="block mt-2 text-xs italic text-gray-500 dark:text-gray-400">"{'{founder} is the founder of NowOpen Africa, building the operating system that gets every African business found, trusted and profitable.'}"</span>
              </p>
            </div>
            <button onClick={() => copy("Yemzo is the founder of NowOpen Africa, building the operating system that gets every African business found, trusted and profitable.", 'Founder bio')}
              className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 px-3 py-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition">
              <Copy size={13} /> Copy bio
            </button>
          </div>
        </div>

        {/* Media + news */}
        <div className="space-y-5 min-w-0">
          <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Media assets</h3>
            <div className="grid grid-cols-3 gap-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="aspect-square rounded-xl bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center text-white/80">
                  <ImageIcon size={20} />
                </div>
              ))}
            </div>
            <p className="mt-3 text-[11px] text-gray-400">Logo, wordmark and product screenshots — swap these with the final press images.</p>
          </div>

          <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3 flex items-center gap-1.5"><Newspaper size={13} /> News</h3>
            <div className="space-y-4">
              {NEWS.map((n) => (
                <div key={n.title} className="border-b border-gray-100 dark:border-gray-800 pb-3 last:border-0 last:pb-0">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-purple-600 dark:text-purple-400">{n.date}</p>
                  <p className="text-sm font-bold text-gray-900 dark:text-white mt-0.5">{n.title}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">{n.summary}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Download centre */}
        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 h-fit">
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3 flex items-center gap-1.5"><Download size={13} /> Download centre</h3>
          <div className="space-y-2">
            {[
              { name: 'Logo pack (SVG · PNG)', icon: ImageIcon },
              { name: 'Press release template', icon: FileText },
              { name: 'Investor deck', icon: Building2 },
              { name: 'Founder headshots', icon: ImageIcon },
              { name: 'Brand guidelines', icon: FileText },
            ].map((d) => (
              <button key={d.name} onClick={() => toast.success(`"${d.name}" — final asset lands here once exported.`)}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 text-left hover:border-purple-300 dark:hover:border-purple-700 hover:bg-gray-50 dark:hover:bg-gray-900/40 transition">
                <d.icon size={15} className="text-purple-600 dark:text-purple-400 shrink-0" />
                <span className="text-xs font-medium text-gray-700 dark:text-gray-200 flex-1">{d.name}</span>
                <Download size={13} className="text-gray-400 shrink-0" />
              </button>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-gray-400 leading-relaxed">The press room pulls from the Brand Asset Manager — export final files there and they appear here.</p>
        </div>
      </div>
    </div>
  );
}
