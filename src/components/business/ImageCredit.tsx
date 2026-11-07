import { Info } from 'lucide-react';

/**
 * Who took this photograph, and is it even of this business?
 *
 * ── TWO OBLIGATIONS, ONE LINE ────────────────────────────────────────────
 *
 * 1. A LICENCE CONDITION. Images recovered from Wikimedia Commons carry
 *    CC BY-SA and CC BY, which REQUIRE the author and licence to be shown
 *    wherever the work is displayed. Storing the credit in a column and never
 *    rendering it is not compliance — it is a breach with a paper trail.
 *
 * 2. AN HONESTY CONDITION. MEASURED 2026-09-23: 2,851 of 3,167 unclaimed
 *    businesses show a STOCK photograph. Every one is a real, named African
 *    business displaying a picture of somewhere else, and nothing on the page
 *    said so. A visitor reading "Sanofi Primary Health Clinic" above a stock
 *    interior reasonably believes they are looking at that clinic.
 *
 * Both are answered by saying plainly where the picture came from.
 *
 * ── WHY `business` GETS NO LABEL ─────────────────────────────────────────
 *
 * A photograph the business publishes of itself, taken from its own website,
 * needs no credit and no caveat — it is theirs, and it is of them. Labelling
 * it would add noise to the only case that is straightforwardly fine.
 */

export type ImageProvenance = 'business' | 'owner' | 'stock' | 'unknown';

interface ImageCreditProps {
  source: ImageProvenance | null | undefined;
  /** Rendered credit line, e.g. "A. Name · CC BY-SA 4.0 · via Wikimedia Commons". */
  attribution?: string | null;
  /** Bare licence code, used to decide whether a credit is legally required. */
  licence?: string | null;
  /** Where it came from, linked so the claim is checkable. */
  sourceUrl?: string | null;
  className?: string;
}

/**
 * Licences that oblige us to name the author.
 *
 * Public-domain marks (CC0, PD) do not, but crediting anyway is harmless and
 * the attribution string is already built — so the only case this really
 * decides is whether the absence of a credit is a bug.
 */
export function requiresCredit(licence: string | null | undefined): boolean {
  if (!licence) return false;
  return /\bCC[- ]BY\b/i.test(licence) || /share[- ]?alike/i.test(licence);
}

export default function ImageCredit({
  source, attribution, licence, sourceUrl, className = '',
}: ImageCreditProps) {
  /*
   * A picture from the business's own site, with nothing to credit, needs no
   * line at all. Everything else says something.
   */
  const isStock = source === 'stock';
  const hasCredit = !!attribution?.trim();

  /*
   * A licence that demands a credit, with no credit stored.
   *
   * Rendering nothing here would display the work in breach and leave no trace
   * of it. Naming the licence is the least we can do while the attribution is
   * missing, and it makes the gap visible rather than silent — an image in
   * this state is a bug in whatever wrote the row.
   */
  const owedCredit = !hasCredit && requiresCredit(licence);
  if (!isStock && !hasCredit && !owedCredit) return null;

  return (
    <p
      data-image-credit={source ?? 'unknown'}
      className={`flex items-start gap-1.5 text-[11px] leading-snug text-gray-500 dark:text-gray-400 ${className}`}
    >
      <Info size={12} className="mt-0.5 shrink-0" aria-hidden />
      <span>
        {isStock && (
          /*
           * Said in words a visitor will actually parse. "Stock image" is
           * jargon; "not a photograph of this business" is the fact.
           */
          <>
            Illustrative photograph — not a picture of this business.
            {hasCredit && ' '}
          </>
        )}
        {owedCredit && (
          <>Licensed under {licence} · credit unavailable</>
        )}
        {hasCredit && (
          <>
            {attribution}
            {sourceUrl && (
              <>
                {' · '}
                <a
                  href={sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="underline hover:text-gray-700 dark:hover:text-gray-200"
                >
                  source
                </a>
              </>
            )}
          </>
        )}
      </span>
    </p>
  );
}
