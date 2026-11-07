import { Info } from 'lucide-react';
import { needsConfirmationLabel, statusOf, type ProvenancedContent } from '../../lib/contentProvenance';

/**
 * Says, once, that some of what follows is not confirmed.
 *
 * WHY ONE NOTICE AND NOT A BADGE PER ITEM
 *
 * The services tab feeds roughly twenty category-specific renderers — a repair
 * queue, a menu, a room list, a class timetable — each with its own layout.
 * Threading a badge through all of them would be invasive, easy to miss in one,
 * and would put a warning beside every line of an eight-item list. A reader
 * meeting eight warnings stops reading warnings.
 *
 * One sentence above the list says the same thing once, and the ordering does
 * the rest: `publicContent` sorts what the business stands behind to the top,
 * so the confirmed items are the ones read first.
 *
 * WHAT IT MUST NEVER BECOME
 *
 * A disclaimer. It is a fact about provenance and an instruction — "ask them" —
 * not an apology for the page. It renders at all only when there is something
 * unconfirmed to describe.
 */

export interface SuggestedContentNoticeProps {
  /** The items actually being rendered below it. */
  items: ProvenancedContent[];
  /** "services" / "products" / "offerings" — what the list is called here. */
  noun?: string;
  className?: string;
}

export default function SuggestedContentNotice({
  items, noun = 'items', className = '',
}: SuggestedContentNoticeProps) {
  const unconfirmed = items.filter(needsConfirmationLabel);
  if (unconfirmed.length === 0) return null;

  const suggested = unconfirmed.filter((i) => statusOf(i) === 'suggested').length;
  const sourced = unconfirmed.length - suggested;
  const all = unconfirmed.length === items.length;

  /*
   * The wording changes with what is actually true, rather than one vague
   * sentence covering both cases. "Typical for this category" and "taken from a
   * public source" are different claims and a reader deserves to know which.
   */
  let body: string;
  if (suggested && !sourced) {
    body = all
      ? `These ${noun} are typical for this category. NowOpen has not confirmed that this business offers them — please check before you travel or pay.`
      : `Some of these ${noun} are typical for this category rather than confirmed by the business. Please check before you travel or pay.`;
  } else if (sourced && !suggested) {
    body = `Some details here came from public sources and have not been confirmed by the business.`;
  } else {
    body = `Some of these ${noun} came from public sources or are typical for this category. None has been confirmed by the business.`;
  }

  return (
    <div
      className={`mb-4 flex items-start gap-2.5 rounded-xl border border-amber-200/70 dark:border-amber-800/60 bg-amber-50/70 dark:bg-amber-900/15 px-3.5 py-2.5 ${className}`}
      role="note"
    >
      <Info size={15} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
      <p className="text-[12px] sm:text-[13px] leading-relaxed text-amber-900 dark:text-amber-100">
        {body}
      </p>
    </div>
  );
}
