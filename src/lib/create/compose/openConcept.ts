// Opens a concept in the Studio editor (decision D6).
//
// The editor already opens any saved project at /media/studio/:id, and saves a
// new one with exactly this insert (pages/StudioEditor.tsx, `save`). So a
// concept becomes editable by being saved as the customer's own project and
// then opened by its address. Nothing in the editor changes, which matters:
// other work edits that file, and a second way in would be a second thing to
// keep right.
//
// It writes one row, as the signed-in customer, under the table's own row
// security. It is a deliberate act (a button), never a side effect of looking.

import { supabase } from '../../supabase';
import { readDocument, type DesignDocument } from '../../studio/designDocument';
import { fullSizeUrl } from '../../design/assetManifest';

export type OpenResult = { ok: true; path: string } | { ok: false; reason: string };

export async function saveConceptAsProject(doc: DesignDocument, userId: string): Promise<OpenResult> {
  doc = withOriginals(doc);
  /* The editor refuses a document it cannot read. Find that out here, before a row exists. */
  const read = readDocument(JSON.parse(JSON.stringify(doc)));
  if (!read.ok) return { ok: false, reason: read.reason };
  /* supabase-js reports failure in the result, not by throwing: check it. */
  const { data, error } = await supabase.from('design_projects')
    .insert({ user_id: userId, title: doc.title, document: doc, source_template_key: null })
    .select('id').single();
  if (error || !data) return { ok: false, reason: error?.message ?? 'The design could not be saved.' };
  return { ok: true, path: `/media/studio/${(data as { id: string }).id}` };
}

/**
 * Galleries draw library photographs from their web-size copies. The customer's
 * own project gets the originals, so what they edit, export and print is full
 * resolution. A copy, never the gallery's document itself.
 */
export function withOriginals(doc: DesignDocument): DesignDocument {
  return {
    ...doc,
    pages: doc.pages.map((p) => ({
      ...p,
      backgroundMedia: p.backgroundMedia?.assetId
        ? { ...p.backgroundMedia, assetId: fullSizeUrl(p.backgroundMedia.assetId) }
        : p.backgroundMedia,
      objects: p.objects.map((o) => (o.type === 'image' ? { ...o, assetId: fullSizeUrl(o.assetId) } : o)),
    })),
  };
}
