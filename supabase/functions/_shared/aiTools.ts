// AI Command Center — server-authoritative tool registry and executors.
//
// The client mirrors this registry for routing and UX; THIS file is the
// authority. An unknown tool name is rejected here, a read tool is never able
// to write, and a LEVEL 2 PREPARE (Phase 1) tool refuses to execute outright —
// so the "prepared, not executed" guarantee holds even if a crafted request
// bypasses the UI entirely.
//
// THE SECURITY BOUNDARY: every executor runs against the CALLING USER's own
// client (anon key + their JWT), never the service role. RLS is the fence — an
// editor calling `analytics_overview` sees exactly what the database lets an
// editor see, because Postgres decides, not this file. The ai_* ledger writes
// in the edge function use the service role, but those tables only ever accept
// is_staff() rows anyway.
//
// AUTONOMY: Phase 1 is LEVEL 2 (PREPARE). All executable tools are read-only;
// the write tools below are REGISTERED (so the planner can prepare them, and
// the approval UI has something real to show) but phase 2, and their run()
// throws. No data can be changed by this engine in Phase 1.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export type AiRisk = "READ" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

/** Which roles may run the tool. `staff` = admin or editor. */
export type AiToolRole = "admin" | "editor" | "staff";

export interface AiToolDef {
  name: string;
  description: string;
  readOnly: boolean;
  risk: AiRisk;
  /** 1 = live now (read-only), 2 = registered for the approval engine (writes). */
  phase: 1 | 2;
  role: AiToolRole;
  /** JSON Schema for arguments — mirrors the client's copy. */
  argsSchema: Record<string, unknown>;
  run: (db: SupabaseClient, args: Record<string, unknown>) => Promise<unknown>;
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** Bounded number of days back — a tool never scans eternity. */
const daysAgo = (days: number): string =>
  new Date(Date.now() - days * 86_400_000).toISOString();

const num = (v: unknown, fallback: number): number => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
};

const str = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, 80) : undefined;

/** Stable hash over args, key-ordered, so an approval binds to the exact payload. */
export function hashArgs(args: Record<string, unknown>): string {
  const stable = JSON.stringify(args, Object.keys(args).sort());
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < stable.length; i++) {
    const ch = stable.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, "0") + (h1 >>> 0).toString(16).padStart(8, "0");
}

/** count rows with an exact-count head query — cheap, no row transfer. */
async function count(
  db: SupabaseClient,
  table: string,
  opts: { eq?: [string, unknown][]; gte?: [string, unknown] } = {},
): Promise<number> {
  let q = db.from(table).select("*", { count: "exact", head: true });
  for (const [col, val] of opts.eq ?? []) q = q.eq(col, val);
  if (opts.gte) q = q.gte(opts.gte[0], opts.gte[1]);
  const { count: c, error } = await q;
  if (error) throw new Error(error.message);
  return c ?? 0;
}

// ---------------------------------------------------------------------------
// READ TOOLS — the live Phase 1 surface
// ---------------------------------------------------------------------------

const BUSINESS_COLS = "name, username, category, location, rating, claim_status, data_status, verification_status, is_listable, status, updated_at";

