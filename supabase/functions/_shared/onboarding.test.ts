import { describe, it, expect } from "vitest";
import {
  businessWelcomeText,
  businessWelcomeTemplateParams,
  instagramGate,
  instagramWelcomeText,
  retryable,
  RETRYABLE_STATUSES,
  toE164,
  toHandle,
  whatsAppGate,
} from "./onboarding.ts";

describe("business welcome copy", () => {
  const opts = {
    firstName: "Ada",
    businessName: "Ada's Kitchen",
    profileUrl: "https://nowopenafrica.com/adas-kitchen",
  };

  it("welcomes by first name and names the business", () => {
    const text = businessWelcomeText(opts);
    expect(text).toContain("Ada");
    expect(text).toContain("Ada's Kitchen");
  });

  it("points at the request's own business profile", () => {
    const text = businessWelcomeText(opts);
    expect(text).toContain("adas-kitchen");
    expect(text).toContain("nowopenafrica.com/adas-kitchen");
  });

  it("educates on using the business profile", () => {
    const text = businessWelcomeText(opts);
    expect(text).toMatch(/open now/i);
    expect(text).toMatch(/photos, services, hours, prices.*contact/i);
    expect(text).toMatch(/enquiries and booking requests/i);
    expect(text).toMatch(/smart qr/i);
    expect(text).toMatch(/studio/i);
  });

  it("is a summary — keeps the essentials and no mega-list", () => {
    const text = businessWelcomeText(opts);
    expect(text.length).toBeLessThan(900);
    expect(text).not.toContain("onboarding brand kit");
  });
});

describe("instagram welcome copy", () => {
  const opts = {
    firstName: "Chidi",
    businessName: "Chidi's Barbershop",
    profileUrl: "https://nowopenafrica.com/chidis-barbershop",
  };

  it("welcomes by first name and names the business", () => {
    const text = instagramWelcomeText(opts);
    expect(text).toContain("Chidi");
    expect(text).toContain("Chidi's Barbershop");
  });

  it("links the profile in a DM-friendly, tap-short form", () => {
    const text = instagramWelcomeText(opts);
    expect(text).toContain("nowopenafrica.com/chidis-barbershop");
    expect(text).not.toContain("https://nowopenafrica.com");
  });

  it("is shorter and more casual than the WhatsApp welcome — DM, not thread", () => {
    const ig = instagramWelcomeText(opts);
    const wa = businessWelcomeText(opts);
    expect(ig.length).toBeLessThan(wa.length);
    expect(ig).toMatch(/dm us here/i);
    expect(ig).toMatch(/tap here/i);
  });

  it("keeps the essentials — open on the map, enquiries, shareable link", () => {
    const text = instagramWelcomeText(opts);
    expect(text).toMatch(/open/i);
    expect(text).toMatch(/enquiries/i);
    expect(text).toMatch(/link or smart qr/i);
  });
});

describe("business welcome template params", () => {
  it("returns body params in the documented order: name, business, profile", () => {
    expect(
      businessWelcomeTemplateParams({
        firstName: "Ada",
        businessName: "Ada's Kitchen",
        profileUrl: "https://nowopenafrica.com/adas-kitchen",
      }),
    ).toEqual(["Ada", "Ada's Kitchen", "nowopenafrica.com/adas-kitchen"]);
  });
});

describe("welcome status classification", () => {
  it("treats the intent states as retryable", () => {
    expect(RETRYABLE_STATUSES).toEqual(["queued", "needs_provider", "needs_template"]);
    expect(retryable("queued")).toBe(true);
    expect(retryable("needs_provider")).toBe(true);
    expect(retryable("needs_template")).toBe(true);
  });

  it("treats every outcome state as terminal — including the Instagram conversation gate", () => {
    for (const status of ["sent", "no_phone", "blocked", "suppressed", "needs_conversation", "failed"]) {
      expect(retryable(status)).toBe(false);
    }
  });
});

describe("toE164", () => {
  it("normalises a leading-zero local number to +234", () => {
    expect(toE164("08012345678")).toBe("+2348012345678");
  });

  it("leaves an already-234 number as +234...", () => {
    expect(toE164("2348012345678")).toBe("+2348012345678");
  });

  it("leaves a + prefixed number intact", () => {
    expect(toE164("+2348012345678")).toBe("+2348012345678");
  });

  it("returns null for a number too short to be valid", () => {
    expect(toE164("123")).toBeNull();
  });

  it("returns null for null or empty", () => {
    expect(toE164(null)).toBeNull();
    expect(toE164("")).toBeNull();
  });

  it("strips formatting and parentheses before normalising", () => {
    expect(toE164("(080) 123 45 67 8")).toBe("+2348012345678");
  });
});

