import { useEffect, useState } from 'react';

import {
  codeEntries, fetchCatalogue, templatesOf,
  type CatalogueEntry, type CatalogueRead,
} from '../lib/create/templateCatalogue';
import { type DesignTemplate } from '../lib/designTemplates';

/**
 * The design catalogue, code templates first and uploaded ones as they land.
 *
 * ── WHY IT NEVER RETURNS A LOADING STATE ─────────────────────────────────
 *
 * The 66 code templates are already in the bundle. Making the gallery wait
 * on a network call to show something it is holding would be slower than
 * what it replaces, and a failed call would leave the shop window empty.
 *
 * So the first render is the full code catalogue, synchronously, and the
 * uploaded half is appended when it arrives. `ready` says whether the second
 * half has been attempted — for the rare caller that genuinely needs to know
 * it has the complete list, such as a count that is about to be printed.
 *
 * Cached in module scope: every Create surface asks the same question, the
 * answer changes only when a staff member publishes something, and the
 * manager drops the cache when they do.
 */
let cache: CatalogueRead | null = null;
let inflight: Promise<CatalogueRead> | null = null;

async function load(): Promise<CatalogueRead> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      cache = await fetchCatalogue();
    } catch {
      /*
       * supabase-js resolves rather than throws, so this is reached only by
       * something below it. Still never leaves the caller with nothing.
       */
      cache = {
        entries: codeEntries(),
        uploadedAvailable: false,
        reason: 'We could not load uploaded templates just now.',
        rejected: [],
      };
    } finally {
      inflight = null;
    }
    return cache!;
  })();
  return inflight;
}

/** Drop the cache so the next read hits the table. Used after publishing. */
export function invalidateCatalogue(): void {
  cache = null;
}

export function useDesignCatalogue(): {
  entries: CatalogueEntry[];
  templates: DesignTemplate[];
  /** True once the uploaded half has been attempted — not "has rows". */
  ready: boolean;
  /** Set when the uploaded half could not be read. The list is short, say so. */
  incomplete: string | null;
} {
  const [read, setRead] = useState<CatalogueRead | null>(() => cache);

  useEffect(() => {
    let cancelled = false;
    void load().then((r) => { if (!cancelled) setRead(r); });
    return () => { cancelled = true; };
  }, []);

  const entries = read?.entries ?? codeEntries();
  return {
    entries,
    templates: read ? templatesOf(read) : entries.map((e) => e.template),
    ready: read !== null,
    incomplete: read && !read.uploadedAvailable ? (read.reason ?? 'Uploaded templates are unavailable.') : null,
  };
}