const platformHealth: AiToolDef = {
  name: "platform_health",
  description:
    "Platform overview: directory size, claim coverage, verification, recent growth, claim pipeline backlog, open approvals, pending profile requests and recent activity/failures. The Audit agent's opening move.",
  readOnly: true,
  risk: "READ",
  phase: 1,
  role: "staff",
  argsSchema: {
    type: "object",
    properties: { days: { type: "number", description: "Recency window in days (default 7)." } },
  },
  run: async (db, args) => {
    const days = num(args.days, 7);
    const since = daysAgo(days);
    const [total, recent, listable, verified, claimed, unclaimed, claimPending, claimsOpen, osApprovals, usersRecent, searches, views, contacts, kept, enquiries, signups, errors] =
      await Promise.all([
        count(db, "businesses"),
        count(db, "businesses", { gte: ["created_at", since] }),
        count(db, "businesses", { eq: [["is_listable", true]] }),
        count(db, "businesses", { eq: [["verification_status", "verified"]] }),
        count(db, "businesses", { eq: [["claim_status", "claimed"]] }),
        count(db, "businesses", { eq: [["claim_status", "unclaimed"]] }),
        count(db, "businesses", { eq: [["claim_status", "claim_pending"]] }),
        count(db, "business_claims", { eq: [["status", "pending"]] }),
        count(db, "os_approvals", { eq: [["status", "pending"]] }),
        count(db, "users", { gte: ["created_at", since] }),
        count(db, "analytics_events", { eq: [["name", "search_performed"]], gte: ["created_at", since] }),
        count(db, "analytics_events", { eq: [["name", "business_viewed"]], gte: ["created_at", since] }),
        count(db, "analytics_events", { eq: [["name", "business_contact_clicked"]], gte: ["created_at", since] }),
        count(db, "analytics_events", { eq: [["name", "business_kept"]], gte: ["created_at", since] }),
        count(db, "analytics_events", { eq: [["name", "enquiry_sent"]], gte: ["created_at", since] }),
        count(db, "analytics_events", { eq: [["name", "signup"]], gte: ["created_at", since] }),
        count(db, "analytics_events", { eq: [["name", "client_error"]], gte: ["created_at", since] }),
      ]);
    return {
      window_days: days,
      directory: { total, listable, verified, claimed, unclaimed, claim_pending: claimPending },
      growth: { businesses_new: recent, users_new: usersRecent, signups: signups },
      claims_backlog: { pending_claims: claimsOpen },
      approvals: { pending_os_approvals: osApprovals },
      activity: { searches, business_views: views, contact_clicks: contacts, keeps: kept, enquiries },
      health: { client_errors: errors },
    };
  },
};

const businessesSnapshot: AiToolDef = {
  name: "businesses_snapshot",
  description:
    "Listings filtered by category, city, claim status or verification. Returns counts plus a bounded sample of rows. Use for every 'show me the businesses / how many X' question.",
  readOnly: true,
  risk: "READ",
  phase: 1,
  role: "staff",
  argsSchema: {
    type: "object",
    properties: {
      category: { type: "string" },
      city: { type: "string" },
      claim_status: { type: "string", enum: ["unclaimed", "claim_pending", "claimed"] },
      verified: { type: "boolean" },
      limit: { type: "number", description: "Max sample rows (default 20, cap 50)." },
    },
  },
  run: async (db, args) => {
    const limit = Math.min(num(args.limit, 20), 50);
    let q = db.from("businesses").select(BUSINESS_COLS, { count: "exact" }).order("updated_at", { ascending: false }).limit(limit);
    if (args.category) q = q.ilike("category", `%${args.category}%`);
    if (args.city) q = q.ilike("location", `%${args.city}%`);
    if (args.claim_status) q = q.eq("claim_status", args.claim_status);
    if (typeof args.verified === "boolean") q = q.eq("verification_status", args.verified ? "verified" : "unverified");
    const { data, count: total, error } = await q;
    if (error) throw new Error(error.message);
    return { total: total ?? 0, sampled: data ?? [] };
  },
};

