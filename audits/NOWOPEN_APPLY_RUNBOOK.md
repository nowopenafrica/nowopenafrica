# NOWOPEN AFRICA — APPLY RUNBOOK

> ## ✅ ITEMS 4a–4e ARE APPLIED — 2026-09-08
>
> All five safe migrations are live on production, applied one at a time and
> verified after each. `npm run check:drift` reports:
>
> > **✓ No drift: every table and column the migrations create is present.**
>
> What is confirmed live:
>
> | | |
> | --- | --- |
> | `analytics_events` | name vocabulary + props-size constraints, both VALIDATED; insert policy now `user_id IS NULL OR user_id = auth.uid()` — a forged event name was rejected in a live test |
> | Open Now | `open_status_set_at` + `opens_on_holidays` on both tables, 2 triggers, `public_holidays` table **empty on purpose** |
> | Advertising | 8 provenance columns; **0 rows claim `rights_verified_at`**; 89 rows say `status = 'active'` and **0 are `advert_is_sellable`** |
> | Search | generated `search_vector`, GIN + trigram indexes, `search_businesses()` — and typo tolerance now actually works (see below) |
> | Evidence | `business_evidence` table, RLS on, 2 policies, **0 rows**; `data_confidence` column, all 271 businesses `unconfirmed` |
>
> **271 businesses before, 271 listable after** — no migration moved what the
> public can see.
>
> **A defect was found while verifying, not by reading.** The search migration
> shipped `similarity(b.name, q) > 0.25` for typo tolerance and it caught
> nothing: measured on production, `similarity('Eko Hotels & Suites','hotle')`
> is 0.143. `similarity` compares whole strings, so a short query is dragged
> down by every trigram in a long name it does not share. Replaced with
> `word_similarity` at 0.4 across name, category and location — because
> "restaurant" and "fashion" live in 12 and 32 *category* values and in zero
> names, so a customer typing "resturant" found nothing while twelve
> restaurants sat in the table. Now: hotle → 16, resturant → 12, fashon → 32,
> zzzqqq → 0. The migration file was updated to match what is deployed.
>
> **STILL OUTSTANDING:** item 4d (users policy — needs staging), item 5
> (production data changes, including the 43,354-row telemetry purge), and
> items 1, 2, 3 and 6. **`supabase db push` remains dangerous** — see below.
**Date:** 2026-09-07 · Everything that needs your hands, in one place, in order.

All the code from eight remediation phases is written, tested and deployed. What remains cannot be done from this session: the environment blocks DDL and data writes against the production database, and three items are decisions rather than commands.

Ordered so the cheapest irreversible risks close first. Times are honest estimates.

---

## 1. Register the Paystack webhook · **2 minutes** · highest value here

**Do:** Paystack Dashboard → Settings → API Keys & Webhooks → Webhook URL:

```
https://wvayqqfqqocwjripugnb.supabase.co/functions/v1/paystack-webhook
```

**Why:** every confirmed payment on record was verified by the customer *returning from checkout* — never by webhook. The evidence is unambiguous: the webhook's own code sets `verified_via: "webhook"`, and both `paid` rows say `'client'`, which that update would have overwritten. It has never delivered.

So today, if a customer pays and closes the tab before the redirect completes, **nothing records it**. They are charged and not credited. The function itself is correct and already deployed — it verifies the HMAC signature and returned a proper `401` to an unsigned probe. It is simply not being called.

**Verify:** make one small real payment, then check that the row reads `verified_via = 'webhook'`:
```sql
select reference, status, verified_via, created_at
from payment_intents order by created_at desc limit 3;
```

Until this is done, "Unresolved checkouts" in the admin Payments tab is the only safety net, and it depends on someone remembering to press a button.

---

## 2. Answer the advertising-rights question · **decision, not a command**

`advertisements` holds 97 rows, **89 marked `active`, `user_id` NULL on every one**, naming specific real third-party sites with day rates:

- 2 Double-Sided Freestanding Screens, The Palms, Lekki
- 16 Digital Screens, Railway Ticketing & Waiting Area, Lagos
- LED Portrait Billboard, 5th Roundabout Lekki FTF Ajah
- 2-Sided Unipole Billboard, Aba Road, Port Harcourt

**Already done:** they no longer appear in the sitemap (the same accountability rule the business listings always had). Nothing was deleted and nothing was marked verified.

**Your call:**
- **If rights exist** — apply migration 4c below and record them: `provenance`, `rights_holder`, `rights_verified_at`, `rights_note`.
- **If they do not** — set `status` to something non-public. They stay in the table; they stop being offered.
- **If partial** — do both, per row.

