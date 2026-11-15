# Instagram live and gallery auto-fetch: audit and spec

15 November 2026. Status: **waiting for the founder's approval.** Nothing is built, migrated or deployed yet.

The founder asked for two things:

> "whenever a business is livestreaming on Instagram it automatically also displays on NowOpen Live on the business page. Also once a registered business includes/adds their Instagram page on NowOpen Africa as a social option, it should also automatically start fetching contents for the business gallery and live also."

The short answer:

- **Gallery auto-fetch: possible, and phase 1.**
- **Detecting that a business is live on Instagram: possible, but only for a business that connects its own Instagram account to NowOpen.** A handle alone is not enough.
- **Playing the Instagram live video on NowOpen: not possible.** Meta gives no stream and no live embed. What NowOpen can honestly do is show a "Live on Instagram now" badge that opens Instagram.

---

## 1. Audit: what exists today

### Measured on production, read-only, 15 Nov

| | |
|---|---|
| Businesses with an Instagram link in `social_links` | 582 |
| Claimed businesses | 9 (8 have an Instagram link) |
| Businesses with an Instagram gallery | 360 (17,888 rows) |
| Owner-connected Instagram accounts (`social_connections`) | **0** |
| NowOpen Live broadcasts ever (`business_streams`) | 7, none live now |
| Handle ledger rows (`instagram_handle_checks`) | 665 |
| Accounts the gallery refresh has ever checked | **88** |

### What is there

- **Lookup by username only** (`_shared/discovery/instagram.ts`): Meta's `business_discovery`, Graph v21.0. Uses the NowOpen system-user token. It returns the profile plus the 12 most recent posts as permalinks, never `media_url`. It is an enrichment source, never a discovery one: it cannot search by place or category.
- **Gallery refresh** (`refresh-instagram-gallery`): pg_cron at `3,23,43 * * * *`. Each run asks Meta about the 15 least-recently-checked accounts, inserts new permalinks (deduplicated by shortcode), stops at the first rate limit and records each attempt in the handle ledger. Only businesses that already have an Instagram gallery are refreshed. New rows reach open pages through Realtime on `business_gallery`.
- **`/instagram` door** (`InstagramOnboarding.tsx`): searches our own directory and spends no Meta quota. **`instagram-intake`** is the anonymous "add my business" endpoint. It files to the review queue, stages the 12 permalinks, and the publish trigger `20261019010000` turns them into gallery rows.
- **Handle ledger and quota**: only `not_business` suppresses a lookup, and only for 30 days. `X-App-Usage` and `X-Business-Use-Case-Usage` are read and the batch paces itself (`instagramQuota.ts`).
- **Social links**: a flat jsonb `{ platform: url }` on `businesses.social_links`. Owners edit it in `BusinessStoryEditor.tsx`, which writes straight to `businesses` and normalises through `socialUrl()`. Admin edits, claims and imports write the same column.
- **NowOpen Live**: `business_streams` holds NowOpen's own browser broadcasts (WebRTC over a Realtime channel, `useBroadcastStream`, `GoLiveModal`). It does not hold anything from Instagram. The header "Live" badge comes from `business_streams.status = 'live'` (`BusinessDetail.tsx` around line 636) and the Live tab is `LiveSection`.
- **Owner Instagram connect**: `social-auth` plus `_shared/social.ts` already has a Meta OAuth flow, built for publishing. It **cannot run**: `META_APP_ID` is not set (only `META_APP_SECRET` is), and it has never been used.

### Bug found during the audit

**The gallery refresh only ever sees 88 of the 360 galleried businesses.** It reads `business_gallery.business_id` with `.limit(1000)`, but there are 17,888 Instagram rows. PostgREST silently returns the first 1,000 rows, and those belong to 88 businesses. The ledger confirms it: exactly 88 handles have ever been refreshed, and all 88 were refreshed in the last day. The other 272 listings, including claimed ones such as Star Chris Pictures, have not been updated since they were published. Phase 1 fixes this.

