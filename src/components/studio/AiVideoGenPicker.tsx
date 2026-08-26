import { useEffect, useState } from 'react';
import { Zap, AlertCircle } from 'lucide-react';
import { fetchProviderStatus, type ProviderStatus } from '../../lib/studioModels';
import {
  VIDEO_GEN_TIERS, videoGenModelsForTier, videoGenModelByKey, videoGenReason,
  type VideoGenTier,
} from '../../lib/videoGen';
import type { AiVideoModel } from '../../lib/pollinations';

// Shared free / paid AI video generation picker used by the studios. Only the
// tier + model matter here: the tier decides the cost, the model decides which
// engine the clip requests go to. Used by the AI Video Studio and the Motion
// Graphics Studio so the choice looks and behaves the same everywhere.

export default function AiVideoGenPicker({
  tier, onTier, model, onModel,
}: {
  tier: VideoGenTier;
  onTier: (t: VideoGenTier) => void;
  model: AiVideoModel;
  onModel: (m: AiVideoModel) => void;
}) {
  // Video needs Replicate or Pollinations specifically — the free image
  // provider has no text-to-video model — so the picker checks and says so
  // rather than letting someone choose an engine that cannot be reached.
  const [provider, setProvider] = useState<ProviderStatus | null>(null);
  useEffect(() => {
    const ac = new AbortController();
    fetchProviderStatus(ac.signal).then(setProvider).catch(() => { /* reported as unconfigured */ });
    return () => ac.abort();
  }, []);
  const canGenerateVideo = provider
    ? provider.provider === 'replicate' || provider.provider === 'pollinations'
    : true;

  const current = videoGenModelByKey(model) ?? videoGenModelsForTier(tier)[0];
  const models = videoGenModelsForTier(tier);
  const reason = videoGenReason(tier, current);

  return (
    <div className="rounded-xl border border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-900/30 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-wide text-purple-600 dark:text-purple-300 flex items-center gap-1">
          <Zap size={11} /> AI video gen — {tier === 'free' ? 'open-weight' : 'premium'} model
        </p>
        <div className="flex rounded-lg bg-gray-100 dark:bg-gray-800 p-0.5">
          {VIDEO_GEN_TIERS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => onTier(t.key)}
              aria-pressed={tier === t.key}
              className={`inline-flex items-center px-3 rounded-md text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 ${ tier === t.key ? 'bg-purple-600 text-white shadow-sm' : 'text-gray-600 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-700' } min-h-[44px]`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {provider && !canGenerateVideo && (
        <p role="status" className="mt-2 flex items-start gap-1.5 text-[10px] leading-snug text-amber-700 dark:text-amber-400">
          <AlertCircle size={12} className="mt-px flex-shrink-0" aria-hidden="true" />
          {provider.ok
            ? `${provider.label} generates stills only — it has no text-to-video model, so clips will fall back to designed graphics. Video needs a Replicate or Pollinations key.`
            : 'No video model is connected, so clips will fall back to designed graphics.'}
        </p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <select
          value={current.key}
          onChange={(e) => onModel(e.target.value as AiVideoModel)}
          className="inline-flex items-center rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500 min-h-[44px]"
        >
          {models.map((m) => (
            <option key={m.key} value={m.key}>{m.label} · {m.maker} — {m.note}</option>
          ))}
        </select>
        <span className="text-[11px] text-purple-700 dark:text-purple-300 font-semibold">
          {current.label} · {tier === 'free' ? 'no cost' : 'billed per render'}
        </span>
      </div>

      <p className="mt-2 text-[11px] text-gray-600 dark:text-gray-300 leading-snug">{reason}</p>
    </div>
  );
}
