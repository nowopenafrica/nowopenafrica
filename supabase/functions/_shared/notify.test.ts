import { describe, it, expect, beforeAll } from "vitest";

import { toE164 } from "./onboarding.ts";

/*
 * notify.ts reads Deno.env at module scope, so it cannot be imported directly
 * under vitest - which is why this file had no tests until now. Stubbing the
 * global and importing dynamically exercises the real shipped function rather
 * than a copy of it.
 */
let waNumber: (phone?: string | null) => string | null;

beforeAll(async () => {
  (globalThis as unknown as { Deno: unknown }).Deno = {
    env: { get: () => undefined },
  };
  ({ waNumber } = await import("./notify.ts"));
});

/*
 * The number that actually goes to Meta.
 *
 * MEASURED 2026-10-10: 316 businesses store a phone as `0...`, and the admin
 * console invites that shape in its own placeholder ("e.g. 0803 000 0000").
 * Those digits used to be handed to Meta unchanged, so the recipient had no
 * country code on it at all.
 */
describe("waNumber refuses what it cannot address", () => {
  it("keeps a number that already carries a country code", () => {
    expect(waNumber("+234 704 676 4907")).toBe("2347046764907");
    expect(waNumber("2347081547726")).toBe("2347081547726");
    // The only welcome this platform has ever sent went here.
    expect(waNumber("+254-709090000")).toBe("254709090000");
  });

  it("refuses a local number instead of guessing a country", () => {
    expect(waNumber("07081547726")).toBeNull();
    expect(waNumber("0803 000 0000")).toBeNull();
  });

  /*
   * The whole reason for refusing rather than defaulting to +234.
   *
   * This directory is pan-African. A Kenyan business stored as 0709090000 is
   * a different person from +234 709 090 000, and sending a real welcome to a
   * stranger is a worse outcome than sending nothing.
   */
  it("does not turn a Kenyan local number into a Nigerian one", () => {
    const kenyanLocal = "0709090000";
    expect(waNumber(kenyanLocal)).toBeNull();
    // toE164 DOES assume Nigeria - which is why it is only used for
    // suppression, where over-matching can stop a send but never misdirect one.
    expect(toE164(kenyanLocal)).toBe("+234709090000");
  });

  it("rejects lengths that cannot be a phone number", () => {
    expect(waNumber("1234567")).toBeNull();
    expect(waNumber("1234567890123456")).toBeNull();
    expect(waNumber("")).toBeNull();
    expect(waNumber(null)).toBeNull();
  });
});
