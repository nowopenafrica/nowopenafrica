// NowOpen OS — document centre (pure, no React / Supabase I/O).
//
// The People OS agreement layer: a library of reusable templates (NDA,
// partnership, volunteer, creative, employment, ...) and the ledger that turns
// them into real documents for a counterparty. A generated document is drafted
// with its clauses and party details — status (draft → sent → signed →
// declined) is written to the row when someone actually acts, never guessed.
// The component falls back to DOCUMENTS_SEED until os_documents is applied.

import { NOWOPEN_ORG_ID } from './workforce';
import { RELATIONSHIP_TYPES, type RelationshipType } from './relationships';

export const DOCUMENT_KINDS = ['nda', 'agreement', 'policy', 'letter'] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export const DOCUMENT_KIND_LABELS: Record<DocumentKind, string> = {
  nda: 'NDA',
  agreement: 'Agreement',
  policy: 'Policy',
  letter: 'Letter',
};

export const DOCUMENT_STATUSES = ['draft', 'sent', 'signed', 'declined', 'expired'] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus, string> = {
  draft: 'Draft',
  sent: 'Sent for signature',
  signed: 'Signed',
  declined: 'Declined',
  expired: 'Expired',
};

/** A reusable agreement in the library, available for the relationships it is
 *  built for. `clauses` are the section headings the generated document uses. */
export interface AgreementTemplate {
  id: string;
  title: string;
  kind: DocumentKind;
  description: string;
  relationships: readonly RelationshipType[];
  clauses: readonly string[];
}

export const AGREEMENT_TEMPLATES: readonly AgreementTemplate[] = [
  {
    id: 'nda', title: 'Mutual Non-Disclosure Agreement', kind: 'nda',
    description: 'Protects NowOpen and the counterparty while discussing work, data or deals.',
    relationships: RELATIONSHIP_TYPES,
    clauses: [
      'Definition of Confidential Information',
      'Obligations of the Receiving Party',
      'Permitted disclosures',
      'Term and survival',
      'Return or destruction',
      'Governing law (Nigeria)',
    ],
  },
  {
    id: 'employment-agreement', title: 'Employment Agreement', kind: 'agreement',
    description: 'Role, compensation, duties and notice for a team member.',
    relationships: ['employee'],
    clauses: [
      'Role and duties', 'Compensation and benefits', 'Working hours',
      'Confidentiality and IP', 'Termination and notice', 'Governing law (Nigeria)',
    ],
  },
  {
    id: 'internship-agreement', title: 'Internship Agreement', kind: 'agreement',
    description: 'Placement terms for an intern — scope, supervision, stipend and IP.',
    relationships: ['employee'],
    clauses: [
      'Scope of the internship', 'Supervision and mentoring', 'Stipend and benefits',
      'Confidentiality and IP', 'Term and notice', 'Governing law (Nigeria)',
    ],
  },
  {
    id: 'partnership-agreement', title: 'Partnership Agreement', kind: 'agreement',
    description: 'Business partnership with NowOpen Africa — scope, obligations and term.',
    relationships: ['partner'],
    clauses: [
      'Purpose of the partnership', 'Role and responsibilities',
      'Brand and marketing', 'Reporting and reviews', 'Term and renewal',
      'Governing law (Nigeria)',
    ],
  },
  {
    id: 'volunteer-agreement', title: 'Volunteer Agreement', kind: 'agreement',
    description: 'Mutual expectations for community ambassadors and volunteers.',
    relationships: ['volunteer'],
    clauses: [
      'Role and commitment', 'Guidance and supervision', 'Confidentiality',
      'Safeguarding and conduct', 'Ending the arrangement', 'Governing law (Nigeria)',
    ],
  },
  {
    id: 'creative-agreement', title: 'Creative Collaboration Agreement', kind: 'agreement',
    description: 'Scope, deliverables, rights and payment for creators and freelancers.',
    relationships: ['creative'],
    clauses: [
      'Scope of work', 'Deliverables and standards', 'Fees and payment',
      'Intellectual property', 'Confidentiality', 'Governing law (Nigeria)',
    ],
  },
  {
    id: 'ip-assignment', title: 'IP & Rights Assignment', kind: 'agreement',
    description: 'Assigns the work created for NowOpen, with moral-rights waiver.',
    relationships: ['creative', 'agency'],
    clauses: [
      'Work made for hire', 'Assignment of rights', 'Moral rights waiver',
      'Licenses in pre-existing material', 'Governing law (Nigeria)',
    ],
  },
  {
    id: 'investor-agreement', title: 'Investor / Advisor Agreement', kind: 'agreement',
    description: 'Terms for funding, advisory roles and information rights.',
    relationships: ['investor'],
    clauses: [
      'Role and contribution', 'Information rights', 'Confidentiality',
      'Compliance', 'Term', 'Governing law (Nigeria)',
    ],
  },
  {
    id: 'media-agreement', title: 'Media Partnership Agreement', kind: 'agreement',
    description: 'Coverage, amplification and credits with a media outlet.',
    relationships: ['media-partner'],
    clauses: [
      'Coverage and amplification', 'Credits and branding', 'Embargoes',
      'Review process', 'Term', 'Governing law (Nigeria)',
    ],
  },
  {
    id: 'service-agreement', title: 'Service Agreement', kind: 'agreement',
    description: 'Deliverables, rates and liability for agencies and vendors.',
    relationships: ['agency', 'production-partner'],
    clauses: [
      'Services and deliverables', 'Fees and payment', 'Insurance and liability',
      'Confidentiality', 'Termination', 'Governing law (Nigeria)',
    ],
  },
  {
    id: 'collaboration-agreement', title: 'Strategic Collaboration Agreement', kind: 'agreement',
    description: 'Shared goals, resources and credits between collaborators.',
    relationships: ['strategic-collaborator'],
    clauses: [
      'Shared goals', 'Resources and contributions', 'Credits',
      'Confidentiality', 'Term', 'Governing law (Nigeria)',
    ],
  },
  {
    id: 'technology-agreement', title: 'Technology Partnership Agreement', kind: 'agreement',
    description: 'Integration, co-building and data handling with a tech partner.',
    relationships: ['technology-partner'],
    clauses: [
      'Scope of the build', 'Data handling and security', 'Licences',
      'Support and maintenance', 'Confidentiality', 'Governing law (Nigeria)',
    ],
  },
  {
    id: 'code-of-conduct', title: 'Code of Conduct', kind: 'policy',
    description: 'Standards every team member and volunteer commits to.',
    relationships: ['employee', 'volunteer'],
    clauses: [
      'Respect and inclusion', 'Integrity', 'Use of company resources',
      'Conflicts of interest', 'Reporting concerns', 'Consequences',
    ],
  },
];

