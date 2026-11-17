# NowOpen Africa: handover

> **Deploy state (17 November 2026).** Production serves commit `f7bca34`
> (bundle `index-D-myyetf.js`): `promote-step2` + the formerly uncommitted live
> work (now committed, `07b1dc0`) + `creative-intel-spec` + the template review
> gate. This folder's `promote-step2` was fast-forwarded to it and rebuilds the
> identical bundle, so deploying from here is safe again. Everything is committed:
> keep it that way, so git and production stay the same thing. This worktree
> checks out LF (`git config --worktree core.autocrlf false`); CRLF files fail the
> self-category and wa-link guards in `npm run build`.

Read this first in any new session. Last updated **7 November 2026**.
Detail per workstream: `docs/create-promote-status-2026-11-06.md`, specs in `docs/superpowers/specs/`, plans in `docs/superpowers/plans/`.

---

## 1. Where things stand

**Repo:** `NowOpen Africa - (OpenCode) - Claude - edit` (this folder). Dev server: `npm run dev`, port 5176 in the Claude preview (`nowopen-edit`).

**Git:** branch `creative-studio-live-canvas`. Everything that is live was committed on 7 Nov in 7 area commits, `4b95d8f` to `de6c777`. Not pushed. `main` is behind.
- Business Updates also lives on `business-updates-phase1` and `business-updates-phase2`. Expect overlap if those are merged.
- The intermediate commits don't build on their own; only `de6c777` matches production.
- Still uncommitted: scratch files only (`_p*.ts`, `__probe*.test.ts`, `_probe*.ts`, `dev2.ts`, `vit_robots_probe.test.ts`, `tmp_claimtest.sql`, `set_enrichment_endpoint.sql`, `.superpowers/`). They are safe to delete.

**Production (www.nowopenafrica.com):** last deployed 7 Nov. That deploy shipped the partner portal and the chatbot edge function.

| Area | State |
|---|---|
| Create page `/media` (needs, carousel, services, template batches 1–3) | Live |
| Promote hub `/adverts` step 1 (goals, budget mix, preview for image, video and link) | Live |
| Placement trust model (Inventory sub-project 1) | Live |
| Partner portal (Inventory sub-project 2): Media owner tab, verification, owner placements, CSV/XLSX import, claims, 3 admin queues | Live 7 Nov |
| Business Updates (24-hour stories) phases 1–2 | Live (database + dashboard wiring); later phases in its own session |
| Projects tab (project stories) | Live |

**NowOpen Credits (NOC), 15 Nov: database LIVE (migrations `20261116010000`…`040000` applied + ledger rows, 243/243, drift clean); code NOT committed; `verify-payment`, `paystack-webhook` and the site DEPLOYED 15 Nov (founder go-ahead). Purchases OFF, rewards OFF, settlement OFF.** Read `docs/credits/NOC_AUDIT_2026-11-15.md` and `docs/credits/NOC_STATUS_2026-11-15.md`.
- Closed a live hole first: anyone could insert a `payment_intents` row already `paid` and have `verify-payment` grant credits or a plan. Inserts are now `lead`/`initiated` only, own account, never `credits`.
- Ledger v2 is double entry, with classes purchased / included / promotional / reward / sandbox. A deferred commit check proves the balance. Every entry carries rate and price snapshots. Market NG is ₦50/NOC, confirmed by the founder 15 Nov and shown on /pricing with each action's cost.
- Live mode needs a recorded compliance approval. Closed-loop rules are CHECK constraints.
- Admin screen: `/admin/credits`. Wallet: `/wallet`.
- Checks: `npm run check:noc` (17 rolled-back checks on live) and `npm run check:noc:concurrency` (two real sessions).
- Still to do:
  - Register the Paystack webhook.
  - Get legal sign-off before `live`.

