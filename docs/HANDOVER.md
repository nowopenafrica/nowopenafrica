# NowOpen Africa: handover

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