This is the only finding in eight phases with real-world legal exposure, and it cannot be resolved from code.

---

## 3. Create a staging database · **~30 minutes** · the one that keeps biting

`.env`, `.env.local` and the linked project are all **one Supabase project** (`wvayqqfqqocwjripugnb`). There is no staging. **Every `npm run dev` writes to production.**

It has already caused three things in a single day:
1. Production `client_error` rows carrying `localhost:5175` stack traces (fixed by gating telemetry, which treats the symptom).
2. `create_orders` showing 0 rows against 3 recorded order events — dev-written rows, hand-deleted. It cost real time to diagnose as *not* a bug.
3. Migration 4d below cannot be applied at all, because there is nowhere to rehearse a policy change that could lock every user out of their own profile.

**Do:** create a second Supabase project, point `.env.local` at it, and set the production URL only in Vercel's environment variables. `supabase db reset` against the current setup would wipe production.

---

## 4. Apply four migrations

Three are additive and safe. The fourth is not, and is marked accordingly.

### ⛔ DO NOT RUN `supabase db push` ON THIS PROJECT

**This corrects advice I gave in an earlier version of this document. Running that command would damage production.**

The migration ledger has drifted from reality. `supabase_migrations.schema_migrations` records **20** migrations as applied; there are **110** files on disk. So `db push` believes **90** are pending — but `npm run check:drift` proves the live schema already contains everything except the four new ones. The rest were applied out-of-band and never recorded.

`db push` would therefore **replay 86 already-applied migrations**. Most are idempotent and would be harmless. Three would write rows:

| File | What replaying it does |
| --- | --- |
| `20240617000000_seed_advertising_placements.sql` | No guard — **duplicates advertising inventory** on every run, the same rows whose ownership is unresolved in item 2 |
| `20240618000000_add_billboard_placements.sql` | No guard — duplicates more billboard rows |
| `20240702000000_seed_media_services.sql` | Guarded `WHERE NOT EXISTS (SELECT 1 FROM media_services)` — **and `media_services` holds 0 rows, so the guard passes and it inserts** |

The third is the one worth understanding, because it looks safe. A "seed if empty" guard defends against *duplication*, not against *fabrication*, and it fires precisely when the table is empty — which is exactly where an honest empty state lives. The Create page today correctly says no creative professionals are listed yet. Replaying that file would fill it with invented ones.

`npm run check:drift` now reports all of this itself, including the live row count that decides the third case, so it cannot be rediscovered by accident.

### Apply these safely instead — one paste

**`audits/APPLY_ALL_PENDING.sql`** is every safe pending migration concatenated in order, wrapped in a single transaction, with the verification queries at the end. Paste the whole file into the Supabase SQL editor and run it once. If any statement fails, nothing is applied.

The fourth migration (4d, the users policy) is **deliberately not in that file** — see below for why.

Run `npm run check:drift` before and after. It reports exactly what is missing, warns about `db push`, and changes nothing.

Afterwards, if you want `db push` to be usable again, repair the ledger so it reflects what is genuinely applied:

```bash
# Marks a migration as applied WITHOUT running it. Do this for the 86 that
# are already live, then db push has only genuinely-pending work to do.
supabase migration repair --status applied <version>
```

Do that deliberately and check `npm run check:drift` afterwards — the drift script compares tables and columns, not policies or functions, so a migration that was only partly applied would still look complete to it.

### 4a · `20260907180000_open_status_expiry_and_holidays.sql` — safe
Adds `open_status_set_at` and `opens_on_holidays`, a trigger that stamps the timestamp server-side, and a staff-only `public_holidays` table.

**Effect:** a manual "closed" override stops lasting forever, and a public holiday closes a business that has not said it trades through one. The application already treats both columns as optional, so applying this changes no live listing's status.

**Note:** the `public_holidays` table is seeded **empty on purpose**. Nigeria's six fixed holidays and Easter are computed in code; Eid al-Fitr and Eid al-Adha follow lunar observation and are *announced*, not calculated. Add each year's announced dates here rather than letting anything guess them.

### 4b · `20260907182000_business_search_index.sql` — safe, unlocks the most
Adds a generated `search_vector`, a GIN index, `pg_trgm` trigram indexes, and a paged `search_businesses()` function.

**Effect on its own: none.** The directory keeps working exactly as it does. What it unlocks is the fix for the largest remaining technical weakness — the directory currently fetches up to 500 rows and filters in the browser, with no index for text search and no typo tolerance ("resturant" finds nothing today).

**After applying, tell me and I will wire the directory to it.** That work is written up but was left undone deliberately, because building against a function that does not exist yet cannot be verified, and this session has held to verifying everything it claims.

