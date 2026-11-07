/*
 * NowOpen Africa — service worker.
 *
 * ── WHY THIS EXISTS AT ALL ───────────────────────────────────────────────
 *
 * The manifest, the icons and the theme colour were already correct. What was
 * missing is this file, and without it Chrome never fires
 * `beforeinstallprompt` — so the site has been un-installable on Android the
 * whole time, for want of a service worker rather than for want of a manifest.
 *
 * ── WHAT IT CACHES, AND MUCH MORE IMPORTANTLY WHAT IT DOES NOT ───────────
 *
 * This application is a directory of real businesses behind a real login. A
 * careless service worker is the fastest way to serve one person's dashboard
 * to the next person on the same device, because a cache does not know who
 * was signed in when it stored something.
 *
 * So the rule here is narrow on purpose:
 *
 *   CACHED      Build output under /assets/ and a handful of static files.
 *               Every one of those is content-hashed by Vite, public, and
 *               identical for every visitor — there is no such thing as a
 *               personalised copy of a hashed JS chunk.
 *
 *   NOT CACHED  Everything else, and that is not an oversight:
 *                 - any cross-origin request, which is where Supabase lives,
 *                   so no API response, no session and no business data is
 *                   ever written to disk by this file;
 *                 - any method other than GET, so nothing that changes data;
 *                 - any request carrying an Authorization header or cookies
 *                   that would make the response specific to one person;
 *                 - the HTML document itself beyond a single offline shell.
 *
 * The practical consequence is the one that matters: signing out, switching
 * accounts, or handing the phone to somebody else cannot surface stale
 * private content, because no private content was ever stored.
 *
 * ── AND WHY IT DOES NOT PROMISE OFFLINE ──────────────────────────────────
 *
 * Nearly everything here needs the network: search, profiles, the dashboard,
 * Create, payments. Offering an "offline mode" would be a promise broken on
 * the first tap. What offline gets you is an honest page saying the
 * connection is gone — which is better than the browser's dinosaur, and is
 * all that is being claimed.
 */

/*
 * ── THIS HAS TO CHANGE EVERY BUILD, AND FOR A LONG TIME IT DID NOT ───────
 *
 * The comment here used to say the build bumped it. Nothing did: it was the
 * literal `nowopen-v1`, `public/` is copied verbatim by Vite, and `activate`
 * only deletes caches that do NOT start with VERSION — which was none of
 * them, ever.
 *
 * MEASURED on production 2026-10-27: 508 chunks from builds going back to
 * the day this worker shipped. A returning visitor ran old cached chunks
 * whose sibling imports no longer existed on the server, the SPA rewrite
 * answered those with index.html, and the browser refused an HTML "module".
 * The page was blank. It got worse with every deploy.
 *
 * `scripts/stamp-sw.mjs` replaces the placeholder at build time and fails
 * the build if it cannot find it. `npm run check:all` fails if this file
 * ever goes back to a hardcoded version.
 */
const VERSION = 'nowopen-__BUILD_ID__';
const ASSETS = `${VERSION}-assets`;
const SHELL = `${VERSION}-shell`;

/** The offline page, and the only HTML this worker ever stores. */
const OFFLINE_URL = '/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    await cache.add(new Request(OFFLINE_URL, { cache: 'reload' }));
    /*
     * Activate immediately. The alternative leaves the previous worker in
     * charge until every tab closes, which on a site people keep open is
     * effectively never — and that is how a deployment appears not to have
     * happened.
     */
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(
      names.filter((n) => !n.startsWith(VERSION)).map((n) => caches.delete(n)),
    );
    await self.clients.claim();
  })());
});

/** Static, public, content-hashed: safe to keep. */
function isCacheableAsset(url) {
  if (url.origin !== self.location.origin) return false;
  if (url.pathname.startsWith('/assets/')) return true;
  if (url.pathname.startsWith('/fonts/')) return true;
  return ['/icon.svg', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png', '/favicon.ico']
    .includes(url.pathname);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  /* Never anything but a plain GET. Nothing that mutates is our business. */
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  /*
   * Cross-origin is left entirely alone — Supabase, Paystack, Pexels and the
   * rest. Not intercepting is stronger than intercepting and choosing not to
   * cache: there is no code path that could get it wrong later.
   */
  if (url.origin !== self.location.origin) return;

  /*
   * A request the browser marks as carrying credentials is, by definition,
   * one whose response may differ per person.
   */
  if (request.credentials === 'include') return;

  if (isCacheableAsset(url)) {
    event.respondWith((async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      /*
       * Only a clean 200 from our own origin, and never an HTML answer.
       *
       * A missing /assets/ file does not 404 here — the SPA rewrite answers
       * it with index.html, 200. Caching that poisons the entry under a name
       * the browser will later demand a JavaScript module from, and the
       * failure then survives the deploy that would have fixed it.
       */
      const type = response.headers.get('content-type') ?? '';
      if (response.ok && response.type === 'basic' && !type.includes('text/html')) {
        const cache = await caches.open(ASSETS);
        void cache.put(request, response.clone());
      }
      return response;
    })());
    return;
  }

  /*
   * Navigations: always the network, falling back to the offline page.
   *
   * Network-FIRST, with no caching of the result. A single-page app's HTML
   * shell is the same for everyone, but the moment it is served from a cache
   * a user can land on a build older than their session and spend ten minutes
   * wondering why a fix did not arrive.
   */
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        return await fetch(request);
      } catch {
        const cache = await caches.open(SHELL);
        return (await cache.match(OFFLINE_URL)) ?? Response.error();
      }
    })());
  }
});

/*
 * Lets the page tell a waiting worker to take over, so an update can be
 * applied when the user asks rather than on a schedule they cannot see.
 */
self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') void self.skipWaiting();
});
