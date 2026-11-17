# Business Updates, Phase 5: Moderation and Real Counts (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (founder's chosen method). Steps use checkbox (`- [ ]`) syntax.

**Goal:**
- NowOpen staff can act on reported updates: hide one with a reason, unhide, or dismiss the reports.
- Owners see real counts for each update: how many people opened it, tapped its button and shared it. These come only from recorded events.

**Architecture:**
- **Events.** Three new analytics events (`update_viewed`, `update_cta_clicked`, `update_shared`) are emitted by the phase 3 viewer through the existing `track()`. The database's event-name whitelist is regenerated from the code with `scripts/gen-event-constraint.mjs`.
- **Counts.** A small invoker-rights database function, `business_update_stats(business_id)`, returns distinct-session counts per update. The owner's existing read access to their own business's events applies. It counts in the database, so the 1,000-row API cap can't silently undercount.
- **Moderation.** An admin-only "Updates" tab in the Admin Console lists reported updates, live updates and hidden ones.
- **Notification.** Hiding writes a bell notification to the owner. Admins may write notifications for anyone, by the existing policy.

**Spec:** `docs/superpowers/specs/2026-10-31-business-updates-design.md` §7 "Admin → Moderation" and "Analytics" (approved).

## Global Constraints

- **Two database changes, applied only after the founder says go,** each with a rolled-back dry run first, recorded in the ledger, then `check:drift`:
  - the regenerated `20260908120000_analytics_event_integrity.sql` (re-runnable, already in the ledger)
  - a new `20261117010000_business_update_stats.sql`
- **Order matters.** Apply the whitelist before deploying the viewer. Otherwise the new events are rejected silently, inside telemetry's deliberate try/catch.
- **Honest numbers.**
  - Counts are distinct browser sessions, leaving out the owner's own visits, the same rule the existing Insights panel uses.
  - The screen says "people opened", "button taps" and "shares", with "Counted from visits to NowOpen", and nothing more.
  - No counts are shown for drafts or scheduled updates.
  - A failed read shows no number at all, never 0.
  - Known limit: analytics events can be written by anyone with the public key (see the analytics-trust note). The counts are "recorded", not audited, and they aren't used to rank anything.
- **Moderation is admin-only** (`is_admin()`, in line with `permissions.ts`). Editors and curators don't get the tab.
- **Hiding needs a reason** of 5–500 characters. The owner sees it in their archive ("Hidden by NowOpen: <reason>") and gets one bell notification. Unhiding notifies them too.
- **Actions** use `ConfirmDialog`. 44px touch targets. No `.select()` after inserts.
- **Localhost never records events** (`shouldReport`). The event check therefore happens on the live site after deploy, in the founder gate.
- **Shared files:**
  - `AdminDashboard.tsx` gets a small additive tab entry and render.
  - `permissions.ts` gets the new tab id, admin-only.
  - `telemetry.ts` gets three union members.

## Decisions for the founder (approve or overturn)

1. **What counts as an "open":** the viewer showing that update, once per update per browser session. The existing telemetry de-duplication already does this per session.
   - Strip thumbnails and Discover cards are not counted. Seeing a card isn't opening it.
2. **No counts on Discover or profiles.** Counts are only for the owner and staff. Public view counts invite gaming, and the events table can be written with the public key.
3. **Report outcomes:**
   - **Hide:** sets the update hidden, marks its open reports "actioned", and notifies the owner.
   - **Dismiss:** marks the open reports "rejected". The update stays live, and the owner isn't told about dismissed reports.
4. **Unhide:** allowed, with a confirmation. It doesn't extend the 24 hours, and if the time has passed the update stays ended. A keeper alert is not re-sent (phase 1 rule: no alert after expiry; an unhidden update that is still live has `notified_at` set already, or never had alerts on).
5. **The tab badge** counts open reports, the only real queue number.

## Review Focus

1. **The stats function is invoker rights.** An owner sees only their own business's counts, and another owner's business id returns nothing. Pinned by a rolled-back SQL check (`stats_owner_only`) in `scripts/check-business-updates.sql`, which goes to 34 checks.
2. **The owner's own visits never count.** Pinned by SQL check `stats_exclude_owner`.
3. **A new event name must be accepted by the live whitelist before the viewer ships.** Pinned by `src/test/eventIntegrity.test.ts` (existing) and the dry run of the regenerated migration.
4. **A failed stats read shows no number.** Pinned by `UpdatesManager.smoke › shows no count when stats cannot be read`.
5. **Hide without a reason is impossible.** The confirm button is disabled under 5 characters. Pinned by `UpdatesModerationPanel.smoke`.

---

### Task 1: Events

**Files:**
- Modify `src/lib/telemetry.ts`: add `'update_viewed' | 'update_cta_clicked' | 'update_shared'` to `EventName`.
- Regenerate the whitelist with `node scripts/gen-event-constraint.mjs`, then confirm with `--check`.
- Modify `src/components/updates/UpdateViewer.tsx`:
  - It takes a `businessId` prop, which the strip passes.
  - On showing an update in focus mode it emits `track('update_viewed', { update_id, type }, businessId)`.
  - On CTA click: `update_cta_clicked`.
  - On a successful share or copy: `update_shared` with `{ method: 'share' | 'copy' }`.
- Modify `src/components/updates/UpdatesStrip.tsx` to pass `businessId`.
- Tests:
  - `updateViewer.smoke`, with `track` mocked:
    - one `update_viewed` per update shown, with the right business id
    - CTA and share events fire
    - no event in list mode, which shows everything at once and isn't an open
  - `eventIntegrity.test.ts` passes. `eventCoverage.test.ts` passes, because each new event has a call site.

