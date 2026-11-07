# Business Updates — design spec

Status: DRAFT, waiting for founder approval. No code or migration exists yet.
Date: 2026-10-31

## 1. What this is

A business posts a short update: text, photos or video, typed as a new product,
new service, offer, announcement, event or recent work. Each update is public for
exactly 24 hours from when it goes live. After that it leaves every public
surface, and it stays in the owner's private archive until they delete it.

Who it is for:
- **People** (Discover, Keeps): a reason to come back today. "What's new at the
  places I like, and what's happening near me right now."
- **Businesses** (dashboard): the cheapest possible way to say "we're here,
  this is new". Today that need is met by a Studio "Announcements" tool that
  saves only to the owner's own browser (`src/lib/announcements.ts`, localStorage).
  Nobody else ever sees those posts.

Success means:
- An owner can post an update from their phone in under a minute.
- The update is gone from every public read at hour 24. The database enforces
  that, not the browser and not a scheduled job.
- Every number shown about an update comes from a recorded row. NowOpen
  invents no views, likes or engagement.

## 2. Decisions already made (founder, 2026-10-31)

| Question | Decision |
|---|---|
| Media after 24h | **Private bucket with short-lived signed links.** Saved links stop working. |
| Moderation | **Post-moderation.** Updates go live at once. Anyone can report one. Staff can hide one, which removes it from every public surface. |
| Keeps alerts | **On by default, with a per-update off switch.** The alert reaches only keepers who opted into the matching topic, through the existing `notify_keepers` throttle. |
| Offers | **An offer update links a real `business_offers` row.** The offer keeps its own start and end dates. The update is a 24-hour announcement of it. |

Defaults I chose (the founder can overturn any of these in review):
- **Who can publish:** the owner, an admin, and active team members with role
  `manager`, `marketing` or `content_editor`. Any active member can read the
  archive. These are existing roles in `src/data/roles.ts` and `has_business_role`.
- **Scheduling:** an update can be set to go live at a chosen time, up to 14
  days ahead. Its 24 hours start then.
- **End early:** yes. The owner can end an update before hour 24.
  **No extending:** 24 hours is exact. "Post again" makes a new copy.
- **Retention:** the archive is kept until the owner deletes the update.
  Deleting removes the row and its media files.
- **Limits:** up to 10 media items per update. Images are compressed to WebP on
  upload (existing `imageCompression.ts`), up to 10 MB each. Video up to 60
  seconds and 50 MB, MP4 or WebM.
- **Visibility:** every published update is public. Keepers-only updates are
  out of scope for now.
- **Studio Announcements:** left untouched in this build. Pointing it at
  Updates is a follow-up.

## 3. Audit: what exists and what gets reused

| System | Live state (read-only query, 2026-10-31) | Use in Updates |
|---|---|---|
| `business_offers` + `/offers` + `OffersManager` | Table live, 0 rows. RLS already filters on `starts_at`/`ends_at`. A `trg_keep_offer` trigger notifies keepers on insert. | Offer updates link via `offer_id`. The update must not notify a second time when it announces an offer that already notified (section 6.4). |
| `business_keeps`, `notify_keepers`, `keep_sends` | 4 keeps live. Topics are a consent record. The throttle runs 1–24h per topic. | The only notification path. Updates never write `notifications` directly. |
| `notifications` (bell) | Live | Reached only through `notify_keepers`. |
| `business_members`, `is_business_member`, `has_business_role` | Live, 0 active members | Publish and archive permissions. |
| `is_admin()`, `is_staff()` | Live | `is_admin()` moderates. Editors and curators get no moderation power, matching `permissions.ts`. |
| `business_gallery` | Live, permanent media | Not reused for storage. Gallery is permanent and public, while Updates media expires and is private. "Keep this in my gallery" is a later option. |
| `business_projects` | Live | Not reused. A "recent work" update can link to a project page through its CTA. |
| `business_reports` + `check_rate_limit` | Live, 0 reports, throttled by hashed IP | The trigger pattern is reused. Update reports get their own table, because `business_reports.reason` is about listing facts (closed, wrong phone). |
| Storage buckets | `business-images`, `hero-videos`, `social-media` (public); `verification-docs`, `create-artwork` (private) | A new private bucket, `business-updates`. |
| `OpenReelCapture` + `openReel.ts` | Live: cross-browser recorder with a bitrate ceiling | Reused for in-app video capture in the composer. |
| `analytics_events` | Event names are restricted by a CHECK constraint, and `user_id` must match the sender | New event names are added through `scripts/gen-event-constraint.mjs`. Owner stats read from these rows only. |
| `ConfirmDialog` | Used across the admin panels | End early, delete and staff hide all confirm through it. |
| pg_cron | Installed. Automation runs every 15 minutes. | Sends alerts for scheduled updates only. It is never the visibility gate. |
| `src/lib/dates.ts` | Local Lagos day | All "ends at 6:40 pm" and "today" labels. |

## 4. Approaches considered

1. **New `business_updates` table + `business_update_media` child table (chosen).**
   One lifecycle, one RLS model and one private bucket, all built for expiry.
