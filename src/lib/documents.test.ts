import { describe, it, expect } from 'vitest';
import {
  AGREEMENT_TEMPLATES, DOCUMENT_KINDS, DOCUMENT_STATUSES,
  templateById, templatesForRelationship, buildDocument, renderDocumentText,
  sendDocument, signDocument, declineDocument, mapDocumentRow,
  summarizeDocuments, DOCUMENTS_SEED,
  type OsDocument,
} from './documents';

const base = (p: Partial<OsDocument>): OsDocument => ({
  id: 'd1',
  org_id: '00000000-0000-4000-8000-00000000a001',
  template_id: 'nda',
  title: 'Mutual Non-Disclosure Agreement — Ada Obi',
  kind: 'nda',
  counterparty_name: 'Ada Obi',
  counterparty_email: 'ada@nowopen.africa',
  relationship: 'employee',
  status: 'draft',
  clauses: ['Definition of Confidential Information', 'Term and survival'],
  ...p,
});

describe('documents — agreement library', () => {
  it('offers the core templates from the People OS vision', () => {
    const titles = AGREEMENT_TEMPLATES.map((t) => t.title);
    expect(titles).toContain('Mutual Non-Disclosure Agreement');
    expect(titles).toContain('Employment Agreement');
    expect(titles).toContain('Internship Agreement');
    expect(titles).toContain('Partnership Agreement');
    expect(titles).toContain('Volunteer Agreement');
    expect(titles).toContain('Creative Collaboration Agreement');
    expect(titles).toContain('IP & Rights Assignment');
  });

  it('matches every template to the relationships it serves', () => {
    for (const t of AGREEMENT_TEMPLATES) {
      expect(t.relationships.length).toBeGreaterThan(0);
      expect(t.clauses.length).toBeGreaterThan(0);
    }
  });

  it('offers the NDA to every relationship', () => {
    const rels = [...new Set(AGREEMENT_TEMPLATES.flatMap((t) => [...t.relationships]))];
    for (const r of rels) {
      expect(templatesForRelationship(r).some((t) => t.id === 'nda')).toBe(true);
    }
  });

  it('keeps an employment agreement employee-only', () => {
    expect(templatesForRelationship('employee').some((t) => t.id === 'employment-agreement')).toBe(true);
    expect(templatesForRelationship('volunteer').some((t) => t.id === 'employment-agreement')).toBe(false);
  });

  it('offers the internship agreement to the team, not to volunteers', () => {
    expect(templatesForRelationship('employee').some((t) => t.id === 'internship-agreement')).toBe(true);
    expect(templatesForRelationship('volunteer').some((t) => t.id === 'internship-agreement')).toBe(false);
  });
});

describe('documents — generation', () => {
  it('drafts a document that starts as a draft, never sent or signed', () => {
    const doc = buildDocument({
      templateId: 'nda',
      counterpartyName: 'Ada Obi',
      counterpartyEmail: 'ada@nowopen.africa',
      relationship: 'employee',
    });
    expect(doc).not.toBeNull();
    expect(doc!.status).toBe('draft');
    expect(doc!.clauses).toEqual([...templateById('nda')!.clauses]);
    expect(doc!.effective_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('renders the full text with parties, clauses and signature block', () => {
    const doc = base({});
    const text = renderDocumentText(doc);
    expect(text).toContain('NOWOPEN AFRICA');
    expect(text).toContain('Ada Obi');
    expect(text).toContain('Definition of Confidential Information');
    expect(text).toContain('governed by the laws of the Federal Republic of Nigeria');
    expect(text).toMatch(/SIGNED by/);
  });

  it('refuses to build from an unknown template', () => {
    expect(buildDocument({
      templateId: 'not-a-template',
      counterpartyName: 'X', counterpartyEmail: 'x@x.com', relationship: 'other',
    })).toBeNull();
  });
});

describe('documents — lifecycle', () => {
  it('moves draft → sent → signed only when acted on', () => {
    let doc = base({});
    doc = sendDocument(doc);
    expect(doc.status).toBe('sent');
    expect(doc.sent_at).toBeTruthy();
    doc = signDocument(doc);
    expect(doc.status).toBe('signed');
    expect(doc.signed_at).toBeTruthy();
  });

  it('a signed document never moves backwards', () => {
    const doc = declineDocument(signDocument(base({})));
    expect(doc.status).toBe('signed');
  });

  it('a declined document never moves forward to signed', () => {
    const doc = signDocument(declineDocument(base({})));
    expect(doc.status).toBe('declined');
  });
});

describe('documents — ledger rollup', () => {
  it('counts per status, per kind and the signing rate', () => {
    const s = summarizeDocuments(DOCUMENTS_SEED);
    expect(s.total).toBe(DOCUMENTS_SEED.length);
    expect(s.byStatus.signed).toBeGreaterThan(0);
    expect(s.byStatus.sent).toBeGreaterThan(0);
    expect(s.byStatus.draft).toBeGreaterThan(0);
    expect(s.byKind.nda).toBeGreaterThan(0);
    expect(s.signingRate).toBeGreaterThan(0);
  });

  it('is honest on an empty ledger — no invented rates', () => {
    const s = summarizeDocuments([]);
    expect(s.total).toBe(0);
    expect(s.signingRate).toBe(0);
    expect(s.byStatus.signed).toBe(0);
  });
});

describe('documents — row mapping', () => {
  it('maps snake_case rows and normalises jsonb clauses', () => {
    const d = mapDocumentRow({
      id: 'r1',
      org_id: '00000000-0000-4000-8000-00000000a001',
      template_id: 'nda',
      title: 'NDA — X',
      kind: 'nda',
      counterparty_name: 'X',
      counterparty_email: 'x@example.com',
      relationship: 'partner',
      status: 'sent',
      clauses: '["Definition of Confidential Information"]',
    });
    expect(d.kind).toBe('nda');
    expect(d.status).toBe('sent');
    expect(d.clauses).toEqual(['Definition of Confidential Information']);
  });

  it('falls back to safe defaults for unknown kind, status and relationship', () => {
    const d = mapDocumentRow({
      id: 'r2',
      org_id: '00000000-0000-4000-8000-00000000a001',
      template_id: 'nda',
      title: 'NDA — Y',
      kind: 'magic',
      counterparty_name: 'Y',
      counterparty_email: 'y@example.com',
      relationship: 'alien',
      status: 'delivered',
    });
    expect(d.kind).toBe('agreement');
    expect(d.status).toBe('draft');
    expect(d.relationship).toBe('other');
  });

  it('DOCUMENT_KINDS and STATUSES stay exhaustive', () => {
    expect(DOCUMENT_KINDS).toHaveLength(4);
    expect(DOCUMENT_STATUSES).toHaveLength(5);
  });
});
