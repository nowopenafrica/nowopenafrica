// brand-social-drive-sync
// -----------------------
// Keeps brand social in step with the team's Google Drive content folder.
//
// Actions:
//   tick    (pg_cron, x-automation-key) — walk every active source folder,
//                                          record new files, import the new ones.
//   sync    (admin) — the same, on demand.
//   import  (admin) — { ids: [drive_file_id, ...] } import chosen library files
//                     as drafts (used to bring in files that predate the sync).
//   status  (admin) — sources, counts by status, last result.
//
// How it reads Drive: the folders are shared "anyone with the link can view",
// and Google's embedded folder view lists such a folder without credentials.
// Files download from drive.usercontent.google.com the same way.
//
// What it will never do:
//   * Publish. An imported file becomes a DRAFT whose caption is a [bracketed]
//     placeholder; checkVariant blocks brackets, so it cannot go out until a
//     person writes the caption and approves the post.
//   * Import the same Drive file twice: brand_social_media.drive_file_id is unique.
//   * Bulk-draft the folder's existing contents. The first sync of a source only
//     records them ('library'); see the migration for why.

// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-application-name, x-automation-key",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const AUTOMATION_SECRET = Deno.env.get("AUTOMATION_SECRET") ?? "";
const db = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

const BUCKET = "social-media";
const PREFIX = "brand/drive";
const MAX_DEPTH = 6;
const MAX_FOLDERS = 200;
const IMPORTS_PER_RUN = 8;
const MAX_BYTES = 45 * 1024 * 1024;
const PLACEHOLDER = "[Write the caption for this post, then approve it]";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function sameSecret(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

async function callerIsAdmin(req: Request): Promise<boolean> {
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth) return false;
  const asCaller = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } } });
  const { data: u, error: ue } = await asCaller.auth.getUser();
  if (ue || !u.user) return false;
  const { data, error } = await asCaller.rpc("is_admin");
  return !error && data === true;
}

// ── Drive, without credentials ───────────────────────────────────────────────

interface DriveEntry { id: string; name: string; modified: string; isFolder: boolean }
interface DriveFile { id: string; name: string; modified: string; path: string }

const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");

async function listFolder(folderId: string): Promise<DriveEntry[]> {
  const r = await fetch(`https://drive.google.com/embeddedfolderview?id=${encodeURIComponent(folderId)}`, { signal: AbortSignal.timeout(20_000) });
  if (!r.ok) throw new Error(`Drive folder ${folderId} answered ${r.status}. Is it still shared with "anyone with the link"?`);
  const html = await r.text();
  const out: DriveEntry[] = [];
  const re = /<a href="([^"]+)"[^>]*>[\s\S]*?<div class="flip-entry-title">([\s\S]*?)<\/div>[\s\S]*?<div class="flip-entry-last-modified"><div>([\s\S]*?)<\/div>/g;
  for (const m of html.matchAll(re)) {
    const folder = /\/folders\/([\w-]+)/.exec(m[1]);
    const file = /\/file\/d\/([\w-]+)/.exec(m[1]);
    const id = (folder ?? file)?.[1];
    if (id) out.push({ id, name: decode(m[2]).trim(), modified: decode(m[3]).trim(), isFolder: Boolean(folder) });
  }
  return out;
}

async function walk(rootId: string, rootLabel: string): Promise<DriveFile[]> {
  const files: DriveFile[] = [];
  const queue: { id: string; path: string; depth: number }[] = [{ id: rootId, path: rootLabel, depth: 0 }];
  let seen = 0;
  while (queue.length && seen < MAX_FOLDERS) {
    const f = queue.shift()!;
    seen++;
    for (const e of await listFolder(f.id)) {
      if (e.isFolder) { if (f.depth < MAX_DEPTH) queue.push({ id: e.id, path: `${f.path}/${e.name}`, depth: f.depth + 1 }); }
      else files.push({ id: e.id, name: e.name, modified: e.modified, path: f.path });
    }
  }
  return files;
}

