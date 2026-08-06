import { useState } from 'react';
import toast from 'react-hot-toast';
import { Copy, Download, PenTool, Send, Wand2 } from 'lucide-react';
import { Business } from '../../types';
import { COPY_GOALS, COPY_PLATFORMS, CopyGoal, CopyPlatform, copyForGoal, hashtagsFor, copyPack } from '../../lib/copywriter';
import { downloadText, slugForFile } from '../../lib/studio';
import { GrowthPlanModule } from '../../lib/growth';
import CaptionEnginePanel from './CaptionEnginePanel';

interface Props {
  business: Business;
  onDesign: (templateKey: string) => void;
  onSchedule: (title: string, text: string) => void;
  onNavigate: (module: GrowthPlanModule) => void;
}

const GOAL_TO_TEMPLATE: Record<CopyGoal, string> = {
  'grand-opening': 'grand-opening',
  'product-launch': 'new-product',
  'weekend-promo': 'weekend-offer',
  'flash-sale': 'flash-sale',
  'seasonal-sale': 'discount',
  hiring: 'hiring',
  event: 'event',
  'thank-you': 'thank-you',
  anniversary: 'anniversary',
  testimonial: 'thank-you',
  'behind-scenes': 'now-open',
  educational: 'customer-appreciation',
  'new-arrival': 'new-product',
};

export default function ContentFactory({ business, onDesign, onSchedule, onNavigate }: Props) {
  const [goal, setGoal] = useState<CopyGoal>('weekend-promo');
  const [platform, setPlatform] = useState<CopyPlatform>('instagram');
  const caption = copyForGoal(business, goal, platform);
  const goalLabel = COPY_GOALS.find((g) => g.key === goal)?.label || goal;

  const copyText = (text: string, message: string) => {
    navigator.clipboard?.writeText(text).then(() => toast.success(message)).catch(() => toast.error('Could not copy — select the text manually.'));
  };

  const downloadPack = () => {
    const pack = copyPack(business, goal);
    const text = pack.map((p) => `[${p.platform.toUpperCase()}]\n${p.text}${p.hashtags ? `\n\n${p.hashtags}` : ''}`).join('\n\n---\n\n');
    downloadText(text, `${slugForFile(business.name)}-${goal}-copy-pack.txt`);
    toast.success('Copy pack downloaded');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-pink-500 to-purple-600 text-white flex items-center justify-center">
            <Wand2 size={18} />
          </div>
          <div>
            <h3 className="text-base font-bold text-gray-900 dark:text-white">AI Content Factory</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">Captions, copy packs, designs and videos — all from your profile.</p>
          </div>
        </div>
      </div>

      {/* Caption generator */}
      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
        <h4 className="text-sm font-bold text-gray-900 dark:text-white mb-4">AI Caption Generator — industry × tone</h4>
        <CaptionEnginePanel business={business} onSchedule={onSchedule} />
      </div>

      {/* Copy pack builder */}
      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
        <h4 className="text-sm font-bold text-gray-900 dark:text-white mb-4">Copy pack builder</h4>
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <div className="lg:col-span-1 space-y-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Goal</label>
              <select value={goal} onChange={(e) => setGoal(e.target.value as CopyGoal)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg text-sm">
                {COPY_GOALS.map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Platform</label>
              <select value={platform} onChange={(e) => setPlatform(e.target.value as CopyPlatform)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg text-sm">
                {COPY_PLATFORMS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
            </div>
            <button onClick={downloadPack}
              className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-purple-600 text-white hover:bg-purple-700 transition">
              <Download size={13} /> Download full pack
            </button>
          </div>
          <div className="lg:col-span-4">
            <textarea value={caption} onChange={() => {}}
              rows={7}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-900/50 dark:text-white rounded-lg text-sm leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-purple-500" />
            {hashtagsFor(business, goal) && (
              <p className="mt-2 text-xs text-purple-600 dark:text-purple-400">{hashtagsFor(business, goal)}</p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={() => copyText(caption, 'Caption copied')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-purple-600 text-white hover:bg-purple-700 transition">
                <Copy size={13} /> Copy
              </button>
              <button onClick={() => onDesign(GOAL_TO_TEMPLATE[goal])}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition">
                <PenTool size={13} /> Design this post
              </button>
              <button onClick={() => onSchedule(goalLabel, caption)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold border border-purple-200 dark:border-purple-700 text-purple-700 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-900/30 transition">
                <Send size={13} /> Schedule & publish
              </button>
              <button onClick={() => onNavigate('flyer')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition">
                🎬 Make a video with AI Video Creator
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
