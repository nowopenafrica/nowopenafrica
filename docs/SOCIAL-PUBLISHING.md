# Social publishing — going live

Everything in the codebase is done. What remains cannot be done from here:
registering apps with Meta, LinkedIn, X and TikTok requires accepting their
terms as the business, and Meta and TikTok will not post to a real account
until the app passes their review. Those are their gates, not ours.

Run this at any point to see exactly where you are:

```bash
npm run social:check
```

It reports which functions are deployed, which channels have credentials, the
callback URL to whitelist, and what is still missing. Nothing below is guesswork
you have to keep in your head.

---

## 1. Register a developer app per platform

You need one app per platform. The callback URL to whitelist is printed by
`npm run social:check` — it must match **character for character**, including
the query string, or the platform rejects the handshake.

| Platform | Console | Gives you |
|---|---|---|
| Instagram + Facebook | developers.facebook.com | `META_APP_ID`, `META_APP_SECRET` |
| LinkedIn | linkedin.com/developers | `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET` |
| X | developer.x.com | `X_CLIENT_ID`, `X_CLIENT_SECRET` |
| TikTok | developers.tiktok.com | `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET` |

Scopes are requested by the code, not configured by you, but the app has to be
*allowed* to request them:

- **Meta** — `pages_show_list`, `pages_manage_posts`, `pages_read_engagement`,
  `instagram_basic`, `instagram_content_publish`, `business_management`.
  Instagram publishing requires a Business or Creator account linked to a
  Facebook Page. Needs App Review.
- **LinkedIn** — `openid`, `profile`, `w_member_social`. `w_member_social`
  needs the "Share on LinkedIn" product added to the app.
- **X** — `tweet.write`, `users.read`, `offline.access`. Must be an OAuth 2.0
  app with PKCE; `offline.access` is what makes the token refreshable, and
  without it scheduled posting stops the first time a token expires.
- **TikTok** — `user.info.basic`, `video.publish`. Direct Post needs audit
  approval; before that it can only post to a private test account.

## 2. Put the values in `.env.social`

`npm run social:check` prints the template. The file is covered by
`.gitignore`'s `.env*`, so it cannot be committed.

Two values are yours to invent, and both should be long and random:

```bash
node -e "console.log(crypto.randomUUID()+crypto.randomUUID())"
```

- `SOCIAL_TOKEN_KEY` — encrypts stored OAuth tokens at rest. **Do not lose or
  rotate it casually**: existing connections cannot be decrypted afterwards and
  every business has to reconnect. Publishing fails loudly rather than posting
  nonsense if this happens.
- `AUTOMATION_SECRET` — the only thing standing between the internet and your
  publish-now endpoint. `publish-due-posts` refuses to run at all when it is
  unset rather than accepting anonymous triggers.

## 3. Deploy

```bash
npx supabase login
npm run social:deploy
```

That sets the secrets from `.env.social`, deploys `social-auth` (with
`--no-verify-jwt`, because provider redirects arrive without our token and the
callback trusts only the signed `state`), `social-publish` and
`publish-due-posts`, applies migrations, then re-runs the check.

## 4. Schedule the publisher

This is the step that makes "scheduled" mean anything — without it posts sit in
the queue. Every 5 minutes:

```
POST https://<project>.supabase.co/functions/v1/publish-due-posts
Header: x-automation-key: <AUTOMATION_SECRET>
```

Supabase Cron, a GitHub Action on a schedule, or any external cron will do.

## 5. Confirm it end to end

1. `npm run social:check` — the platform you set up reads *ready to post*.
2. Studio → AI Marketing Department → Schedule & Publish. The channel shows
   **posts for real** rather than *needs setup* or *reminder only*.
3. Connect it. The popup goes to the real platform and returns to a
   self-closing page.
4. Schedule a post one minute out, then close the tab. It should appear on the
   account without the browser open — that is the whole point.
5. If it does not: `social_scheduled_posts.last_error` and
   `social_publish_log.error` carry the provider's own message.

---

## What the Studio shows before any of this

The panel never claims more than it can do, so its current state is accurate
rather than broken:

| State | Meaning |
|---|---|
| **posts for real** | connected, and posts actually go out |
| **needs setup** | the platform is supported but this project has no developer app |
| **reminder only** | no API integration exists (WhatsApp Status, NowOpen Profile, Google Business Profile, Pinterest, Threads) — it stays on your plan, we never post to it |
| *(no badge)* | the service could not be reached, so no claim is made either way |

`reminder only` is not a bug to fix by deploying — those five have no publishing
API wired up at all, and the label says so honestly rather than pretending a
handle is a connection.
