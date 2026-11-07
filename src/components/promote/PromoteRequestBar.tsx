import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowUp, Megaphone } from 'lucide-react';

import { parsePromoteIntent } from '../../lib/promote/promoteIntent';
import type { GoalSlug } from '../../lib/promote/goals';

/**
 * The Promote request bar: "What do you want to achieve?" and the goal tiles
 * under it. The twin of Create's IntentComposer.
 *
 * The sentence is read by the deterministic parser in
 * lib/promote/promoteIntent.ts — no model is involved and none is pretended.
 * Words that name a goal open that goal's view (with the city, when one was
 * named), the same place a tile lands. A city on its own sets the area and
 * the placement filter, and says so, because that part was understood. Words
 * that name neither say so in one line and leave the tiles to do the work.
 */
export default function PromoteRequestBar({
  goal, onGoal, onCity, children,
}: {
  /** The open goal, if any: a city-only request then just changes its area. */
  goal: GoalSlug | null;
  onGoal: (goal: GoalSlug, city: string | null) => void;
  onCity: (city: string) => void;
  /** The goal tiles, which belong to the request bar. */
  children?: ReactNode;
}) {
  const [text, setText] = useState('');
  /* What the last request resolved to, when it did not open a goal. */
  const [note, setNote] = useState<{ kind: 'miss' } | { kind: 'city'; city: string } | null>(null);

  /* A goal opened or closed (a tile, Back) answers the last request; its note is stale now. */
  useEffect(() => { setNote(null); }, [goal]);

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (!text.trim()) return;
    const asked = parsePromoteIntent(text);
    const city = asked.city;
    if (asked.goal) {
      setNote(null);
      onGoal(asked.goal, city);
      return;
    }
    if (city) {
      onCity(city);
      /* With a goal open the area chip already shows the change; "pick a goal" would be wrong. */
      setNote(goal ? null : { kind: 'city', city });
      return;
    }
    setNote({ kind: 'miss' });
  };

  return (
    <section
      data-promote-section="request"
      aria-labelledby="promote-intent"
      className="rounded-3xl border border-gray-200 bg-white px-4 py-6 shadow-sm dark:border-gray-700 dark:bg-gray-800/60 sm:px-8 sm:py-9"
    >
      <p className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-orange-600 dark:text-orange-400">
        <Megaphone size={14} aria-hidden /> NowOpen Promote
      </p>
      <h1 id="promote-intent" className="mt-2 text-[1.6rem] font-bold leading-[1.15] tracking-tight text-gray-900 dark:text-white sm:text-[2.25rem]">
        What do you want to achieve?
      </h1>
      {/* The page's old headline, kept as the promise under the question. */}
      <p className="mt-2 max-w-xl text-sm text-gray-600 dark:text-gray-400">
        Be seen where people are. Then see who came. Say it in your own words, or pick a goal.
      </p>

      <form onSubmit={submit} className="mt-5 min-w-0">
        <div className="flex items-center gap-2 rounded-2xl border border-gray-300 bg-white p-2 focus-within:border-orange-500 focus-within:ring-2 focus-within:ring-orange-500/30 dark:border-gray-600 dark:bg-gray-900">
          <label htmlFor="promote-prompt" className="sr-only">Describe what you want to achieve</label>
          <input
            id="promote-prompt"
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="A Black Friday sale in Lagos"
            autoComplete="off"
            className="min-h-[44px] min-w-0 flex-1 bg-transparent px-2.5 text-[15px] text-gray-900 placeholder:text-gray-400 focus:outline-none dark:text-white"
          />
          <button
            type="submit"
            disabled={!text.trim()}
            aria-label="Find my mix"
            className="grid h-[44px] w-[44px] shrink-0 place-items-center rounded-xl bg-orange-600 text-white hover:bg-orange-700 disabled:opacity-40"
          >
            <ArrowUp size={18} aria-hidden />
          </button>
        </div>
        {note && (
          <p
            data-testid="promote-no-match"
            role="status"
            className="mt-3 rounded-2xl bg-gray-50 px-4 py-3 text-sm text-gray-700 dark:bg-gray-900/60 dark:text-gray-300"
          >
            {note.kind === 'city'
              ? `Showing placements in ${note.city}. Pick a goal to see a plan.`
              : 'We could not match that to a goal yet. Pick the closest one below.'}
          </p>
        )}
      </form>

      {children && <div className="mt-6">{children}</div>}
    </section>
  );
}