function kindOf(name: string): "image" | "video" | "other" {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["jpg", "jpeg", "png", "webp"].includes(ext)) return "image";
  if (["mp4", "mov", "m4v"].includes(ext)) return "video";
  return "other";
}

// ── Import one file ──────────────────────────────────────────────────────────

async function importOne(row: any): Promise<{ ok: boolean; code?: string; error?: string }> {
  if (row.kind === "other") {
    await db.from("brand_social_media").update({ status: "skipped", note: "Not an image or video." }).eq("id", row.id);
    return { ok: false, error: "not media" };
  }
  try {
    const r = await fetch(`https://drive.usercontent.google.com/download?id=${encodeURIComponent(row.drive_file_id)}&export=download&confirm=t`,
      { signal: AbortSignal.timeout(60_000) });
    if (!r.ok) throw new Error(`Drive download answered ${r.status}.`);
    const type = r.headers.get("content-type") ?? "";
    if (type.includes("text/html")) throw new Error("Drive returned a page instead of the file (too large, or no longer shared).");
    let bytes = new Uint8Array(await r.arrayBuffer());
    if (bytes.byteLength > MAX_BYTES) throw new Error(`File is ${Math.round(bytes.byteLength / 1048576)} MB; the limit is ${MAX_BYTES / 1048576} MB.`);

    let path: string, contentType: string;
    if (row.kind === "image") {
      // Instagram only accepts JPEG, so every image is stored as one.
      const img = await Image.decode(bytes);
      bytes = await img.encodeJPEG(90);
      path = `${PREFIX}/${row.drive_file_id}.jpg`; contentType = "image/jpeg";
    } else {
      path = `${PREFIX}/${row.drive_file_id}.mp4`; contentType = "video/mp4";
    }
    const up = await db.storage.from(BUCKET).upload(path, bytes, { contentType, upsert: true });
    if (up.error) throw new Error(`Storage upload failed: ${up.error.message}`);
    const url = db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

    const { data: camp } = await db.from("brand_social_campaigns").select("id").eq("slug", "always-on").maybeSingle();
    const format = row.kind === "video" ? "reel" : "post";
    const { data: content, error: ce } = await db.from("brand_social_content").insert({
      campaign_id: camp?.id ?? null, pillar: "community", audience: "owners", objective: "awareness",
      hook: row.name, caption: PLACEHOLDER, media_url: url, status: "draft",
      creative_brief: `From the team's Google Drive: ${row.folder_path}/${row.name}. Watch or view it in full before approving: check for unfinished text, placeholders or pre-launch wording baked into the ${row.kind}.`,
      evidence: `Google Drive file ${row.drive_file_id} (${row.folder_path}/${row.name}, modified ${row.drive_modified ?? "unknown"}). Caption not written yet.`,
    }).select("id, code").single();
    if (ce || !content) throw new Error(`Could not create the draft: ${ce?.message ?? "no row"}`);
    const variants = ["facebook", "instagram"].map((channel) => ({ content_id: content.id, channel, caption: PLACEHOLDER, format }));
    const { error: ve } = await db.from("brand_social_variants").insert(variants);
    if (ve) throw new Error(`Could not add channel versions: ${ve.message}`);

    await db.from("brand_social_media").update({
      status: "imported", storage_url: url, bytes: bytes.byteLength, content_id: content.id, imported_at: new Date().toISOString(), note: null,
    }).eq("id", row.id);
    return { ok: true, code: content.code };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.from("brand_social_media").update({ status: "failed", note: msg.slice(0, 500) }).eq("id", row.id);
    return { ok: false, error: msg };
  }
}

// ── A sync ───────────────────────────────────────────────────────────────────

