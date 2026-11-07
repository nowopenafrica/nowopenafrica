// What this Instagram token is, and which of two separate features it unlocks.
//
// ── TWO FEATURES, EASILY CONFUSED ────────────────────────────────────────
//
// 1. Instagram DMs (notify.ts → INSTAGRAM_TOKEN + INSTAGRAM_BUSINESS_ID).
//    Meta only permits a DM inside an open 24-hour conversation window — a
//    reply to somebody who messaged us. There is no cold outreach here, ever,
//    and no amount of configuration creates one.
//
// 2. The manual Instagram extractor (extract-instagram → META_PAGE_ACCESS_TOKEN
//    + INSTAGRAM_BUSINESS_ACCOUNT_ID). Reads a public business profile by
//    username through business_discovery. Needs instagram_basic,
//    instagram_manage_insights and pages_read_engagement, plus App Review.
//
// One Meta token can satisfy both if it carries the right scopes and reaches a
// linked Instagram Business account. Rather than guess, this asks — and then
// proves the extractor claim by actually performing a lookup, because a scope
// list is a permission to try, not evidence that it works.
//
// ── READ-ONLY ────────────────────────────────────────────────────────────
//
// It never sends a DM. Same reasoning as the WhatsApp probe: a JWT carries no
// verified Instagram identity, so there is no "only to yourself" guarantee to
// lean on, and a DM is a message to a real person.

import { createClient } from "npm:@supabase/supabase-js@2";

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
const GRAPH = "https://graph.facebook.com/v20.0";

const TOKEN = Deno.env.get("INSTAGRAM_TOKEN");
const IG_BUSINESS_ID = Deno.env.get("INSTAGRAM_BUSINESS_ID");
const EXTRACTOR_TOKEN = Deno.env.get("META_PAGE_ACCESS_TOKEN");
const EXTRACTOR_IG_ID = Deno.env.get("INSTAGRAM_BUSINESS_ACCOUNT_ID");

/** Scopes the manual extractor needs. Meta grants these only after App Review. */
const EXTRACTOR_SCOPES = ["instagram_basic", "instagram_manage_insights", "pages_read_engagement"];
/** Scopes an Instagram DM reply needs. */
const DM_SCOPES = ["instagram_manage_messages", "pages_messaging"];

