/** Types for intake-lib.mjs, so a test in src/ can import it under `strict`. */
export const KINDS: string[];
export const ALLOWED_INDUSTRIES: string[];
export const MIME_BY_EXT: Record<string, string>;
export const MAX_BYTES: number;
export const CSV_COLUMNS: string[];

export function sha256(buf: Uint8Array): string;
export function extOf(name: string): string;
export function seededLicenceKeys(sql: string): string[];
export function parseCsv(text: string): { header: string[]; rows: Record<string, string>[] };

export interface IntakeRow {
  file: string; ext: string; mime: string; kind: string; title: string;
  description: string | null; tags: string[]; subjects: string[]; industries: string[]; regions: string[];
  source_name: string; source_url: string | null; source_asset_id: string | null;
  creator_name: string | null; creator_url: string | null; licence_key: string;
  evidence_file: string; attribution_text: string | null; restrictions: string | null;
  contains_people: boolean; contains_brands: boolean; release_on_file: boolean;
  retrieved_at: string | null;
}
export type ParseRowResult = { ok: true; value: IntakeRow } | { ok: false; reason: string };
export function parseRow(row: Record<string, string>, licenceKeys: string[]): ParseRowResult;

export function dominantColours(rgba: Uint8Array | Uint8ClampedArray | number[], n?: number): string[];
export interface ImageInfo { width: number; height: number; colours: string[] }
export function imageInfo(buf: Buffer, mime: string): ImageInfo | null;
export function svgInfo(svgText: string): { width: number | null; height: number | null; colours: string[] };
export function orientationOf(width: number | null, height: number | null): 'landscape' | 'portrait' | 'square' | null;

export type LibrarySvgResult = { ok: true; svg: string } | { ok: false; reason: string };
export function validateLibrarySvg(text: string): LibrarySvgResult;
export function classifyUploadResponse(status: number, bodyText: string): 'uploaded' | 'exists' | 'failed';

export interface Measured {
  sha256: string; ext: string; mime: string; bytes: number;
  width: number | null; height: number | null; colours: string[];
  storagePath: string; evidencePath: string; thumbPath?: string | null; sanitisedAt: string | null; now: string;
}
export function toInsertRow(v: IntakeRow, m: Measured): Record<string, unknown>;