const claimPipeline: AiToolDef = {
  name: "claim_pipeline",
  description:
    "The claim funnel: how many claims are pending, approved or rejected, plus workforce outreach status (contacted, replied, claimed). Answers 'why aren't they claiming' and 'what's stuck in review'.",
  readOnly: true,
  risk: "READ",
  phase: 1,
  role: "staff",
  argsSchema: { type: "object", properties: {} },
  run: async (db) => {
    const claims = await db.from("business_claims").select("status", { count: "exact" });
    if (claims.error) throw new Error(claims.error.message);
    const byStatus: Record<string, number> = { pending: 0, approved: 0, rejected: 0 };
    (claims.data ?? []).forEach((c) => {
      byStatus[c.status as string] = (byStatus[c.status as string] ?? 0) + 1;
    });
    const oldest = await db
      .from("business_claims")
      .select("id, created_at, status")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(5);
    const counts = await count(db, "claimreach_outreach");
    const replied = await count(db, "claimreach_outreach", { eq: [["status", "replied"]] });
    const claimed = await count(db, "claimreach_outreach", { eq: [["status", "claimed"]] });
    return {
      claims: byStatus,
      oldest_pending: (oldest.data ?? []).map((c) => ({ created_at: c.created_at })),
      outreach: { total: counts, replied, claimed },
    };
  },
};

const analyticsOverview: AiToolDef = {
  name: "analytics_overview",
  description:
    "Platform engagement over a window: searches, business views, contact clicks, keeps, enquiries, signups, bookings — each as a real count. Use for growth and engagement questions.",
  readOnly: true,
  risk: "READ",
  phase: 1,
  role: "staff",
  argsSchema: {
    type: "object",
    properties: { days: { type: "number", description: "Window in days (default 7)." } },
  },
  run: async (db, args) => {
    const days = num(args.days, 7);
    const since = daysAgo(days);
    const names = [
      "search_performed", "search_result_clicked", "business_viewed", "business_contact_clicked",
      "directions_opened", "business_kept", "enquiry_sent", "booking_started", "signup", "signin",
      "create_order_requested", "plan_viewed", "client_error",
    ] as const;
    const rows = await Promise.all(
      names.map(async (name) => [name, await count(db, "analytics_events", { eq: [["name", name]], gte: ["created_at", since] })] as const),
    );
    return {
      window_days: days,
      // A subset described for the model — raw counts are verbose.
      counts: Object.fromEntries(rows),
      strongest: [...rows].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, c]) => ({ event: name, count: c })),
    };
  },
};

