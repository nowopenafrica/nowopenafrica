/**
 * A signed-out visitor's media plan, held in the browser.
 *
 * Lines are real items only (an advert placement or a revenue product); no
 * prices are stored here, they are resolved from the live catalogue when the
 * plan is shown. Storage can be blocked or full, so every access is guarded and
 * an in-memory copy keeps the plan alive for the visit.
 */

export type LocalLine =
  | { kind: 'placement'; advertId: string; days: number | null }
  | { kind: 'product'; productId: string };

export const LOCAL_PLAN_KEY = 'nowopen.promote.plan.v1';
export const PLAN_CHANGED_EVENT = 'nowopen:plan-changed';

const STORE_VERSION = 1;

/** Copy of the last written plan. Authoritative while `memoryDirty` is set. */
let memory: LocalLine[] = [];
/** True after a failed storage write: storage is stale, so reads use memory. */
let memoryDirty = false;

const lineKey = (l: LocalLine): string =>
  l.kind === 'placement' ? `placement:${l.advertId}` : `product:${l.productId}`;

const lineItemId = (l: LocalLine): string =>
  l.kind === 'placement' ? l.advertId : l.productId;

function nonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

function parseLine(raw: unknown): LocalLine | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.kind === 'placement') {
    if (!nonEmptyString(r.advertId)) return null;
    const days = r.days === undefined ? null : r.days;
    if (days !== null && !(typeof days === 'number' && Number.isInteger(days) && days > 0)) {
      return null;
    }
    return { kind: 'placement', advertId: r.advertId, days };
  }
  if (r.kind === 'product') {
    if (!nonEmptyString(r.productId)) return null;
    return { kind: 'product', productId: r.productId };
  }
  return null;
}

function dedupe(lines: LocalLine[]): LocalLine[] {
  const seen = new Set<string>();
  const out: LocalLine[] = [];
  for (const l of lines) {
    const k = lineKey(l);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(l);
  }
  return out;
}

export function readLocalPlan(): LocalLine[] {
  if (typeof window === 'undefined' || memoryDirty) return [...memory];
  let text: string | null;
  try {
    text = window.localStorage.getItem(LOCAL_PLAN_KEY);
  } catch {
    return [...memory];
  }
  if (text === null) return [];
  try {
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object') return [];
    const p = parsed as { v?: unknown; lines?: unknown };
    if (p.v !== STORE_VERSION || !Array.isArray(p.lines)) return [];
    const lines: LocalLine[] = [];
    for (const raw of p.lines) {
      const l = parseLine(raw);
      if (l) lines.push(l);
    }
    return dedupe(lines);
  } catch {
    return [];
  }
}

export function notifyPlanChanged(): void {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent(PLAN_CHANGED_EVENT));
  } catch {
    /* a listener threw; the write already happened */
  }
}

function write(lines: LocalLine[]): void {
  memory = [...lines];
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(
        LOCAL_PLAN_KEY,
        JSON.stringify({ v: STORE_VERSION, lines }),
      );
      memoryDirty = false;
    } catch {
      /* blocked or full: the in-memory copy carries the visit */
      memoryDirty = true;
    }
  }
  notifyPlanChanged();
}

export function addLocalLines(lines: LocalLine[]): { added: number; skipped: number } {
  const current = readLocalPlan();
  const have = new Set(current.map(lineKey));
  const next = [...current];
  let added = 0;
  let skipped = 0;
  for (const raw of lines) {
    const l = parseLine(raw);
    if (!l) continue;
    const k = lineKey(l);
    if (have.has(k)) {
      skipped += 1;
      continue;
    }
    have.add(k);
    next.push(l);
    added += 1;
  }
  write(next);
  return { added, skipped };
}

export function removeLocalLine(itemId: string): void {
  write(readLocalPlan().filter((l) => lineItemId(l) !== itemId));
}

export function setLocalDays(advertId: string, days: number | null): void {
  if (days !== null && !(Number.isInteger(days) && days > 0)) return;
  write(
    readLocalPlan().map((l) =>
      l.kind === 'placement' && l.advertId === advertId ? { ...l, days } : l,
    ),
  );
}

export function replaceLocalPlan(lines: LocalLine[]): void {
  const clean: LocalLine[] = [];
  for (const raw of lines) {
    const l = parseLine(raw);
    if (l) clean.push(l);
  }
  write(dedupe(clean));
}

export function clearLocalPlan(): void {
  write([]);
}

export function onPlanChanged(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const onStorage = (e: StorageEvent) => {
    if (e.key === LOCAL_PLAN_KEY) cb();
  };
  window.addEventListener(PLAN_CHANGED_EVENT, cb);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(PLAN_CHANGED_EVENT, cb);
    window.removeEventListener('storage', onStorage);
  };
}