### 4c · `20260907181000_advert_inventory_provenance.sql` — safe
Adds `provenance` (defaulting to `unverified_import`), `rights_holder`, `rights_verified_at`, `rights_verified_by`, `rights_note`, `currency` (defaulting to NGN — a rate of `14` could be ₦14, $14 or ₦14,000), and availability dates. Plus `advert_is_sellable()`, which requires an accountable party rather than merely `status = 'active'`.

**It marks nothing as verified.** No row gains `rights_verified_at`. Verification is a human act with a counterparty; asserting it in SQL would be exactly the invented data this platform has spent effort removing.

### 4e · `20260908120000_analytics_event_integrity.sql` — safe, and the gate on everything intelligence

**Generated**, not hand-written — `node scripts/gen-event-constraint.mjs` builds it from the `EventName` union in `src/lib/telemetry.ts`, and `npm run verify` fails if the two drift. Regenerate rather than editing.

**What it closes.** Measured on production 2026-09-08:

```
analytics_events CHECK constraints : NONE
INSERT policy                      : roles={anon,authenticated} WITH CHECK (true)
```

The public anon key could insert unlimited rows with any `name`, any `business_id` and **any `user_id`** — including somebody else's. Low stakes while the table is a log nothing acts on. It stops being low stakes the moment anything ranks businesses on engagement, detects demand from searches, or targets acquisition from it: all three have obvious commercial motive to forge.

Three changes, all additive:

1. `name` must be one of the 23 declared events.
2. `props` must be under 4 KB — the same cap `sanitizeProps` applies client-side, expressed where it cannot be bypassed by not using the client.
3. The insert policy becomes `user_id is null or user_id = auth.uid()`. **Anonymous events keep working** — almost every measured visitor is signed out, so removing `anon` would blind the public site rather than secure it. What stops is *claiming to be* somebody.

Constraints are added `NOT VALID` and validated separately, so a slow validation over 43,596 rows never holds a lock on the insert path. The migration writes no rows and is re-runnable.

**Rate limiting is deliberately absent.** A per-insert `COUNT` over a growing table is a self-inflicted performance problem, and an attacker holding the anon key can afford to be patient. That control belongs at the edge.

**Apply this before item 5c below**, so the purge happens against a table that can no longer be refilled with junk.

### 4d · `20260907190000_users_column_guard_policy.sql` — ⚠ **DO NOT APPLY UNTESTED**

Adds a `WITH CHECK` pinning `role`, `plan` and `plan_status` for non-admins, so role protection is not trigger-only.

**Why it waits:** it *replaces* a live policy on the authentication table. A wrong `WITH CHECK` locks every user out of their own profile. There is nowhere to rehearse it — see item 3.

**Apply only after staging exists**, or inside a transaction you verify by hand:
```sql
begin;
-- paste the migration
-- then, as a NON-admin user: confirm a name change succeeds
-- and a role change is rejected
commit;  -- or rollback
```

**The escalation it defends against is not currently exploitable** — `guard_user_role_column` holds, and I verified it in production. This is depth, and depth is not worth risking sign-in to rush.

---

## 5. Three production data changes · **~10 minutes**

Each is safe; none could be run from this session.

```sql
-- 5a. A typo in a live business name, its URL slug, and the sitemap.
update businesses
   set name = 'NowOpen Media Ad Placements'
 where username = 'nowopen-media-ad-placeements';
-- Then either keep the slug (the canonical still resolves) or change it
-- and add a redirect — do NOT change it without one.

-- 5b. A table created by pasting a migration file into the table editor.
-- 462 rows, one column named "-- Combined migration script...".
-- Nothing references it. RLS is on with no policies, so it is not exposed.
drop table if exists public."NowOpen Africa";

-- 5c. 42,910 junk `signin` rows — 99.4% of the telemetry table, all from the
-- emitter bug fixed in Phase 1 (it fired on every token refresh, ~670 per
-- session). They carry no information and skew every aggregate.
-- Scoped to before the fix deployed, so genuine sign-ins are kept.
delete from analytics_events
 where name = 'signin'
   and created_at < '2026-09-07T18:00:00Z';
```

**Check 5c first:**
```sql
select count(*) from analytics_events
 where name = 'signin' and created_at < '2026-09-07T18:00:00Z';
```

---

## 6. Two governance items · **your judgement**

**6a. Three of eleven accounts are full admins (27%).** `is_staff()` already supports an `editor` role that nothing uses. One compromised admin is total platform compromise. I did not demote anyone: I cannot tell which of the three is a person who needs the access, and locking a colleague out is worse than the risk.