async function sync() {
  const { data: sources } = await db.from("brand_social_media_sources").select("*").eq("active", true);
  const results: any[] = [];
  for (const s of sources ?? []) {
    const r: any = { source: s.label };
    try {
      const files = await walk(s.drive_folder_id, s.label.replace(/\s*\(Google Drive\)$/, ""));
      r.files = files.length;
      const known = new Set<string>();
      for (let i = 0; i < files.length; i += 300) {
        const { data } = await db.from("brand_social_media").select("drive_file_id").in("drive_file_id", files.slice(i, i + 300).map((f) => f.id));
        for (const k of data ?? []) known.add(k.drive_file_id);
      }
      const fresh = files.filter((f) => !known.has(f.id));
      // First sync records what is already there; later syncs import what is new.
      // A 'queued' note marks a library row for import on this or a later run.
      for (let i = 0; i < fresh.length; i += 300) {
        const rows = fresh.slice(i, i + 300).map((f) => ({
          source_id: s.id, drive_file_id: f.id, name: f.name, folder_path: f.path, kind: kindOf(f.name),
          drive_modified: f.modified, status: "library",
          note: s.baseline_done ? "queued" : "Present at the first sync; import it to make a draft.",
        }));
        const { error } = await db.from("brand_social_media").upsert(rows, { onConflict: "drive_file_id", ignoreDuplicates: true });
        if (error) throw new Error(error.message);
      }
      r.new_files = fresh.length;
      if (!s.baseline_done) {
        r.baseline = true;
        await db.from("brand_social_media_sources").update({ baseline_done: true }).eq("id", s.id);
      }
      const { data: queued } = await db.from("brand_social_media").select("*").eq("source_id", s.id).eq("status", "library").eq("note", "queued").limit(IMPORTS_PER_RUN);
      r.imported = [];
      for (const q of queued ?? []) r.imported.push({ name: q.name, ...(await importOne(q)) });
    } catch (e) {
      r.error = e instanceof Error ? e.message : String(e);
    }
    await db.from("brand_social_media_sources").update({ last_synced_at: new Date().toISOString(), last_result: r }).eq("id", s.id);
    results.push(r);
  }
  return json({ ok: true, results });
}

async function importChosen(ids: string[]) {
  const { data: rows } = await db.from("brand_social_media").select("*").in("drive_file_id", ids).in("status", ["library", "failed"]);
  const out: any[] = [];
  for (const row of (rows ?? []).slice(0, IMPORTS_PER_RUN)) out.push({ name: row.name, ...(await importOne(row)) });
  return json({ ok: true, requested: ids.length, imported: out, left: Math.max(0, (rows?.length ?? 0) - IMPORTS_PER_RUN) });
}

async function status() {
  const { data: sources } = await db.from("brand_social_media_sources").select("label, drive_folder_id, active, baseline_done, last_synced_at, last_result");
  const { data: rows } = await db.from("brand_social_media").select("status, kind");
  const counts: Record<string, number> = {};
  for (const r of rows ?? []) counts[`${r.status}:${r.kind}`] = (counts[`${r.status}:${r.kind}`] ?? 0) + 1;
  return json({ ok: true, sources, counts });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST only." }, 405);
  let body: any = {};
  try { body = await req.json(); } catch { /* empty body is a tick */ }

  const key = req.headers.get("x-automation-key") ?? "";
  if (key) {
    if (!AUTOMATION_SECRET || !sameSecret(key, AUTOMATION_SECRET)) return json({ error: "Forbidden." }, 403);
    if (!body?.action || body.action === "tick") return await sync();
    if (body.action === "status") return await status();
    return json({ error: "Unknown action." }, 400);
  }

  if (!(await callerIsAdmin(req))) return json({ error: "Admins only." }, 403);
  if (body?.action === "sync") return await sync();
  if (body?.action === "status") return await status();
  if (body?.action === "import") {
    const ids = Array.isArray(body?.ids) ? body.ids.filter((x: unknown) => typeof x === "string" && /^[\w-]{10,}$/.test(x)) : [];
    if (!ids.length) return json({ error: "Send ids: the Drive file ids to import." }, 400);
    return await importChosen(ids.slice(0, 50));
  }
  return json({ error: "Unknown action." }, 400);
});