async function graph<T>(path: string): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${GRAPH}/${path}`, { headers: { Authorization: `Bearer ${TOKEN}` } });
    const body = await res.json().catch(() => null) as { error?: { message?: string } } | null;
    if (!res.ok) return { ok: false, error: body?.error?.message ?? `Graph ${res.status}` };
    return { ok: true, data: body as T };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

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

  if (!TOKEN) {
    return json({ ok: false, stage: "token", reason: "No INSTAGRAM_TOKEN is set on this project." }, 200);
  }

  const dbg = await graph<{
    data?: {
      app_id?: string; type?: string; application?: string; expires_at?: number;
      is_valid?: boolean; scopes?: string[];
      granular_scopes?: { scope: string; target_ids?: string[] }[];
    };
  }>(`debug_token?input_token=${encodeURIComponent(TOKEN)}`);

  if (!dbg.ok) return json({ ok: false, stage: "token", reason: `Meta rejected the token: ${dbg.error}` }, 200);

  const d = dbg.data.data ?? {};
  if (d.is_valid === false) {
    return json({ ok: false, stage: "token", reason: "Meta reports this token is no longer valid." }, 200);
  }

  const expiresAt = d.expires_at ?? 0;
  const neverExpires = expiresAt === 0;
  const hoursLeft = neverExpires ? null : Math.round((expiresAt * 1000 - Date.now()) / 3_600_000);
  const scopes = d.scopes ?? [];

  /*
   * Which Instagram Business account does this reach? It hangs off a Facebook
   * Page, so walk the Pages. This is also the ID both features need, and
   * discovering it saves somebody hunting in Business Manager.
   */
  /*
   * The right call depends on what kind of token this is.
   *
   * On a PAGE token `/me` IS the Page, so `/me/accounts` does not exist and
   * returns "(#100) Tried accessing nonexisting field (accounts)" — which
   * looks exactly like "this token reaches nothing" and is not. On a USER or
   * SYSTEM_USER token, `/me/accounts` is the list of Pages. Ask the right
   * question rather than reporting the wrong answer.
   */
  const isPageToken = d.type === "PAGE";
  const pages = isPageToken
    ? await graph<{ id?: string; name?: string }>("me?fields=id,name")
        .then((r) => r.ok
          ? { ok: true as const, data: { data: [{ id: r.data.id ?? "", name: r.data.name }] } }
          : r)
    : await graph<{ data?: { id: string; name?: string }[] }>("me/accounts?fields=id,name&limit=50");
  const igAccounts: { pageId: string; pageName?: string; igId: string; username?: string }[] = [];
  const discovery: string[] = [];

  if (!pages.ok) {
    discovery.push(`Could not list Pages: ${pages.error}`);
  } else {
    const list = pages.data.data ?? [];
    discovery.push(isPageToken
      ? `This is a Page token for "${list[0]?.name ?? list[0]?.id}".`
      : `${list.length} Facebook Page(s) visible to this token.`);
    for (const pg of list) {
      const r = await graph<{ instagram_business_account?: { id: string; username?: string } }>(
        `${pg.id}?fields=instagram_business_account{id,username}`,
      );
      if (r.ok && r.data.instagram_business_account) {
        igAccounts.push({
          pageId: pg.id, pageName: pg.name,
          igId: r.data.instagram_business_account.id,
          username: r.data.instagram_business_account.username,
        });
      }
    }
    if (list.length > 0 && igAccounts.length === 0) {
      discovery.push("No Page has an Instagram Business account linked. Link one in Meta before either feature can work.");
    }
  }

  const missingExtractorScopes = EXTRACTOR_SCOPES.filter((s) => !scopes.includes(s));

  /*
   * The next step, not the end state.
   *
   * Saying "needs App Review" was true eventually and wrong immediately: the
   * usual cause is a token generated without these boxes ticked. Meta grants
   * them to the app's own admins, developers and testers without review
   * (Standard Access); App Review is what later turns that into Advanced
   * Access — acting for people with no role on the app.
   */
  const extractorNextStep = missingExtractorScopes.length === 0
    ? null
    : `Regenerate the token with ${missingExtractorScopes.join(" and ")} ticked. Meta grants these to the `
      + "app's own admins without App Review; review is only needed to use them for people outside the app.";
  const missingDmScopes = DM_SCOPES.filter((s) => !scopes.includes(s));

  /*
   * PROVE the extractor claim rather than inferring it from scopes.
   *
   * A scope is permission to attempt a call, not evidence the call succeeds —
   * App Review, account type and linkage all sit between the two. So perform a
   * real business_discovery lookup, using our OWN account as the subject.
   * Reading our own public profile is the least intrusive possible test and it
   * exercises the exact code path the extractor uses.
   */
  let extractorProof: { attempted: boolean; works: boolean; detail: string } =
    { attempted: false, works: false, detail: "Not attempted: no Instagram Business account was found." };

  const selfIg = igAccounts[0];
  if (selfIg?.username) {
    const probe = await graph<{ business_discovery?: { username?: string } }>(
      `${selfIg.igId}?fields=business_discovery.username(${selfIg.username}){username,name,followers_count}`,
    );
    extractorProof = probe.ok && probe.data.business_discovery
      ? { attempted: true, works: true, detail: `business_discovery resolved @${selfIg.username}. The manual extractor would work.` }
      : {
        attempted: true, works: false,
        detail: probe.ok
          ? "business_discovery returned nothing — the account may not be a Business/Creator account."
          : `business_discovery failed: ${probe.ok === false ? probe.error : ""}`,
      };
  }

  const warnings: string[] = [];

  /*
   * A PAGE token that reports no expiry is NOT necessarily permanent.
   *
   * Measured 2026-10-08, the hard way: debug_token returned expires_at = 0 for
   * the Instagram page token and this probe duly reported neverExpires: true.
   * Hours later every call failed with "Session has expired on Thursday,
   * 08-Oct-26 08:00:00 PDT". A page token inherits the lifetime of the USER
   * session it was derived from — and a token minted in the Graph API Explorer
   * dies with that session, whatever expires_at says. Only a page token
   * derived from a System User is genuinely permanent.
   *
   * So the zero is reported as what it is — an absent expiry, not a promise.
   */
  if (neverExpires && d.type === "PAGE") {
    warnings.push(
      "This is a PAGE token and Meta reports no expiry, which does not mean it is permanent: a page token "
      + "inherits the lifetime of the user session it came from, and one minted in the Graph API Explorer dies "
      + "with that session. For a platform, derive it from a System User in Business Settings.",
    );
  }

  if (!neverExpires && hoursLeft !== null && hoursLeft <= 48) {
    warnings.push(
      `This token expires in about ${hoursLeft} hour(s). It is a ${d.type ?? "USER"} token — a platform needs a `
      + "System User token, which does not expire.",
    );
  }
  /*
   * Stated unconditionally because it is a property of Meta's platform, not of
   * this configuration: no setting will ever permit a cold Instagram DM.
   */
  warnings.push(
    "Instagram DMs are conversation-only: Meta permits a message only inside the 24-hour window after somebody "
    + "messages us first. Cold DMs to a handle are never possible, however this is configured.",
  );

  return json({
    ok: true,
    sentAnything: false,
    token: {
      valid: true, type: d.type ?? null, appId: d.app_id ?? null,
      application: d.application ?? null, neverExpires,
      expiresAt: neverExpires ? null : new Date(expiresAt * 1000).toISOString(),
      hoursLeft, scopes,
    },
    discovery,
    igAccounts,
    dm: {
      secretsSet: { INSTAGRAM_TOKEN: true, INSTAGRAM_BUSINESS_ID: Boolean(IG_BUSINESS_ID) },
      missingScopes: missingDmScopes,
      // Even fully configured, this only ever enables REPLIES.
      repliesPossible: missingDmScopes.length === 0 && Boolean(IG_BUSINESS_ID),
    },
    extractor: {
      secretsSet: {
        META_PAGE_ACCESS_TOKEN: Boolean(EXTRACTOR_TOKEN),
        INSTAGRAM_BUSINESS_ACCOUNT_ID: Boolean(EXTRACTOR_IG_ID),
      },
      missingScopes: missingExtractorScopes,
      nextStep: extractorNextStep,
      proof: extractorProof,
      /*
       * The useful conclusion: this token may be able to power the extractor,
       * which has been reporting "not configured" since it was built.
       */
      thisTokenCouldPowerIt: extractorProof.works,
      suggestedSecrets: extractorProof.works && selfIg
        ? { META_PAGE_ACCESS_TOKEN: "(this same token)", INSTAGRAM_BUSINESS_ACCOUNT_ID: selfIg.igId }
        : null,
    },
    warnings,
  });
});
