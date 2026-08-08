import { useState } from 'react';
import { Sparkles, ChevronDown } from 'lucide-react';
import GeneratePanel from './GeneratePanel';
import { GenerateKind } from '../../lib/studioModels';

// Sits next to any "Upload image / video" control: one button expands the same
// generate panel used in DesignStudio, and the result lands exactly where an
// upload would — so the surrounding code never has to know where the media
// came from. Kept mounted (hidden) so a prompt survives closing and reopening.

export default function AiGenerateToggle({
  onGenerated,
  defaultPrompt,
  width,
  height,
  label = 'Generate with AI',
}: {
  onGenerated: (url: string, kind: GenerateKind) => void;
  defaultPrompt?: string;
  width: number;
  height: number;
  label?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900/50 transition"
      >
        <Sparkles size={13} /> {label}
        <ChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <div className={open ? 'mt-2' : 'hidden'}>
        <GeneratePanel
          width={width}
          height={height}
          defaultPrompt={defaultPrompt}
          onGenerated={(url, kind) => { onGenerated(url, kind); setOpen(false); }}
        />
      </div>
    </div>
  );
}