export function templateById(id: string): AgreementTemplate | undefined {
  return AGREEMENT_TEMPLATES.find((t) => t.id === id);
}

/** Templates the library offers for a given relationship. */
export function templatesForRelationship(relationship: RelationshipType): readonly AgreementTemplate[] {
  return AGREEMENT_TEMPLATES.filter((t) => t.relationships.includes(relationship));
}

/** One document on the ledger, generated from a template for a counterparty. */
export interface OsDocument {
  id: string;
  org_id: string;
  template_id: string;
  title: string;
  kind: DocumentKind;
  counterparty_name: string;
  counterparty_email: string;
  relationship: RelationshipType;
  status: DocumentStatus;
  effective_date?: string | null;
  sent_at?: string | null;
  signed_at?: string | null;
  clauses: string[];
  created_at?: string;
  updated_at?: string;
}

export interface DocumentRow {
  id: string;
  org_id: string;
  template_id: string;
  title: string;
  kind: string;
  counterparty_name: string;
  counterparty_email: string;
  relationship: string;
  status: string;
  effective_date?: string | null;
  sent_at?: string | null;
  signed_at?: string | null;
  clauses?: unknown;
  created_at?: string;
  updated_at?: string;
}

const asStringList = (v: unknown): string[] => {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string');
  if (typeof v === 'string' && v.trim()) {
    try { return asStringList(JSON.parse(v)); } catch { return []; }
  }
  return [];
};

