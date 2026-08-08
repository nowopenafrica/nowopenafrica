import { describe, it, expect } from 'vitest';
import {
  SIGNING_METHODS, SIGNING_REQUIREMENTS,
  requiredSigningTemplates, completeSigning, provisioningFor,
  summarizeProvisioning, summarizeSignatures, mapSignatureRow,
  SIGNING_SEED,
} from './signatures';
import { buildDocument } from './documents';
import type { OsDocument } from './documents';
import type { OnboardingProfile } from './onboardingProfiles';

const profile = (p: Partial<OnboardingProfile>): OnboardingProfile => ({
  id: 'p1',
  org_id: '00000000-0000-4000-8000-00000000a001',
  full_name: 'Ada Obi',
  email: 'ada@nowopen.africa',
  relationship: 'employee',
  steps_completed: [],
  signed_agreements: [],
  access_grants: ['Creative', 'Motion Design', 'Creative Studio'],
  ...p,
});

describe('signatures — signing requirements', () => {
  it('every relationship has signing requirements built from real templates', () => {
    for (const relationship of Object.keys(SIGNING_REQUIREMENTS) as (keyof typeof SIGNING_REQUIREMENTS)[]) {
      const templates = requiredSigningTemplates(relationship);
      expect(templates.length).toBeGreaterThan(0);
      expect(templates.every((t) => Boolean(t.id))).toBe(true);
    }
  });

  it('an employee must sign the NDA and the employment agreement', () => {
    const ids = requiredSigningTemplates('employee').map((t) => t.id);
    expect(ids).toEqual(['nda', 'employment-agreement']);
  });

  it('a volunteer only needs the volunteer agreement', () => {
    expect(requiredSigningTemplates('volunteer').map((t) => t.id)).toEqual(['volunteer-agreement']);
  });

  it('unknown relationships fall back to the NDA-only requirement', () => {
    expect(requiredSigningTemplates('other').map((t) => t.id)).toEqual(['nda']);
  });
});

describe('signatures — capturing a signature', () => {
  it('only signs a document that is actually out for signature', () => {
    const draft = buildDocument({
      templateId: 'nda',
      counterpartyName: 'Ada Obi',
      counterpartyEmail: 'ada@nowopen.africa',
      relationship: 'employee',
    })!;
    const r = completeSigning(draft, { signerName: 'Ada Obi', signerEmail: 'ada@nowopen.africa', method: 'digital' });
    expect(r.ok).toBe(false);
  });

  it('rejects a signer whose email does not match the counterparty', () => {
    const draft = buildDocument({
      templateId: 'nda',
      counterpartyName: 'Ada Obi',
      counterpartyEmail: 'ada@nowopen.africa',
      relationship: 'employee',
    })!;
    const sent = { ...draft, status: 'sent' as const };
    const r = completeSigning(sent, { signerName: 'Intruder', signerEmail: 'intruder@x.com', method: 'digital' });
    expect(r.ok).toBe(false);
  });

  it('captures a signature record and moves the document to signed', () => {
    const draft = buildDocument({
      templateId: 'nda',
      counterpartyName: 'Ada Obi',
      counterpartyEmail: 'ada@nowopen.africa',
      relationship: 'employee',
    })!;
    const sent = { ...draft, status: 'sent' as const };
    const r = completeSigning(sent, { signerName: 'Ada Obi', signerEmail: 'ADA@nowopen.africa', method: 'manual' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.record.signer_email).toBe('ada@nowopen.africa');
    expect(r.record.method).toBe('manual');
    expect(r.document.status).toBe('signed');
    expect(r.document.signed_at).toBeTruthy();
  });
});

describe('signatures — provisioning', () => {
  const docs = (templateIds: string[]): OsDocument[] =>
    templateIds.map((t, i) => {
      const d = buildDocument({
        templateId: t,
        counterpartyName: 'Ada Obi',
        counterpartyEmail: 'ada@nowopen.africa',
        relationship: 'employee',
      })!;
      return { ...d, status: 'signed' as const, signed_at: `2026-08-0${i + 1}T12:00:00Z` };
    });

  it('grants access only when every required document is signed', () => {
    const partial = provisioningFor(profile({}), docs(['nda']));
    expect(partial.status).toBe('pending');
    expect(partial.missing).toEqual(['employment-agreement']);
    expect(partial.accessGranted).toEqual([]);

    const complete = provisioningFor(profile({}), docs(['nda', 'employment-agreement']));
    expect(complete.status).toBe('granted');
    expect(complete.accessGranted).toEqual(['Creative', 'Motion Design', 'Creative Studio']);
  });

  it('only counts signatures on the profile email', () => {
    const foreign = provisioningFor(profile({}), [{
      ...docs(['nda'])[0],
      counterparty_email: 'someone-else@x.com',
    }]);
    expect(foreign.missing).toEqual(['nda', 'employment-agreement']);
  });

  it('rolls up granted vs pending profiles', () => {
    const employees = [profile({}), profile({ id: 'p2', email: 'other@nowopen.africa' })];
    const s = summarizeProvisioning(employees, docs(['nda', 'employment-agreement']));
    expect(s.total).toBe(2);
    expect(s.granted).toBe(1);
    expect(s.pending).toBe(1);
    expect(s.provisionedRate).toBe(50);
  });
});

describe('signatures — summaries and mapping', () => {
  it('counts signatures and documents still awaiting', () => {
    const sent = buildDocument({
      templateId: 'nda',
      counterpartyName: 'Ada Obi',
      counterpartyEmail: 'ada@nowopen.africa',
      relationship: 'employee',
    })!;
    const s = summarizeSignatures(SIGNING_SEED, [{ ...sent, status: 'sent' as const }]);
    expect(s.total).toBe(SIGNING_SEED.length);
    expect(s.perMethod.digital).toBeGreaterThan(0);
    expect(s.awaiting).toBe(1);
  });

  it('maps snake_case rows with a safe method default', () => {
    const r = mapSignatureRow({
      id: 'r1',
      org_id: '00000000-0000-4000-8000-00000000a001',
      document_id: 'd1',
      document_title: 'NDA — X',
      signer_name: 'X',
      signer_email: 'x@example.com',
      method: 'biometric',
      signed_at: '2026-08-01T14:00:00Z',
    });
    expect(r.method).toBe('manual');
    expect(r.created_at).toBe('2026-08-01T14:00:00Z');
  });

  it('SIGNING_METHODS stays exhaustive', () => {
    expect(SIGNING_METHODS).toEqual(['manual', 'digital']);
  });
});
