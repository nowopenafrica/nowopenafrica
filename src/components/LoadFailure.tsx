import { WifiOff, RefreshCw } from 'lucide-react';

/**
 * "We could not load this" — as distinct from "there is nothing here".
 *
 * THE DEFECT THIS FIXES
 *
 * Every discovery surface swallowed its fetch failures:
 *
 *   })().catch(() => { if (!cancelled) setLoading(false); });
 *
 * `loading` goes false, the list stays empty, and the visitor is shown the
 * empty state. So a dropped connection was indistinguishable from an empty
 * directory — and the page confidently said "no businesses listed yet" to
 * somebody whose signal had simply gone.
 *
 * That is bad anywhere. Here it is worse for two compounding reasons. The
 * audience is on mobile connections that drop routinely, and the directory
 * genuinely IS nearly empty — so the failure mode reinforces exactly the
 * wrong conclusion, which is that the platform is dead rather than that the
 * network blinked. A customer who sees that once does not come back to check.
 *
 * WHY A COMPONENT RATHER THAN A TOAST
 *
 * A toast disappears and leaves the misleading empty state behind. This
 * replaces the empty state, so what is on screen matches what happened, and
 * it carries the retry — which matters most on precisely the connections that
 * caused it.
 */
export default function LoadFailure({
  /** What could not be loaded, lower case: "businesses", "offers". */
  what,
  onRetry,
  /** Set when the browser reports itself offline, which changes the advice. */
  offline = typeof navigator !== 'undefined' && navigator.onLine === false,
}: {
  what: string;
  onRetry: () => void;
  offline?: boolean;
}) {
  return (
    <div
      role="alert"
      className="rounded-2xl border border-dashed border-amber-300 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-900/15 p-6 sm:p-8 text-center"
    >
      <WifiOff size={30} className="mx-auto text-amber-600 dark:text-amber-400" />
      <h3 className="mt-3 text-lg font-bold text-gray-900 dark:text-white">
        We could not load {what}
      </h3>
      {/* Says which of the two things happened. The whole point is that this is
          NOT "there is nothing here" — so the sentence says so outright rather
          than embedding the noun, which read badly for labels like "what is
          open now" ("not an empty what is open now list"). */}
      <p className="mt-1.5 text-sm text-gray-700 dark:text-gray-300 max-w-md mx-auto">
        {offline
          ? 'Your device looks offline. Reconnect and try again — nothing is lost.'
          : 'This is a connection problem — on our side or yours. It does not mean there is nothing here. Try again.'}
      </p>
      <button
        onClick={onRetry}
        className="mt-5 inline-flex items-center gap-2 min-h-[44px] px-5 rounded-xl bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-bold hover:opacity-90 transition"
      >
        <RefreshCw size={16} /> Try again
      </button>
    </div>
  );
}
