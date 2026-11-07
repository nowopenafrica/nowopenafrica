# Create, Promote & Inventory Intelligence — status

Last updated 7 November 2026. Covers the work started on 31 October 2026: the Create redesign, the Promote rebuild, and the first two sub-projects of Inventory Intelligence.

**Nothing below is committed to git.** It all lives in the shared working folder. Deploys ship that whole folder, so run `npm run check:drift` before every deploy.

---

## At a glance

| Area | State | Live on www |
|---|---|---|
| Create page (`/media`) | Done | Yes, 31 Oct |
| Template redesign, batches 1–3 | Done | Yes, 31 Oct |
| Promote hub (`/adverts`), step 1 | Done | Yes, 31 Oct |
| Ad preview: images, video and links | Done | Yes, 31 Oct |
| Placement trust model (Inventory sub-project 1) | Done | Yes, 31 Oct |
| Partner portal (Inventory sub-project 2) | Done | Yes, 7 Nov (chatbot redeployed too) |
| Business Updates (24-hour stories) | Separate session: phases 1–2 built and committed on branches | Database yes; screens no |

---

## 1. Create (`/media`)

**Live:**
- "What do you need?", with nine need tiles.
- The products carousel: 12 real finished designs, a pause button, and it pauses when off screen.
- Popular now, a view per need, and `/media/services`.

**Template redesign:** batches 1–3 are done, so every need shows at least 6 finished designs. All text passes the readability checks.

**Next:**
- Step 2: options and details.
- Step 3: export, with free download and optional Paystack support.
- Step 4: the finish screen.
- Template batches 4–8.

Spec: `docs/superpowers/specs/2026-10-31-create-flow-10-design.md`

## 2. Promote (`/adverts`)

**Live:**
- "What do you want to achieve?": six goals and a request bar ("Black Friday sale in Lagos").
- A budget mix per goal (Free, Starter up to ₦50k, Growth up to ₦250k, Campaign). It is built only from real items, and set prices are never added to indicative ones.
- Start free, On NowOpen, and placements by medium and city.
- `/advertise` redirects into the hub.

**Preview:** accepts PNG, JPG, WebP, SVG, GIF and AVIF, MP4, WebM and MOV video, and pasted links. The site's security policy was widened to allow https video links, with your approval.

**Honesty:**
- All 97 placement photos are stock images and are labelled "Stock photo — not this site".
- Every price says "indicative".
- No placement claims to be booked or available without a confirmation.

**Next:**
- Step 2: a plan tray on every page, and artwork from Create sized to the placement.
- Step 3: Paystack for NowOpen ads, one quote request for outdoor, and the finish screen.

Spec: `docs/superpowers/specs/2026-10-31-promote-hub-design.md`

## 3. Inventory Intelligence

The programme has seven sub-projects, in your order:
1. Trust model.
2. Partner portal.
3. CRM and draft-only outreach.
4. Acquisition through Radar.
5. Dashboard.
6. Public map and search.
7. AI assistance.

Programme overview: `docs/superpowers/specs/2026-10-31-inventory-trust-model-design.md`

**Rule:** VacantBoards, Alternative Adverts, Outdoor Exchange, OOHna and BuyMedia are partnership targets, not scraping sources.

### 3.1 Trust model: live

- **Labels:** every placement shows a trust label (Source listed, Partner supplied or Partner verified) and an availability line.
- **"Available"** appears only with a dated confirmation that covers today.
- **Confirmations expire by medium:** outdoor and transit 30 days, screens 14, broadcast, print and online 7.
- **Admin "Media owners" tab:** verify owners, record where each contact came from, link placements, log confirmations, and archive or reject with a reason.
- **Database guarantees:** "Partner verified" is impossible without a verified owner, confirmations can't be rewritten, and every change is audited.

### 3.2 Partner portal: live (7 Nov)

| Task | What | State |
|---|---|---|
| 1 | Database migration (security-reviewed) | Applied live |
| 2 | 18 live behaviour checks (rolled back) | All pass |
| 3 | "Media owner" dashboard tab and verification (registration plus one site proof) | Done, reviewed |
| 4 | Placement form, availability updates, admin review list, public-listing leak closed | Done, reviewed |
| 5 | "Is this your site? Claim it" and the admin claims list | Done, reviewed |
| 6 | Spreadsheet import: CSV/XLSX, column matching, row errors, duplicate check, history | Done, reviewed |
| 7 | Full test run, browser check, review sheet | Done (review sheet: https://claude.ai/artifact/KoryofqmUQX3rGVXcdVUqC) |

Spec: `docs/superpowers/specs/2026-11-01-partner-portal-design.md` · Plan: `docs/superpowers/plans/2026-11-01-partner-portal.md`

**Deploy note:** the chatbot's placement search changed. When the portal ships, redeploy the `chatbot` edge function too.

---

## 4. Database changes applied to production

Each was dry-run in a rolled-back transaction first, applied with your go-ahead, and recorded in the migration log.

| Migration | What |
|---|---|
| `20261101090000_business_project_stories` | Project stories columns (Projects tab); owners could not save projects until this was applied |
| `20261109010000_placement_trust` | Trust model |
| `20261109020000_placement_trust_v2` | Who confirmed, the date rules, hidden rejected owners |
| `20261111010000_partner_portal` | Partner portal |
| `20261111020000_fix_trust_audit_array` | Fixed: non-admin edits of a placement's price, photo or size failed |
| `20261111030000_partner_portal_fixes` | Review fixes: rejected owners locked out, resubmission needs a new document, cleared prices drop their source |

Behaviour checks you can re-run safely (they always roll back):
- `node scripts/check-placement-trust.mjs` (17 checks)
- `node scripts/check-partner-portal.mjs` (23 checks)

---

## 5. Decisions waiting on you

1. **Payment before confirmation.** Today a visitor can pay through Paystack ("Pay to reserve these dates") for a placement no media owner has confirmed. Should payment wait for an owner's confirmation? This belongs to Promote step 3.
2. **Placement page wording.** Should the "Active" badge and the "Why book with NowOpen" box (launch promises) be reworded?
3. **Two older security holes**, proposed as a separate task:
   - the credit triggers leave the database transaction with full admin rights;
   - `_apply_proposal_write` can be called by any signed-in user.
4. **Commits.** All of this is uncommitted, and it needs grouping into commits when you're ready.

## 6. Known issues

- One failing test belongs to other work: `src/lib/projectPageRender.test.ts`, the project-stories share page.
- `adminCreator.smoke.test.tsx` has a long-standing unhandled error from a test mock.
- Business Updates is committed on branches `business-updates-phase1` and `business-updates-phase2`, not pushed. Its dashboard wiring is still uncommitted in this folder.

## 7. Where the detail lives

Each workstream's progress log records every decision and review:
- `.superpowers/sdd/2026-10-31-create-step1-ia-page/`
- `.superpowers/sdd/2026-10-31-promote-step1-hub/`
- `.superpowers/sdd/2026-10-31-placement-trust-model/`
- `.superpowers/sdd/2026-11-01-partner-portal/`

Review sheets:
- Create: https://claude.ai/artifact/5Ff1PUpBdU5HVe8UZzbBPZ
- Promote: https://claude.ai/artifact/C1ce1fzdZzuJ3jF8erHjtr
- Trust model: https://claude.ai/artifact/Xt5yg9YLPo2VbS57uZddhk
