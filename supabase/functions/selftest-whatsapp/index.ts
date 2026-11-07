// "What is this WhatsApp token, and what is still missing?" — asked of Meta.
//
// ── READ-ONLY, DELIBERATELY ──────────────────────────────────────────────
//
// This endpoint NEVER sends a WhatsApp message. The email self-test can send
// safely because a JWT carries a verified email address, so it can mail only
// the caller. A JWT carries no verified phone number, so there is no
// equivalent "send only to yourself" guarantee here — any send would have to
// be aimed at a number somebody typed, and that is a different thing with
// different consent rules. Sending stays in the existing manual-send screen,
// which already records who sent what to whom.
//
// So this answers the setup questions instead, which is where the real work
// is: a WhatsApp token on its own sends nothing. You also need the phone
// number ID and, for anyone outside an open 24-hour window, an approved
// template. Both live in Meta's UI and both are discoverable from the token.
//
// ── WHY EXPIRY IS THE HEADLINE ───────────────────────────────────────────
//
// Meta hands out several things that all look like `EAA…`. A token copied
// from the Graph API Explorer dies in about an hour; a user token lasts 60
// days; only a System User token is permanent. Configuring a platform around
// a token that expires on Tuesday is the expensive mistake here, so the
// expiry is reported first and loudly.

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

const TOKEN = Deno.env.get("WHATSAPP_TOKEN");
const PHONE_ID = Deno.env.get("WHATSAPP_PHONE_ID");
const TEMPLATE = Deno.env.get("WHATSAPP_WELCOME_TEMPLATE");
/* The WhatsApp Business Account. Given explicitly because a sending token
 * usually cannot enumerate its way to one (that needs business_management),
 * and the templates live here. */
const WABA_ID = Deno.env.get("WHATSAPP_WABA_ID");
/* Delivery-webhook configuration. Read, never reported back as a value. */
const APP_SECRET_SET = Boolean(Deno.env.get("META_APP_SECRET"));
const VERIFY_TOKEN_SET = Boolean(Deno.env.get("WHATSAPP_VERIFY_TOKEN"));

interface PhoneNumber {
  id: string;
  display_phone_number?: string;
  verified_name?: string;
  quality_rating?: string;
  code_verification_status?: string;
}

interface Template {
  name: string;
  status: string;
  language: string;
  category?: string;
}

