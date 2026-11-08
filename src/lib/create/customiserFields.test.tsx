import { readFileSync } from 'node:fs';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import TemplateCustomiser from '../../components/create/TemplateCustomiser';
import { DESIGN_TEMPLATES } from '../designTemplates';
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

/* ── Behaviour: typing into each field changes the design ─────────────── */

// jsdom lays nothing out, and the customiser draws nothing until it has a
// measured stage to fit the design into (as in lookCustomiser.test.tsx).
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 900 });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 700 });
});
afterEach(() => cleanup());

const ROLES = Object.keys(CUSTOMISER_TEXT_FIELDS) as (keyof typeof CUSTOMISER_TEXT_FIELDS)[];

/** A template whose front shows every role the customiser edits. */
const everyRole = DESIGN_TEMPLATES.find((t) => ROLES.every((r) => t.slots.some((s) => s.role === r)));

describe('CUSTOMISER_TEXT_FIELDS, rendered', () => {
  it('changes the drawn design when each field is typed into', () => {
    expect(everyRole, 'a template with all five roles').toBeDefined();
    const { container } = render(
      <MemoryRouter>
        <TemplateCustomiser template={everyRole!} initialStyle="signature" initialBrand="#2563eb" onClose={() => {}} />
      </MemoryRouter>,
    );
    const drawn = () => (container.querySelector('[data-export-width]')?.textContent ?? '').toLowerCase();
    expect(drawn()).not.toBe('');
    for (const role of ROLES) {
      const typed = `Zq${role}word`;
      expect(drawn(), role).not.toContain(typed.toLowerCase());
      fireEvent.change(screen.getByLabelText(CUSTOMISER_TEXT_FIELDS[role]), { target: { value: typed } });
      // Compared case-blind: a slot may set its words in capitals.
      expect(drawn(), role).toContain(typed.toLowerCase());
    }
  });
});
