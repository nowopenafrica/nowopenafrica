import { lazy, type ComponentType } from 'react';

/**
 * `React.lazy`, but it survives a deploy.
 *
 * THE BUG THIS FIXES, measured in production telemetry:
 *
 *   react-boundary  /business/lagos-prime-realty
 *     Failed to fetch dynamically imported module:
 *     https://www.nowopenafrica.com/assets/BusinessDetail-D6o_2ziK.js
 *
 *   react-boundary  /yemzoarts
 *     'text/html' is not a valid JavaScript MIME type.
 *
 * Both are one failure. A browser holds an `index.html` from before a deploy,
 * navigates to a lazy route, and asks for a content-hashed chunk that the new
 * build no longer contains. The SPA fallback answers with `index.html`, which
 * the browser then refuses as JavaScript — hence the second message. The user
 * gets an error screen on a site that is working perfectly for everyone who
 * loaded it after the deploy.
 *
 * On a project that deploys several times a day this is not an edge case, and
 * the only mitigation was a manual "reload" button in ErrorBoundary — after
 * the page had already broken.
 *
 * THE STRATEGY, in order:
 *
 *  1. Retry once after a short pause. A genuine network blip — common on the
 *     mobile networks this audience uses — resolves here without a reload,
 *     which is much cheaper than throwing the page away.
 *  2. If it fails again, reload the page ONCE. That fetches a fresh
 *     `index.html`, so the chunk names line up and the navigation succeeds.
 *  3. Never reload twice. A reload loop is far worse than an error screen, so
 *     the attempt is recorded in `sessionStorage` and never repeated.
 *  4. Never reload while offline. There is nothing to fetch, so a reload would
 *     replace a recoverable error with a blank page. Let the boundary show.
 */

const RELOAD_KEY = 'nowopen:chunk-reload';
const RETRY_DELAY_MS = 350;

/** Exported for tests: has a recovery reload already been spent this session? */
export function reloadAlreadyAttempted(): boolean {
  try {
    return sessionStorage.getItem(RELOAD_KEY) !== null;
  } catch {
    // Private mode, or storage disabled. Treat as "already used" so we never
    // risk a loop we cannot detect.
    return true;
  }
}

function markReloadAttempted(): void {
  try {
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    /* storage unavailable — the guard above already fails closed */
  }
}

/**
 * Is this the failure signature of a chunk that no longer exists?
 *
 * Kept narrow on purpose. A component that throws while *evaluating* is a real
 * bug and must reach the error boundary, not be papered over with a reload.
 */
export function isStaleChunkError(err: unknown): boolean {
  const message = String((err as { message?: string } | undefined)?.message ?? err ?? '');
  return (
    /failed to fetch dynamically imported module/i.test(message) ||
    /error loading dynamically imported module/i.test(message) ||
    /importing a module script failed/i.test(message) ||
    /is not a valid javascript mime type/i.test(message) ||
    /failed to import/i.test(message)
  );
}

const isOffline = (): boolean =>
  typeof navigator !== 'undefined' && navigator.onLine === false;

/**
 * Wrap a dynamic import so a stale chunk recovers instead of breaking the page.
 *
 * Drop-in for `lazy(() => import('./Page'))` → `lazyRoute(() => import('./Page'))`.
 */
export function lazyRoute<T extends ComponentType<unknown>>(
  load: () => Promise<{ default: T }>,
) {
  return lazy(() =>
    load().catch(async (first) => {
      if (!isStaleChunkError(first)) throw first;

      // 1. One quiet retry, for a network blip rather than a deploy.
      try {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
        return await load();
      } catch (second) {
        // 2. Still failing: the build almost certainly moved under us.
        if (!isOffline() && !reloadAlreadyAttempted() && typeof location !== 'undefined') {
          markReloadAttempted();
          location.reload();
          // Hang until the reload takes effect, so React never renders an
          // error screen we are about to discard anyway.
          await new Promise(() => {});
        }
        throw second;
      }
    }),
  );
}

export default lazyRoute;