describe("toHandle", () => {
  it("keeps a plain handle lowercased", () => {
    expect(toHandle("AdaKitchen")).toBe("adakitchen");
    expect(toHandle("AdaLagosRestaurant")).toBe("adalagosrestaurant");
  });

  it("strips a leading @", () => {
    expect(toHandle("@Ada.Kitchen")).toBe("ada.kitchen");
  });

  it("preserves a numeric IG user ID", () => {
    expect(toHandle(" 17841400000000000 ")).toBe("17841400000000000");
  });

  it("returns null for empty or whitespace", () => {
    expect(toHandle(null)).toBeNull();
    expect(toHandle(undefined)).toBeNull();
    expect(toHandle("  ")).toBeNull();
  });
});

describe("whatsAppGate", () => {
  const ready = {
    killSwitchOn: true,
    suppressed: false,
    providerConfigured: true,
    templateConfigured: true,
  };

  it("lets a send through when every gate is open", () => {
    expect(whatsAppGate(ready)).toBeNull();
  });

  it("refuses when the outbound_whatsapp kill switch is off", () => {
    expect(whatsAppGate({ ...ready, killSwitchOn: false })).toEqual({
      status: "blocked",
      reason: "outbound_whatsapp kill switch is off.",
    });
  });

  it("refuses a suppressed (ClaimReach §22) contact", () => {
    expect(whatsAppGate({ ...ready, suppressed: true })).toEqual({
      status: "suppressed",
      reason: "Contact opted out (ClaimReach §22).",
    });
  });

  it("refuses when no WhatsApp provider is configured", () => {
    expect(whatsAppGate({ ...ready, providerConfigured: false })).toEqual({
      status: "needs_provider",
      reason: "WhatsApp provider not configured (WHATSAPP_TOKEN/WHATSAPP_PHONE_ID).",
    });
  });

  it("refuses when no approved template is set — cold messages need one", () => {
    expect(whatsAppGate({ ...ready, templateConfigured: false })).toEqual({
      status: "needs_template",
      reason: "WHATSAPP_WELCOME_TEMPLATE env not set (required for out-of-session messages).",
    });
  });

  it("fires gates in order — the kill switch outranks everything", () => {
    expect(whatsAppGate({
      killSwitchOn: false,
      suppressed: true,
      providerConfigured: false,
      templateConfigured: false,
    })).toEqual({ status: "blocked", reason: "outbound_whatsapp kill switch is off." });
  });
});

describe("instagramGate", () => {
  const ready = {
    killSwitchOn: true,
    suppressed: false,
    providerConfigured: true,
    conversationOpen: true,
  };

  it("lets an in-conversation send through with no template needed", () => {
    expect(instagramGate(ready)).toBeNull();
  });

  it("refuses when the outbound_instagram kill switch is off", () => {
    expect(instagramGate({ ...ready, killSwitchOn: false })).toEqual({
      status: "blocked",
      reason: "outbound_instagram kill switch is off.",
    });
  });

  it("refuses a suppressed (ClaimReach §22) contact on instagram", () => {
    expect(instagramGate({ ...ready, suppressed: true })).toEqual({
      status: "suppressed",
      reason: "Contact opted out (ClaimReach §22).",
    });
  });

  it("refuses when no Instagram provider is configured", () => {
    expect(instagramGate({ ...ready, providerConfigured: false })).toEqual({
      status: "needs_provider",
      reason: "Instagram provider not configured (INSTAGRAM_TOKEN/INSTAGRAM_BUSINESS_ID).",
    });
  });

  it("refuses a cold outreach with NO conversation — the IG-specific honesty gate", () => {
    expect(instagramGate({ ...ready, conversationOpen: false })).toEqual({
      status: "needs_conversation",
      reason: expect.stringMatching(/needs_conversation|open conversation/),
    });
  });

  it("fires gates in order — the kill switch outranks everything", () => {
    expect(instagramGate({
      killSwitchOn: false,
      suppressed: true,
      providerConfigured: false,
      conversationOpen: false,
    })).toEqual({ status: "blocked", reason: "outbound_instagram kill switch is off." });
  });
});