import { describe, it, expect } from 'vitest';
import {
  HUB_RELATIONSHIPS, HUB_RELATIONSHIP_TYPES, hubRelationshipById,
  schemaFor, allFieldsFor, validateForm, hasErrors,
  createFormSubmission, generateReference, pipelineFor, nextStatus,
  advanceStatus, mapApplicationRow, summarizeApplications,
  FORM_APPLICATIONS_SEED, isAllowedUpload, formatFileSize, MAX_UPLOAD_MB,
  type FormApplication, type HubRelationshipType,
} from './formsEngine';

describe('formsEngine — one universal hub, nine journeys', () => {
  it('serves every relationship type through the same engine', () => {
    for (const type of HUB_RELATIONSHIP_TYPES) {
      const schema = schemaFor(type);
      expect(schema.sections.length).toBeGreaterThan(0);
      expect(schema.steps.length).toBeGreaterThan(2);
      expect(schema.agreements.length).toBeGreaterThan(0);
    }
    expect(HUB_RELATIONSHIPS.length).toBe(9);
  });

  it('each relationship has a stable, unique code for references', () => {
    const codes = HUB_RELATIONSHIPS.map((o) => o.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(hubRelationshipById('employee')?.code).toBe('EMP');
  });

  it('keeps schemas conditional — partner never sees employee questions', () => {
    const employeeFields = allFieldsFor(schemaFor('employee'));
    const partnerFields = allFieldsFor(schemaFor('partner'));
    const ids = (list: { id: string }[]) => list.map((f) => f.id);
    expect(ids(employeeFields)).toContain('desired_role');
    expect(ids(employeeFields)).toContain('years_experience');
    expect(ids(partnerFields)).not.toContain('desired_role');
    expect(ids(partnerFields)).toContain('company_name');
    expect(ids(partnerFields)).toContain('partnership_type');
  });

  it('intern, volunteer, advisor and media schemas carry their own journeys', () => {
    const intern = allFieldsFor(schemaFor('intern'));
    const volunteer = allFieldsFor(schemaFor('volunteer'));
    const advisor = allFieldsFor(schemaFor('advisor'));
    const media = allFieldsFor(schemaFor('media'));
    const ids = (list: { id: string }[]) => list.map((f) => f.id);
    expect(ids(intern)).toContain('institution');
    expect(ids(volunteer)).toContain('contribution_areas');
    expect(ids(advisor)).toContain('advisory_interests');
    expect(ids(media)).toContain('audience_size');
  });
});

describe('formsEngine — validation', () => {
  const employee = schemaFor('employee');

  it('flags every required field that is left empty', () => {
    const errors = validateForm(employee, {});
    expect(hasErrors(errors)).toBe(true);
    expect(errors.full_name).toBe('This field is required');
    expect(errors.email).toBe('This field is required');
    expect(errors.desired_role).toBe('This field is required');
  });

  it('rejects malformed emails and phone numbers', () => {
    const errors = validateForm(employee, {
      full_name: 'Ada Obi', email: 'not-an-email', phone: 'abc',
      country: 'Nigeria', desired_department: 'Creative & Brand', desired_role: 'Designer',
      employment_type: 'Full-time', work_style: 'Remote',
    });
    expect(errors.email).toMatch(/valid email/);
    expect(errors.phone).toMatch(/valid phone/);
  });

  it('accepts a fully valid employee profile', () => {
    const errors = validateForm(employee, {
      full_name: 'Ada Obi', email: 'ada@nowopen.africa', phone: '+234 800 000 0000',
      country: 'Nigeria', desired_department: 'Creative & Brand', desired_role: 'Designer',
      employment_type: 'Full-time', work_style: 'Remote',
      cv: { name: 'ada-cv.pdf', type: 'application/pdf', size: 2048 },
      skills: ['Motion Design'],
    });
    expect(hasErrors(errors)).toBe(false);
  });
});

describe('formsEngine — submissions', () => {
  const base = {
    relationship: 'employee' as HubRelationshipType,
    applicantName: 'Ada Obi',
    email: 'ada@nowopen.africa',
    country: 'Nigeria',
    answers: { desired_role: 'Designer' },
    consent: true,
  };

  it('refuses a submission without consent', () => {
    const r = createFormSubmission({ ...base, consent: false });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.consent).toBeTruthy();
  });

  it('creates a submission with an honest new status and a random reference', () => {
    const r1 = createFormSubmission(base);
    const r2 = createFormSubmission(base);
    expect(r1.ok && r2.ok).toBe(true);
    if (!r1.ok || !r2.ok) return;
    expect(r1.application.status).toBe('new');
    expect(r1.application.submitted_at).toBeTruthy();
    expect(r1.application.reference).toMatch(/^NOW-EMP-\d{4}-[A-Z2-9]{4}$/);
    expect(r1.application.reference).not.toBe(r2.application.reference);
    expect(r1.application.answers.desired_role).toBe('Designer');
  });

  it('generates per-relationship references', () => {
    expect(generateReference('intern', new Date('2026-08-13'))).toMatch(/^NOW-INT-2026-/);
    expect(generateReference('partner', new Date('2026-08-13'))).toMatch(/^NOW-PTR-2026-/);
  });
});

