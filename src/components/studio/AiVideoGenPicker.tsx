import { Zap } from 'lucide-react';
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
  const current = videoGenModelByKey(model) ?? videoGenModelsForTier(tier)[0];
  const models = videoGenModelsForTier(tier);
  const reason = videoGenReason(tier, current);

  return (
    <div className="rounded-xl border border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-900/30 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-wide text-purple-600 dark:text-purple-300 flex items-center gap-1">
          <Zap size={11} /> AI video gen — {tier === 'free' ? 'free' : 'paid'} model
        </p>
        <div className="flex rounded-lg bg-gray-100 dark:bg-gray-800 p-0.5">
          {VIDEO_GEN_TIERS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => onTier(t.key)}
              aria-pressed={tier === t.key}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 ${
                tier === t.key
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <select
          value={current.key}
          onChange={(e) => onModel(e.target.value as AiVideoModel)}
          className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
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