/** A Graph GET that never throws and never leaks the token into the result. */
async function graph<T>(path: string): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${GRAPH}/${path}`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    const body = await res.json().catch(() => null) as
      { error?: { message?: string } } | null;
    if (!res.ok) {
      return { ok: false, error: body?.error?.message ?? `Graph ${res.status}` };
    }
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
    return json({
      ok: false, stage: "token", tokenPresent: false,
      reason: "No WHATSAPP_TOKEN is set on this project, so nothing was asked of Meta.",
    }, 200);
  }

  /*
   * 1. What IS this token? debug_token is the only call that distinguishes a
   *    permanent System User token from an Explorer token that dies today.
   */
  const dbg = await graph<{
    data?: {
      app_id?: string; type?: string; application?: string;
      expires_at?: number; data_access_expires_at?: number;
      is_valid?: boolean; scopes?: string[];
      granular_scopes?: { scope: string; target_ids?: string[] }[];
    };
  }>(`debug_token?input_token=${encodeURIComponent(TOKEN)}`);

  if (!dbg.ok) {
    return json({
      ok: false, stage: "token", tokenPresent: true,
      reason: `Meta rejected the token: ${dbg.error}`,
    }, 200);
  }

  const d = dbg.data.data ?? {};
  if (d.is_valid === false) {
    return json({
      ok: false, stage: "token", tokenPresent: true,
      reason: "Meta reports this token is no longer valid. Issue a new one.",
    }, 200);
  }

  /*
   * expires_at === 0 means it never expires — a System User token, which is
   * what a platform should be running on.
   */
  const expiresAt = d.expires_at ?? 0;
  const neverExpires = expiresAt === 0;
  const expiresIso = neverExpires ? null : new Date(expiresAt * 1000).toISOString();
  const hoursLeft = neverExpires ? null : Math.round((expiresAt * 1000 - Date.now()) / 3_600_000);

  /*
   * 2. Which WhatsApp Business Account does it reach? Meta reports this in
   *    granular_scopes against the messaging permission, which saves hunting
   *    for an ID in Business Manager.
   */
  const wabaIds = new Set<string>(
    // The configured account first; discovery is only a fallback for it.
    (WABA_ID ? [WABA_ID] : []).concat(
    (d.granular_scopes ?? [])
      .filter((g) => g.scope?.startsWith("whatsapp_business"))
      .flatMap((g) => g.target_ids ?? [])),
  );

  /*
   * Fallback discovery.
   *
   * granular_scopes carries target_ids only when the permission was granted
   * against a specific asset; a plain user token often has the scopes and no
   * targets. Finding nothing there is NOT evidence that the account has no
   * numbers — it is evidence that this lookup was the wrong one. So walk the
   * businesses the token can see before concluding anything.
   */
  const discovery: string[] = [];
  /*
   * Run this ALWAYS, not only when the configured account is missing.
   *
   * A System User token with business_management can see every WhatsApp
   * account on the business — including a real one sitting next to the test
   * sandbox. Only looking when the configured id is absent would hide exactly
   * the account somebody needs to switch to.
   */
  {
    const biz = await graph<{ data?: { id: string; name?: string }[] }>("me/businesses?limit=50");
    if (!biz.ok) {
      discovery.push(`Could not list businesses for this token: ${biz.error}`);
    } else {
      const list = biz.data.data ?? [];
      discovery.push(`${list.length} business account(s) visible to this token.`);
      for (const b of list) {
        for (const edge of ["owned_whatsapp_business_accounts", "client_whatsapp_business_accounts"]) {
          const r = await graph<{ data?: { id: string }[] }>(`${b.id}/${edge}?limit=50`);
          if (r.ok) for (const w of r.data.data ?? []) wabaIds.add(w.id);
        }
      }
      if (wabaIds.size === 0 && list.length > 0) {
        discovery.push("None of those businesses has a WhatsApp Business Account attached to this token.");
      }
    }
  }

  // 3. The phone numbers and templates on each account — the two things that
  //    are actually missing from the configuration.
  const accounts: {
    wabaId: string;
    name?: string;
    phoneNumbers: PhoneNumber[];
    templates: Template[];
    note?: string;
  }[] = [];

  for (const wabaId of Array.from(wabaIds)) {
    /*
     * More than the name: account_review_status and
     * business_verification_status are what decide whether this account can
     * message real people at all, and they are not visible from the number.
     */
    const info = await graph<{
      name?: string; account_review_status?: string;
      business_verification_status?: string; ownership_type?: string;
    }>(`${wabaId}?fields=name,account_review_status,business_verification_status,ownership_type`);
    const nums = await graph<{ data?: PhoneNumber[] }>(
      `${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating,code_verification_status`,
    );
    const tpl = await graph<{ data?: Template[] }>(
      `${wabaId}/message_templates?fields=name,status,language,category&limit=100`,
    );
    accounts.push({
      wabaId,
      name: info.ok ? info.data.name : undefined,
      reviewStatus: info.ok ? info.data.account_review_status : undefined,
      businessVerification: info.ok ? info.data.business_verification_status : undefined,
      ownershipType: info.ok ? info.data.ownership_type : undefined,
      phoneNumbers: nums.ok ? (nums.data.data ?? []) : [],
      templates: tpl.ok ? (tpl.data.data ?? []) : [],
      note: nums.ok ? undefined : `Could not read phone numbers: ${nums.error}`,
    });
  }

  /*
   * Direct check of the CONFIGURED number.
   *
   * Enumeration needs business_management, which a sending token often lacks
   * — but the number itself can be read by its own ID. So when listing came
   * back empty, ask about the one ID we were actually given rather than
   * reporting an unknown as a failure.
   */
  let directPhone: PhoneNumber | null = null;
  let directPhoneError: string | null = null;
  /** The WABA that owns the configured number, when it is not the configured WABA. */
  let ownerWabaId: string | null = null;
  /*
   * Ask whenever the configured id was not FOUND, not only when enumeration
   * returned nothing.
   *
   * The earlier condition skipped the direct read as soon as any number came
   * back — so with the sandbox number still listed, a newly added number was
   * reported "not reachable by this token" without anything ever asking Meta
   * about it. That is a conclusion drawn from a lookup that never ran, and a
   * new number usually sits on a DIFFERENT WABA, which is exactly the case
   * this has to detect.
   */
  const alreadyFound = PHONE_ID
    ? accounts.some((a) => a.phoneNumbers.some((n) => n.id === PHONE_ID))
    : true;
  if (PHONE_ID && !alreadyFound) {
    const r = await graph<PhoneNumber>(
      `${PHONE_ID}?fields=id,display_phone_number,verified_name,quality_rating,code_verification_status`,
    );
    if (r.ok) directPhone = r.data;
    else directPhoneError = r.error;

    /*
     * Which account owns it?
     *
     * Templates belong to a WhatsApp Business Account, not to a number — so a
     * number sitting on a different WABA from the configured one means the
     * approved templates do not apply to it, and nothing else on this screen
     * would reveal that. Asked separately because the owner is not a field on
     * the phone-number node.
     */
    if (r.ok) {
      const owner = await graph<{ data?: { id: string; name?: string }[] }>(
        `${PHONE_ID}/whatsapp_business_account?fields=id,name`,
      );
      if (owner.ok) {
        const w = owner.data.data?.[0];
        if (w?.id) ownerWabaId = w.id;
      } else {
        discovery.push(`Could not determine which WABA owns ${PHONE_ID}: ${owner.error}`);
      }
    }
  }

  const allNumbers = accounts.flatMap((a) => a.phoneNumbers).concat(directPhone ? [directPhone] : []);
  const phoneIdMatches = PHONE_ID ? allNumbers.some((n) => n.id === PHONE_ID) : false;
  // Templates also live on the WABA; without enumeration we cannot see them.
  const templatesReadable = accounts.some((a) => a.templates.length > 0);
  const approvedTemplates = accounts
    .flatMap((a) => a.templates)
    .filter((t) => t.status === "APPROVED");

  /*
   * What is still missing, in the order somebody would fix it. Computed here
   * rather than written into the screen, because a hardcoded list of missing
   * things is exactly what goes stale the day one of them is set.
   */
  const missing: string[] = [];
  if (!PHONE_ID) missing.push("WHATSAPP_PHONE_ID is not set");
  else if (!phoneIdMatches && allNumbers.length > 0) {
    missing.push(`WHATSAPP_PHONE_ID (${PHONE_ID}) is not one of the numbers this token can reach`);
  }
  /*
   * "Not set" is the right thing to say only when there is nothing to set it
   * to. Once a NowOpen template has been submitted, the real state is that
   * Meta has not decided yet — and naming a PENDING template would turn
   * honest needs_template records into actual send failures.
   */
  const ownTemplates = accounts.flatMap((a) => a.templates).filter((t) => /^nowopen_/.test(t.name));
  const ownPending = ownTemplates.filter((t) => t.status === "PENDING");
  const ownApproved = ownTemplates.filter((t) => t.status === "APPROVED");
  const ownRejected = ownTemplates.filter((t) => t.status === "REJECTED");

  if (!TEMPLATE) {
    if (ownApproved.length > 0) {
      missing.push(
        `${ownApproved[0].name} is APPROVED — set WHATSAPP_WELCOME_TEMPLATE to it to switch welcomes on`,
      );
    } else if (ownPending.length > 0) {
      missing.push(
        `${ownPending[0].name} is submitted and waiting on Meta's approval. Do not set `
        + "WHATSAPP_WELCOME_TEMPLATE until it is APPROVED — a pending template sends nothing, and naming it "
        + "turns honest 'needs template' records into failed sends.",
      );
    } else if (ownRejected.length > 0) {
      missing.push(`${ownRejected[0].name} was REJECTED by Meta — check the reason in Business Manager and resubmit`);
    } else {
      missing.push("WHATSAPP_WELCOME_TEMPLATE is not set, and no NowOpen template has been submitted to Meta yet");
    }
  }
  else if (approvedTemplates.length > 0 && !approvedTemplates.some((t) => t.name === TEMPLATE)) {
    missing.push(`WHATSAPP_WELCOME_TEMPLATE (${TEMPLATE}) is not an APPROVED template on this account`);
  }
  if (allNumbers.length === 0) {
    /*
     * Say what is TRUE, which is that discovery failed — not that the account
     * has no numbers.
     *
     * Those are different claims and only one of them is supported. A token
     * with whatsapp_business_messaging but without business_management can
     * send perfectly well and still be unable to list anything, so "no numbers
     * found" would send somebody to re-create a WhatsApp account they already
     * have.
     */
    const couldNotLook = discovery.some((x) => /Missing Permission|Could not list/i.test(x));
    missing.push(
      couldNotLook
        ? "the phone number ID could not be discovered automatically — this token can send but cannot list assets "
          + "(that needs business_management). Copy it from Meta: WhatsApp → API Setup → \"Phone number ID\"."
        : "no WhatsApp phone number is attached to the accounts this token can see",
    );
  }

  /*
   * Things that are configured and still not production.
   *
   * `missing` answers "will an API call succeed?". These answer "should this
   * be pointed at real business owners?" — a different and more important
   * question, and the one a green tick would otherwise paper over.
   */
  const warnings: string[] = [];

  /*
   * Things that CAP the account without stopping it.
   *
   * These are kept out of `warnings` deliberately, because `productionReady`
   * is `no missing && no warnings` and the panel prints "not ready for real
   * businesses" whenever it is false. Business verification pending is a tier
   * cap, not a blocker: the number is verified, the template is approved, and
   * Meta accepted a real send on 2026-10-09 while verification was pending.
   * Filing it as a warning made the screen contradict both its own body text
   * ("nothing to do but wait") and the message that had already gone out.
   */
  const advisories: string[] = [];

  if (!neverExpires && hoursLeft !== null && hoursLeft <= 48) {
    warnings.push(
      `This token expires in about ${hoursLeft} hour(s) (${expiresIso}). It is a ${d.type ?? "USER"} token — `
      + "the kind the Graph API Explorer issues. WhatsApp will stop working when it lapses. A platform needs a "
      + "System User token, which does not expire.",
    );
  }

  /*
   * Meta issues every new app a sandbox number. It is free and it is NOT a
   * business line: it only messages a handful of pre-registered recipients.
   * Detected from Meta's own fields rather than guessed from the +1 555 range.
   */
  /*
   * Judge the number that is CONFIGURED, not every number on the portfolio.
   *
   * The sandbox does not disappear when a real number is added, so "some
   * account here is a test account" stays true forever — and the screen went
   * on calling a verified Nigerian business line a test account. What matters
   * is the number this platform will actually send from.
   */
  const activeNumber = allNumbers.find((n) => n.id === PHONE_ID) ?? null;
  const activeAccount = accounts.find((a) => a.phoneNumbers.some((n) => n.id === PHONE_ID)) ?? null;
  const testish = activeNumber
    ? /test/i.test(activeNumber.verified_name ?? "") || /test/i.test(activeAccount?.name ?? "")
    : accounts.some((a) => /test/i.test(a.name ?? ""))
      || allNumbers.some((n) => /test/i.test(n.verified_name ?? ""));
  if (testish) {
    warnings.push(
      "This is Meta's TEST WhatsApp account, not a business line. A test number can only message a short list of "
      + "recipients you register in Meta, and it cannot be used for real onboarding. Add and verify your own "
      + "business number before switching delivery on.",
    );
  }

  /*
   * Is the configured number on the configured WABA?
   *
   * null when we could not tell; false only when enumeration SUCCEEDED and
   * the number was absent, which is a real measurement rather than a missing
   * one. Templates live on a WABA, so a false here means the approved
   * template cannot be used from this number.
   */
  const enumeratedOk = accounts.length > 0 && accounts.every((a) => !a.note);
  const numberIsOnConfiguredWaba: boolean | null = !PHONE_ID || !enumeratedOk
    ? null
    : accounts.some((a) => a.phoneNumbers.some((n) => n.id === PHONE_ID));

  if (numberIsOnConfiguredWaba === false) {
    warnings.push(
      `${activeNumber?.display_phone_number ?? PHONE_ID} is NOT on the configured WhatsApp Business Account `
      + `(WHATSAPP_WABA_ID = ${WABA_ID}). Templates belong to an account, so nowopen_listing_live_v2 does not `
      + "apply to this number — set WHATSAPP_WABA_ID to the account that owns it and resubmit the template there.",
    );
  }

  // Again: the configured number, not whichever others happen to exist.
  const cvTarget = activeNumber ?? allNumbers[0];
  if (cvTarget?.code_verification_status && cvTarget.code_verification_status !== "VERIFIED") {
    warnings.push(`${cvTarget.display_phone_number ?? "The phone number"} is not code-verified in Meta.`);
  }

  /*
   * jaspers_market_* and hello_world are Meta's demo templates. Naming one as
   * the welcome message would turn `readyToSend` green and send "Hello World"
   * to a real business owner, which is worse than sending nothing.
   */
  const SAMPLE = /^(hello_world|jaspers_market_)/;
  /*
   * Meta has the last word on category, and it changed ours.
   *
   * nowopen_welcome_v1 was submitted as UTILITY and Meta classified it
   * MARKETING. That is not cosmetic: marketing templates cost more, and they
   * may only go to people who opted in to marketing — a signup is consent to
   * be onboarded, not consent to be marketed at. A welcome that lists what
   * else the platform can do reads as promotion, and Meta judged it so.
   */
  /*
   * Business verification, which the screen was not reporting at all.
   *
   * It is invisible from the number and from the templates, and it governs
   * how many people can be messaged per day — an account can look entirely
   * healthy and still be capped. Reported here so it is not discovered later
   * as an unexplained sending limit.
   */
  for (const a of accounts) {
    const v = a.businessVerification;
    if (!v || v === "verified") continue;
    if (v === "pending_need_more_info") {
      advisories.push(
        "Meta needs more information to verify this business. Finish it in Business Settings -> Security Centre "
        + "-> Business verification; until it clears, messaging stays capped at the lowest tier.",
      );
    } else if (v === "pending") {
      advisories.push(
        "Business verification is submitted and waiting on Meta. Nothing to do but wait; messaging stays capped "
        + "at the lowest tier until it clears.",
      );
    } else if (v === "rejected" || v === "failed") {
      warnings.push(
        "Meta REJECTED business verification for this account. Read the reason in Security Centre and resubmit — "
        + "this blocks scaling beyond the lowest messaging tier.",
      );
    } else {
      warnings.push(`Business verification status is "${v}", not verified.`);
    }
  }

  const marketingOwn = accounts
    .flatMap((a) => a.templates)
    .filter((t) => /^nowopen_/.test(t.name) && t.category === "MARKETING");
  const utilityOwn = accounts
    .flatMap((a) => a.templates)
    .filter((t) => /^nowopen_/.test(t.name) && t.category === "UTILITY");

  if (marketingOwn.length > 0 && utilityOwn.length > 0) {
    /*
     * A UTILITY alternative already exists, so the advice is no longer "write
     * one" — it is "use that one, and get the marketing one out of reach".
     * Telling somebody to do work they have already done is how a warning
     * starts being ignored.
     */
    warnings.push(
      `${marketingOwn[0].name} is MARKETING, but ${utilityOwn[0].name} is UTILITY and is the one to use. `
      + `Point WHATSAPP_WELCOME_TEMPLATE at ${utilityOwn[0].name} once it is APPROVED, and delete `
      + `${marketingOwn[0].name} in Meta so nobody can aim at it by mistake.`,
    );
  } else if (marketingOwn.length > 0) {
    warnings.push(
      `Meta classified ${marketingOwn[0].name} as MARKETING, not UTILITY. Marketing templates are charged at a `
      + "higher rate and may only be sent to recipients who opted in to marketing — signing up is not that "
      + "consent. Either record a marketing opt-in at signup, or submit a strictly transactional v2 (the fact "
      + "the profile is live and its link, with no growth tips) which Meta normally accepts as UTILITY.",
    );
  }

  const haveOwnTemplate = accounts.flatMap((a) => a.templates).some((t) => /^nowopen_/.test(t.name));
  /*
   * Only tell somebody to write a template when they have not written one.
   * This warning asked for work that was already done the moment
   * nowopen_welcome_v1 was submitted — the same stale-claim bug this screen
   * keeps producing.
   */
  if (!haveOwnTemplate && approvedTemplates.length > 0 && approvedTemplates.every((t) => SAMPLE.test(t.name))) {
    warnings.push(
      "Every approved template here is one of Meta's samples (hello_world, jaspers_market_*). None is a NowOpen "
      + "welcome message. Write one, submit it for approval, and set WHATSAPP_WELCOME_TEMPLATE to its name — do "
      + "not point it at a sample just to clear the check.",
    );
  }

  /*
   * `GET /<WABA_ID>/subscribed_apps` — whether OUR app will receive this
   * account's events at all. Configuring the callback URL is not enough; the
   * WhatsApp account must also be subscribed to the app, and that step is the
   * one people miss. A failed read stays null: "could not look" is not "not
   * subscribed", a distinction this file has had to relearn twice.
   */
  let wabaSubscribed: boolean | null = null;
  if (WABA_ID) {
    const subs = await graph<{ data?: Array<unknown> }>(`${WABA_ID}/subscribed_apps`);
    if (subs.ok) wabaSubscribed = (subs.data.data ?? []).length > 0;
  }

  return json({
    ok: true,
    sentAnything: false, // stated explicitly: this endpoint cannot send
    token: {
      valid: true,
      type: d.type ?? null,
      appId: d.app_id ?? null,
      application: d.application ?? null,
      neverExpires,
      expiresAt: expiresIso,
      hoursLeft,
      scopes: d.scopes ?? [],
    },
    accounts,
    configured: { phoneId: PHONE_ID ?? null, phoneIdMatches, template: TEMPLATE ?? null },
    approvedTemplates,
    missing,
    discovery,
    // The number this platform would actually send from, resolved.
    activeNumber,
    ownerWabaId,
    /*
     * true / false / null, and null means UNKNOWN rather than fine.
     *
     * This previously defaulted to true whenever the owner could not be read,
     * which is a reassurance drawn from a failed lookup. The owner edge does
     * not exist on the phone-number node, so that default fired every time.
     *
     * The sound deduction is the other way round: enumerating the configured
     * WABA SUCCEEDED and did not contain this number, so the number is
     * certainly not on it — and templates belong to a WABA.
     */
    templatesApplyToActiveNumber: numberIsOnConfiguredWaba,
    directPhone,
    directPhoneError,
    templatesReadable,
    readyToSend: missing.length === 0,
    warnings,
    // Green API config is not the same as fit to use on real people.
    productionReady: missing.length === 0 && warnings.length === 0,
    advisories,
    /*
     * Is the delivery webhook actually wired?
     *
     * Until it is, `status: 'sent'` is the last thing this platform ever
     * learns about a message — and `sent` only means the Cloud API accepted
     * the request. A send to a number with no country code was recorded
     * `sent` on 2026-10-10 and could never have arrived.
     *
     * Three independent things have to be true, and two of them are invisible
     * from the app side, so each is reported separately rather than as one
     * green tick that could mean any of them.
     */
    deliveryWebhook: {
      appSecretSet: APP_SECRET_SET,
      verifyTokenSet: VERIFY_TOKEN_SET,
      wabaSubscribed,
      note: !APP_SECRET_SET
        ? "META_APP_SECRET is not set, so every webhook event is refused. Delivery stays unknown."
        : !VERIFY_TOKEN_SET
          ? "WHATSAPP_VERIFY_TOKEN is not set, so Meta's subscription handshake cannot succeed."
          : wabaSubscribed === false
            ? "The app is not subscribed to this WhatsApp account, so Meta sends it no events."
            : wabaSubscribed === null
              ? "Could not read the subscription list; this is not evidence that it is missing."
              : "Configured: signed events will be accepted and recorded.",
    },
  });
});