```sql
select email, role, created_at from users where role = 'admin';
```

**6b. The only Platinum-verified business is the operator's own.** `YemzoArts Studios` carries `verification_tier = 'platinum'`, `trust_score = 83`, `verified = true` — where Platinum means *"On-site (or trusted-partner) verified."* The other business is `none` / `0`.

Not a code defect; the code renders stored values correctly. But the platform operator holding the sole top-tier badge is something an investor or a careful customer would question immediately. Your data, your call.

---

## 7. Then the only thing that actually moves the score

Everything above is hygiene. Across eight phases, four categories never moved: **Product 5, Discovery 2, Customer Experience 4.5, Creative 2.** They are one fact — two businesses, both yours, in one category.

The platform can now do two things it could not this morning:

- **Tell you which businesses to recruit.** Zero-result searches are captured with their result count and surfaced in the admin as "Searched for, not found", ranked by how many distinct people wanted the same thing. Verified working end to end on production — searching "24 hour pharmacy" in Lekki produced exactly that row.
- **Show a business owner whether it worked.** Views, viewers, contacts and per-channel breakdown, with no trend drawn below ten in each window and the owner's own visits excluded.

Both instruments are new today. Neither has anything to measure yet.

**Ten real businesses in one Lagos vertical would move this number further than anything left on my list.**

---

## 8. Provision the Business Intelligence + AI Workforce stacks · three pastes + two deploys

Both stacks are additive, each shipped as **one paste, one transaction** — any
error rolls that file back. Docs updated 2026-09-12.

### 8a · `audits/APPLY_PENDING_ENRICHMENT.sql` — Business Intelligence + auto-apply

The enrichment stack (`20260911000000` → `20260912020000`): BI columns,
evidence/assertions, media assets, enrichment jobs, change proposals, sync
preferences (+ `ensure_business_sync_preferences()`), the scheduler (pg_cron),
ops functions, and auto-apply. What the founder asked for here:

- **"All current unclaimed businesses are set to open 24hrs"** — done by the
  first migration's honest UPDATE: unclaimed businesses with no hours get
  `availability_mode='default_24_7'`, `is_24_hours=true`, but
  `is_24_hours_confirmed=false`. Their listing now reads **Open now** with the
  detail "Open 24 hours · default" — the platform never claims the
  owner said it.

After this paste, `npm run check:drift` reports the live schema matches the
migrations. The auto-apply engine is owner-gated by `auto_apply_due_proposals`
(20260912020000): a proposal applies only if the owner's stored flags allow it,
every flag defaults to ask-first, and nothing applies to a business with no
prefs row. It is invoked automatically at the end of every live enrichment run
by the executor; `20260913030000_auto_apply_sweep.sql` adds a daily sweep
(`auto_apply_all_due_proposals()`) for proposals lingering after a failed run.
Apply that migration with the SQL editor once you trust proposals in review
(the migration schedules the cron itself — the earlier runbook draft's
no-arg `auto_apply_due_proposals()` overload does not exist and would fail
every night, so do not schedule that form by hand):

**Why the Enrichment Ops panel still says "No endpoint configured" after 8a**

The 8a paste installs the queue, the scheduler cron (`tick_enrichment()` every
15 min), and the ops console — but deliberately leaves `private_config`
empty. `tick_enrichment()` posts to `private_config.enrichment_endpoint`, and
until that key exists the tick `RAISE NOTICE`s and returns, so the pipeline
is an honest, visible no-op. The banner is the feature, not a bug. Bringing it
live needs the executor deployed and pointed at — the enrichment twin of 8c:

```bash
# 1. Deploy the executor (same machine, after 8a committed):
supabase functions deploy enrich-business
# 2. Secrets it reads at runtime (functions/*/index.ts):
supabase secrets set AUTOMATION_SECRET=<the SAME long random string as run-workforce>
supabase secrets set SUPABASE_URL=https://wvayqqfqqocwjripugnb.supabase.co
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<service_role key>
supabase secrets set GROQ_API_KEY=<optional — enables the AI resolver; without it
#   the engine still resolves real structured sources, just no LLM pass>
```

Then, in the SQL editor (same `AUTOMATION_SECRET`, plus the anon key from
`VITE_SUPABASE_ANON_KEY` in `.env`). **`refill=1` is what makes a cron tick
refill the queue before draining it; `limit=8` caps one run at eight jobs:**

```sql
select public.set_private_config(
  'enrichment_endpoint',
  'https://wvayqqfqqocwjripugnb.supabase.co/functions/v1/enrich-business?limit=8&refill=1');
select public.set_private_config('automation_secret', '<the SAME AUTOMATION_SECRET>');
select public.set_private_config('anon_key', '<the anon key>');
```

