import { useState } from 'react';
import { CornerDownLeft, Sparkles } from 'lucide-react';

import type { DesignPage } from '../../lib/studio/designDocument';
import type { PatchOp } from '../../lib/studio/designPatch';
import {
  CAPABILITIES, PROMPT_PLACEHOLDER, opsFromPrompt, type PromptVariant,
} from '../../lib/studio/promptOps';

/**
 * Say what you want changed.
 *
 * ── WHAT THIS IS, AND IS NOT ─────────────────────────────────────────────
 *
 * It is a deterministic instruction bar. Every sentence it accepts is turned
 * into operations by `promptOps.ts` and validated by `designPatch.ts`, in
 * the browser, instantly, for nothing. No model is called and none is
 * implied: the word "AI" does not appear, because this is a parser.
 *
 * It refuses by name. "Make it more premium" gets told, plainly, that it is
 * not something this can do — and told three things it CAN do. A composer
 * that silently does nothing teaches people it is broken; one that invents a
 * change teaches them not to trust it.
 *
 * ── WHY IT IS NOT A CHAT ─────────────────────────────────────────────────
 *
 * There is no transcript, because there is no conversation to keep: each
 * instruction is applied to the document and the document IS the state. Undo
 * is the history, and it is the one the drag handles already write to — so a
 * typed change and a dragged one undo the same way, in the same order.
 */
export default function PromptComposer({
  page,
  selectedId,
  onApply,
  onVariant,
}: {
  page: DesignPage;
  selectedId: string | null;
  /** Applies the operations and returns why any of them did not land. */
  onApply: (ops: PatchOp[]) => { rejected: string[] };
  /**
   * Adds a copy of this design at another size.
   *
   * Separate from `onApply` because it changes the document rather than the
   * page — the original has to still be there afterwards, which is the whole
   * point of asking for a version.
   */
  onVariant: (variant: PromptVariant) => void;
}) {
  const [value, setValue] = useState('');
  const [said, setSaid] = useState<{ text: string; ok: boolean } | null>(null);

  const run = () => {
    const prompt = value.trim();
    if (!prompt) return;
    const outcome = opsFromPrompt(prompt, page, selectedId);

    if (!outcome.understood) {
      setSaid({ text: outcome.say, ok: false });
      return;
    }

    if (outcome.variant) {
      onVariant(outcome.variant);
      setSaid({ text: outcome.say, ok: true });
      setValue('');
      return;
    }

    const { rejected } = onApply(outcome.ops);
    /*
     * The parser can produce an operation the validator declines — "bigger"
     * on type already at the ceiling. Reporting the parser's cheerful
     * sentence then would claim a change that never happened.
     */
    if (rejected.length && rejected.length >= outcome.ops.length) {
      setSaid({ text: rejected[0], ok: false });
      return;
    }
    setSaid({
      text: rejected.length ? `${outcome.say} (${rejected[0]})` : outcome.say,
      ok: true,
    });
    setValue('');
  };

  return (
    <div className="border-t border-gray-200 bg-white px-3 py-2.5 dark:border-gray-800 dark:bg-gray-900">
      <div className="mx-auto flex max-w-3xl items-center gap-2">
        <Sparkles size={15} className="shrink-0 text-gray-400" aria-hidden />
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); run(); } }}
          placeholder={PROMPT_PLACEHOLDER}
          aria-label="Change the design by typing an instruction"
          className="min-h-[40px] w-full min-w-0 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 dark:border-gray-600 dark:bg-gray-950 dark:text-gray-100"
        />
        <button
          type="button"
          onClick={run}
          disabled={!value.trim()}
          className="inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-lg bg-gray-900 px-3.5 text-sm font-semibold text-white disabled:opacity-40 dark:bg-white dark:text-gray-900"
        >
          <CornerDownLeft size={14} /> Apply
        </button>
      </div>

      <div className="mx-auto mt-1.5 flex max-w-3xl flex-wrap items-center gap-1.5">
        {said ? (
          <p className={`text-[11px] ${said.ok ? 'text-gray-500' : 'text-amber-700 dark:text-amber-300'}`}>
            {said.text}
          </p>
        ) : (
          /* Examples in the exact words it accepts, so the first try works. */
          CAPABILITIES.slice(0, 3).map((hint) => (
            <button
              key={hint}
              type="button"
              onClick={() => setValue(hint)}
              className="rounded-full border border-gray-200 px-2.5 py-1 text-[11px] text-gray-500 hover:border-gray-400 hover:text-gray-700 dark:border-gray-700 dark:text-gray-400"
            >
              {hint}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
