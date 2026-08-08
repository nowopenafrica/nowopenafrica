import { describe, it, expect } from 'vitest';
import {
  RELATIONSHIP_OPTIONS, RELATIONSHIP_LABELS, RELATIONSHIP_TYPES,
  RELATIONSHIP_JOURNEYS, journeyFor, stepsAwaitingSignature,
} from './relationships';

describe('relationships — relationship model', () => {
  it('covers every relationship from the People OS link', () => {
    expect(RELATIONSHIP_OPTIONS.map((o) => o.id)).toContain('employee');
    expect(RELATIONSHIP_OPTIONS.map((o) => o.id)).toContain('partner');
    expect(RELATIONSHIP_OPTIONS.map((o) => o.id)).toContain('volunteer');
    expect(RELATIONSHIP_OPTIONS.map((o) => o.id)).toContain('creative');
    expect(RELATIONSHIP_OPTIONS.map((o) => o.id)).toContain('investor');
    expect(RELATIONSHIP_OPTIONS.map((o) => o.id)).toContain('other');
  });

  it('labels every relationship type', () => {
    for (const t of RELATIONSHIP_TYPES) {
      expect(RELATIONSHIP_LABELS[t]).toBeTruthy();
    }
  });

  it('gives every relationship a non-empty journey', () => {
    for (const t of RELATIONSHIP_TYPES) {
      expect(journeyFor(t).length).toBeGreaterThan(0);
    }
  });

  it('falls back to the "other" journey for unknown types', () => {
    expect(journeyFor('other').length).toBeGreaterThan(0);
  });
});

describe('relationships — journeys', () => {
  it('gives an employee the full employment flow', () => {
    const steps = journeyFor('employee').map((s) => s.label);
    expect(steps).toContain('Personal information');
    expect(steps).toContain('NDA');
    expect(steps).toContain('IP & confidentiality');
    expect(steps).toContain('Digital signature');
    expect(steps).toContain('Orientation');
  });

  it('gives a volunteer a different, lighter flow', () => {
    const steps = journeyFor('volunteer').map((s) => s.label);
    expect(steps).toContain('Skills & interests');
    expect(steps).toContain('Volunteer agreement');
    expect(steps).not.toContain('Employment agreement');
  });

  it('gives a partner a business verification flow', () => {
    const steps = journeyFor('partner').map((s) => s.label);
    expect(steps).toContain('Business verification');
    expect(steps).toContain('Partnership agreement');
    expect(steps).toContain('Partner portal');
  });

  it('journeys differ between employee and volunteer (not one size fits all)', () => {
    expect(RELATIONSHIP_JOURNEYS.employee).not.toEqual(RELATIONSHIP_JOURNEYS.volunteer);
  });
});

describe('relationships — signature detection', () => {
  it('flags NDA and digital signature as signing steps for employees', () => {
    const signing = journeyFor('employee').filter((s) => s.requiresSignature).map((s) => s.id);
    expect(signing).toContain('nda');
    expect(signing).toContain('signature');
  });

  it('reports only the unsigned documents', () => {
    const remaining = stepsAwaitingSignature('employee', ['personal-information', 'nda']);
    expect(remaining.map((s) => s.id)).toContain('ip-confidentiality');
    expect(remaining.map((s) => s.id)).toContain('signature');
    expect(remaining.map((s) => s.id)).not.toContain('nda');
  });

  it('reports nothing once every signing step is done', () => {
    const all = journeyFor('partner').map((s) => s.id);
    expect(stepsAwaitingSignature('partner', all)).toHaveLength(0);
  });
});