**Brand Autopilot (AI drafting), 15 Nov: LIVE (migration applied + ledger row, 236/236; `brand-social-generate` deployed; site deployed). NOT committed. Drafting is still switched off with no token limit, so no model call has been made yet.** The "NowOpen Autopilot" brief was audited against the repo. Brand Social already covers the brand profile, pillars, campaigns, content and per-channel variants, approval, audit, UTM links, sourced metrics and the Zoho hand-over. The missing piece was AI drafting:
- `src/lib/brandAutopilot.ts` (20 tests); edge copy via `npm run sync:brand-social`
- `supabase/migrations/20261115010000_brand_autopilot.sql` (BEGIN…ROLLBACK dry run passed 15 Nov; not applied)
- `supabase/functions/brand-social-generate/` (drafts only; inserts as the admin so the guard trigger keeps status = draft)
- `src/components/admin/BrandAutopilot.tsx`, the "AI drafting" tab in Brand Social

To use it: Admin → Brand Social → AI drafting, tick "AI drafting on" and save a monthly token limit. A real model call through the same prompt, parser and checks passed on 15 Nov (Groq gpt-oss-120b, 3.5 s, ~2,350 tokens); the admin-insert step is untested until a signed-in admin drafts one.

**Direct Facebook publishing, 15 Nov: LIVE and switched ON (06:54 Lagos, founder's go-ahead; autonomy mode set to Approval). First real post due 13:00 Lagos (NOA-SOC-0081); check its "View the live post" link in the queue.** Migration `20261115020000_brand_social_direct_publish.sql` (applied, ledger 237), edge fn `brand-social-publish`, pg_cron `nowopen-brand-social-publish` every 5 min (no-op while off), card in Brand Social → Channels. Rules in `src/lib/brandPublish.ts` (16 tests, synced to edge). Facebook channel route = `meta_direct` (Page 269966327004474); the Zoho file and Zoho Flow dispatcher now skip direct channels so nothing posts twice. The stored META_PAGE_ACCESS_TOKEN is a never-expiring system-user token with pages_manage_posts; a private write test (unpublished post created, read back, deleted) passed. Instagram cannot be direct yet: the token lacks `instagram_content_publish` (regenerate the system-user token with it, update META_PAGE_ACCESS_TOKEN / INSTAGRAM_TOKEN / WHATSAPP_TOKEN, which share one value, then set instagram's publish_route).

**Formats, art and January push, 15 Nov.** Migration `20261115030000_brand_social_formats.sql` (applied, ledger 238): each channel version has a format (post / reel / story / carousel) and posts can carry up to 10 media. `brand-social-publish` now does Facebook post/reel/story, Instagram post/carousel/reel/story and Threads (needs THREADS_ACCESS_TOKEN + THREADS_USER_ID); videos still processing are finished on a later tick. Admin queue has **Publish now** for approved posts. Instagram and Threads paths are untested live until their tokens exist. 18 scheduled posts had placeholders baked into the artwork; they were held and given clean cards from `scripts/social-cards/render_cards.py` (Pillow + Coolvetica; refuses brackets; `--story` for 1080x1920). January batch: 136 posts (3 feed posts a day + a daily Facebook Story, 29 Dec–31 Jan) built by `build_jan.py`, checked and loaded by `load_jan.mts`, all in_review.

**X, LinkedIn, TikTok, YouTube connectors, 15 Nov: LIVE, waiting on developer apps.** Migration `20261115040000_brand_social_connections.sql` (applied, ledger 239). `social-auth` has a brand mode (`?target=brand`, admins only, refuses while `SOCIAL_TOKEN_KEY` is unset); YouTube is a new provider (`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`), brand-only. `brand-social-publish` posts to X (text + image), LinkedIn profile and company page (text + image; company page needs `LINKEDIN_ORG_SCOPES=1` after LinkedIn approval), TikTok (video; private until TikTok audits the app) and YouTube (Shorts and videos; private until Google verifies the app). Tokens refresh automatically. Admin: Brand Social → Channels → Connected accounts (connect, disconnect, per-channel "publish directly", LinkedIn company id). None of the four has run for real yet. Deploy functions without `--no-verify-jwt` so `config.toml` decides (social-publish must keep JWT verification on). Fixed in passing: the Studio's connect popup reported every successful connection as a failure.

**Schedule audit, 15 Nov.** None of the 52 posts planned 30 Oct–14 Nov reached Facebook or Instagram (checked against the live Page and IG feeds): the two Zoho files (29 and 30 Oct) were downloaded but never uploaded. 5 countdown posts retired (0001–0004, 0011); 47 rescheduled to 13–28 Dec and set back to in_review. Do not upload the two old Zoho files. Zoho Flow still unchecked: the browser pane is signed out of Zoho. Not built yet from the brief: calendar view, image and video production, direct platform publishing (no Meta, TikTok, YouTube or LinkedIn app keys exist), analytics collection, scheduled weekly runs.

