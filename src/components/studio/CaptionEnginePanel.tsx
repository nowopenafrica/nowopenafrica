import { useState } from 'react';
import toast from 'react-hot-toast';
import { Copy, Send, Wand2 } from 'lucide-react';
import { Business } from '../../types';
import { generateCaptions, toneOptions, CAPTION_ANGLES } from '../../lib/captionEngine';
import { VIDEO_INDUSTRIES, industryKeyForCategory } from '../../lib/videoCreator';

interface Props {
  business: Business;
  onSchedule?: (title: string, text: string) => void;
}

export default function CaptionEnginePanel({ business, onSchedule }: Props) {
  const [industry, setIndustry] = useState(industryKeyForCategory(business.category));
  const [tone, setTone] = useState('');
  const options = generateCaptions(business, { industryKey: industry, tone });

  const copyText = (text: string, message: string) => {
    navigator.clipboard?.writeText(text).then(() => toast.success(message)).catch(() => toast.error('Could not copy — select the text manually.'));
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <select value={industry} onChange={(e) => setIndustry(e.target.value)}
          className="inline-flex items-center px-3 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg text-sm min-h-[44px]">
          {VIDEO_INDUSTRIES.map((i) => <option key={i.key} value={i.key}>{i.emoji} {i.label}</option>)}
        </select>
        <div className="flex flex-wrap gap-1.5">
          {toneOptions().map((t) => (
            <button key={t.key || 'neutral'} onClick={() => setTone(t.key)}
              className={`inline-flex items-center px-3 .5 rounded-lg text-xs font-semibold border transition ${tone === t.key ? 'border-transparent text-white bg-purple-600' : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'} min-h-[44px]`}>
              {t.label}
            </button>
          ))}
        </div>
        <button onClick={() => setTone(tone)}
          className="inline-flex items-center gap-1.5 px-3 rounded-lg text-xs font-semibold border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition min-h-[44px]">
          <Wand2 size={13} /> Regenerate
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {options.map((o) => {
          const angle = CAPTION_ANGLES.find((a) => a.key === o.angle);
          return (
            <div key={o.angle} className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 flex flex-col">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-700 dark:text-gray-200">
                  <span>{angle?.emoji}</span> {o.title}
                </span>
              </div>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-300 leading-relaxed flex-1 whitespace-pre-line">{o.text}</p>
              <p className="mt-2 text-xs text-purple-600 dark:text-purple-400 leading-relaxed">{o.hashtags}</p>
              <div className="mt-3 flex gap-2">
                <button onClick={() => copyText(o.text, 'Caption copied')}
                  className="inline-flex items-center gap-1.5 px-3 .5 rounded-lg text-xs font-semibold bg-purple-600 text-white hover:bg-purple-700 transition min-h-[44px]">
                  <Copy size={12} /> Copy
                </button>
                {onSchedule && (
                  <button onClick={() => onSchedule(o.title, o.text)}
                    className="inline-flex items-center gap-1.5 px-3 .5 rounded-lg text-xs font-semibold border border-purple-200 dark:border-purple-700 text-purple-700 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-900/30 transition min-h-[44px]">
                    <Send size={12} /> Schedule
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
