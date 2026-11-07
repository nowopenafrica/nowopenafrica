/**
 * Which live modules an industry's categories actually ship.
 *
 * Split out of industrySystems.ts on 2026-10-10 for one reason: this is the
 * only code there that reads CATEGORY_FEATURES, and that import pulled 39.8 kB
 * of category configuration into every module that wanted the INDUSTRIES
 * list — including the home page, which uses it for fourteen tile names.
 *
 * Only /platform calls this, and /platform is a lazy route, so the weight now
 * arrives with the page that needs it.
 */

import { CATEGORY_FEATURES } from './categoryFeatures';
import type { IndustrySystem } from './industrySystems';

/**
 * The modules an industry runs TODAY, derived from `data/categoryFeatures.ts`.
 *
 * The `groups` above are the full vision — a roadmap, most of it not built. So
 * the /platform page had no way to say which of it works, and rendered every
 * feature with a green tick regardless. Meanwhile the shipped module map grew
 * to cover all 250 categories, and none of that was visible.
 *
 * This is COMPUTED, never authored. That is the whole point: the page cannot
 * claim a module the product does not ship, and a module added to a category
 * appears here without anyone remembering to update a marketing list. It is
 * the same guarantee the DEV category check below gives, applied to features.
 *
 * Grouped by `tabLabel` — the interaction — rather than by ctaLabel, because
 * the CTAs are per-trade wordings ("Book a Call", "Book a Meeting", "Book a
 * Consultation") that all describe one capability. `categories` counts how
 * many of the industry's categories run it, which is what makes the ordering
 * meaningful: the first chip is what that industry mostly does.
 */
export interface LiveModule {
  /** The interaction, e.g. 'Appointments', 'Orders', 'Estimates', 'Tickets'. */
  label: string;
  /** How many of this industry's categories ship it. */
  categories: number;
}

export function liveModulesFor(industry: IndustrySystem): LiveModule[] {
  const counts = new Map<string, number>();
  for (const category of industry.categories) {
    for (const feature of CATEGORY_FEATURES[category] ?? []) {
      counts.set(feature.tabLabel, (counts.get(feature.tabLabel) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([label, categories]) => ({ label, categories }))
    .sort((a, b) => b.categories - a.categories || a.label.localeCompare(b.label));
}