2. **Add `expires_at` to `business_gallery`.** Rejected. Gallery rows are
   permanent and their media sits in a public bucket. Mixing in expiry would put
   two visibility models into one table, and every gallery read would have to
   learn about expiry.
3. **Reuse `business_offers` for every type.** Rejected. An offer is a
   commercial promise with its own dates and code. Most updates are not offers.

## 5. Data model (phase 1)

### 5.1 `business_updates`

| Column | Type | Rule |
|---|---|---|
| `id` | uuid pk | |
| `business_id` | uuid → businesses, cascade | |
| `author_id` | uuid → auth.users, set null | Forced to `auth.uid()` on insert by a trigger |
| `type` | text | `new_product`, `new_service`, `offer`, `announcement`, `event`, `recent_work` |
| `title` | text | ≤ 80 chars, may be empty |
| `body` | text | ≤ 500 chars, may be empty |
| `offer_id` | uuid → business_offers, set null | Must belong to the same business. Required to publish when `type = 'offer'`. |
| `event_starts_at` | timestamptz null | Optional, for `type = 'event'` |
| `cta_label` / `cta_url` | text null | URL must start with `https://` or `/`. Label ≤ 30 chars. |
| `notify_keepers` | boolean default true | The owner's off switch |
| `published_at` | timestamptz null | Null means draft. Set means live from this moment, or scheduled if in the future. |
| `expires_at` | timestamptz **generated** `published_at + interval '24 hours'` | No one can edit it, so no one can extend an update |
| `ended_at` | timestamptz null | End early |
| `notified_at` | timestamptz null | When the keeper alert went out, so it fires once |
| `moderation_status` | text default `ok` | `ok` or `hidden`. Only admins may change it (trigger). |
| `moderation_note`, `moderated_by`, `moderated_at` | | Admin only |
| `created_at`, `updated_at` | timestamptz | |

**Lifecycle state.** It is derived from the columns, never stored, so it cannot drift:
- `draft`: `published_at IS NULL`
- `scheduled`: `published_at > now()`
- `active`: `published_at <= now() < expires_at`, `ended_at IS NULL`, `moderation_status = 'ok'`
- `ended`: past `expires_at`, or `ended_at` set
- `hidden`: `moderation_status = 'hidden'`

The same derivation lives in SQL (a `business_update_state()` immutable-style
helper taking `now()` as an argument) and in `src/lib/businessUpdates.ts`, so the
UI labels and the server's gate are tested against the same cases.

**Guard trigger** (BEFORE INSERT/UPDATE):
- Once `OLD.published_at <= now()`, `published_at` cannot change. This blocks
  re-arming an old update for another 24 hours.
- A new `published_at` must fall between `now() - 5 minutes` (clock skew) and
  `now() + 14 days`.
- Publishing requires at least one of title, body or media. A `type = 'offer'`
  update also needs an `offer_id` from the same business.
- Only `is_admin()` may change `moderation_*`.
- `ended_at` can only be set, never cleared, and only while the update is published.
- After publish, content edits (title, body, media) are allowed only while the
  update is draft or scheduled. A live update is fixed: end it and post again.
  An update cannot change after people have seen it.

### 5.2 `business_update_media`

