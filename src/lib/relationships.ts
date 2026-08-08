// NowOpen OS — relationship model (pure, no React / Supabase I/O).
//
// The People OS starts with one universal link and one question: how are you
// helping build NowOpen Africa? Each relationship type owns its onboarding
// journey — the ordered steps the profile walks, mirrored by the os_onboarding
// journey engine. Signature-required steps are flagged so the status logic can
// honestly say "awaiting signature" instead of guessing.

export type RelationshipType =
  | 'employee'
  | 'partner'
  | 'volunteer'
  | 'creative'
  | 'agency'
  | 'production-partner'
  | 'strategic-collaborator'
  | 'investor'
  | 'media-partner'
  | 'technology-partner'
  | 'other';

export interface RelationshipOption {
  id: RelationshipType;
  label: string;
  emoji: string;
  blurb: string;
}

export const RELATIONSHIP_OPTIONS: readonly RelationshipOption[] = [
  { id: 'employee', label: 'Employee', emoji: '👤', blurb: 'Joining the NowOpen team.' },
  { id: 'partner', label: 'Partner', emoji: '🤝', blurb: 'A business relationship with NowOpen Africa.' },
  { id: 'volunteer', label: 'Volunteer / Community Ambassador', emoji: '🌍', blurb: 'Giving time to the community.' },
  { id: 'creative', label: 'Creative / Freelancer', emoji: '🎨', blurb: 'Design, video, copy and production work.' },
  { id: 'agency', label: 'Agency / Vendor', emoji: '🏢', blurb: 'Delivering services on behalf of an agency.' },
  { id: 'production-partner', label: 'Production Partner', emoji: '🎬', blurb: 'Co-producing with NowOpen.' },
  { id: 'strategic-collaborator', label: 'Strategic Collaborator', emoji: '🤝', blurb: 'Sharing goals and resources.' },
  { id: 'investor', label: 'Investor / Advisor', emoji: '💼', blurb: 'Funding or advising the mission.' },
  { id: 'media-partner', label: 'Media Partner', emoji: '📰', blurb: 'Covering and amplifying NowOpen.' },
  { id: 'technology-partner', label: 'Technology Partner', emoji: '🧑‍💻', blurb: 'Building together on the stack.' },
  { id: 'other', label: 'Other', emoji: '✨', blurb: 'Something else — tell us.' },
];

export const RELATIONSHIP_LABELS: Record<RelationshipType, string> = Object.fromEntries(
  RELATIONSHIP_OPTIONS.map((o) => [o.id, o.label]),
) as Record<RelationshipType, string>;

export const RELATIONSHIP_TYPES: readonly RelationshipType[] = RELATIONSHIP_OPTIONS.map((o) => o.id);

export interface OnboardingStep {
  /** Stable id stored in os_onboarding.steps_completed. */
  id: string;
  label: string;
  /** True when this step produces a document that must be signed before the
   *  journey can finish — powers the "awaiting signature" status. */
  requiresSignature?: boolean;
}

/** The journey each relationship walks, in order. Mirrors the onboarding
 *  flows in the vision: employee, volunteer and partner get different paths. */
