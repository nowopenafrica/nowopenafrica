// NowOpen OS — signing vault & provisioning (pure, no React / Supabase I/O).
//
// The People OS signature layer. A "sent" document in os_documents IS a signing
// request: the vault lists them, and capturing a signature records who signed,
// when and how (manual / digital) in os_signatures while the document moves to
// signed. Provisioning is the honest bridge back to OS-20 profiles: a profile's
// access grants are only considered granted once every required signing
// template for its relationship has a signed document on that email. Nothing is
// assumed — an email mismatch is rejected, and missing documents stay listed.

import { NOWOPEN_ORG_ID } from './workforce';
import { type RelationshipType } from './relationships';
import { templateById, signDocument, type AgreementTemplate, type OsDocument } from './documents';
import type { OnboardingProfile } from './onboardingProfiles';

export const SIGNING_METHODS = ['manual', 'digital'] as const;
export type SigningMethod = (typeof SIGNING_METHODS)[number];

export const SIGNING_METHOD_LABELS: Record<SigningMethod, string> = {
  manual: 'Manual (in person)',
  digital: 'Digital',
};

/** One captured signature — a document signed by a counterparty. */
export interface SigningRecord {
  id: string;
  org_id: string;
  document_id: string;
  document_title: string;
  signer_name: string;
  signer_email: string;
  method: SigningMethod;
  signed_at: string;
  created_at: string;
}

export interface SignatureRow {
  id: string;
  org_id: string;
  document_id: string;
  document_title: string;
  signer_name: string;
  signer_email: string;
  method: string;
  signed_at: string;
  created_at?: string;
}

export function mapSignatureRow(row: SignatureRow): SigningRecord {
  const method = SIGNING_METHODS.find((m) => m === row.method) ?? 'manual';
  return {
    id: row.id,
    org_id: row.org_id,
    document_id: row.document_id,
    document_title: row.document_title,
    signer_name: row.signer_name,
    signer_email: row.signer_email,
    method,
    signed_at: row.signed_at,
    created_at: row.created_at ?? row.signed_at,
  };
}

/** Which signing templates a relationship must complete before access is
 *  provisioned. Derived from the agreement library — only documents that exist
 *  in the library are ever required. */
export const SIGNING_REQUIREMENTS: Record<RelationshipType, readonly string[]> = {
  employee: ['nda', 'employment-agreement'],
  partner: ['nda', 'partnership-agreement'],
  volunteer: ['volunteer-agreement'],
  creative: ['nda', 'creative-agreement'],
  agency: ['nda', 'service-agreement'],
  'production-partner': ['nda', 'service-agreement'],
  'strategic-collaborator': ['nda', 'collaboration-agreement'],
  investor: ['nda', 'investor-agreement'],
  'media-partner': ['media-agreement'],
  'technology-partner': ['nda', 'technology-agreement'],
  other: ['nda'],
};

export function requiredSigningTemplates(relationship: RelationshipType): readonly AgreementTemplate[] {
  return (SIGNING_REQUIREMENTS[relationship] ?? SIGNING_REQUIREMENTS.other)
    .map((id) => templateById(id))
    .filter((t): t is AgreementTemplate => Boolean(t));
}

export interface CompleteSigningInput {
  signerName: string;
  signerEmail: string;
  method: SigningMethod;
}

export type CompleteSigningResult =
  | { ok: true; record: SigningRecord; document: OsDocument }
  | { ok: false; error: string };

/** Capture a signature on a sent document. The signer must match the
 *  counterparty on the document — a mismatched email is rejected, never
 *  silently recorded. */
export function completeSigning(doc: OsDocument, input: CompleteSigningInput): CompleteSigningResult {
  if (doc.status !== 'sent') {
    return { ok: false, error: `Only a sent document can be signed (it is ${doc.status}).` };
  }
  if (input.signerEmail.trim().toLowerCase() !== doc.counterparty_email.trim().toLowerCase()) {
    return { ok: false, error: 'Signer email must match the counterparty on the document.' };
  }
  const now = new Date();
  const signedAt = now.toISOString();
  return {
    ok: true,
    record: {
      id: `sig-${now.getTime()}-${Math.floor(Math.random() * 10000)}`,
      org_id: doc.org_id,
      document_id: doc.id,
      document_title: doc.title,
      signer_name: input.signerName.trim() || doc.counterparty_name,
      signer_email: doc.counterparty_email,
      method: input.method,
      signed_at: signedAt,
      created_at: signedAt,
    },
    document: signDocument(doc, signedAt),
  };
}