`id`, `update_id` → updates (cascade), `business_id` (denormalised for storage
RLS and checked equal to the parent's), `position` smallint, `kind`
(`image` | `video`), `storage_path` (unique, must start with
`<business_id>/<update_id>/`), `poster_path` null, `width`, `height`,
`duration_ms` (video ≤ 60000), `alt_text` ≤ 200, `created_at`.
A trigger caps media at 10 per update. Media cannot change once the parent is live.

### 5.3 `business_update_reports`

`id`, `update_id` → updates (cascade), `business_id`, `user_id` null, `reason`
(`spam`, `misleading`, `offensive`, `scam`, `impersonation`, `other`),
`detail` ≤ 500, `status` (`open`, `actioned`, `rejected`), `reviewed_by`,
`reviewed_at`, `created_at`. Anyone may insert, rate-limited with
`enforce_public_write_limit('update_report', '30', '1 hour')`. Only admins can
read or update. Clients never chain `.select()` onto the insert.

### 5.4 Storage: `business-updates` bucket

Private, 50 MB limit, MIME allowlist `image/webp, image/jpeg, image/png,
video/mp4, video/webm`. Paths are `<business_id>/<update_id>/<file>`.

Policies on `storage.objects` for this bucket:
- **Insert / delete:** authenticated users with
  `has_business_role(<business_id from path>, publisher roles)`. The uuid parse
  is done by a safe helper that returns null on a bad path, so a malformed name
  is refused instead of raising.
- **Select:** either the caller is a member of that business (archive), or a
  `business_update_media` row with this `storage_path` belongs to an update that
  is active right now.

Public viewers get signed links (`createSignedUrls`) with a TTL of
`min(10 minutes, time left)`. Signing checks the select policy, so an ended or
hidden update cannot be signed. Honest limit: a link signed at minute 23:55 can
still work for up to 10 minutes after the update ends. That is the cost of
having no proxy. It is short and bounded, and the update has already left
every NowOpen page.

## 6. Security and lifecycle

### 6.1 Public read (RLS)
```
published_at <= now() AND expires_at > now() AND ended_at IS NULL
AND moderation_status = 'ok'
AND EXISTS (SELECT 1 FROM businesses b WHERE b.id = business_id)
```
The `EXISTS` runs under the caller's own `businesses` RLS, so updates from an
unlisted or suspended business vanish with it. Media follow the parent update
through `EXISTS` on it.

### 6.2 Owner and team
- Read all their updates, including drafts and the archive: `is_business_member(business_id)`.
- Insert, update and delete: `has_business_role(business_id, ARRAY['manager','marketing','content_editor'])`. Owners and admins pass by definition.

### 6.3 Staff
`is_admin()` reads everything, sets `moderation_status`, and reads and resolves reports.

### 6.4 Keeper alerts
- **Topic map:** `offer` → promotions, `new_product`/`new_service` → products,
  `event` → events, `announcement`/`recent_work` → announcements.
- **Immediate:** an AFTER trigger fires when an update becomes active
  (`published_at <= now()`), `notify_keepers` is true and `notified_at` is null.
  It calls `notify_keepers(...)` with link `/<slug>?update=<id>` and sets
  `notified_at`. It swallows its own errors, like the existing keep triggers.
- **Scheduled:** `dispatch_scheduled_update_alerts()` runs from pg_cron every
  15 minutes. It sends for updates that became active since the last run, and
  skips any that are no longer active. Alerts can arrive up to 15 minutes late.
  The update is visible on time regardless.
- **No double alert:** an offer update whose offer was created in the last
  6 hours does not alert, because `trg_keep_offer` already did. The throttle
  would also suppress it, but the rule makes the reason explicit.
- An owner who keeps their own business is never alerted. `notify_keepers` already handles this.

### 6.5 Hidden by staff
Setting `hidden` removes the update from public reads and media signing at once.
The owner sees "Hidden by NowOpen" and the note in their archive.

## 7. Surfaces (phases 2–5, summarised; each gets its own review sheet)

- **Dashboard → Updates.** Create Update (type, text, media, optional CTA, offer
  picker for the offer type, schedule, "Tell my keepers" toggle with the real
  keeper count for that topic via `reachFor`). Tabs: Active (with a live
  countdown), Scheduled and Drafts, Archive. End early and Delete go through
  `ConfirmDialog`.
- **Business profile.** An Updates strip above the tabs, shown only when at
  least one update is active. A focused viewer: swipe or arrow-key next/prev,
  images, video muted with a visible unmute button and no auto-audio, a
  "Posted 3h ago · ends 6:40 pm" label from `dates.ts`, Share (link
  `/<slug>?update=<id>`, which shows "This update has ended" after expiry), and
  Report. An accessible list view is the fallback, with keyboard navigation,
  alt text, captions and reduced motion. Touch targets are 44px explicit.
- **Discover → "Happening on NowOpen".** Active updates, newest `published_at`
  first. Relevance only breaks ties within the same hour: kept businesses first,
  then the viewer's area or category. No counts. Hidden when nothing is active,
  with no filler.
- **Keeps.** A "New today" row from businesses the person keeps.
- **Admin → Moderation.** The update reports queue, hide/unhide with a note, and
  a list of recent updates.
- **Analytics.** New events: `update_viewed`, `update_cta_clicked`,
  `update_shared`, with `update_id` in props. The owner sees "N recorded opens".
  Only real events are counted, and the screen says so.

## 8. Phase plan

1. **Database, security, lifecycle.** Migration for the three tables, the bucket
   and its policies, guard triggers, the alert trigger and cron function, and
   the report rate limit. `src/lib/businessUpdates.ts` holds the pure lifecycle
   state, the topic map, validation and TTL maths, with Vitest tests. A
   `BEGIN … ROLLBACK` dry run on live proves RLS as anon, as a non-member and as
   the owner, and writes nothing. Then a founder gate, apply, record in the
   ledger, and `check:drift`.
2. **Owner dashboard:** composer, tabs and the upload pipeline.
3. **Public profile:** strip, viewer, list view, share and report.
4. **Discover and Keeps.**
5. **Admin moderation and analytics events.**

Each phase ends with a review sheet: what changed, what was verified live (and
how), and what was not. No commit or deploy without founder approval.

## 9. Testing

- Pure lib: Vitest for the state derivation at each boundary (23:59:59 active,
  24:00:00 ended, scheduled, ended early, hidden), the topic map, validation and
  the signed-URL TTL.
- SQL: a dry-run script that runs inside `BEGIN … ROLLBACK`. It switches
  `request.jwt.claims` and `role` to impersonate anon, a stranger and the owner,
  then asserts what each can see, write and sign. It creates fixture rows only
  inside the rolled-back transaction.
- `npm run typecheck`, `npm run verify` before any phase review.

## 10. Out of scope

Keepers-only visibility, reactions or likes, replies, AI captions, Studio
Announcements migration, cross-posting to Instagram/WhatsApp Status, saving an
update into the gallery, and mobile app parity (a follow-up via the mobile twin
libraries).
