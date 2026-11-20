/**
 * Video Studio: bring ONE media file in from a link a signed-in person pasted.
 *
 * WHY A SERVER STEP
 *
 * Video Studio projects store storage paths, never URLs (readVideoDocument
 * refuses a URL asset): the canvas compositor and the coming MP4 export can
 * only draw pixels they are allowed to read, and a project must not break
 * the day somebody else's link dies. The browser cannot copy the file itself,
 * because the site's CSP `connect-src` does not (and should not) allow every
 * host on the internet. So the server fetches the file once, checks it is the
 * same kind of thing an upload may be, and stores it in the person's own
 * `business-images/<user id>/studio/` folder, exactly where an upload goes.
 *
 * SAFEGUARDS
 *
 *   * Signed-in people only. The JWT is checked with getUser(): the gateway's
 *     verify_jwt also passes the public anon key, so it proves nothing.
 *   * The SSRF guard (_shared/discovery/safeUrl.ts) runs on the link and on
 *     EVERY redirect hop before it is followed (redirect: "manual"), so no
 *     internal address, private range or cloud-metadata endpoint is reached.
 *   * Player pages (YouTube, Instagram, TikTok…) are refused by name with a
 *     reason: they serve a page, not a file, and their terms forbid ripping.
 *   * The type must be one an upload may be; the size is capped from the
 *     header AND while reading, so a server that lies about its length is
 *     stopped at the cap rather than filling memory.
 *   * Ten imports per person per ten minutes.
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import { checkFetchUrl } from "../_shared/discovery/safeUrl.ts";
import { isRateLimited } from "../_shared/rateLimit.ts";
import {
  baseType, checkImportSize, checkImportType, IMPORT_HARD_MAX, IMPORT_MAX_BYTES, IMPORT_MAX_REDIRECTS,
  importPath, PLAYER_PAGE_MESSAGE, playerPageHost,
} from "../_shared/videoImport.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-application-name",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BUCKET = "business-images";
const FETCH_TIMEOUT_MS = 30_000;
const USER_AGENT = "NowOpenVideoStudio/1.0 (+https://www.nowopenafrica.com)";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const refuse = (reason: string, status = 400) => json({ ok: false, reason }, status);

/** Read at most `cap` bytes; null when the body is longer. */
async function readCapped(res: Response, cap: number): Promise<Uint8Array | null> {
  if (!res.body) return new Uint8Array(await res.arrayBuffer()).slice(0, cap + 1);
  const reader = res.body.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > cap) { await reader.cancel(); return null; }
    parts.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.byteLength; }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return refuse("Send a POST with { url }.", 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // ── who is asking ─────────────────────────────────────────────────────
  const authHeader = req.headers.get("Authorization") ?? "";
  const asUser = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
  const { data: who, error: whoError } = await asUser.auth.getUser();
  if (whoError || !who?.user) return refuse("Sign in to add media from a link.", 401);
  const userId = who.user.id;

  if (isRateLimited(`video-import:${userId}`, 10, 10 * 60_000)) {
    return refuse("That is a lot of links in a short time. Wait a few minutes and try again.", 429);
  }

  let target = "";
  try {
    target = String((await req.json())?.url ?? "").trim();
  } catch {
    return refuse("Send { url }.");
  }
  if (!target) return refuse("Paste a link first.");
  if (!/^https?:\/\//i.test(target)) target = `https://${target}`;

  // ── fetch, re-checking every hop ──────────────────────────────────────
  let current = target;
  let res: Response | null = null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    for (let hop = 0; hop <= IMPORT_MAX_REDIRECTS; hop++) {
      const verdict = checkFetchUrl(current);
      if (!verdict.safe || !verdict.url) return refuse(`NowOpen will not fetch that link: ${verdict.detail}`);
      const player = playerPageHost(new URL(verdict.url).hostname);
      if (player) return refuse(PLAYER_PAGE_MESSAGE(player), 422);

      const r = await fetch(verdict.url, {
        redirect: "manual",
        signal: controller.signal,
        headers: { "User-Agent": USER_AGENT, Accept: "video/*,image/*,audio/*;q=0.9,*/*;q=0.1" },
      });
      if (r.status >= 300 && r.status < 400) {
        const next = r.headers.get("location");
        await r.body?.cancel();
        if (!next) return refuse("That link redirects nowhere.");
        current = new URL(next, verdict.url).toString();
        continue;
      }
      res = r;
      break;
    }
    if (!res) return refuse("That link redirects too many times.");
    if (!res.ok) { await res.body?.cancel(); return refuse(`The site answered ${res.status}, so the file could not be fetched.`, 422); }

    const type = checkImportType(res.headers.get("content-type"));
    if (!type.ok) { await res.body?.cancel(); return refuse(type.reason, 422); }

    const declared = Number(res.headers.get("content-length") ?? "");
    if (Number.isFinite(declared) && declared > 0) {
      const tooBig = checkImportSize(type.kind, declared);
      if (tooBig) { await res.body?.cancel(); return refuse(tooBig, 413); }
    }

    const bytes = await readCapped(res, Math.min(IMPORT_MAX_BYTES[type.kind], IMPORT_HARD_MAX));
    if (!bytes) return refuse(`That ${type.kind} is larger than ${IMPORT_MAX_BYTES[type.kind] / 1024 / 1024} MB.`, 413);
    const sizeProblem = checkImportSize(type.kind, bytes.byteLength);
    if (sizeProblem) return refuse(sizeProblem, 413);

    // ── store it where an upload would go ──────────────────────────────
    const path = importPath(userId, type.ext);
    const admin = createClient(url, service);
    /* checkImportType accepted it, so this is one of IMPORT_TYPES' keys. */
    const contentType = baseType(res.headers.get("content-type"));
    const { error: upError } = await admin.storage.from(BUCKET).upload(path, bytes, {
      cacheControl: "3600", upsert: false, contentType,
    });
    if (upError) return refuse(`The file was fetched but could not be stored: ${upError.message}`, 500);

    return json({ ok: true, path, kind: type.kind, bytes: bytes.byteLength, contentType });
  } catch (e) {
    const msg = (e as Error)?.name === "AbortError"
      ? `The site did not send the file within ${FETCH_TIMEOUT_MS / 1000}s.`
      : `Could not reach that link: ${(e as Error)?.message ?? "unknown error"}`;
    return refuse(msg, 502);
  } finally {
    clearTimeout(timer);
  }
});
