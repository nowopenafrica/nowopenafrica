/**
 * The words a template sets, slot by slot and page by page.
 *
 * Shared by the quality checks (C3, C5, C7, C9) and by fontCoverage.test.ts,
 * so "what does this slot draw" has one answer.
 */
import { DESIGN_TEMPLATES, type DesignTemplate, type SlotSpec } from '../../../designTemplates';
import { sampleFor } from '../../../create/sampleCopy';
import type { TemplateContent } from '../../../../components/studio/TemplateSurface';

export interface Page { name: string; slots: SlotSpec[] }

/** The front, then every further side or page. */
export function pagesOf(tpl: DesignTemplate): Page[] {
  return [{ name: 'front', slots: tpl.slots }, ...(tpl.extraPages ?? [])];
}

/** The copy a check measures: the caller's, else the demo copy the gallery shows. */
export const copyFor = (tpl: DesignTemplate, copy?: TemplateContent): TemplateContent =>
  copy ?? sampleFor(tpl);

/** Every string a slot draws, with the case transform applied. */
export function slotText(slot: SlotSpec, content: TemplateContent): string[] {
  const out: string[] = [];
  switch (slot.role) {
    case 'services': out.push(...(content.services ?? [])); break;
    case 'contact': out.push(...(content.contact ?? [])); break;
    case 'price':
      for (const r of content.price ?? []) out.push(r.label, r.price, r.was ?? '');
      break;
    case 'stats':
      // Stat labels are always set in capitals.
      for (const s of content.stats ?? []) out.push(s.value, s.label.toUpperCase());
      break;
    case 'qr': break;
    default: out.push(String(content[slot.role as keyof TemplateContent] ?? ''));
  }
  return out.filter(Boolean).map((t) => (slot.upper ? t.toUpperCase() : t));
}

/**
 * The longest name the demo copy sets: the longest brand or headline of any
 * template's sample. The "long real-world name" C5 and editability put into
 * both name-bearing slots.
 */
export const LONGEST_SAMPLE_NAME = DESIGN_TEMPLATES
  .flatMap((t) => { const c = sampleFor(t); return [c.brand ?? '', c.headline ?? '']; })
  .reduce((a, b) => (b.length > a.length ? b : a), '');

/* ── C9: placeholder and nonsense copy ─────────────────────────────────── */

const PLACEHOLDERS: [RegExp, string][] = [
  [/lorem ipsum|dolor sit amet/i, 'lorem ipsum'],
  [/your headline here/i, '"Your headline here"'],
  [/\b[\w.+-]+@example\.(com|org|net)\b/i, 'an example.com email'],
  [/\b123[-\s.]?456\b/, 'a 123-456 number'],
];

/** Runs of digits that read as a phone number: 7+ digits with spaces, dots, dashes or brackets. */
const PHONE = /\+?\d[\d\s().-]{5,}\d/g;

/**
 * A phone number nobody could dial: all one digit, or nothing but zeros after
 * the first three digits (080 0000 0000, 0800 000 0000, 0803 000 0000).
 */
function fakePhone(run: string): boolean {
  const digits = run.replace(/\D/g, '');
  if (digits.length < 7) return false;
  if (/^(\d)\1+$/.test(digits)) return true;
  return /^0*$/.test(digits.slice(3)) || /^\d{1,4}0{7,}$/.test(digits);
}

/** Why a string is placeholder or nonsense copy, or [] when it is fine. */
export function placeholderProblems(text: string): string[] {
  const out: string[] = [];
  for (const [re, what] of PLACEHOLDERS) if (re.test(text)) out.push(what);
  for (const run of text.match(PHONE) ?? []) {
    if (fakePhone(run)) out.push(`a fake phone number "${run.trim()}"`);
  }
  return out;
}
