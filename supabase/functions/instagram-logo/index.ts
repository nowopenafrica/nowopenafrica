// Copies an Instagram profile picture into our own storage, to use as a logo.
//
// ── WHY THIS IS A COPY AND NOT A LINK ────────────────────────────────────
//
// Meta's `profile_picture_url` is a signed CDN address. Measured 2026-10-08
// against @jumianigeria, it carried `oe=6ACD7273` — an expiry FOUR DAYS out.
// Storing that link on a listing produces a logo that works today and is a
// broken image next week, on a business's public page, with nothing to say it
// has happened.
//
// So the bytes are fetched once, here, server-side, and written to the
// `business-images` bucket. What reaches the listing is our own stable URL.
//
// ── THE RIGHTS QUESTION, STATED PLAINLY ──────────────────────────────────
//
// `radar_sources.instagram_graph` records `image_reuse_allowed = 'prohibited'`,
// which is why every other part of this pipeline refuses to carry imagery and
// says so on screen.
//
// This endpoint is the one deliberate exception, and it is narrow: a staff
// member must ask for it per account, having seen the picture and the account
// it belongs to. The platform operator is asserting a right to use that
// business's own mark on that business's own listing — a judgement a person
// can make and a pipeline cannot. Nothing automated reaches this endpoint:
// there is no batch mode and no scheduler path to it.
//
// Every copy records where it came from and when, so a business that objects
// can be answered with a fact rather than a guess.

import { createClient } from "npm:@supabase/supabase-js@2";
import { lookupInstagramBusiness, normalizeHandle } from "../_shared/discovery/instagram.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-application-name",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const STAFF = new Set(["admin", "editor", "business_curator"]);

/** A profile picture is small. Anything larger is not one. */
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  const auth = req.headers.get("Authorization") ?? "";
  const asCaller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: auth } } });
  const { data: me, error: meErr } = await asCaller.auth.getUser();
  if (meErr || !me?.user) return json({ ok: false, reason: "Sign in first." }, 401);

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data: actor } = await admin.from("users").select("role").eq("id", me.user.id).maybeSingle();
  if (!STAFF.has((actor as { role?: string } | null)?.role ?? "")) {
    return json({ ok: false, reason: "Staff only." }, 403);
  }

  const body = await req.json().catch(() => null) as { handle?: string } | null;
  const handle = normalizeHandle(body?.handle);
  if (!handle) return json({ ok: false, reason: "Send { handle }." }, 400);

  /*
   * Re-read the profile rather than trusting a URL from the browser.
   *
   * The address is signed and short-lived, so the one the operator is looking
   * at may already be stale — and accepting a URL from a request body would
   * turn this into a general-purpose fetcher pointed at anything.
   */
  const result = await lookupInstagramBusiness(handle);
  if (!result.ok) {
    return json({ ok: false, reason: result.message || "Could not read that profile." }, 200);
  }
  const src = result.profile.profilePictureUrl;
  if (!src) return json({ ok: false, reason: `@${handle} publishes no profile picture.` }, 200);

  /*
   * Only Meta's own CDN. The URL comes from the Graph reply rather than the
   * caller, so this is belt and braces — but an image fetcher that will
   * retrieve any host is an SSRF tool, and the cost of pinning it is nothing.
   */
  let host: string;
  try {
    host = new URL(src).host;
  } catch {
    return json({ ok: false, reason: "Meta returned an unreadable picture address." }, 200);
  }
  if (!/(^|\.)(fbcdn\.net|cdninstagram\.com)$/i.test(host)) {
    return json({ ok: false, reason: `Unexpected image host: ${host}` }, 200);
  }

  let bytes: Uint8Array;
  let contentType: string;
  try {
    const res = await fetch(src);
    if (!res.ok) return json({ ok: false, reason: `Meta's CDN refused the image (${res.status}).` }, 200);

    contentType = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!ALLOWED.has(contentType)) {
      return json({ ok: false, reason: `Not an image we accept: ${contentType || "unknown"}` }, 200);
    }

    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) {
      return json({ ok: false, reason: "That picture is larger than a profile picture should be." }, 200);
    }
    bytes = new Uint8Array(buf);
  } catch (e) {
    return json({ ok: false, reason: `Could not fetch the picture: ${(e as Error).message}` }, 200);
  }

  const ext = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
  /*
   * Keyed on the handle, so re-reading an account replaces its logo rather
   * than littering the bucket with one file per extraction.
   */
  const path = `instagram-logos/${handle}.${ext}`;

  const { error: upErr } = await admin.storage
    .from("business-images")
    .upload(path, bytes, { contentType, upsert: true });
  if (upErr) return json({ ok: false, reason: `Could not store the image: ${upErr.message}` }, 200);

  const { data: pub } = admin.storage.from("business-images").getPublicUrl(path);

  return json({
    ok: true,
    handle,
    logoUrl: pub.publicUrl,
    /*
     * Provenance travels with it. A business that asks where its logo came
     * from gets a date and a source, not a shrug.
     */
    sourceUrl: `https://www.instagram.com/${handle}/`,
    copiedAt: new Date().toISOString(),
    bytes: bytes.byteLength,
    contentType,
  });
});
