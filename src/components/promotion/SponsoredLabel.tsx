import { Megaphone } from 'lucide-react';

/**
 * The label that must appear on anything somebody paid to put in front of you.
 *
 * ── WHY THIS IS A COMPONENT AND NOT A CONVENTION ─────────────────────────
 *
 * The rule is that paid placement is never disguised as organic ranking. A
 * rule like that survives exactly as long as everyone remembers it: the first
 * card built in a hurry without the label ships a sponsored listing that reads
 * as an editorial recommendation, and nothing fails, nothing errors, and no
 * test notices — the card simply looks like all the others. That is the point
 * at which a directory stops being trustworthy, and it is invisible in review.
 *
 * So the labelling is not left to whoever writes the markup. `placementKind`
 * is a required prop on the card, the label is rendered from it, and a test
 * asserts that a paid kind cannot render without one. Forgetting becomes a
 * failure rather than a silence.
 *
 * ── THE WORDS ────────────────────────────────────────────────────────────
 *
 * "Sponsored", "Featured" and "Promoted" are not interchangeable, and picking
 * whichever sounds best is how a label stops meaning anything:
 *
 *   Sponsored — a third party paid for this position.
 *   Featured  — the business paid to be surfaced here.
 *   Promoted  — the business paid to amplify something it already published.
 *
 * All three are disclosures. None of them is decoration, which is why the
 * styling is legible rather than a faint grey the eye skips.
 */

export type PlacementKind =
  /** Not paid for. Carries no label, and must never be given one. */
  | 'organic'
  | 'sponsored'
  | 'featured'
  | 'promoted';

/** The paid kinds. Anything here must be disclosed wherever it is rendered. */
export const PAID_PLACEMENTS: readonly PlacementKind[] = ['sponsored', 'featured', 'promoted'];

export function isPaidPlacement(kind: PlacementKind): boolean {
  return PAID_PLACEMENTS.includes(kind);
}

const WORDING: Record<Exclude<PlacementKind, 'organic'>, { label: string; title: string }> = {
  sponsored: {
    label: 'Sponsored',
    title: 'A business paid for this position. It is not ranked by relevance alone.',
  },
  featured: {
    label: 'Featured',
    title: 'This business paid to be surfaced here. It is not ranked by relevance alone.',
  },
  promoted: {
    label: 'Promoted',
    title: 'This business paid to amplify this. It is not ranked by relevance alone.',
  },
};

interface SponsoredLabelProps {
  kind: PlacementKind;
  className?: string;
}

/**
 * Renders nothing for organic placement — an unpaid listing wearing a
 * "Featured" badge is the same lie in the other direction.
 */
export default function SponsoredLabel({ kind, className = '' }: SponsoredLabelProps) {
  if (kind === 'organic') return null;
  const copy = WORDING[kind];

  return (
    <span
      data-placement={kind}
      title={copy.title}
      className={`inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-900/40 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-900 dark:text-amber-200 ${className}`}
    >
      <Megaphone size={11} aria-hidden />
      {copy.label}
      {/* Announced in full to a screen reader. The visible word is a
          shorthand that only works if you can also see the styling. */}
      <span className="sr-only"> — {copy.title}</span>
    </span>
  );
}
