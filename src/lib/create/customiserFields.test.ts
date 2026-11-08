import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { CUSTOMISER_TEXT_FIELDS, isCustomiserTextRole } from './customiserFields';

/*
 * The customiser keeps its field labels inline (createGallery.test.ts reads
 * them from the source too), so this pins the constant C7 reads to what the
 * component really renders and routes. If a field is added or removed there,
 * this fails until the constant agrees.
 */
const customiser = readFileSync('src/components/create/TemplateCustomiser.tsx', 'utf8');

describe('CUSTOMISER_TEXT_FIELDS', () => {
  it('names a field the customiser renders, for every role', () => {
    for (const [role, label] of Object.entries(CUSTOMISER_TEXT_FIELDS)) {
      expect(customiser, role).toContain(`aria-label="${label}"`);
    }
  });

  it('routes an in-place edit for every role, and for no other', () => {
    const routed = [...customiser.matchAll(/role === '(\w+)'\) set\w+\(value\)/g)].map((m) => m[1]);
    expect(routed.sort()).toEqual(Object.keys(CUSTOMISER_TEXT_FIELDS).sort());
  });

  it('leaves meta out: the customiser fixes it and offers no field', () => {
    expect(customiser).toMatch(/meta: 'yourbusiness\.nowopenafrica\.com'/);
    expect(isCustomiserTextRole('meta')).toBe(false);
    expect(isCustomiserTextRole('headline')).toBe(true);
  });
});
