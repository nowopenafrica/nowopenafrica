// OpenAI Code Center — model registry.
//
// The switchable engine models are the OpenCode Zen catalogue (opencode/<id>).
// OpenCode Zen is OpenAI-compatible, so every model below works through BOTH
// engines: the built-in llm path (supabase/functions/_shared/llm.ts, needs the
// OPENCODE_API_KEY secret on ai-command) and the opencode SDK engine once the
// hosted server is deployed. Ids are typed free-form so a future Zen catalogue
// change only touches this file.

export interface AiModelOption {
  id: string;
  label: string;
}

export interface AiModelGroup {
  label: string;
  models: AiModelOption[];
}

export const AI_MODEL_GROUPS: AiModelGroup[] = [
  {
    label: 'Free',
    models: [
      { id: 'opencode/big-pickle', label: 'Big Pickle' },
      { id: 'opencode/deepseek-v4-flash-free', label: 'DeepSeek V4 Flash (free)' },
      { id: 'opencode/north-mini-code-free', label: 'North Mini Code' },
      { id: 'opencode/mimo-v2.5-free', label: 'MiMo-V2.5' },
      { id: 'opencode/laguna-s-2.1-free', label: 'Laguna S 2.1' },
      { id: 'opencode/hy3-free', label: 'Hy3' },
      { id: 'opencode/ling-3.0-flash-fin-free', label: 'Ling 3.0 Flash Fin' },
      { id: 'opencode/nemotron-3-ultra-free', label: 'Nemotron 3 Ultra' },
      { id: 'opencode/nemotron-3.5-lightning-free', label: 'Nemotron 3.5 Lightning' },
      { id: 'opencode/muse-spark-1.3-contributor-free', label: 'Muse Spark 1.3 (contributor)' },
      { id: 'opencode/minimax-m2.5-free', label: 'MiniMax M2.5 (free)' },
    ],
  },
  {
    label: 'Curated (pay-as-you-go)',
    models: [
      { id: 'opencode/deepseek-v4-flash', label: 'DeepSeek V4 Flash' },
      { id: 'opencode/deepseek-v4-pro', label: 'DeepSeek V4 Pro' },
      { id: 'opencode/deepseek-v4-flash-vision-exp', label: 'DeepSeek V4 Flash Vision (exp)' },
    ],
  },
];

export const DEFAULT_AI_MODEL = 'opencode/big-pickle';

const STORAGE_KEY = 'nowopen_ai_command_model';

export function isZenModel(id: string): boolean {
  return typeof id === 'string' && id.startsWith('opencode/');
}

export function knownModel(id: string): boolean {
  return AI_MODEL_GROUPS.some((g) => g.models.some((m) => m.id === id));
}

export function loadPreferredModel(): string {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && knownModel(saved)) return saved;
  } catch {
    // storage unavailable — default is fine
  }
  return DEFAULT_AI_MODEL;
}

export function persistPreferredModel(id: string): void {
  if (!knownModel(id)) return;
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // storage unavailable — preference just won't survive a reload
  }
}