export function mapDocumentRow(row: DocumentRow): OsDocument {
  const kind = DOCUMENT_KINDS.find((k) => k === row.kind) ?? 'agreement';
  const relationship = RELATIONSHIP_TYPES.find((r) => r === row.relationship) ?? 'other';
  const status = DOCUMENT_STATUSES.find((s) => s === row.status) ?? 'draft';
  return {
    id: row.id,
    org_id: row.org_id,
    template_id: row.template_id,
    title: row.title,
    kind,
    counterparty_name: row.counterparty_name,
    counterparty_email: row.counterparty_email,
    relationship,
    status,
    effective_date: row.effective_date,
    sent_at: row.sent_at,
    signed_at: row.signed_at,
    clauses: asStringList(row.clauses),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/** Draft a new document from a template for a counterparty. It starts as a
 *  draft — nothing is marked sent or signed until someone acts. */
export function buildDocument(input: {
  templateId: string;
  counterpartyName: string;
  counterpartyEmail: string;
  relationship: RelationshipType;
  effectiveDate?: string;
}): OsDocument | null {
  const template = templateById(input.templateId);
  if (!template) return null;
  const now = new Date();
  const effectiveDate = input.effectiveDate ?? now.toISOString().slice(0, 10);
  const id = `doc-${now.getTime()}-${Math.floor(Math.random() * 10000)}`;
  return {
    id,
    org_id: NOWOPEN_ORG_ID,
    template_id: template.id,
    title: `${template.title} — ${input.counterpartyName}`,
    kind: template.kind,
    counterparty_name: input.counterpartyName,
    counterparty_email: input.counterpartyEmail,
    relationship: input.relationship,
    status: 'draft',
    effective_date: effectiveDate,
    clauses: [...template.clauses],
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
  };
}

/** The rendered agreement text — header, parties, numbered clauses and a
 *  signature block — so a document is never an empty shell. */
export function renderDocumentText(doc: OsDocument): string {
  const template = templateById(doc.template_id);
  const heading = template?.title ?? doc.title;
  const lines: string[] = [
    `${heading.toUpperCase()}`,
    '',
    `THIS AGREEMENT is made on the ${doc.effective_date ?? '___'} ("Effective Date")`,
    `between NOWOPEN AFRICA ("NowOpen") and ${doc.counterparty_name} (${doc.counterparty_email}) ("Counterparty").`,
    '',
    'WHEREAS the parties wish to record the terms governing their relationship;',
    '',
    ...doc.clauses.flatMap((c, i) => [`${i + 1}. ${c}`, `   The parties agree to the terms set out under this clause.`, '']),
    `This document is governed by the laws of the Federal Republic of Nigeria.`,
    '',
    'SIGNED by NowOpen Africa: __________________',
    `SIGNED by ${doc.counterparty_name}: __________________`,
  ];
  return lines.join('\n');
}

/** Move a document forward along its lifecycle — only when someone actually
 *  sends or signs it, with the date recorded honestly. Terminal states never
 *  move backwards and declined/expired documents are never resurrected. */
export function sendDocument(doc: OsDocument, at = new Date().toISOString()): OsDocument {
  if (doc.status === 'signed' || doc.status === 'declined' || doc.status === 'expired') return doc;
  return { ...doc, status: 'sent', sent_at: doc.sent_at ?? at, updated_at: at };
}

export function signDocument(doc: OsDocument, at = new Date().toISOString()): OsDocument {
  if (doc.status === 'signed' || doc.status === 'declined' || doc.status === 'expired') return doc;
  return { ...doc, status: 'signed', sent_at: doc.sent_at ?? at, signed_at: doc.signed_at ?? at, updated_at: at };
}

export function declineDocument(doc: OsDocument, at = new Date().toISOString()): OsDocument {
  if (doc.status === 'signed' || doc.status === 'expired') return doc;
  return { ...doc, status: 'declined', updated_at: at };
}

export interface DocumentSummary {
  total: number;
  byStatus: Record<DocumentStatus, number>;
  byKind: Record<string, number>;
  signed: number;
  sent: number;
  drafts: number;
  /** Percent of non-draft documents that are signed, rounded. */
  signingRate: number;
}

export function summarizeDocuments(docs: OsDocument[]): DocumentSummary {
  const byStatus: Record<DocumentStatus, number> = {
    draft: 0, sent: 0, signed: 0, declined: 0, expired: 0,
  };
  const byKind: Record<string, number> = {};
  for (const d of docs) {
    byStatus[d.status] += 1;
    byKind[d.kind] = (byKind[d.kind] ?? 0) + 1;
  }
  const decided = docs.length - byStatus.draft;
  return {
    total: docs.length,
    byStatus,
    byKind,
    signed: byStatus.signed,
    sent: byStatus.sent,
    drafts: byStatus.draft,
    signingRate: decided === 0 ? 0 : Math.round((byStatus.signed / decided) * 100),
  };
}

// The dev/fallback ledger, mirrored by the 20260808110000_os_documents seed.
// The component uses these until the migration is applied. Keep in sync with
// the SQL seed — counterparties match the os_onboarding roster.
export const DOCUMENTS_SEED: OsDocument[] = [
  {
    id: 'seed-doc-0', org_id: NOWOPEN_ORG_ID, template_id: 'nda', kind: 'nda',
    title: 'Mutual Non-Disclosure Agreement — Chukwu Emeka',
    counterparty_name: 'Chukwu Emeka', counterparty_email: 'chukwu@nowopen.africa',
    relationship: 'employee', status: 'signed', effective_date: '2026-08-01',
    sent_at: '2026-08-01T10:00:00Z', signed_at: '2026-08-01T14:00:00Z',
    clauses: [...(templateById('nda')!.clauses)], created_at: '2026-08-01T09:00:00Z',
  },
  {
    id: 'seed-doc-1', org_id: NOWOPEN_ORG_ID, template_id: 'employment-agreement', kind: 'agreement',
    title: 'Employment Agreement — Chukwu Emeka',
    counterparty_name: 'Chukwu Emeka', counterparty_email: 'chukwu@nowopen.africa',
    relationship: 'employee', status: 'sent', effective_date: '2026-08-01',
    sent_at: '2026-08-01T10:00:00Z',
    clauses: [...(templateById('employment-agreement')!.clauses)], created_at: '2026-08-01T09:00:00Z',
  },
  {
    id: 'seed-doc-2', org_id: NOWOPEN_ORG_ID, template_id: 'nda', kind: 'nda',
    title: 'Mutual Non-Disclosure Agreement — Meatclub Nigeria',
    counterparty_name: 'Meatclub Nigeria', counterparty_email: 'ops@meatclub.ng',
    relationship: 'partner', status: 'signed', effective_date: '2026-08-03',
    sent_at: '2026-08-03T09:00:00Z', signed_at: '2026-08-03T16:30:00Z',
    clauses: [...(templateById('nda')!.clauses)], created_at: '2026-08-03T08:00:00Z',
  },
  {
    id: 'seed-doc-3', org_id: NOWOPEN_ORG_ID, template_id: 'partnership-agreement', kind: 'agreement',
    title: 'Partnership Agreement — Meatclub Nigeria',
    counterparty_name: 'Meatclub Nigeria', counterparty_email: 'ops@meatclub.ng',
    relationship: 'partner', status: 'draft', effective_date: '2026-08-03',
    clauses: [...(templateById('partnership-agreement')!.clauses)], created_at: '2026-08-03T08:00:00Z',
  },
  {
    id: 'seed-doc-4', org_id: NOWOPEN_ORG_ID, template_id: 'volunteer-agreement', kind: 'agreement',
    title: 'Volunteer Agreement — Kofi Mensah',
    counterparty_name: 'Kofi Mensah', counterparty_email: 'kofi@example.com',
    relationship: 'volunteer', status: 'signed', effective_date: '2026-07-15',
    sent_at: '2026-07-15T09:00:00Z', signed_at: '2026-07-15T12:00:00Z',
    clauses: [...(templateById('volunteer-agreement')!.clauses)], created_at: '2026-07-15T08:00:00Z',
  },
  {
    id: 'seed-doc-5', org_id: NOWOPEN_ORG_ID, template_id: 'creative-agreement', kind: 'agreement',
    title: 'Creative Collaboration Agreement — Lagos Tech Studio',
    counterparty_name: 'Lagos Tech Studio', counterparty_email: 'hello@lagostech.studio',
    relationship: 'creative', status: 'sent', effective_date: '2026-08-07',
    sent_at: '2026-08-07T11:00:00Z',
    clauses: [...(templateById('creative-agreement')!.clauses)], created_at: '2026-08-07T10:00:00Z',
  },
  {
    id: 'seed-doc-6', org_id: NOWOPEN_ORG_ID, template_id: 'nda', kind: 'nda',
    title: 'Mutual Non-Disclosure Agreement — Atlas Capital',
    counterparty_name: 'Atlas Capital', counterparty_email: 'invest@atlascap.co',
    relationship: 'investor', status: 'draft', effective_date: '2026-08-08',
    clauses: [...(templateById('nda')!.clauses)], created_at: '2026-08-08T09:00:00Z',
  },
];
