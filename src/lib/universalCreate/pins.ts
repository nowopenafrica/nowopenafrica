/**
 * Which business tools somebody keeps in their Create menu.
 *
 * ── WHY THIS IS NOT localStorage ─────────────────────────────────────────
 *
 * These are shortcuts set up once and relied on afterwards. A caterer pins
 * receipts and invoices; a photographer pins design and catalogues. In
 * localStorage that lives on one device — the phone it was set up on, not the
 * laptop the invoicing happens on, and gone when site data is cleared.
 *
 * The rule this codebase follows is that localStorage holds per-viewer
 * conveniences (a remembered filter, a collapsed section). A deliberate
 * configuration somebody would be annoyed to redo belongs in the database.
 */

import { supabase } from '../supabase';
import { DEFAULT_PINNED, TOOLS_BY_KEY, type CreateTool } from './intents';

/**
 * The caller's pinned tools, in menu order.
 *
 * Falls back to the default set for anyone who has pinned nothing — an empty
 * menu would make the feature look broken to every new owner, and the
 * defaults are the four most universally useful tools.
 *
 * Returns the defaults on error too: this is a shortcut menu, and failing to
 * read a preference must not leave somebody with no way to reach their tools.
 */
export async function fetchPinnedTools(): Promise<CreateTool[]> {
  const { data, error } = await supabase
    .from('create_tool_pins')
    .select('tool_key,position')
    .order('position');

  if (error) return resolve(DEFAULT_PINNED);

  const keys = ((data ?? []) as Array<{ tool_key: string }>).map((r) => r.tool_key);
  /*
   * No rows means "never chosen", not "chose nothing".
   *
   * Somebody who deliberately empties their menu gets the defaults back next
   * time, which is a real limitation of storing only the pins — and the right
   * trade: an empty Create menu reads as a bug, and the cost of being wrong
   * is one unpin, while the cost the other way is a feature that looks dead.
   */
  if (keys.length === 0) return resolve(DEFAULT_PINNED);
  return resolve(keys);
}

/**
 * Save the whole menu in one call.
 *
 * Whole-list rather than pin/unpin per tool: the order is the array order,
 * which is what the UI already knows, and the menu is never briefly
 * half-saved.
 */
export async function savePinnedTools(keys: string[]): Promise<{ ok: boolean; message?: string }> {
  // Only keys the catalogue knows. A stale key from an older deploy would
  // otherwise be stored forever and resolve to nothing on every read.
  const known = keys.filter((k) => k in TOOLS_BY_KEY);
  const { error } = await supabase.rpc('set_create_tool_pins', { p_keys: known });
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

/** Keys → tools, dropping anything the catalogue no longer has. */
function resolve(keys: string[]): CreateTool[] {
  return keys.map((k) => TOOLS_BY_KEY[k]).filter(Boolean);
}
