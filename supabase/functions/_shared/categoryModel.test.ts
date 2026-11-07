import { describe, it, expect } from "vitest";

import {
  allowedCategories, buildCategoryPrompt, parseCategoryAnswer, worthAsking,
} from "./categoryModel.ts";

const CATS = allowedCategories();

describe("the categories a model may name", () => {
  it("offers the directory's real categories, deduplicated and sorted", () => {
    expect(CATS.length).toBeGreaterThan(50);
    expect(new Set(CATS).size).toBe(CATS.length);
    expect([...CATS].sort()).toEqual(CATS);
  });
});

describe("reading the answer", () => {
  it("accepts an exact category", () => {
    expect(parseCategoryAnswer(`CATEGORY: ${CATS[0]}`, CATS)).toBe(CATS[0]);
  });

  it("forgives case and quoting, which are formatting", () => {
    expect(parseCategoryAnswer(`category: "${CATS[1].toUpperCase()}"`, CATS)).toBe(CATS[1]);
  });

  /*
   * The rule that keeps this honest. Quietly mapping a near-miss onto a real
   * category is how a classifier starts agreeing with itself.
   */
  it("refuses a category that is merely close", () => {
    expect(parseCategoryAnswer("CATEGORY: Food & Drinks", CATS)).toBeNull();
    expect(parseCategoryAnswer("CATEGORY: Luxury Real Estate Group", CATS)).toBeNull();
  });

  it("treats refusal, silence and nonsense alike", () => {
    expect(parseCategoryAnswer("CATEGORY: NONE", CATS)).toBeNull();
    expect(parseCategoryAnswer("", CATS)).toBeNull();
    expect(parseCategoryAnswer(null, CATS)).toBeNull();
    expect(parseCategoryAnswer("I think it might be a shop of some kind", CATS)).toBeNull();
  });

  it("ignores chatter around the answer line", () => {
    expect(parseCategoryAnswer(`Sure!\nCATEGORY: ${CATS[2]}\nHope that helps.`, CATS)).toBe(CATS[2]);
  });
});

describe("what is worth spending a call on", () => {
  it("skips a business with no usable words", () => {
    expect(worthAsking(null)).toBe(false);
    expect(worthAsking("Lagos.")).toBe(false);
    expect(worthAsking("   ")).toBe(false);
  });

  it("asks when the business actually described itself", () => {
    expect(worthAsking("We bake bespoke wedding cakes and deliver across Lagos.")).toBe(true);
  });
});

describe("the prompt carries only the business's own words", () => {
  const prompt = buildCategoryPrompt("Ada's Kitchen", "We cook jollof and small chops.", CATS);

  it("includes the name, the description and the allowed list", () => {
    expect(prompt).toContain("Ada's Kitchen");
    expect(prompt).toContain("jollof");
    expect(prompt).toContain(CATS[0]);
  });

  it("says nothing about location, popularity or similar businesses", () => {
    expect(prompt).not.toMatch(/follower|popular|similar|nearby|rating/i);
  });
});
