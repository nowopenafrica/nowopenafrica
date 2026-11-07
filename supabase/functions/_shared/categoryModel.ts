/**
 * Asking a model which category a business belongs to — safely.
 *
 * ── WHY ──────────────────────────────────────────────────────────────────
 *
 * MEASURED 2026-10-12: 223 listable, unclaimed businesses sit in "Other" or
 * with no category. 217 carry an Instagram link and 211 have a description.
 * The deterministic reader (`selfCategory.ts`) matches a handful of them,
 * because it only fires on an exact trade word — "we make bespoke cakes for
 * Lagos weddings" names no term in its vocabulary.
 *
 * A model reads that sentence correctly. The risk is that it also answers
 * confidently when the text says nothing, and invents a category that does
 * not exist.
 *
 * ── THE THREE RULES THAT MAKE THIS SAFE ──────────────────────────────────
 *
 * 1. The answer must be one of OUR categories, checked after the fact. A
 *    model that replies "Luxury Real Estate Group" is rejected outright
 *    rather than creating a category nobody browses.
 * 2. It is given an explicit way to refuse, and refusal is the default on
 *    anything unparseable. "I could not tell" is a correct answer.
 * 3. It only ever produces a PROPOSAL. The whole sweep writes
 *    `business_change_proposals`, because a dry run once showed it
 *    re-applying a change a human had reverted the same day.
 *
 * Nothing here reads a photograph, a location or a similar business. Only the
 * words the business published about itself.
 */

import { SELF_DESCRIPTION_CATEGORY } from "./selfCategory.ts";

/**
 * The categories a proposal may name.
 *
 * Taken from the deterministic reader's own mapping, whose source test
 * asserts every value exists in BUSINESS_CATEGORIES. So this list cannot
 * drift into a category the directory does not have.
 */
export function allowedCategories(): string[] {
  return [...new Set(Object.values(SELF_DESCRIPTION_CATEGORY))].sort();
}

export const CATEGORY_SYSTEM_PROMPT = [
  "You classify African businesses into a fixed directory taxonomy.",
  "",
  "You will be given a business name and the words that business published",
  "about itself. Reply with EXACTLY ONE line and nothing else:",
  "",
  "  CATEGORY: <one category, copied character-for-character from the list>",
  "  or",
  "  CATEGORY: NONE",
  "",
  "Answer NONE whenever the text does not say what the business sells or does.",
  "A location, a slogan, a follower count or an inspirational quote is not a",
  "trade. Guessing is worse than refusing: a wrong category puts a business in",
  "front of customers who did not want it, and hides it from the ones who did.",
  "",
  "Never invent a category. If the right answer is not on the list, say NONE.",
].join("\n");

/** The one user turn. Only the business's own words. */
export function buildCategoryPrompt(
  name: string | null,
  description: string | null,
  categories: string[],
): string {
  return [
    "Allowed categories:",
    ...categories.map((c) => `- ${c}`),
    "",
    `Business name: ${(name ?? "").trim() || "(none given)"}`,
    "Its own description:",
    (description ?? "").trim() || "(none given)",
  ].join("\n");
}

/**
 * Read the model's answer, and refuse anything that is not exactly one of
 * ours.
 *
 * Deliberately strict. Case and surrounding whitespace are forgiven because
 * those are formatting, not meaning; a near-miss like "Food & Drinks" when the
 * category is "Food & Drink" is NOT forgiven, because quietly correcting a
 * model's wording is how a classifier starts agreeing with itself.
 */
export function parseCategoryAnswer(text: string | null | undefined, categories: string[]): string | null {
  const raw = (text ?? "").trim();
  if (!raw) return null;

  const line = raw.split(/\r?\n/).map((l) => l.trim()).find((l) => /^CATEGORY\s*:/i.test(l)) ?? raw;
  const answer = line.replace(/^CATEGORY\s*:/i, "").trim().replace(/^["'`]|["'`]$/g, "");
  if (!answer || /^none$/i.test(answer)) return null;

  const match = categories.find((c) => c.toLowerCase() === answer.toLowerCase());
  return match ?? null;
}

/**
 * Is there enough here to be worth asking about?
 *
 * A name alone is not. "Palton Morgan Holdings" tells a model nothing a
 * human could verify, and spending a call to be told NONE is waste on both
 * sides.
 */
export function worthAsking(description: string | null | undefined): boolean {
  return (description ?? "").trim().length >= 25;
}
