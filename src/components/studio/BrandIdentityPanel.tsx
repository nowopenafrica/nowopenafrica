import { useState } from 'react';
import { Mic, RotateCcw, Quote } from 'lucide-react';
import { Business } from '../../types';
import {
  BrandIdentity, BRAND_VOICE_TRAITS, WRITING_STYLES, voicePreview, writingStyleLabel,
} from '../../lib/brandIdentity';

interface Props {
  business: Business;
  identity: BrandIdentity;
  update: (patch: Partial<BrandIdentity>) => void;
  toggleVoice: (key: string) => void;
  reset: () => void;
}

const inputCls = 'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500';

export default function BrandIdentityPanel({ business, identity, update, toggleVoice, reset }: Props) {
  const samples = voicePreview(business, identity);
  const [tone, setTone] = useState(samples[0].tone);
  const active = samples.find((s) => s.tone === tone) ?? samples[0];
  const hasVoice = identity.voice.length > 0 || identity.writingStyle !== 'professional';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Identity fields */}
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2">
            <label className="block text-[11px] font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Tagline</label>
            <input value={identity.tagline} onChange={(e) => update({ tagline: e.target.value })}
              placeholder="e.g. Our meat is always fresh."
              className={inputCls} />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Established</label>
            <input value={identity.established} onChange={(e) => update({ established: e.target.value })}
              placeholder="2020"
              className={inputCls} />
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Brand promise</label>
          <input value={identity.brandPromise} onChange={(e) => update({ brandPromise: e.target.value })}
            placeholder="The promise customers remember"
            className={inputCls} />
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Mission</label>
          <textarea value={identity.mission} onChange={(e) => update({ mission: e.target.value })}
            placeholder="Why you exist — the change you make for customers"
            rows={2} className={inputCls} />
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Vision</label>
          <textarea value={identity.vision} onChange={(e) => update({ vision: e.target.value })}
            placeholder="Where you're going in the next 3–5 years"
            rows={2} className={inputCls} />
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Business story</label>
          <textarea value={identity.story} onChange={(e) => update({ story: e.target.value })}
            placeholder="How it started, the journey so far, what's next…"
            rows={3} className={inputCls} />
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Brand keywords <span className="font-normal text-gray-400">(comma-separated)</span></label>
          <input value={identity.keywords} onChange={(e) => update({ keywords: e.target.value })}
            placeholder="fresh, luxury, trusted, fast"
            className={inputCls} />
        </div>

        <button onClick={reset} className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition">
          <RotateCcw size={12} /> Reset identity
        </button>
      </div>

      {/* Brand voice */}
      <div className="space-y-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Mic size={15} className="text-purple-600 dark:text-purple-400" />
            <p className="text-sm font-bold text-gray-900 dark:text-white">Brand voice</p>
            {hasVoice && <span className="text-[10px] font-medium text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30 px-2 py-0.5 rounded-full">Set</span>}
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Every caption, flyer, email and proposal Studio writes follows this voice.</p>
          <div className="flex flex-wrap gap-2">
            {BRAND_VOICE_TRAITS.map((t) => {
              const on = identity.voice.includes(t.key);
              return (
                <button key={t.key} onClick={() => toggleVoice(t.key)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${on ? 'border-transparent text-white' : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                  style={on ? { background: '#7c3aed' } : undefined}>
                  {on ? '✓ ' : ''}{t.label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Writing style</label>
          <div className="flex flex-wrap gap-2">
            {WRITING_STYLES.map((s) => (
              <button key={s.key} onClick={() => update({ writingStyle: s.key })}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${identity.writingStyle === s.key ? 'border-transparent text-white' : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                style={identity.writingStyle === s.key ? { background: '#7c3aed' } : undefined}>
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Voice preview */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Quote size={14} className="text-purple-600 dark:text-purple-400" />
            <p className="text-sm font-bold text-gray-900 dark:text-white">Brand voice preview</p>
            <span className="ml-auto text-[10px] font-medium text-gray-400">Writing style: {writingStyleLabel(identity.writingStyle)}</span>
          </div>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {samples.map((s) => (
              <button key={s.tone} onClick={() => setTone(s.tone)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition ${tone === s.tone ? 'text-white' : 'bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-600'}`}
                style={tone === s.tone ? { background: '#7c3aed' } : undefined}>
                {s.tone}
              </button>
            ))}
          </div>
          <p className="text-sm text-gray-700 dark:text-gray-300 italic">{active.text}</p>
        </div>
      </div>
    </div>
  );
}
