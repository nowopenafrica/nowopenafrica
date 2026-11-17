import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

import DesignSurface from '../studio/DesignSurface';
import { useOptionalAuth } from '../../contexts/AuthContext';
import type { CreativeBrief } from '../../lib/create/brief';
import { conceptsFor, documentFor } from '../../lib/create/compose/concepts';
import { saveConceptAsProject } from '../../lib/create/compose/openConcept';
import { archetypeOf, movementOf } from '../../lib/create/intel';
import { paletteOf } from '../../lib/design/palettes';
import { typefaceOf } from '../../lib/design/typefaces';

/**
 * Three concepts for the brief above, each a real, editable design.
 *
 * ── WHAT A CONCEPT IS HERE ───────────────────────────────────────────────
 *
 * A movement, a composition, a type pairing and a palette chosen together
 * from the Creative Intelligence Library, drawn for the format the brief
 * asked for. The three differ in all four, so this is three directions and
 * not one layout in three colours.
 *
 * ── WHAT IT IS HONEST ABOUT ──────────────────────────────────────────────
 *
 * The words are the customer's own when they wrote any. Otherwise they are
 * plain lines from a hand-written bank, and the panel says so: they are a
 * starting point, to be replaced in the editor. Nothing here invents a
 * business name, a price, a date or an address. "Your brand" and
 * "Your address" are labels waiting for the real thing.
 *
 * No photographs yet: the licensed set has not been through intake, so every
 * concept shown to a customer is built from type, shape and pattern.
 *
 * Opening one saves it as the customer's own project and opens the editor
 * there. That is the only thing on this panel that writes anything.
 */
export default function ConceptPanel({ brief, businessName }: { brief: CreativeBrief; businessName?: string }) {
  /* Optional: this panel must never be the reason the Create page fails to render. Without a provider it shows the signed-out path. */
  const user = useOptionalAuth()?.user ?? null;
  const navigate = useNavigate();
  const [opening, setOpening] = useState<number | null>(null);

  const concepts = useMemo(() => conceptsFor(brief, { businessName }), [brief, businessName]);
  const pages = useMemo(() => concepts.map((c) => documentFor(c, brief)), [concepts, brief]);
  if (!brief.industry || concepts.length === 0) return null;

  const first = pages[0].pages[0];
  const wide = first.width / first.height > 1.6;
  const ownWords = !!brief.headline;

  const open = async (k: number) => {
    if (!user || opening !== null) return;
    setOpening(k);
    const result = await saveConceptAsProject(pages[k], user.id);
    if (result.ok) { navigate(result.path); return; }
    setOpening(null);
    toast.error(`Could not open that concept: ${result.reason}`);
  };

  return (
    <section
      data-testid="concept-panel"
      aria-labelledby="concepts-heading"
      className="mt-4 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900 sm:p-5"
    >
      <h2 id="concepts-heading" className="font-coolvetica text-[1.35rem] leading-tight text-gray-900 dark:text-white">
        {concepts.length === 1 ? 'One direction for this brief' : `${concepts.length === 2 ? 'Two' : 'Three'} directions for this brief`}
      </h2>
      <p className="mt-1 max-w-[62ch] text-[13px] text-gray-600 dark:text-gray-400">
        {ownWords
          ? 'Your headline is used as you wrote it. The smaller lines are placeholders for you to replace.'
          : 'The words are placeholders to start from, not claims about your business. Replace them with your own in the editor.'}
        {' '}Labels such as “Your brand” wait for your details.
      </p>

      <ul className={`mt-4 grid gap-5 ${wide ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'}`}>
        {concepts.map((c, k) => {
          const page = pages[k].pages[0];
          const movement = movementOf(c.movement);
          const composition = archetypeOf(c.archetype);
          return (
            <li key={c.n} data-testid={`concept-${c.n}`} className="flex min-w-0 flex-col">
              <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
                <DesignSurface page={page} accent={paletteOf(c.palette)?.colours.primary ?? '#15803d'} />
              </div>
              <h3 className="mt-3 text-[15px] font-semibold text-gray-900 dark:text-white">{movement?.name ?? 'Concept'}</h3>
              <p className="mt-0.5 text-[13px] text-gray-600 dark:text-gray-400">
                {composition.name} · {paletteOf(c.palette)?.name}
              </p>
              <p className="mt-1.5 text-[13px] leading-snug text-gray-700 dark:text-gray-300">{composition.idea}</p>
              {/*
                * The type, named. A brand board says which face is the headline and
                * which is the text; a customer choosing between three concepts is
                * choosing type as much as layout, and should be told what it is.
                */}
              <p data-testid={`concept-${c.n}-type`} className="mt-1.5 text-[13px] text-gray-600 dark:text-gray-400">
                {typefaceOf(c.input.fonts.display).label === typefaceOf(c.input.fonts.text).label
                  ? <>Type: <span className="font-semibold text-gray-900 dark:text-white">{typefaceOf(c.input.fonts.display).label}</span> throughout</>
                  : <>Headline in <span className="font-semibold text-gray-900 dark:text-white">{typefaceOf(c.input.fonts.display).label}</span>, text in <span className="font-semibold text-gray-900 dark:text-white">{typefaceOf(c.input.fonts.text).label}</span></>}
              </p>
              <div className="mt-3">
                {user ? (
                  <button
                    type="button"
                    onClick={() => { void open(k); }}
                    disabled={opening !== null}
                    className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-green-700 px-4 text-sm font-bold text-white hover:bg-green-800 disabled:opacity-50"
                  >
                    {opening === k ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : null}
                    {opening === k ? 'Opening…' : 'Open in the editor'}
                    {opening === k ? null : <ArrowRight size={15} aria-hidden="true" />}
                  </button>
                ) : (
                  <Link
                    to="/login"
                    className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-gray-300 px-4 text-sm font-semibold text-gray-900 hover:bg-gray-50 dark:border-gray-600 dark:text-white dark:hover:bg-gray-800"
                  >
                    Sign in to edit this <ArrowRight size={15} aria-hidden="true" />
                  </Link>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
