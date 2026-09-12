import { useEffect, useRef, useState } from 'react';
import type { ImgHTMLAttributes, SyntheticEvent } from 'react';
import { Image as ImageIcon } from 'lucide-react';

type SmartImgProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'onError'> & {
  /** May be empty/undefined — a missing picture shows a placeholder, never a broken glyph. */
  src?: string | null;
  /** Optional second source tried once after the primary fails (poster → clip, logo → cover). */
  fallback?: string | null;
  /** Extra classes for the placeholder block, e.g. a brand tint. */
  placeholderClassName?: string;
  /** Fires only when every source has failed; the placeholder is already showing. */
  onError?: (e: SyntheticEvent<HTMLImageElement>) => void;
};

/**
 * An `<img>` that never draws the browser's broken-image box, anywhere on the
 * site, whatever a remote host does later.
 *
 * A picture can die after it was stored: a Pexels link goes stale, an operator's
 * CDN starts blocking hotlinks, a Supabase object gets deleted. A broken image
 * icon in a cover photo reads as "this page failed", which is exactly the wrong
 * signal for a listing that is otherwise fine. So:
 *
 *  - no `src` (empty or null) → a styled placeholder fills the same box;
 *  - load error with a `fallback` → swap to it exactly once (posters already
 *    try their clip's still when the poster 404s);
 *  - load error with nothing left to try → placeholder, and the caller's own
 *    `onError` still fires so nothing that relied on it silently stops.
 */
export default function SmartImg({
  src,
  fallback,
  onError,
  loading = 'lazy',
  decoding = 'async',
  alt = '',
  className,
  placeholderClassName = '',
  onClick,
  ...rest
}: SmartImgProps) {
  const [candidate, setCandidate] = useState<string | null>(src ?? null);
  const [broken, setBroken] = useState(false);
  const switched = useRef(false);

  // The source often changes in place (a re-upload, a pasted URL being edited)
  // without the element remounting — reset so the new URL gets a real chance.
  useEffect(() => {
    setCandidate(src ?? null);
    setBroken(false);
    switched.current = false;
  }, [src]);

  if (!candidate || broken) {
    return (
      <div
        aria-hidden="true"
        onClick={onClick}
        className={`relative overflow-hidden bg-gray-100 dark:bg-gray-800 ${className ?? ''} ${placeholderClassName}`}
      >
        <ImageIcon
          className="absolute inset-0 m-auto h-1/4 w-1/4 min-w-[12px] min-h-[12px] text-gray-300 dark:text-gray-600"
          strokeWidth={1.5}
        />
      </div>
    );
  }

  return (
    <img
      {...rest}
      src={candidate}
      alt={alt}
      loading={loading}
      decoding={decoding}
      className={className}
      onClick={onClick}
      onError={(e) => {
        if (!switched.current && fallback) {
          switched.current = true;
          setCandidate(fallback);
          return;
        }
        switched.current = true;
        setBroken(true);
        onError?.(e);
      }}
    />
  );
}