describe('formsEngine — pipelines', () => {
  it('walks the full People pipeline for employees', () => {
    expect(pipelineFor('employee')).toEqual([
      'new', 'screening', 'under-review', 'interview', 'documents',
      'agreement', 'approved', 'onboarding', 'active', 'archived',
    ]);
    expect(nextStatus('employee', 'interview')).toBe('documents');
  });

  it('gives partners a shorter, B2B pipeline', () => {
    expect(pipelineFor('partner')).toEqual([
      'new', 'qualification', 'discussion', 'proposal', 'nda', 'agreement', 'approved', 'active',
    ]);
    expect(advanceStatus('partner', 'proposal')).toBe('nda');
  });

  it('terminal statuses do not advance', () => {
    expect(nextStatus('employee', 'archived')).toBeNull();
    expect(advanceStatus('employee', 'archived')).toBe('archived');
  });
});

describe('formsEngine — rows, rollups, uploads', () => {
  it('maps snake_case rows to applications with safe defaults', () => {
    const app = mapApplicationRow({
      id: 'r1',
      org_id: '00000000-0000-4000-8000-00000000a001',
      reference: 'NOW-EMP-2026-ABCD1',
      relationship: 'employee',
      applicant_name: 'Ada Obi',
      email: 'ada@nowopen.africa',
      country: 'Nigeria',
      status: 'screening',
      consent: true,
      submitted_at: '2026-08-13T10:00:00Z',
    });
    expect(app.relationship).toBe('employee');
    expect(app.status).toBe('screening');
    expect(app.answers).toEqual({});
  });

  it('falls back for unknown relationship and status', () => {
    const app = mapApplicationRow({
      id: 'r2', org_id: 'x', reference: 'NOW-X-2026-0000', relationship: 'alien',
      applicant_name: 'X', email: 'x@x.com', country: 'Nowhere', status: 'magic',
      consent: true, submitted_at: '2026-08-13T10:00:00Z',
    });
    expect(app.relationship).toBe('other');
    expect(app.status).toBe('new');
  });

  it('rolls up totals, today and pending from the seed', () => {
    const s = summarizeApplications(FORM_APPLICATIONS_SEED, new Date('2026-08-13T12:00:00Z'));
    expect(s.total).toBe(FORM_APPLICATIONS_SEED.length);
    expect(s.byRelationship.employee).toBe(1);
    expect(s.byRelationship.partner).toBe(1);
    expect(s.pendingReview).toBeGreaterThan(0);
  });

  it('is honest on an empty ledger — zeroes, no invented rates', () => {
    const s = summarizeApplications([], new Date('2026-08-13T12:00:00Z'));
    expect(s.total).toBe(0);
    expect(s.today).toBe(0);
    expect(s.approved).toBe(0);
  });

  it('guards file uploads by type and size', () => {
    expect(isAllowedUpload({ name: 'cv.pdf' })).toBe(true);
    expect(isAllowedUpload({ name: 'notes.docx' })).toBe(true);
    expect(isAllowedUpload({ name: 'evil.exe' })).toBe(false);
    expect(MAX_UPLOAD_MB).toBeGreaterThan(0);
    expect(formatFileSize(2048)).toBe('2 KB');
    expect(formatFileSize(2 * 1024 * 1024)).toBe('2.0 MB');
  });

  it('seed stays a valid employee application type', () => {
    const first: FormApplication = FORM_APPLICATIONS_SEED[0];
    expect(schemaFor(first.relationship).sections.length).toBeGreaterThan(0);
  });
});
