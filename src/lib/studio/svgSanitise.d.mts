/** Types for svgSanitise.mjs, so TypeScript in src/ can import it under `strict`. */
export const DANGEROUS_TAGS: string[];
export function isUnsafeAttribute(name: string, value: string): boolean;
export type LibrarySvgResult =
  | { ok: true; svg: string }
  | { ok: false; reason: string };
export function validateLibrarySvg(text: string): LibrarySvgResult;
