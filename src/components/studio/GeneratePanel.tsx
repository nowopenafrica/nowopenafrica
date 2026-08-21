import { useMemo, useState } from 'react';
import { Sparkles, Loader2, KeyRound, ChevronDown, Image as ImageIcon, Video as VideoIcon } from 'lucide-react';
import {
  STUDIO_MODELS, CUSTOM_MODEL_ID, generateMedia, generateMessage,
  type StudioModel, type GenerateKind,
} from '../../lib/studioModels';
import PasswordToggle from '../PasswordToggle';

// Generate a background instead of uploading one.
//
// Sits directly under the upload control because it answers the same question —
// "what goes behind this design?" — for someone who has no photo to hand. The
// result is handed back as a data: URL, which is exactly what the upload path
// produces, so the rest of the Studio needs no special case.

export default function GeneratePanel({
  onGenerated,
  defaultPrompt,
  width,
  height,
}: {
  onGenerated: (url: string, kind: GenerateKind) => void;
  defaultPrompt?: string;
  width: number;
  height: number;
}) {
  const [prompt, setPrompt] = useState(defaultPrompt ?? '');
  const [modelId, setModelId] = useState(STUDIO_MODELS[0].id);
  const [customId, setCustomId] = useState('');
  const [ownKey, setOwnKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [revealKey, setRevealKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const selected: StudioModel | null = useMemo(
    () => STUDIO_MODELS.find((m) => m.id === modelId) ?? null,
    [modelId],
  );
  const isCustom = modelId === CUSTOM_MODEL_ID;
  const kind: GenerateKind = isCustom
    ? (customId.includes('video') || customId.includes('t2v') ? 'video' : 'image')
    : (selected?.kind ?? 'image');

  const run = async () => {
    const text = prompt.trim();
    if (!text) { setStatus('Describe what you want first.'); return; }
    const id = isCustom ? customId.trim() : modelId;
    if (isCustom && !id) { setStatus('Paste a model id, e.g. replicate:owner/name.'); return; }

    setBusy(true);
    setStatus(kind === 'video' ? 'Generating — a clip can take a few minutes.' : 'Generating…');
    try {
      const out = await generateMedia({
        prompt: text,
        width,
        height,
        model: id,
        apiKey: ownKey.trim() || undefined,
        kind,
      });
      if (out.ok) {
        onGenerated(out.dataUrl, kind);
        setStatus(`Added — ${out.model}`);
      } else {
        setStatus(generateMessage(out.reason, selected, Boolean(ownKey.trim())));
      }
    } finally {
      setBusy(false);
    }
  };

  const free = STUDIO_MODELS.filter((m) => m.tier === 'free');
  const paid = STUDIO_MODELS.filter((m) => m.tier === 'paid');

  return (
    <div className="rounded-xl border border-purple-200 dark:border-purple-800/60 bg-purple-50/50 dark:bg-purple-900/10 p-3">
      <div className="flex items-center gap-1.5 mb-2">
        <Sparkles size={13} className="text-purple-500" />
        <h4 className="text-xs font-bold text-gray-900 dark:text-white">Or generate one</h4>
      </div>

      <label className="sr-only" htmlFor="gen-prompt">Describe the image or video</label>
      <textarea
        id="gen-prompt"
        rows={2}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Jollof rice steaming on a plate, warm evening light"
        className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2.5 py-2 text-xs text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
      />

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="gen-model">Model</label>
        <div className="relative flex-1 min-w-[190px]">
          <select
            id="gen-model"
            value={modelId}
            onChange={(e) => { setModelId(e.target.value); setStatus(null); }}
            className="w-full appearance-none rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 pl-2.5 pr-7 min-h-[44px] text-xs font-medium text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            <optgroup label="Free — open weights">
              {free.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </optgroup>
            <optgroup label="Paid — needs a Replicate key">
              {paid.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </optgroup>
            <optgroup label="Anything else">
              <option value={CUSTOM_MODEL_ID}>Custom model id…</option>
            </optgroup>
          </select>
          <ChevronDown size={13} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
        </div>

        <button
          type="button"
          onClick={run}
          disabled={busy}
          className="inline-flex items-center gap-1.5 px-3 min-h-[44px] rounded-lg bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : kind === 'video' ? <VideoIcon size={13} /> : <ImageIcon size={13} />}
          {busy ? 'Generating' : 'Generate'}
        </button>
      </div>

      {isCustom && (
        <input
          value={customId}
          onChange={(e) => setCustomId(e.target.value)}
          placeholder="replicate:owner/model-name  or  hf:owner/model-name"
          className="mt-2 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2.5 min-h-[44px] text-xs text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
      )}

      <p className="mt-1.5 text-[11px] text-gray-500 dark:text-gray-400">
        {isCustom
          ? 'Any Hugging Face or Replicate model. Video models run on Replicate and take a few minutes.'
          : selected?.note}
      </p>

      <button
        type="button"
        onClick={() => setShowKey((v) => !v)}
        aria-expanded={showKey}
        className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-semibold text-gray-600 dark:text-gray-300 hover:text-purple-600 dark:hover:text-purple-400 min-h-[44px]"
      >
        <KeyRound size={12} />
        {ownKey.trim() ? 'Using your own key' : 'Use your own API key'}
        <ChevronDown size={12} className={`transition-transform ${showKey ? 'rotate-180' : ''}`} />
      </button>

      {showKey && (
        <div className="mt-1">
          <label className="sr-only" htmlFor="gen-key">Your API key</label>
          <div className="relative">
          <input
            id="gen-key"
            type={revealKey ? 'text' : 'password'}
            autoComplete="off"
            value={ownKey}
            onChange={(e) => setOwnKey(e.target.value)}
            placeholder={selected?.needs === 'REPLICATE_API_TOKEN' ? 'r8_…' : 'hf_…'}
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 pl-2.5 pr-11 min-h-[44px] text-xs text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
          {/* A mistyped API key fails with a bare 401, so being able to read
              back what you pasted is the difference between one attempt and
              several. */}
          <PasswordToggle shown={revealKey} onToggle={() => setRevealKey(!revealKey)} field="API key" />
          </div>
          {/* Say exactly what happens to it. A vague "we keep it safe" would be
              worse than saying nothing, and this is a paid credential. */}
          <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
            Held in this tab only — not saved, and gone when you close it. It passes through NowOpen to reach the
            provider and is never stored or logged. Leave empty to use the platform's own model.
          </p>
        </div>
      )}

      {status && (
        <p role="status" className="mt-2 text-[11px] text-gray-700 dark:text-gray-200">{status}</p>
      )}
    </div>
  );
}