**Instagram gallery auto-fetch (phase 1), 15 Nov: LIVE and committed (its files only).**
- **Migration and ledger:** `20261118010000_instagram_owner_handle_sync.sql` applied, with its ledger row (245/245, drift clean).
- **Deploys:** `refresh-instagram-gallery` is v13 (JWT check on) and the site was deployed 15 Nov.
- **Owner-triggered sync:** when the owner of a claimed business sets or changes its Instagram handle in "Your business story", a trigger queues an `instagram_sync_requests` row and pokes the function. Requests run first (max 3 per run).
- **Handle ledger rule:** a `not_business` answer blocks re-asking for 24 hours only.
- **Owner opt-out:** `business_sync_preferences.sync_enabled = false` is respected.
- **Bug fixed:** the refresh read its pool with `.limit(1000)` and only ever reached 88 of 360 galleried businesses. The pool is now `instagram_gallery_refresh_pool()`, paged, 361 businesses.
- **First run (16:43 UTC):** asked 15 accounts (13 read, 2 not Business accounts) and added 86 posts to 9 businesses, with 0 duplicates. Accounts ever refreshed went from 88 to 103.
- **Checks:** `node scripts/check-instagram-owner-sync.mjs` runs 13 checks on live and always rolls back.
- **Phase 2, "Live on Instagram now" badge: not built.**
  - Meta's `live_media` needs the business's own login, Advanced Access through App Review, and Business Verification.
  - `META_APP_ID` is unset.
  - An Instagram live can never be played on NowOpen: there is no stream and no embed.
- **Spec:** `docs/instagram/INSTAGRAM_LIVE_AND_GALLERY_SPEC_2026-11-15.md`.
- **Review sheet:** https://claude.ai/artifact/7rFLcr8ZZ2dWE8GoGZmx53

Database: 233/233 migrations recorded and in sync (`npm run check:drift`, clean on 7 Nov).

---

## 2. Rules that are not obvious

- **Approval:**
  - No commits, deploys or production database writes without the founder's explicit go-ahead in chat.
  - Payments stay in test mode. Switching to live keys is the founder's job.
- **The dev server writes to production.** There is one Supabase project. In browser checks, never click save, submit, approve, or "I sell advertising space". Test reading code through the app's modules instead, e.g. `await import('/src/lib/promote/placementImport.ts')` in the page.
- **Deploying:**
  - Run `npm run check:drift`, then `npx vercel --prod --yes`. A git push does not deploy.
  - Deploys ship the whole folder, including other sessions' uncommitted work.
  - Edge functions deploy separately: `npx supabase functions deploy <name>`. If you edit `supabase/functions/_shared`, redeploy every function that imports it.
- **Migrations are applied by hand:**
  1. Dry run inside `BEGIN … ROLLBACK`.
  2. Apply with `npx supabase db query --linked -f <file>`.
  3. Insert the row into `supabase_migrations.schema_migrations`.
  4. Run `npm run check:drift`.

  Never use `supabase db push`. The CLI returns only the last result set, so put a check script's summary in one final SELECT.
- **Postgres traps:**
  - Block comments nest, so never write `*/` inside a comment's prose.
  - Appending to a `text[]` needs `array_append(arr, 'x'::text)`; `arr || 'x'` raises 22P02.
  - SECURITY DEFINER functions should guard on `auth.role()` and set `search_path`.
- **Line endings:** preserve each file's existing endings.
  - CRLF: `AdvertDetail.tsx`, `MediaOwnersPanel.tsx` and its test, `App.tsx`, `MediaPlan.tsx`.
  - LF: `Dashboard.tsx`.
- **Code conventions:**
  - Money: `useCurrency().format`.
  - "Today": `src/lib/dates.ts` (Africa/Lagos), never UTC.
  - Confirmations: `ConfirmDialog`, never `window.confirm`.