/** The provisioning state of one profile against the signed documents. Access
 *  is only "granted" when every required signing template is signed for the
 *  profile's email; otherwise the missing documents are listed honestly. */
export interface ProvisioningStatus {
  status: 'granted' | 'pending';
  required: readonly string[];
  signedRequired: readonly string[];
  missing: readonly string[];
  accessGranted: readonly string[];
}

export function provisioningFor(profile: OnboardingProfile, documents: readonly OsDocument[]): ProvisioningStatus {
  const required = requiredSigningTemplates(profile.relationship).map((t) => t.id);
  const signed = new Set(
    documents
      .filter((d) => d.status === 'signed' && d.counterparty_email.toLowerCase() === profile.email.toLowerCase())
      .map((d) => d.template_id),
  );
  const missing = required.filter((id) => !signed.has(id));
  const granted = missing.length === 0;
  return {
    status: granted ? 'granted' : 'pending',
    required,
    signedRequired: required.filter((id) => signed.has(id)),
    missing,
    accessGranted: granted ? profile.access_grants : [],
  };
}

export interface ProvisioningSummary {
  total: number;
  granted: number;
  pending: number;
  /** Percent of profiles provisioned, rounded. */
  provisionedRate: number;
}

export function summarizeProvisioning(profiles: readonly OnboardingProfile[], documents: readonly OsDocument[]): ProvisioningSummary {
  let granted = 0;
  for (const p of profiles) {
    if (provisioningFor(p, documents).status === 'granted') granted += 1;
  }
  return {
    total: profiles.length,
    granted,
    pending: profiles.length - granted,
    provisionedRate: profiles.length === 0 ? 0 : Math.round((granted / profiles.length) * 100),
  };
}

export interface SignatureSummary {
  total: number;
  perMethod: Record<SigningMethod, number>;
  /** Documents currently out for signature (os_documents status sent). */
  awaiting: number;
}

export function summarizeSignatures(records: readonly SigningRecord[], documents: readonly OsDocument[]): SignatureSummary {
  const perMethod: Record<SigningMethod, number> = { manual: 0, digital: 0 };
  for (const r of records) perMethod[r.method] += 1;
  return {
    total: records.length,
    perMethod,
    awaiting: documents.filter((d) => d.status === 'sent').length,
  };
}

// The dev/fallback signature ledger, mirrored by the 20260808120000_os_signatures
// seed. Signatures reference the signed os_documents seed rows. Keep in sync.
export const SIGNING_SEED: SigningRecord[] = [
  {
    id: 'seed-sig-0', org_id: NOWOPEN_ORG_ID, document_id: 'seed-doc-0',
    document_title: 'Mutual Non-Disclosure Agreement — Chukwu Emeka',
    signer_name: 'Chukwu Emeka', signer_email: 'chukwu@nowopen.africa',
    method: 'manual', signed_at: '2026-08-01T14:00:00Z', created_at: '2026-08-01T14:00:00Z',
  },
  {
    id: 'seed-sig-1', org_id: NOWOPEN_ORG_ID, document_id: 'seed-doc-2',
    document_title: 'Mutual Non-Disclosure Agreement — Meatclub Nigeria',
    signer_name: 'Meatclub Nigeria', signer_email: 'ops@meatclub.ng',
    method: 'digital', signed_at: '2026-08-03T16:30:00Z', created_at: '2026-08-03T16:30:00Z',
  },
  {
    id: 'seed-sig-2', org_id: NOWOPEN_ORG_ID, document_id: 'seed-doc-4',
    document_title: 'Volunteer Agreement — Kofi Mensah',
    signer_name: 'Kofi Mensah', signer_email: 'kofi@example.com',
    method: 'digital', signed_at: '2026-07-15T12:00:00Z', created_at: '2026-07-15T12:00:00Z',
  },
];