---

## 2. What Meta allows (primary sources, read 15 Nov)

### Detecting a live broadcast

- [`GET /{ig-user-id}/live_media`](https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/live_media) returns the account's live video. The docs say: "Only live video IG Media being broadcast at the time of the request will be returned." It needs a **User** access token with `instagram_basic` and `pages_read_engagement`, plus `ads_read` or `ads_management` if the Page role comes through Business Manager. On Instagram Login it needs `instagram_business_basic` on `graph.instagram.com`.
- It is an edge on the account itself. It is **not** a field of [`business_discovery`](https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/business_discovery). So we cannot learn whether a stranger's account is live from its handle. The business has to log in and grant NowOpen access.
- For accounts NowOpen does not own or manage, which means every real business, Meta requires **Advanced Access**, which needs **App Review and Business Verification**. Standard Access only covers accounts whose people have a role on our app, such as @nowopenafrica. NowOpen's Meta Business Verification is still outstanding (see the WhatsApp setup notes).

### Webhooks vs polling

- The [webhook fields matrix](https://developers.facebook.com/documentation/instagram-platform/webhooks/fields) lists 15 fields. **None fires when a broadcast starts or ends**, and none fires when a post is published. `live_comments` fires only when someone comments on a live video, so it cannot tell us reliably that a broadcast has started.
- So both live state and new posts need **polling**.

### Rate limits

- From [Meta's rate limiting docs](https://developers.facebook.com/docs/graph-api/overview/rate-limiting):
  - Instagram calls count against Business Use Case limits: "Calls within 24 hours = 4800 * Number of Impressions", reported in `X-Business-Use-Case-Usage`.
  - App and user tokens also have the Platform limit, "200 * Number of Users" per hour, reported in `X-App-Usage`.
- `business_discovery` runs on NowOpen's own token, so all 582 handles share one budget. That is why the refresh asks about 15 accounts per run.
- `live_media` would run on each business's own token, so each connected account brings its own budget. Polling every 2 minutes is about 720 calls a day per account, which is well inside those limits.

### Showing the live video

- `live_media` returns no stream address. The fields shown are `id, media_type (BROADCAST), media_product_type (LIVE), owner, username, comments`, and `media_url` is withheld when reading another user's media.
- [Instagram oEmbed](https://developers.facebook.com/docs/instagram-platform/oembed) embeds photo, video, Reel and feed posts. It says "Stories are not supported" and lists no live embed.
- **So an Instagram live cannot be played inside NowOpen.** Pulling the video any other way would mean scraping or restreaming someone else's broadcast, which Meta's terms forbid. We will not do it.
- If the business shares the replay afterwards, it becomes an ordinary post or reel, and the gallery sync picks it up as an embed.

---

## 3. Spec

### Phase 1: gallery auto-fetch for registered businesses (build now)

**1a. Fix the refresh pool.** Replace the capped `.limit(1000)` read with a service-role-only RPC, `instagram_gallery_refresh_pool()`, which returns one row per eligible business (`business_id`, `instagram link`). The eligible businesses are:

- every business that already has an Instagram gallery (the current rule); and
- every **claimed** business with an Instagram link (new: the owner added it for their own page, which is the consent the current rule was waiting for).

The rotation stays least-recently-checked first, 15 per run, stopping on a rate limit.

**1b. Request a sync when an owner adds or changes the handle.**

- New table `instagram_sync_requests`: `business_id`, `handle`, `status` (pending / done / not_business / rate_limited / error), `requested_at`, `processed_at`, `posts_added`, `note`.
  - RLS: staff read all; the business owner reads their own business's rows; nobody writes from the browser.
  - At most one pending request per business.
- An `AFTER INSERT OR UPDATE OF social_links` trigger on `businesses` (SECURITY DEFINER, fixed `search_path`) fires only when:
  - the business is claimed and has an owner; and
  - the **normalised** handle actually changed. Editing the URL format, or saving the story without touching Instagram, does nothing.

  It replaces any pending request with the new handle, then pokes the function through `pg_net` so the owner does not wait for the next 20-minute tick. The poke is queued inside the transaction, so a failed save sends nothing.
- `refresh-instagram-gallery` gains a "requests first" step. Each run, scheduled or poked, handles up to 3 pending requests before the rotation, from the same budget and with the same rate-limit stop. A request left pending by a rate limit is retried on the next tick.
- **The handle ledger is respected:**
  - If the ledger says `not_business` within 30 days, the request is marked `not_business` and Meta is not asked. The owner is told to switch the account to Business or Creator in the Instagram app.
  - Decision for the founder: should an owner's request be allowed one fresh check per 24 hours despite the ledger, since an owner may have just switched the account? **Recommended: yes.**
- Rows are written exactly as today's sync writes them (`galleryRow()`): permalinks rendered through Meta's embed, no copied captions or images, deduplicated by shortcode. The first sync brings the latest 12 posts. After that the business is in the rotation.
- **Owner UI**, `BusinessStoryEditor.tsx` only:
  - One line under the Instagram field: "When you save, we bring your latest Instagram posts into your gallery. Your account must be a public Business or Creator account. New posts are checked every few hours."
  - After saving, the status of the latest request: "Bringing in your posts…", "12 posts added", or "Instagram says this isn't a Business or Creator account".
- **Scope:**
  - Claimed businesses only. Unclaimed listings keep today's rule.
  - **Removing** the handle stops future syncs and deletes nothing. The owner can remove posts from the gallery themselves.

**Not in phase 1:** owner Instagram connect and anything to do with live state.

**Proof for phase 1:**

- Unit tests for the SQL normaliser matching `normalizeHandle()`, the request-first ordering, ledger skipping and the copy.
- A `BEGIN … ROLLBACK` dry run on live that asserts:
  - a claimed business changing its handle creates one pending request;
  - an unclaimed one, or a non-handle edit, creates none;
  - the pool RPC returns more than 88 businesses.
- `npm run typecheck`, the vitest suite and `check:drift` after applying.
- **No rows are written during testing.** The real first run happens only after the founder's go-ahead to apply and deploy. YemzoArts Studios (claimed, handle set, no gallery) is the natural first real case.

### Phase 2: "Live on Instagram now" (built after phase 1, switched on only when Meta allows)

1. The owner connects Instagram from the dashboard through the existing `social-auth` Meta flow, extended with `pages_show_list` and `ads_read` where needed. This needs `META_APP_ID` set and Facebook Login configured on the NowOpen Meta app.
2. `poll-instagram-live` runs every 2 minutes, for connected accounts only, and calls `live_media` with that business's own token. It writes `instagram_live_status`: business, live media id, first seen, last confirmed, ended.
3. The business page shows the badge only while the last confirmation is under 5 minutes old:
   - in the header: "Live on Instagram now";
   - in the Live tab: a card with an **Open on Instagram** button to the account.

   There is no player. A business that stops being confirmed loses the badge. NowOpen's own Live broadcasts are unchanged and remain the only video NowOpen plays.
4. **Before App Review** this can be proved only on accounts that have a role on our app (e.g. @nowopenafrica). **For real businesses** it needs Advanced Access through App Review plus Business Verification. Until then, the badge cannot appear for any business. It is never faked and never guessed from a handle.

### Founder decisions

1. Approve phase 1 as written.
2. Ledger override: one owner check per 24 hours despite a recent `not_business` result (recommended yes).
3. Removing the Instagram handle: keep the existing posts (recommended), or remove them?
4. Phase 2: go ahead and build the owner connect and live badge now, accepting that it stays dark until Meta App Review and Business Verification are done? The founder would need to add `META_APP_ID` and start Meta Business Verification.