const opportunityFinder: AiToolDef = {
  name: "opportunity_finder",
  description:
    "High-value acquisition candidates: listable, unclaimed listings most likely to deserve a claim push — recent, with contact details present. Plus a per-category supply/demand gap view from searches vs listings.",
  readOnly: true,
  risk: "READ",
  phase: 1,
  role: "staff",
  argsSchema: {
    type: "object",
    properties: { limit: { type: "number", description: "Max candidates (default 10, cap 30)." } },
  },
  run: async (db, args) => {
    const limit = Math.min(num(args.limit, 10), 30);
    const { data, error } = await db
      .from("businesses")
      .select("name, username, category, location, phone, website, email, rating, listing_score, updated_at")
      .eq("is_listable", true)
      .eq("claim_status", "unclaimed")
      .not("phone", "is", null)
      .order("listing_score", { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);

    // Demand: count recent searches per location from a bounded sample.
    const since = daysAgo(14);
    const searchRows = await db
      .from("analytics_events")
      .select("props")
      .eq("name", "search_performed")
      .gte("created_at", since)
      .limit(400);
    const demandByCity: Record<string, number> = {};
    (searchRows.data ?? []).forEach((r) => {
      const props = (r as { props?: Record<string, unknown> }).props ?? {};
      const loc = typeof props.location === "string" ? props.location.trim() : undefined;
      if (loc) demandByCity[loc] = (demandByCity[loc] ?? 0) + 1;
    });
    const topDemand = Object.entries(demandByCity).sort((a, b) => b[1] - a[1]).slice(0, 8);

    return {
      candidates: (data ?? []).map((b) => ({ name: b.name, username: b.username, category: b.category, location: b.location, rating: b.rating, score: b.listing_score, contactable: Boolean(b.phone || b.email || b.website), updated: b.updated_at })),
      top_search_demand: topDemand.map(([city, n]) => ({ city, searches: n })),
    };
  },
};

const duplicateFinder: AiToolDef = {
  name: "duplicate_finder",
  description:
    "Duplicate-listing candidates: records sharing the same name and city, or the same phone number. Reports groups of size 2+ so a human can decide which to merge (merging itself is a Phase 2 write tool).",
  readOnly: true,
  risk: "READ",
  phase: 1,
  role: "staff",
  argsSchema: {
    type: "object",
    properties: { limit: { type: "number", description: "Max rows scanned (default 1500)." } },
  },
  run: async (db, args) => {
    const limit = Math.min(num(args.limit, 1500), 4000);
    const { data, error } = await db
      .from("businesses")
      .select("id, name, username, category, location, phone, claim_status, updated_at")
      .order("updated_at", { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);

    const norm = (s: unknown): string => String(s ?? "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
    const groups = new Map<string, typeof data>();
    const phones = new Map<string, typeof data>();
    (data ?? []).forEach((b) => {
      if (b.claim_status === "claimed") return;
      const key = `${norm(b.name)}|${norm(b.location).split(" ").slice(0, 2).join(" ")}`;
      groups.set(key, [...(groups.get(key) ?? []), b]);
      const phone = norm((b as { phone?: string | null }).phone).replace(/\s/g, "");
      if (phone.length >= 7) phones.set(phone, [...(phones.get(phone) ?? []), b]);
    });

    const sameNameCity = [...groups.values()].filter((g) => g.length > 1);
    const samePhone = [...phones.values()].filter((g) => g.length > 1);
    return {
      same_name_and_city: sameNameCity.slice(0, 15).map((g) => g.map((b) => ({ name: b.name, username: b.username, location: b.location }))),
      same_phone: samePhone.slice(0, 10).map((g) => g.map((b) => ({ name: b.name, username: b.username, phone: b.phone }))),
      scanned: data?.length ?? 0,
    };
  },
};

const dataQuality: AiToolDef = {
  name: "data_quality",
  description:
    "Directory completeness among listable listings: how many miss a description, phone, email, website or opening hours, how many are low-confidence, and the provenance mix. Drives the Data Steward's checklist.",
  readOnly: true,
  risk: "READ",
  phase: 1,
  role: "staff",
  argsSchema: { type: "object", properties: {} },
  run: async (db) => {
    const listable = await count(db, "businesses", { eq: [["is_listable", true]] });
    const missing = async (col: string): Promise<number> => {
      const { count: c, error } = await db
        .from("businesses")
        .select("*", { count: "exact", head: true })
        .eq("is_listable", true)
        .or(`${col}.is.null,${col}.eq.`);
      if (error) throw new Error(error.message);
      return c ?? 0;
    };
    const [noDesc, noPhone, noEmail, noSite, noHours, lowConfidence] = await Promise.all([
      missing("description"),
      missing("phone"),
      missing("email"),
      missing("website"),
      missing("opening_hours"),
      count(db, "businesses", { eq: [["is_listable", true], ["data_confidence", "unconfirmed"]] }),
    ]);
    const provenance = await db.from("businesses").select("data_status, claim_status");
    if (provenance.error) throw new Error(provenance.error.message);
    const byDataStatus: Record<string, number> = {};
    (provenance.data ?? []).forEach((b) => {
      const k = b.data_status as string;
      byDataStatus[k] = (byDataStatus[k] ?? 0) + 1;
    });
    return {
      listable,
      missing: {
        description: noDesc,
        phone: noPhone,
        email: noEmail,
        website: noSite,
        opening_hours: noHours,
        low_data_confidence: lowConfidence,
      },
      completeness_pct: listable ? Math.round((1 - (noPhone + noDesc) / (2 * listable)) * 100) : null,
      provenance: byDataStatus,
    };
  },
};

const growthGaps: AiToolDef = {
  name: "growth_gaps",
  description:
    "Where demand outruns supply: recent search volume by category and city against how many listable listings exist there. The map the Growth team builds campaigns from.",
  readOnly: true,
  risk: "READ",
  phase: 1,
  role: "staff",
  argsSchema: {
    type: "object",
    properties: { days: { type: "number", description: "Search window (default 14)." } },
  },
  run: async (db, args) => {
    const days = num(args.days, 14);
    const since = daysAgo(days);
    const searchRows = await db
      .from("analytics_events")
      .select("props")
      .eq("name", "search_performed")
      .gte("created_at", since)
      .limit(700);
    const demandByCategory: Record<string, number> = {};
    (searchRows.data ?? []).forEach((r) => {
      const props = (r as { props?: Record<string, unknown> }).props ?? {};
      const cat = typeof props.category === "string" ? props.category.trim() : undefined;
      const loc = typeof props.location === "string" ? props.location.trim() : "anywhere";
      if (cat) demandByCategory[`${cat} @ ${loc}`] = (demandByCategory[`${cat} @ ${loc}`] ?? 0) + 1;
    });
    const listingRows = await db
      .from("businesses")
      .select("category, location")
      .eq("is_listable", true)
      .limit(1000);
    const supply: Record<string, number> = {};
    (listingRows.data ?? []).forEach((b) => {
      const cat = b.category ?? "Other";
      const loc = b.location ?? "anywhere";
      const key = `${cat} @ ${loc}`;
      supply[key] = (supply[key] ?? 0) + 1;
    });
    const gaps = Object.entries(demandByCategory)
      .map(([key, demandCount]) => ({ key, searches: demandCount, listings: supply[key] ?? 0 }))
      .filter((g) => g.searches >= 3)
      .sort((a, b) => b.searches / (b.listings + 1) - a.searches / (a.listings + 1))
      .slice(0, 15);
    return { window_days: days, gaps };
  },
};

const systemHealth: AiToolDef = {
  name: "system_health",
  description:
    "The machinery: recent workforce runs (the AI roster's own status), the cron schedule, automation log tail, and ClaimReach outreach state. Answers 'is the platform machinery working'.",
  readOnly: true,
  risk: "READ",
  phase: 1,
  role: "admin",
  argsSchema: { type: "object", properties: {} },
  run: async (db) => {
    const runs = await db.from("workforce_runs").select("agent_key, status, summary, reason, created_at").order("created_at", { ascending: false }).limit(8);
    const schedule = await db.from("workforce_schedule").select("agent_key, enabled, cron").limit(20);
    const automation = await db.from("automation_log").select("*").order("created_at", { ascending: false }).limit(8);
    const outreach = await db.from("claimreach_outreach").select("status, created_at").order("created_at", { ascending: false }).limit(500);
    if (runs.error || schedule.error || automation.error || outreach.error) {
      throw new Error(runs.error?.message ?? schedule.error?.message ?? automation.error?.message ?? outreach.error?.message ?? "system_health failed");
    }
    const outreachByStatus: Record<string, number> = {};
    (outreach.data ?? []).forEach((o) => {
      const k = o.status as string;
      outreachByStatus[k] = (outreachByStatus[k] ?? 0) + 1;
    });
    return {
      workforce_runs: (runs.data ?? []).map((r) => ({ agent: r.agent_key, status: r.status, summary: r.summary ?? null, reason: r.reason ?? null, created_at: r.created_at })),
      schedule: schedule.data ?? [],
      automation_tail: automation.data ?? [],
      outreach_by_status: outreachByStatus,
    };
  },
};

const securitySnapshot: AiToolDef = {
  name: "security_snapshot",
  description:
    "RLS posture scan: for every critical table, whether row-level security is enabled and whether its policies gate on is_staff()/is_admin(). The Security Sentinel's core evidence.",
  readOnly: true,
  risk: "READ",
  phase: 1,
  role: "admin",
  argsSchema: { type: "object", properties: {} },
  run: async (db) => {
    const { data, error } = await db.rpc("ai_rls_snapshot");
    if (error) throw new Error(error.message);
    return { tables: data };
  },
};

const searchInsight: AiToolDef = {
  name: "directory_search",
  description:
    "Free-text search across live listings (name, category, description) with an optional city filter. Use when a question names a specific business, niche or place.",
  readOnly: true,
  risk: "READ",
  phase: 1,
  role: "staff",
  argsSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "The noun to search for." },
      city: { type: "string", description: "Optional city filter." },
      limit: { type: "number", description: "Max results (default 10)." },
    },
  },
  run: async (db, args) => {
    const query = str(args.query);
    const city = str(args.city);
    if (!query) return { results: [] };
    const limit = Math.min(num(args.limit, 10), 20);
    const safe = query.replace(/[,()]/g, " ");
    let q = db.from("businesses").select(BUSINESS_COLS + ", description").eq("is_listable", true).limit(limit);
    q = q.or(`name.ilike.%${safe}%,category.ilike.%${safe}%,description.ilike.%${safe}%`);
    if (city) q = q.ilike("location", `%${city}%`);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return { results: data ?? [] };
  },
};

