/**
 * A template's content hash: what a review is pinned to (spec §9.3).
 *
 * Sorted-key JSON, so the hash depends on what the template says and not on
 * the order its fields were written in, then FNV-1a 64-bit over the UTF-8
 * bytes, as 16 lowercase hex characters. Not cryptographic: it only has to
 * notice an edit, and editing a template is meant to make its review stale.
 */
import type { DesignTemplate } from '../../designTemplates';

/** JSON with object keys sorted at every depth. `undefined` fields are dropped, as JSON does. */
export function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map((v) => (v === undefined ? 'null' : stableJson(v))).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined && typeof v !== 'function')
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(',')}}`;
}

const OFFSET = 0xcbf29ce484222325n;
const PRIME = 0x100000001b3n;
const MASK = 0xffffffffffffffffn;

/** FNV-1a 64-bit of a string's UTF-8 bytes, as 16 hex characters. */
export function fnv1a64(text: string): string {
  let h = OFFSET;
  for (const byte of new TextEncoder().encode(text)) {
    h ^= BigInt(byte);
    h = (h * PRIME) & MASK;
  }
  return h.toString(16).padStart(16, '0');
}

export const contentHash = (tpl: DesignTemplate): string => fnv1a64(stableJson(tpl));
