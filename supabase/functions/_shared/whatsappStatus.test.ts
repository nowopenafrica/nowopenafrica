import { describe, it, expect } from "vitest";

import {
  isProgress, mapStatus, parseStatusEvents, toIso, verifySignature,
} from "./whatsappStatus.ts";

const body = (statuses: unknown[]) => ({
  object: "whatsapp_business_account",
  entry: [{ id: "1790161078687252", changes: [{ field: "messages", value: { statuses } }] }],
});

describe("reading Meta's status webhook", () => {
  it("pulls out the message id, status and time", () => {
    const [e] = parseStatusEvents(body([
      { id: "wamid.ABC", status: "delivered", timestamp: "1760000000" },
    ]));
    expect(e.messageId).toBe("wamid.ABC");
    expect(e.status).toBe("delivered");
    expect(toIso(e.at)).toBe(new Date(1760000000 * 1000).toISOString());
  });

  it("keeps Meta's own failure sentence", () => {
    const [e] = parseStatusEvents(body([
      {
        id: "wamid.BAD", status: "failed", timestamp: "1760000001",
        errors: [{ code: 131026, title: "Message undeliverable" }],
      },
    ]));
    expect(e.status).toBe("failed");
    expect(e.errorCode).toBe(131026);
    expect(e.errorDetail).toBe("Message undeliverable");
  });

  /*
   * Meta's "sent" means what our row already said. Treating it as progress
   * would be the platform telling itself news it does not have.
   */
  it("maps Meta's 'sent' to accepted, not delivered", () => {
    expect(mapStatus("sent")).toBe("accepted");
    expect(mapStatus("DELIVERED")).toBe("delivered");
    expect(mapStatus("deleted")).toBeNull();
    expect(mapStatus(undefined)).toBeNull();
  });

  it("never throws on a malformed or hostile body", () => {
    expect(parseStatusEvents(null)).toEqual([]);
    expect(parseStatusEvents({})).toEqual([]);
    expect(parseStatusEvents({ entry: "not-an-array" })).toEqual([]);
    expect(parseStatusEvents(body([{ status: "delivered" }]))).toEqual([]); // no id
    expect(parseStatusEvents(body([{ id: "wamid.X" }]))).toEqual([]); // no status
  });

  /*
   * Meta does not promise ordering, and `read` often arrives before
   * `delivered`. Without a rank the later event would erase the better one.
   */
  it("does not let a late event walk a message backwards", () => {
    expect(isProgress("read", "delivered")).toBe(false);
    expect(isProgress("delivered", "read")).toBe(true);
    expect(isProgress(null, "accepted")).toBe(true);
    expect(isProgress("accepted", "accepted")).toBe(false);
  });

  it("never hides a failure behind an optimistic late event", () => {
    expect(isProgress("failed", "delivered")).toBe(false);
    expect(isProgress("failed", "read")).toBe(false);
    expect(isProgress("read", "failed")).toBe(true);
  });
});

describe("the endpoint is public, so the signature is the whole door", () => {
  const SECRET = "test-app-secret";
  const payload = JSON.stringify(body([{ id: "wamid.A", status: "delivered", timestamp: "1" }]));

  async function sign(raw: string, secret: string): Promise<string> {
    const key = await crypto.subtle.importKey(
      "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
    );
    const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw));
    return `sha256=${Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("")}`;
  }

  it("accepts a body Meta really signed", async () => {
    expect(await verifySignature(payload, await sign(payload, SECRET), SECRET)).toBe(true);
  });

  it("rejects a forged delivery claim", async () => {
    const forged = JSON.stringify(body([{ id: "wamid.A", status: "read", timestamp: "1" }]));
    expect(await verifySignature(forged, await sign(payload, SECRET), SECRET)).toBe(false);
  });

  it("rejects a signature made with the wrong secret", async () => {
    expect(await verifySignature(payload, await sign(payload, "not-the-secret"), SECRET)).toBe(false);
  });

  /*
   * The important one: with no app secret configured we cannot tell Meta from
   * a stranger, and "cannot tell" must never read as "trusted".
   */
  it("fails closed when no app secret is configured", async () => {
    expect(await verifySignature(payload, await sign(payload, SECRET), "")).toBe(false);
  });

  it("rejects a missing or malformed header", async () => {
    expect(await verifySignature(payload, null, SECRET)).toBe(false);
    expect(await verifySignature(payload, "sha1=abc", SECRET)).toBe(false);
    expect(await verifySignature(payload, "sha256=nothex", SECRET)).toBe(false);
  });
});

