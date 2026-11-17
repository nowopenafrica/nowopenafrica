/** Types for webcopy.mjs, so a test in src/ can import it under `strict`. */
export const WEB_COPY_KINDS: string[];
export function needsWebCopy(kind: string, mime: string): boolean;
export function webCopyPath(originalSha256: string): string;
export function makeWebCopy(bytes: Uint8Array): { body: Uint8Array; width: number; height: number };