- **Honesty rules:**
  - All 97 placement photos are stock and are labelled "Stock photo — not this site".
  - Prices are "indicative".
  - "Available" needs a dated owner confirmation covering today.
  - All trust wording lives in `src/lib/promote/trust.ts`.
  - Public listings use `isListedPlacement` (`src/lib/promote/listing.ts`), which hides pending_review, rejected and archived.
- **Placement location** is "City, Country", because the city filter reads the first comma segment. Landmarks go in `site_address`.
- **Hidden browser pane:** it freezes animation frames. Show the pane before judging scroll or animation.

---

## 3. Checks

| Command | What | Last result |
|---|---|---|
| `npm run typecheck` | app, server and edge tsconfigs | 0 errors |
| `npx vitest run` | full suite (~3 min) | 482 files, 7,350 tests pass |
| `npm run verify` | typecheck, lint, check:all, test | — |
| `npm run check:drift` | live schema and migration ledger | clean, 233/233 |
| `node scripts/check-partner-portal.mjs` | 23 rolled-back live checks | 23/23 |
| `node scripts/check-placement-trust.mjs` | 17 rolled-back live checks | 17/17 |
| `node scripts/check-business-updates.mjs` | Business Updates live checks | — |

---

## 4. Decisions waiting on the founder

1. **Payment before confirmation.** A visitor can pay ("Pay to reserve these dates") for a placement no owner has confirmed. Should payment wait for the owner? This belongs to Promote step 3.
2. **Rejected owners' live placements.** Should they come off the public site immediately?
3. **Placement page wording.** The "Active" badge and the "Why book with NowOpen" box.
4. **Two older security holes**, proposed as their own task:
   - credit triggers set service_role claims for the rest of the transaction;
   - `_apply_proposal_write` is executable by any signed-in user.
5. **Push and merge.** Should `creative-studio-live-canvas` be pushed or merged to `main`?

---

## 5. Next work, in order

- **Promote step 2:** a plan tray on every page; artwork from Create sized to the placement.
- **Promote step 3:** Paystack for NowOpen ads, one quote request for outdoor, the finish screen (needs decision 1).
- **Create steps 2–4:** options and details, then export (free download plus optional Paystack support), then the finish screen. Template batches 4–8.
- **Inventory sub-projects 3–7:**
  - 3: CRM and draft-only outreach;
  - 4: Radar acquisition;
  - 5: dashboard;
  - 6: public map and search;
  - 7: AI assistance.

  VacantBoards, Alternative Adverts, Outdoor Exchange, OOHna and BuyMedia are partnership targets, never scraping sources.
- **Known test noise:** `adminCreator.smoke.test.tsx` has a long-standing unhandled mock error.

---

## 6. Where things live

**Promote** (`src/lib/promote/`, `src/components/promote/`):
- `goals.ts`, `promoteIntent.ts`, `mix.ts`, `freeTools.ts`, `campaigns.ts`, `artworkSource.ts`
- `trust.ts`, `listing.ts`, `mediaOwners.ts`, `partner.ts`, `placementImport.ts`, `sizeSpec.ts`

**Partner portal screens:**
- Dashboard: `src/components/dashboard/{MediaOwnerTab,OwnerVerificationPanel,OwnerPlacementForm,OwnerPlacementList,PlacementImport}.tsx`
- Admin: `src/components/admin/MediaOwnersPanel.tsx`
- Placement page: `src/components/promote/ClaimPlacementButton.tsx`, shown only to signed-in, non-rejected media owners.

**Create:** `src/lib/create/`, `src/components/create/`, `src/lib/design/`, `src/lib/designTemplates.ts`, `src/lib/design/catalogueTemplates.ts`

**Business Updates:** `src/lib/businessUpdates*.ts`, `src/components/dashboard/UpdateComposer.tsx`, migrations `20261110*` and `20261112010000`

**SDD ledgers** (decisions and reviews per plan, git-ignored): `.superpowers/sdd/<plan>/progress.md`

**Review sheets:**
- Create: https://claude.ai/artifact/5Ff1PUpBdU5HVe8UZzbBPZ
- Promote: https://claude.ai/artifact/C1ce1fzdZzuJ3jF8erHjtr
- Trust model: https://claude.ai/artifact/Xt5yg9YLPo2VbS57uZddhk
- Partner portal: https://claude.ai/artifact/KoryofqmUQX3rGVXcdVUqC