describe("a failure code should lead somewhere", () => {
  it("turns 131042 into the action that actually fixes it", async () => {
    const { failureAdvice } = await import("./whatsappStatus.ts");
    expect(failureAdvice(131042)).toMatch(/payment method/i);
  });

  /*
   * The restraint matters more than the coverage: guessing at an unfamiliar
   * code would have the screen confidently misdirect whoever reads it.
   */
  it("says nothing at all about a code it does not know", async () => {
    const { failureAdvice } = await import("./whatsappStatus.ts");
    expect(failureAdvice(999999)).toBeNull();
    expect(failureAdvice(null)).toBeNull();
  });
});

describe("Meta repeats itself", () => {
  /*
   * A real 131042 arrived with title and message identical, and the screen
   * read "Business eligibility payment issue — Business eligibility payment
   * issue".
   */
  it("does not print the same sentence twice", () => {
    const [e] = parseStatusEvents({
      entry: [{ changes: [{ value: { statuses: [{
        id: "wamid.P", status: "failed", timestamp: "1",
        errors: [{ code: 131042, title: "Business eligibility payment issue", message: "Business eligibility payment issue" }],
      }] } }] }],
    });
    expect(e.errorDetail).toBe("Business eligibility payment issue");
  });

  it("still joins two genuinely different sentences", () => {
    const [e] = parseStatusEvents({
      entry: [{ changes: [{ value: { statuses: [{
        id: "wamid.Q", status: "failed", timestamp: "1",
        errors: [{ code: 131026, title: "Message undeliverable", message: "Recipient is not a valid WhatsApp user" }],
      }] } }] }],
    });
    expect(e.errorDetail).toBe("Message undeliverable — Recipient is not a valid WhatsApp user");
  });
});

describe("inbound messages — the free direction", () => {
  const inbound = (messages: unknown[], contacts: unknown[] = []) => ({
    entry: [{ changes: [{ value: { messaging_product: "whatsapp", contacts, messages } }] }],
  });

  it("reads the sender, the text and the display name", async () => {
    const { parseInboundMessages } = await import("./whatsappStatus.ts");
    const [m] = parseInboundMessages(inbound(
      [{ id: "wamid.IN1", from: "2347081547726", timestamp: "1760000000", type: "text", text: { body: "Hi (NOA-7B73A46E)" } }],
      [{ wa_id: "2347081547726", profile: { name: "Adeyemi" } }],
    ));
    expect(m.messageId).toBe("wamid.IN1");
    expect(m.from).toBe("2347081547726");
    expect(m.name).toBe("Adeyemi");
    expect(m.body).toContain("NOA-7B73A46E");
  });

  /*
   * An image or voice note is still a real person writing in. Dropping it
   * would mean "they contacted us and we have no record", which is the worse
   * failure of the two.
   */
  it("records a non-text message rather than dropping it", async () => {
    const { parseInboundMessages } = await import("./whatsappStatus.ts");
    const [m] = parseInboundMessages(inbound(
      [{ id: "wamid.IMG", from: "2347081547726", timestamp: "1", type: "image" }],
    ));
    expect(m.messageId).toBe("wamid.IMG");
    expect(m.body).toBeNull();
  });

  it("ignores a status-only payload and never throws", async () => {
    const { parseInboundMessages } = await import("./whatsappStatus.ts");
    expect(parseInboundMessages({ entry: [{ changes: [{ value: { statuses: [] } }] }] })).toEqual([]);
    expect(parseInboundMessages(null)).toEqual([]);
    expect(parseInboundMessages(inbound([{ from: "234" }]))).toEqual([]); // no id
  });
});