// ---------------------------------------------------------------------------
// PHASE 2 WRITE TOOLS — registered so the approval engine can prepare them
// ---------------------------------------------------------------------------

const writeTool = (name: string, description: string, risk: AiRisk, role: AiToolRole, extra: Record<string, unknown> = {}): AiToolDef => ({
  name,
  description: `${description} [Phase 2 — registered but NOT executable at LEVEL 2 PREPARE. Runs only after a human approval in a later phase.]`,
  readOnly: false,
  risk,
  phase: 2,
  role,
  argsSchema: { type: "object", properties: { ...extra }, additionalProperties: true },
  run: async () => {
    // Phase 1 guarantees: a registered write can never execute through this
    // engine, whatever the caller asks for. This is the LEVEL 2 line.
    throw new Error(`${name} is registered (Phase 2) but not executable at LEVEL 2 PREPARE.`);
  },
});

// ---------------------------------------------------------------------------
// registry
// ---------------------------------------------------------------------------

export const AI_TOOLS: AiToolDef[] = [
  platformHealth,
  businessesSnapshot,
  claimPipeline,
  analyticsOverview,
  opportunityFinder,
  duplicateFinder,
  dataQuality,
  growthGaps,
  systemHealth,
  securitySnapshot,
  searchInsight,
  // Phase 2 writes (prepared only).
  writeTool("merge_business", "Merge two duplicate listings into one, preserving the claimed/kept data.", "CRITICAL", "admin", { source_id: {}, target_id: {} }),
  writeTool("approve_claim", "Approve a pending business claim, handing the listing to its owner.", "HIGH", "admin", { claim_id: {} }),
  writeTool("update_business", "Update a public listing's profile fields (description, hours, phone, website).", "MEDIUM", "admin", { business_id: {}, fields: {} }),
  writeTool("send_outreach", "Send a ClaimReach outreach message to a business contact.", "HIGH", "admin", { business_id: {}, channel: {} }),
  writeTool("toggle_feature", "Toggle a feature flag or listing switch for everyone.", "MEDIUM", "admin", { flag: {}, value: {} }),
];

export const AI_TOOL_BY_NAME: Record<string, AiToolDef> = Object.fromEntries(
  AI_TOOLS.map((t) => [t.name, t]),
);

/** The official read-only skill list the router and planner may call in Phase 1. */
export const EXECUTABLE_TOOLS = AI_TOOLS.filter((t) => t.phase === 1 && t.readOnly).map((t) => t.name);

/** Default autonomy for Phase 1: LEVEL 2 = PREPARE. */
export const AUTONOMY_LEVEL = 2;

export function classifyRisk(readOnly: boolean): AiRisk {
  return readOnly ? "READ" : "CRITICAL";
}