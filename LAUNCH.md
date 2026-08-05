# NowOpen Africa — Launch Runbook

Status of the industry-operating-systems work and the steps that remain before
go-live. Web app: `Latest Web UI Updates/nowopen-latest`. Mobile app:
`../../nowopen-mobile`.

---

## ✅ What's built & verified

### Web (`nowopen-latest`)
- **31 industry operating systems** — each category renders a purpose-built
  profile experience (Real Estate portal + mortgage calc, Restaurant menu, Hotel
  rooms, Car dealer + finance calc, Pharmacy, Fitness, Beauty, Health, Fashion,
  Education, Photography, Transport, Events, Retail, Agriculture, Legal, Service
  Providers, Finance + loan calc, Manufacturing, Construction, Travel, Automotive,
  Childcare, Music, Design, Insurance, Accounting, Digital Marketing, Mobile
  Money, Software & IT, Gadget & Device Repair).
- **Platform `/platform`** — pillars + industries + a **"See it live" gallery**
  (`src/data/osShowcase.ts`) whose cards link to each demo profile. 2-per-row on
  mobile; verified light **and** dark.
- Demo spotlights: `business_37`–`business_68` (usernames like
  `lagos-prime-realty`, `gadgetmedic-repairs`).
- Typecheck: `npm run typecheck` (clean).

### Mobile (`nowopen-mobile`, Expo)
- **Config parity** — `categoryFeatures.ts` + `categories.ts` synced to web.
- **Spotlight resolution** — all 31 demos resolve by id **and** username
  (`src/data/spotlights.ts`, wired into `useBusiness`/`useBusinessContent`).
- **Tailored profiles** via two config-driven components
  (`IndustrySection` + `CatalogSection`): action rows, badges, quick-tiles,
  proof-stat strips, portfolios, filter chips, search, cart, and the mortgage /
  finance calculators. Driven by `src/data/industryConfig.ts`.
- **Native Platform screen** — `src/app/platform.tsx` (reached from
  Account → More → "Industry systems").
- Verified in the Expo web preview across every archetype (service, stat-strip,
  cart-catalog, calculator-catalog, image-rooms, showcase), light + dark.
- Typecheck: `npx tsc --noEmit -p tsconfig.json` (clean; no `typecheck` script).

---

## ⏳ Remaining before go-live (owner actions)

1. **Run the bundled DB migrations.** Apply
   `supabase/migrations/scripts/sql/apply_all_migrations.sql` (12 additive,
   nullable-column migrations) to the Supabase project. Until then, real
   businesses in the new verticals fall back to generic fields; demo spotlights
   already work because they're client-side sample data.

2. **Refresh the Anthropic API key** for the AI concierge / chatbot edge
   function (the previous key needs rotating).

3. **Deploy the web app** (Vercel) — `npm run build`, ship. Security headers,
   SPA redirects and edge-function CORS are already configured.

4. **Mobile store builds (EAS).** From `nowopen-mobile`:
   - `eas build --platform android --profile preview` → APK for on-device testing.
   - `eas build --platform ios --profile preview` (needs an Apple Developer acct).
   - App identifier is `africa.nowopen.app`.

5. **On-device mobile QA.** The Expo web preview matches closely, but do a final
   pass on a real device (Expo Go or an EAS dev build) — especially camera,
   WebRTC live, push notifications and Paystack WebView checkout, which the web
   preview can't exercise.

---

## 📲 Social publishing (real OAuth) — go-live setup

The Studio's **Schedule & Publish** posts for real to Instagram, Facebook,
LinkedIn, X and TikTok via two edge functions (`social-auth`, `social-publish`).
Until credentials are configured, every channel falls back to the on-device
simulation (posts are marked *Published (simulated)* and nothing is sent). To
switch a channel on:

1. **Apply the migration** — run `20240815000000_social_publish.sql` (or the
   updated `scripts/sql/apply_all_migrations.sql`) against the Supabase project.

2. **Register the developer apps** (each has approval requirements):
   - **Meta** (Instagram + Facebook share ONE app): enable *Instagram Graph API*
     + *Instagram Content Publishing*, and add the app as an admin of each
     Facebook page that should post.
   - **LinkedIn**: scopes `r_liteprofile r_emailaddress w_member_social` (2FA).
   - **X**: OAuth 2.0 with PKCE (`S256`) — requires the (paid) write tier.
   - **TikTok**: *Login with TikTok* + *Content Publishing* (`video.publish`).

3. **Set these env vars** in the Supabase project (Settings → Edge Functions):
   `META_APP_ID`, `META_APP_SECRET`, `LINKEDIN_CLIENT_ID`,
   `LINKEDIN_CLIENT_SECRET`, `X_CLIENT_ID`, `X_CLIENT_SECRET`,
   `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `APP_BASE_URL` (the frontend
   origin, e.g. `https://nowopenafrica.com`). `SUPABASE_JWT_SECRET` must already
   be set (it signs the OAuth `state`).

4. **Register the redirect URI** in each app dashboard — it must be an exact
   match, one per provider:
   ```
   <SUPABASE_URL>/functions/v1/social-auth?action=callback&provider=instagram
   <SUPABASE_URL>/functions/v1/social-auth?action=callback&provider=facebook
   <SUPABASE_URL>/functions/v1/social-auth?action=callback&provider=linkedin
   <SUPABASE_URL>/functions/v1/social-auth?action=callback&provider=x
   <SUPABASE_URL>/functions/v1/social-auth?action=callback&provider=tiktok
   ```
   (For Meta, register the `instagram` and `facebook` variants; the same app
   handles both.)

5. **Deploy the functions**:
   ```
   supabase functions deploy social-auth
   supabase functions deploy social-publish
   ```

**Behaviour once live:** connecting a channel opens the platform's consent
popup; tokens are stored server-side (never in the browser). Publishing sends
text always, and images/videos by staging them to the public `social-media`
bucket first. Notes: TikTok accepts **video only** (image posts stay simulated);
X rejects images over ~4MB (single-request upload); Meta long-lived tokens are
auto-extended when a publish happens near expiry.

---

## Adding a new industry later (both apps)

**Web:** add sample data (`src/data/sampleXxx.ts` with a `XXX_SPOTLIGHTS`
record) + a component in `src/components/`, wire into `BusinessDetail.tsx`
(import, `SPOTLIGHTS` merge, `isXxx` detect, sample injection, render branch),
add the `categoryFeatures.ts` module, add dashboard fields in
`BusinessContentManager.tsx`, and add a `{id, blurb}` to `osShowcase.ts`.

**Mobile:** add the business record + services/products to
`src/data/spotlights.ts`, a config entry in `src/data/industryConfig.ts`, the
`categoryFeatures.ts` module, and a `{id, blurb}` to the mobile `osShowcase.ts`.
No new screen needed — `IndustrySection`/`CatalogSection` render from the config.
When adding an icon to a config action/quick-tile, **remember to import it** from
`lucide-react-native` (tsc won't catch a missing icon used only in config data).
