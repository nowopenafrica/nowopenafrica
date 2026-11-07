/**
 * Ambient declarations so `tsc` can check Deno edge-function code.
 *
 * These files run on Deno, which resolves `npm:` specifiers and provides the
 * `Deno` global. tsc knows neither, so without this every shared module drowned
 * in environmental errors and the real type bugs were invisible among them.
 *
 * Only the surface these functions actually use is declared. A wider `any`
 * would hide the mistakes this whole file exists to expose — see
 * tsconfig.edge.json for the one that shipped.
 *
 * Deno itself ignores a .d.ts that nothing imports, so this changes nothing at
 * runtime.
 */

declare namespace Deno {
  /** The only Deno API these functions touch. */
  const env: {
    get(key: string): string | undefined;
    set(key: string, value: string): void;
    has(key: string): boolean;
  };
}

declare module 'npm:@supabase/supabase-js@2' {
  export * from '@supabase/supabase-js';
}