- [ ] **Steps:** failing tests, watch them fail, implement, regenerate, pass.

### Task 2: Stats function and owner counts

**Files:**
- Create `supabase/migrations/20261117010000_business_update_stats.sql`:
  - `public.business_update_stats(p_business uuid) RETURNS TABLE(update_id uuid, people integer, cta_taps integer, shares integer)`
  - `LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public`.
  - It counts `count(distinct session_id)` per `props->>'update_id'` over `analytics_events`, where `business_id = p_business`, `name` is one of the three events, and the event's `user_id` is null or not the business's owner.
  - Executable by `authenticated` only.
- Modify `scripts/check-business-updates.sql`: add the two checks named above, then the runner expects 34.
- Modify `src/lib/businessUpdatesApi.ts`: `loadUpdateStats(businessId): Promise<Map<string, { people: number; cta: number; shares: number }> | null>`.
- Modify `src/components/dashboard/UpdatesManager.tsx`:
  - On active and ended rows, show "{people} people opened · {cta} button taps · {shares} shares".
  - Below the tabs, show "Counted from visits to NowOpen. Your own visits are not counted."
  - On read failure, show no line at all.
- Tests:
  - the `loadUpdateStats` mapping, with null on error
  - manager smoke tests: shows counts, and `shows no count when stats cannot be read`
  - the SQL check guard test

### Task 3: Moderation panel

**Files:**
- Create `src/lib/updateModeration.ts` (+ test):
  - `listModeration(): Promise<Result<{ reported: ModItem[]; live: ModItem[]; hidden: ModItem[] }>>`:
    - **Reported:** updates with open reports, oldest report first, each with its reasons tallied.
    - **Live:** the newest 50 live updates.
    - **Hidden:** the newest 50 hidden.
    - Media is signed for staff.
  - `hideUpdate(u, note)`:
    - updates `moderation_status = 'hidden'` and `moderation_note`
    - marks open reports `actioned`
    - inserts the owner notification `{ user_id: owner, title: 'An update was hidden by NowOpen', body: note, type: 'moderation', link: '/dashboard?open=updates&business=<id>' }`, without `.select()`
  - `unhideUpdate(u)`: the same, with a notification "Your update is visible again".
  - `dismissReports(updateId)`: marks open reports `rejected`.
- Create `src/components/admin/UpdatesModerationPanel.tsx`:
  - Three sections: Reported, Live now and Hidden.
  - Each card shows the business, the update content and media (signed), the time label, the report reasons with counts, and the reporters' optional details, in plain text.
  - Actions: Hide (a `ConfirmDialog` with a required reason textarea), Dismiss reports, Unhide, and Open profile.
  - Empty states, plus a failed-read state.
- Modify `src/lib/permissions.ts`: add `'updates'` to `AdminTabId`, admin only.
- Modify `src/pages/AdminDashboard.tsx`: add the tab `{ id: 'updates', label: 'Updates', icon: Megaphone, count: openUpdateReports }` and render the panel.
- Tests:
  - panel smoke: Hide is disabled until a reason of 5+ characters, Dismiss, Unhide, empty versus failed
  - lib tests: no `.select()` after the notification insert; Hide marks reports actioned
  - a permissions test: the tab is admin-only

### Task 4: Verify, review, founder gates

- [ ] **Browser checks, reading only:** the Admin "Updates" tab renders with its empty states, and the dashboard counts line is hidden while there are no events.
- [ ] **Fresh review,** then one fix pass, then `npm run verify`, then the review sheet.
- [ ] **Founder gate A:** dry-run, then apply both migrations, record them in the ledger, then `check:drift`. The 34 checks must pass.
- [ ] **Founder gate B:** deploy. Events only record from the live site.
- [ ] **Founder gate C, a live check on YemzoArts Studios with alerts off:**
  1. Post an update.
  2. Open it as a logged-out visitor on www (a private window, or the public key path), tap its button and share.
  3. The dashboard shows "1 people opened · 1 button taps · 1 shares" after the 4-second telemetry flush. The "1 people" wording is fixed to singular in code.
  4. Report it.
  5. Admin hides it with a reason. The owner sees "Hidden by NowOpen" and gets a bell notification.
  6. Unhide, then delete.
  7. Confirm 0 updates, reports and files remain. The test analytics rows stay, because they are history; the review sheet lists them.


## Corrections after the whole-change review (2026-11-15)

- **Deploy order is a hard rule, with a wider blast radius than stated above.** Telemetry sends each page's queued events as one batch. If the viewer ships before the whitelist is applied, a single `update_viewed` row makes the database reject the whole batch, including that page's `business_viewed` and `business_contact_clicked`, so the existing Insights panel would undercount too. Apply the whitelist, check drift, and only then deploy.
- **Decision 1 wording.** Telemetry de-duplicates within a 2-second window, not per session. The viewer records one open per update each time it is opened. The counts are still per session, because the database counts distinct sessions.
- **Decision 4 made true.** Unhiding marks the keeper alert as handled, so neither the trigger nor the 15-minute scheduler sends a first alert hours late. Unhiding an update whose 24 hours have passed tells the owner exactly that, and never says "visible again".
- **Own visits.** Whole sessions in which the owner or an active team member appeared are left out, not just their signed-in events. The note now reads "Visits by you and your team are not counted."
- **The stats migration also redefines `business_update_alert_on_live`** for the unhide rule. There are now 37 checks.