**Verify (as an admin):**

```sql
select public.enrichment_cron_status();   -- configured: true, queued > 0 within a tick or two
select count(*) from public.business_enrichment_jobs where status = 'succeeded';
select jobname, schedule, active from cron.job
 where jobname in ('nowopen-enrichment', 'auto-apply-proposals');
```

Until an operator does this, the panel still says "No endpoint configured" —
and it is right to.

### 8b · `audits/APPLY_WORKFORCE_AUTOMATION.sql` — the AI workforce engine

The workforce's own cron (`20260901020000` → `20260906030000`) plus
`20260913000000_fix_workforce_agent_keys.sql` (aligns the roster keys with the
schedule keys so **every run lands on its department's row** — previously
Trust & Safety and Customer Success ran but their roster rows never moved).

Three siblings land in the same paste, in order:

- `20260913010000_workforce_full_coverage.sql` — every 15-minute tick fills
  every agent's run log with honest facts (no-ops excluded), and fixes the
  `missing_hours` label contradiction so the board can say "cannot tell if
  open" for listings with no hours and no confirmed 24/7 flag.
- `20260913020000_launch_automation.sql` — the Launch Control board states
  itself. An hourly pass studies the real tables (approvals, done work items,
  moderated assets, published videos, knowledge, scheduled posts) and ticks a
  checklist item **only** when the evidence exists, recording the source in
  `os_launches.checklist_evidence`. It never un-ticks a human decision and
  never fakes a tick — the board renders an `auto` badge instead of pretending
  the reason and the tick are the same thing.
- The daily digest rides the chief-of-staff cadence: the edge function claims
  one `automation_log` row per day and pushes a brief to admin email/WhatsApp
  **only** when the `outbound_email` / `outbound_whatsapp` feature flags are on
  (both default off, so "not sending" is always the recoverable default).
  No new env vars — it reuses the existing Resend/WhatsApp paths.

The verification block confirms `workforce_cron_status() -> healthy: true`,
re-schedules the launch automation slot and prints what it proved.

### 8c · Deploy `run-workforce` and point cron at it · **your hands, ~10 min**

The migrations deliberately leave `private_config` empty — secrets are never
committed. In order **after 8b**:

```bash
supabase functions deploy run-workforce
supabase secrets set AUTOMATION_SECRET=<a long random string>
supabase secrets set SUPABASE_URL=https://wvayqqfqqocwjripugnb.supabase.co
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<service_role key>
```

Then, in the SQL editor (same `AUTOMATION_SECRET`, plus the anon key from
`VITE_SUPABASE_ANON_KEY` in `.env`):

```sql
select public.set_private_config('workforce_endpoint', 'https://wvayqqfqqocwjripugnb.supabase.co/functions/v1/run-workforce');
select public.set_private_config('automation_secret', '<the AUTOMATION_SECRET>');
select public.set_private_config('anon_key', '<the anon key>');
```

### Verify (as an admin)

```sql
select public.workforce_cron_status();            -- healthy: true once runs succeed
select agent_key, enabled, interval_min from public.workforce_schedule order by agent_key;
select agent_key, name, department from public.os_workforce
 where agent_key in ('chief-of-staff','growth-director','trust-safety','customer-success');
select key, value is not null as set from public.private_config order by key;
```

The founder daily brief then appears automatically on **Dashboard → Founder's
Office → Workforce** (the `chief-of-staff` row in `workforce_runs`). Remaining
honest limitation: the compile-time roster lists 18 AI roles, but only these
four have scheduled rules implemented today. Adding the rest (strategy,
marketing, creative, sales, finance, product, …) is new `AGENTS` + fact work,
not an install step.

---

## Quick reference

| # | Item | Time | Reversible |
| - | --- | --- | --- |
| 1 | Register Paystack webhook | 2 min | yes |
| 2 | Advertising rights | decision | — |
| 3 | Staging database | 30 min | yes |
| 4a–e | **`audits/APPLY_ALL_PENDING.sql`** — all five, one paste, one transaction | 2 min | yes |
| 4d | Users policy migration | ⚠ after staging | yes, but risky to test live |
| 5a | Fix live business typo | 1 min | yes |
| 5b | Drop junk table | 1 min | **no** — 462 junk rows |
| 5c | Purge junk signin rows | 1 min | **no** — 42,910 junk rows |
| 6a | Review admin count | judgement | yes |
| 6b | Review Platinum tier | judgement | yes |

After 4b, tell me and I will wire server-side search into the directory.
