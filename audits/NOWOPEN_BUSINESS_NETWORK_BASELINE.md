# NOWOPEN BUSINESS NETWORK — BASELINE AUDIT
**Date:** 2026-09-08 · **Scope:** the "NowOpen Your Business" acquisition & claiming system
**Method:** measured against the live production database (`wvayqqfqqocwjripugnb`) and the current working tree. No code was changed. Every count below is a real query, not an estimate.

---

## THE HEADLINE

**Roughly 70% of this brief already exists in the codebase, and none of it has ever been used.**

That is the single most important finding, and it changes what the work is. The brief reads as a build order. The measurement says otherwise:

| Table | Rows |
| --- | --: |
| `businesses` | **2** (both the founder's, both `user_created` / `claimed`) |
| `business_claims` | **0** |
| `import_batches` | **0** |
| `import_rows` | **0** |
| `radar_candidates` | **0** |
| `verification_documents` | **0** |
| `profile_requests` | **1** |
| `radar_sources` | 4 |

Seven tables, a rollback function, a duplicate engine, a source-licensing model, an admin import screen, a claim flow, three distinct badges and RLS on all of it — built, deployed, and **never run once**.

So the risk here is not "we lack an acquisition engine". It is **building a second one beside the first**, which §1 explicitly forbids. The real work is: close the specific measured gaps, then *exercise* the system end to end.

The other finding that matters: the 500 synthetic seed businesses recorded in earlier sessions **are gone**. Production holds two real businesses. Nothing in this system is currently misrepresenting anything to anybody — because nothing is in it.

---

## 1 · WHAT EXISTS (do not rebuild)

### Data model — **FIXED**

The four-concept separation §2 demands is already in the schema, on `businesses` (70 columns):

| §2 concept | Live column | Verdict |
| --- | --- | --- |
| Business record | `businesses` row | FIXED |
| Claim status | `claim_status`, `claimed_at`, `user_id` | FIXED |
| Verification status | `verification_status`, `verification_tier`, `verified`, `last_verified_at` | FIXED |
| Data confidence | `data_status` | **PARTIALLY FIXED — see §3 gap** |

Provenance columns are all present and were designed for exactly this purpose: `source_name`, `source_url`, `source_license`, `source_record_id`, `source_imported_at`, `source_last_checked_at`.

Field-level verification flags already exist too: `phone_verified`, `email_verified`, `address_verified`, `id_verified`, `onsite_verified`, `registration_verified`.

### Public visibility gate — **FIXED, and better than the brief asks**

`is_listable` is a **generated column**, so visibility cannot be forgotten in application code:

```sql
is_listable = (lifecycle_status <> 'suspended')
              AND (data_status <> 'synthetic_unverified' OR claim_status = 'claimed')
```

This is the mechanism that made the earlier synthetic seeds invisible. It is load-bearing and must not be casually redefined.

### Import pipeline — **FIXED** (§8, §9, §10, §30, §31)

`import_batches` (23 columns) already carries everything §30 asks for and more: `reference`, `dataset`, `filename`, `uploaded_by`, `column_mapping`, `source_name`, `source_type`, `source_url`, `source_license`, `status`, `total_rows`, `valid_rows`, `review_rows`, `invalid_rows`, `duplicate_rows`, `created_rows`, `approved_by`, `approved_at`, `rolled_back_at`, `rolled_back_by`, `error`.

`import_rows` carries per-row `status` (`pending|valid|review|invalid|duplicate|imported|skipped|rolled_back`), `issues`, `confidence`, `duplicate_of`, `created_business_id`.

`src/lib/imports/mapping.ts` (13 KB) and `validate.ts` (7.4 KB) do the normalisation and validation §9 lists. `src/lib/radar/` adds `normalize.ts`, `entity.ts`, `confidence.ts`. Tests exist: `imports.test.ts`, `radar.test.ts`, `claims.test.ts`.

### Rollback — **FIXED, and safe** (§31)

`rollback_import_batch(uuid)` is `SECURITY DEFINER` with a pinned `search_path`, gated on `is_admin()`, and — the part §31 specifically demands — **it refuses to delete a business that was subsequently claimed**:

```sql
WHERE r.batch_id = p_batch
  AND bus.user_id IS NULL
  AND bus.claim_status = 'unclaimed'
```

It returns `{businesses_removed, kept_because_claimed}`, so the admin is told what it spared rather than left to assume. This is the strongest single piece of the existing system.

### Source policy — **FIXED, and enforced in data** (§29)

`radar_sources` models licence terms as columns, not prose: `automated_access`, `bulk_extraction`, `competing_dataset`, `redistribution`, `licence`, `authorised_by`, `authorised_at`.

Four sources exist. Three are permitted (`admin_import`, `business_submission`, `public_suggestion`). The fourth is the one that matters:

```
businesslist_ng | BusinessList.com.ng | licensed_directory | active: FALSE
  automated_access: prohibited   bulk_extraction: prohibited   redistribution: prohibited
  licence: None   authorised_by: None
  notes: "Their terms prohibit bots, crawlers, scrapers, bulk extraction and use in
          a competing dataset. Do not enable without a signed agreement."
```

That is a **recorded prohibition, not a scraper configuration** — the correct way to remember a "no". It aligns with the standing instruction that BusinessList.com.ng must not be scraped.

### Claim system — **PARTIALLY FIXED** (§16, §19, §20)

Exists: `business_claims` table, `ClaimBusiness.tsx` (the "Is this your business?" CTA and modal), `ApprovalsHub.tsx` (admin review), and two RPCs — `mark_claim_pending()` and `apply_business_claim()`. Approval is explicitly admin-only; the component's own comment says an auto-approving claim would be "an account takeover with a friendly label".

Gaps are in §17/§18 depth — see below.

### Badges — **FIXED** (§33)

`ListingStatusBadge.tsx` renders unclaimed / claimed / verified as **three visibly different things**, with a comment explaining why collapsing them destroys the information.

### Submission campaign — **PARTIALLY FIXED** (§39, §40)

`/send-business` (owner-submitted) and `/nominate` (third-party tip) already exist and write to `profile_requests` and `radar_candidates` respectively. Both are account-free, which is what §40 asks for.

### RLS — **FIXED** (§34)

| Table | Policies |
| --- | --- |
| `business_claims` | users read **their own**; users insert their own; admins ALL |
| `verification_documents` | owners manage their own; admins ALL |
| `import_batches` / `import_rows` | admins ALL — no public read |
| `radar_candidates` | anyone may suggest (INSERT); staff read/update |
| `profile_requests` | public INSERT; staff read/update |

No claimant can see another claimant's evidence. This satisfies §34 as measured.

---

## 2 · WHAT IS MISSING OR WRONG

### GAP 1 — Status enums are short of §3 · **PARTIALLY FIXED**

Measured `CHECK` constraints versus the brief:

| Axis | Brief requires | Live has | Missing |
| --- | --- | --- | --- |
| Claim | unclaimed, claim_pending, claimed, **claim_rejected**, **claim_suspended** | unclaimed, claim_pending, claimed | **2 values** |
| Verification | unverified, pending, verified, **expired**, rejected | unverified, pending, verified, rejected | **1 value** |

This is not cosmetic. With no `claim_rejected`, a rejected claim returns the business to plain `unclaimed` and the platform forgets it was ever contested — so a bad-faith claimant simply tries again and nothing on the record says they were refused. With no `claim_suspended`, there is no state for "this claim is under dispute", which is the state a takedown or ownership dispute actually needs.

`expired` matters because `last_verified_at` exists and nothing ages it out; a 2026 verification will still read "verified" in 2029.

### GAP 2 — Data confidence is a different axis from what §3 describes · **MISSING**

`data_status` values are `synthetic_unverified | imported_authorized | submitted | user_created | admin_curated`.

Those describe **where the record came from** — origin. §3's `SOURCE_CONFIRMED | PARTIALLY_CONFIRMED | OWNER_CONFIRMED | ADMIN_VERIFIED` describe **how well the content is confirmed** — confidence. They are genuinely two different questions, and a record can be `imported_authorized` (origin) while being `partially_confirmed` (confidence).

**Do not rename `data_status`.** It feeds the generated `is_listable` column and the sitemap gate; changing its vocabulary would silently change who is visible on the internet. The correct move is a *second* column.

### GAP 3 — No XLSX support · **MISSING** (§7)

`ImportCenter.tsx` has a hand-rolled `parseCsv` and `<input accept=".csv,text/csv">`. `package.json` has no `xlsx`, `exceljs` or `papaparse` dependency. The brief's acceptance test (§FINAL, step ONE) is *"Upload an XLSX"* — which today is impossible.

### GAP 4 — Claim flow is one step, not four · **PARTIALLY FIXED** (§17, §18)

`business_claims` columns: `id, business_id, user_id, evidence, contact, status, reviewed_by, reviewed_at, note, created_at`.

Against §18:

| §18 field | Status |
| --- | --- |
| `relationship` | **MISSING** — §17 Step 1 (owner / representative / manager / other) does not exist |
| `verification_method` | **MISSING** — §17 Step 3 does not exist |
| `risk_score` | **MISSING** |
| `claimant_message` | partially — folded into `evidence` |
| `decision_reason` | partially — `note` is used for both admin notes and reason |
| `admin_notes` | shares `note` with `decision_reason` |

The UI collects free-text `evidence` + `contact` in a single modal. There is no step to confirm business details (§17 Step 2), and no restriction of verification methods to those the business actually supports.

`business_claims_status_check` is also marked **`NOT VALID`** — meaning existing rows were never checked against it. With 0 rows that is currently harmless, and it should be validated before the table is used in anger.

### GAP 5 — No template download · **MISSING** (§38)

No CSV or XLSX template, no data dictionary, no allowed-values reference. An admin's first import will therefore be a guess at the column names, and `column_mapping` exists precisely because that guess is expected to be wrong.

### GAP 6 — Provenance is per-record, not per-field · **MISSING** (§12)

`source_name` etc. sit on the business row. §12 requires distinguishing **SOURCE / DERIVED / AI ENRICHMENT / OWNER CONFIRMED** per field, so that an AI-written description is never presented as owner-provided.

Today there is no place to record that `description` was generated while `phone` came from the source. This is the gap with the highest honesty risk in the whole brief: it is the mechanism that stops enrichment from silently becoming a claim about the business.

### GAP 7 — The claim funnel is unmeasured · **MISSING** (§42)

Searched every `track(...)` call in `src/`. The only events in this family are `profile_request_started` and `profile_requested`.

Missing entirely: `claims_started`, `claims_completed`, `claims_approved`, `claims_rejected`, `profiles_created`, `profiles_published`, `profiles_claimed`, `profiles_completed`, `businesses_activated`, `businesses_receiving_leads`.

So §42's funnel — the thing that decides whether this campaign worked — cannot currently be measured at any step past the submission form. Given the brief's own North Star ("not how many did we import"), this is a first-class gap, not a reporting nicety.

### GAP 8 — Import runs in the browser · **UNSCALABLE** (§36)

`ImportCenter.tsx` chunks inserts at 500 rows with a comment noting a 12,000-row file times out in one insert. That is a real mitigation and it is not enough for §36's 100,000: the work still happens in a browser tab, with no background job, no resumable progress and no server-side transaction across chunks. Close the laptop and the import stops half-done.

Note also `import_batch_to_candidates(uuid)` and `radar_publish_candidate(uuid)` already exist — so the server-side path is partly built; it is the *orchestration* that is missing.

### GAP 9 — SEO gate is provenance-only, not quality · **PARTIALLY FIXED** (§27)

`api/sitemap.xml.ts` includes a business when:

```js
b.claim_status === 'claimed' || b.data_status === 'imported_authorized'
```

That correctly keeps synthetic records out. But §27 asks for a **quality** threshold — useful content, location, category, meaningful information — before an unclaimed profile is submitted for indexing. As written, an `imported_authorized` record with nothing but a name and a city would be submitted to Google. With 0 imported records this is latent, and it becomes live the moment the first import runs.

### GAP 10 — Acquisition intelligence is one-quarter built · **PARTIALLY FIXED** (§24, §25, §43)

`supplyGaps()` in `northStar.ts` exists and is surfaced in `ActivationPanel.tsx` — that covers "searched for, not found" and geographic gaps.

Missing: popular *unclaimed* profiles, high-traffic unclaimed profiles, contact attempts on unclaimed profiles, and the composite **claim priority score** of §25. None of these can exist yet anyway, because there are no unclaimed profiles to score.

### GAP 11 — No outreach workflow · **MISSING** (§26)

Nothing implements owner outreach, and nothing implements the frequency limits and suppression §26 requires alongside it. Those two must ship together; outreach without suppression is how a directory becomes a spammer.

### GAP 12 — Correction queue is partial · **PARTIALLY FIXED** (§23)

`ReportListing.tsx`, `SuggestBusiness.tsx` and `deletion_requests` exist, and `ApprovalsHub` reviews some of it. There is no unified "Know this business?" correction surface on an unclaimed profile covering phone / address / website / social / category / hours / closure / duplicate, and no single correction queue behind it.

### GAP 13 — Nothing has been exercised · **UNPROVEN**

Every table is empty. There is no evidence that:

- an import batch completes,
- the duplicate engine scores a real pair,
- `apply_business_claim()` moves ownership correctly,
- rollback spares a claimed business in practice,
- an unclaimed profile renders its CTA on a real record.

The code is tested in unit form; **the pipeline has never carried data.**

---

## 3 · PRIVACY & DATA PROTECTION (§28) — **PARTIALLY FIXED**

Present: `deletion_requests` (owner-initiated deletion via admin approval), `ReportListing`, RLS isolating evidence.

Missing: an explicit rule separating *business* contact data from *personal* contact data. Nothing in the import validation distinguishes "the shop's landline" from "the owner's personal mobile", and §28 turns on exactly that distinction. There is also no published takedown route for a business that never asked to be listed — only a report form.

This is the gap that carries real-world legal exposure under Nigerian data-protection requirements, and it should be closed **before** the first import, not after.

---

## 4 · VERDICT TABLE

| Area | §  | Verdict |
| --- | --- | --- |
| Four-concept model | 2 | **FIXED** |
| Claim status values | 3 | **PARTIALLY FIXED** — 2 values missing |
| Verification status values | 3 | **PARTIALLY FIXED** — `expired` missing |
| Data confidence | 3 | **MISSING** — different axis exists |
| Unclaimed profile state & CTA | 4, 5 | **FIXED** |
| Trust display / three badges | 6, 33 | **FIXED** |
| Admin import screen | 7, 8 | **PARTIALLY FIXED** — CSV only |
| One-click import & validation | 9 | **FIXED** |
| Import data model | 10 | **FIXED** |
| Source provenance | 11 | **FIXED** |
| Per-field provenance | 12 | **MISSING** |
| No fabricated socials | 13 | **FIXED** (nothing fabricates) |
| Description generation rules | 14 | **MISSING** (no generator exists yet) |
| Duplicate engine | 15 | **FIXED** |
| Claim CTA | 16 | **FIXED** |
| Four-step claim flow | 17 | **PARTIALLY FIXED** — one step |
| Claim record fields | 18 | **PARTIALLY FIXED** — 3 fields missing |
| Admin Claim Center | 19 | **PARTIALLY FIXED** — no tabs/risk column |
| Approval flow | 20 | **FIXED** |
| Owner activation | 21 | **PARTIALLY FIXED** — `ProfileCompleteness` exists |
| Claim-to-growth loop | 22 | **UNPROVEN** |
| Correction queue | 23 | **PARTIALLY FIXED** |
| Business opportunities | 24 | **PARTIALLY FIXED** |
| Claim priority score | 25 | **MISSING** |
| Outreach + suppression | 26 | **MISSING** |
| SEO quality gate | 27 | **PARTIALLY FIXED** |
| Privacy / takedown | 28 | **PARTIALLY FIXED** |
| Source policy | 29 | **FIXED** |
| Import audit log | 30 | **FIXED** |
| Rollback | 31 | **FIXED** |
| Data quality score | 32 | **MISSING** |
| Admin safety / RLS | 34 | **FIXED** |
| Test coverage of the flow | 35 | **PARTIALLY FIXED** — units only |
| Scale to 100k | 36 | **UNSCALABLE** |
| Import UX | 37 | **PARTIALLY FIXED** |
| Template download | 38 | **MISSING** |
| Campaign landing page | 39 | **PARTIALLY FIXED** |
| Submission flow | 40 | **FIXED** |
| Notifications | 41 | **PARTIALLY FIXED** |
| Campaign measurement | 42 | **MISSING** |
| NowOpen IQ integration | 43 | **PARTIALLY FIXED** |

**Nothing is BROKEN. Nothing is DUPLICATED. Nothing measured is UNSAFE.** One area is UNSCALABLE (§36) and one is UNPROVEN (§13/§22).

---

## 5 · RECOMMENDED ORDER

§45 lists 24 steps. Given what already exists, most of steps 1–14 are complete. The honest sequence from here:

**A. Close the honesty gaps first — before any data enters**
1. Add `claim_rejected` + `claim_suspended`, and `expired` (Gap 1).
2. Add a `data_confidence` column *beside* `data_status`, never replacing it (Gap 2).
3. Add per-field provenance so enrichment can never pose as owner-provided (Gap 6).
4. Separate business contact data from personal contact data in validation; add a takedown route (§28).
5. Add the SEO quality threshold, so the first import cannot flood Google with thin pages (Gap 9).

**B. Make the acceptance test possible**
6. XLSX support (Gap 3).
7. Template + data dictionary download (Gap 5).
8. Four-step claim flow and the missing claim fields; validate the `NOT VALID` constraint (Gap 4).
9. Claim funnel analytics (Gap 7) — otherwise §42 cannot be answered at all.

**C. Then exercise it**
10. Run a real import end to end, in a rehearsal, and measure what actually happens (Gap 13).

**D. Only then build the new surfaces**
11. Claim priority score, outreach with suppression, correction queue, data quality score, IQ integration.

**One blocker applies to all of A:** every item in A is a schema change, and this session cannot apply DDL to production — five refusals from the permission classifier. There is also no staging database (`.env`, `.env.local` and the linked project are one Supabase project), so there is nowhere to rehearse. See `audits/NOWOPEN_APPLY_RUNBOOK.md`, items 3 and 4, and **do not run `supabase db push`** — it would replay 86 applied migrations, three of which write rows.

---

## 6 · THE ONE THING THIS AUDIT WOULD SAY IF IT COULD ONLY SAY ONE

You already own an acquisition engine. It is better than the brief assumes — the rollback is careful, the source-licensing model is genuinely unusual, the visibility gate is enforced in the database rather than in code, and the prohibition on BusinessList.com.ng is recorded as data rather than remembered as a rule.

What it has never had is **a single row of input**.

The gap between this system and the campaign in the brief is not 24 build steps. It is about five honesty-critical schema changes, XLSX parsing, a deeper claim form, a funnel that can be measured — and then someone running it once, for real, and watching what happens.
