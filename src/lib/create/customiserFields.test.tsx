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

  it('offers meta as "Small print" and feeds the surface from it, not a fixed address (Ruling Z)', () => {
    expect(customiser).not.toMatch(/meta: 'yourbusiness\.nowopenafrica\.com'/);
    expect(customiser).toMatch(/^\s*meta,\r?$/m);
    expect(CUSTOMISER_TEXT_FIELDS.meta).toBe('Small print');
    expect(isCustomiserTextRole('meta')).toBe(true);
    expect(isCustomiserTextRole('headline')).toBe(true);
    expect(isCustomiserTextRole('services')).toBe(false);
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

/**
 * For each role, a template whose front shows it. One template rarely carries
 * all six (meta joined in Ruling Z), so each field is typed into on a design
 * that draws it.
 */
const showing = (role: (typeof ROLES)[number]) => DESIGN_TEMPLATES.find((t) => t.slots.some((s) => s.role === role));

describe('CUSTOMISER_TEXT_FIELDS, rendered', () => {
  it.each(ROLES)('changes the drawn design when the %s field is typed into', (role) => {
    const tpl = showing(role);
    expect(tpl, `a template whose front shows ${role}`).toBeDefined();
    const { container } = render(
      <MemoryRouter>
        <TemplateCustomiser template={tpl!} initialStyle="signature" initialBrand="#2563eb" onClose={() => {}} />
      </MemoryRouter>,
    );
    const drawn = () => (container.querySelector('[data-export-width]')?.textContent ?? '').toLowerCase();
    expect(drawn()).not.toBe('');
    const typed = `Zq${role}word`;
    expect(drawn(), role).not.toContain(typed.toLowerCase());
    fireEvent.change(screen.getByLabelText(CUSTOMISER_TEXT_FIELDS[role]), { target: { value: typed } });
    // Compared case-blind: a slot may set its words in capitals.
    expect(drawn(), role).toContain(typed.toLowerCase());
  });

  it('covers the Small print field', () => {
    expect(ROLES).toContain('meta');
  });
});