export const RELATIONSHIP_JOURNEYS: Record<RelationshipType, readonly OnboardingStep[]> = {
  employee: [
    { id: 'personal-information', label: 'Personal information' },
    { id: 'professional-information', label: 'Professional information' },
    { id: 'department', label: 'Department' },
    { id: 'role', label: 'Role' },
    { id: 'emergency-contact', label: 'Emergency contact' },
    { id: 'employment-documents', label: 'Employment documents' },
    { id: 'nda', label: 'NDA', requiresSignature: true },
    { id: 'ip-confidentiality', label: 'IP & confidentiality', requiresSignature: true },
    { id: 'code-of-conduct', label: 'Code of conduct' },
    { id: 'policies', label: 'Policies' },
    { id: 'signature', label: 'Digital signature', requiresSignature: true },
    { id: 'account-setup', label: 'Account setup' },
    { id: 'orientation', label: 'Orientation' },
  ],
  volunteer: [
    { id: 'personal-information', label: 'Personal information' },
    { id: 'skills-interests', label: 'Skills & interests' },
    { id: 'availability', label: 'Availability' },
    { id: 'location', label: 'Location' },
    { id: 'volunteer-agreement', label: 'Volunteer agreement', requiresSignature: true },
    { id: 'nda-confidentiality', label: 'NDA / confidentiality', requiresSignature: true },
    { id: 'code-of-conduct', label: 'Code of conduct' },
    { id: 'consent', label: 'Consent' },
    { id: 'orientation', label: 'Orientation' },
  ],
  partner: [
    { id: 'company-information', label: 'Company information' },
    { id: 'representative', label: 'Representative' },
    { id: 'partnership-type', label: 'Partnership type' },
    { id: 'business-verification', label: 'Business verification' },
    { id: 'partnership-proposal', label: 'Partnership proposal' },
    { id: 'nda', label: 'NDA', requiresSignature: true },
    { id: 'partnership-agreement', label: 'Partnership agreement', requiresSignature: true },
    { id: 'signature', label: 'Digital signature', requiresSignature: true },
    { id: 'partner-portal', label: 'Partner portal' },
  ],
  creative: [
    { id: 'personal-information', label: 'Personal information' },
    { id: 'creative-briefing', label: 'Creative briefing' },
    { id: 'portfolio', label: 'Portfolio' },
    { id: 'nda', label: 'NDA', requiresSignature: true },
    { id: 'collaboration-agreement', label: 'Collaboration agreement', requiresSignature: true },
    { id: 'ip-rights', label: 'IP / rights agreement', requiresSignature: true },
    { id: 'brand-guidelines', label: 'Brand guidelines' },
    { id: 'file-standards', label: 'File standards' },
    { id: 'delivery-specs', label: 'Delivery specifications' },
    { id: 'payment-procedures', label: 'Payment / invoice procedures' },
  ],
  agency: [
    { id: 'company-information', label: 'Company information' },
    { id: 'representative', label: 'Representative' },
    { id: 'agency-capabilities', label: 'Capabilities' },
    { id: 'business-verification', label: 'Business verification' },
    { id: 'service-agreement', label: 'Service agreement', requiresSignature: true },
    { id: 'nda', label: 'NDA', requiresSignature: true },
    { id: 'signature', label: 'Digital signature', requiresSignature: true },
    { id: 'vendor-portal', label: 'Vendor portal' },
  ],
  'production-partner': [
    { id: 'company-information', label: 'Company information' },
    { id: 'production-capabilities', label: 'Production capabilities' },
    { id: 'representative', label: 'Representative' },
    { id: 'business-verification', label: 'Business verification' },
    { id: 'production-agreement', label: 'Production agreement', requiresSignature: true },
    { id: 'nda', label: 'NDA', requiresSignature: true },
    { id: 'signature', label: 'Digital signature', requiresSignature: true },
    { id: 'production-portal', label: 'Production portal' },
  ],
  'strategic-collaborator': [
    { id: 'organization-information', label: 'Organization information' },
    { id: 'representative', label: 'Representative' },
    { id: 'collaboration-type', label: 'Collaboration type' },
    { id: 'goals', label: 'Shared goals' },
    { id: 'collaboration-agreement', label: 'Collaboration agreement', requiresSignature: true },
    { id: 'nda', label: 'NDA', requiresSignature: true },
    { id: 'signature', label: 'Digital signature', requiresSignature: true },
  ],
  investor: [
    { id: 'contact-information', label: 'Contact information' },
    { id: 'investor-type', label: 'Investor type' },
    { id: 'fund-information', label: 'Fund information' },
    { id: 'nda', label: 'NDA', requiresSignature: true },
    { id: 'investor-agreement', label: 'Investor agreement', requiresSignature: true },
    { id: 'signature', label: 'Digital signature', requiresSignature: true },
    { id: 'data-room', label: 'Data room access' },
  ],
  'media-partner': [
    { id: 'media-information', label: 'Outlet information' },
    { id: 'outlet-details', label: 'Outlet details' },
    { id: 'reach-audience', label: 'Reach & audience' },
    { id: 'media-agreement', label: 'Media partnership agreement', requiresSignature: true },
    { id: 'brand-guidelines', label: 'Brand guidelines' },
    { id: 'signature', label: 'Digital signature', requiresSignature: true },
  ],
  'technology-partner': [
    { id: 'company-information', label: 'Company information' },
    { id: 'tech-stack', label: 'Technology stack' },
    { id: 'representative', label: 'Representative' },
    { id: 'business-verification', label: 'Business verification' },
    { id: 'technology-agreement', label: 'Technology partnership agreement', requiresSignature: true },
    { id: 'nda', label: 'NDA', requiresSignature: true },
    { id: 'signature', label: 'Digital signature', requiresSignature: true },
  ],
  other: [
    { id: 'personal-information', label: 'Personal information' },
    { id: 'introduction', label: 'Introduction' },
    { id: 'relationship-details', label: 'Relationship details' },
    { id: 'agreement', label: 'Agreement', requiresSignature: true },
    { id: 'signature', label: 'Digital signature', requiresSignature: true },
  ],
};

/** The onboarding journey a relationship walks, in order. */
export function journeyFor(relationship: RelationshipType): readonly OnboardingStep[] {
  return RELATIONSHIP_JOURNEYS[relationship] ?? RELATIONSHIP_JOURNEYS.other;
}

/** Which steps still need a signature before onboarding can complete. */
export function stepsAwaitingSignature(
  relationship: RelationshipType,
  completed: readonly string[],
): readonly OnboardingStep[] {
  return journeyFor(relationship).filter((s) => s.requiresSignature && !completed.includes(s.id));
}
