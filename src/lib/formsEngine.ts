// NowOpen OS — Universal Forms Hub engine (pure, no React / Supabase I/O).
//
// ONE shareable public URL (/forms) serves every relationship journey. This is
// not a collection of forms — it is one form engine driven by a schema per
// relationship. Selecting a type swaps the sections, questions, documents and
// agreements; admins can add new relationship types later without touching the
// frontend. Applications are stored as rows (os_form_applications) with a
// human-readable but unguessable reference — never a predictable sequence.
// Statuses are honest: they only move along a relationship's own pipeline when
// someone actually acts. The component falls back to FORM_APPLICATIONS_SEED /
// local storage until the migration is applied.

import { NOWOPEN_ORG_ID } from './workforce';

export type HubRelationshipType =
  | 'employee'
  | 'intern'
  | 'volunteer'
  | 'partner'
  | 'collaborator'
  | 'business'
  | 'advisor'
  | 'media'
  | 'other';

export interface HubRelationshipOption {
  id: HubRelationshipType;
  label: string;
  emoji: string;
  blurb: string;
  /** Short code used in human-readable references (NOW-EMP-2026-…). */
  code: string;
}

export const HUB_RELATIONSHIPS: readonly HubRelationshipOption[] = [
  { id: 'employee', label: 'Employee', emoji: '👤', code: 'EMP', blurb: 'Join the NowOpen Africa team.' },
  { id: 'intern', label: 'Intern', emoji: '🎓', code: 'INT', blurb: 'Apply for an internship / graduate opportunity.' },
  { id: 'volunteer', label: 'Volunteer', emoji: '🌍', code: 'VOL', blurb: 'Join the NowOpen Africa community and contribute your skills.' },
  { id: 'partner', label: 'Partner', emoji: '🤝', code: 'PTR', blurb: 'Explore a business, strategic or commercial partnership.' },
  { id: 'collaborator', label: 'Collaborator', emoji: '🎨', code: 'COL', blurb: 'Work on a creative, production, technology or special project.' },
  { id: 'business', label: 'Business / Organization', emoji: '🏢', code: 'BIZ', blurb: 'Introduce your company or organization to NowOpen Africa.' },
  { id: 'advisor', label: 'Advisor / Consultant', emoji: '💼', code: 'ADV', blurb: 'Offer professional expertise or advisory support.' },
  { id: 'media', label: 'Media / Creator', emoji: '📰', code: 'MED', blurb: 'Collaborate as a media outlet, creator or influencer.' },
  { id: 'other', label: 'Other', emoji: '✨', code: 'OTH', blurb: 'For relationships that don’t fit the above categories.' },
];

export const HUB_RELATIONSHIP_TYPES: readonly HubRelationshipType[] = HUB_RELATIONSHIPS.map((o) => o.id);

export function hubRelationshipById(id: string): HubRelationshipOption | undefined {
  return HUB_RELATIONSHIPS.find((o) => o.id === id);
}

export const FORM_FIELD_TYPES = [
  'text', 'longtext', 'email', 'phone', 'url', 'number', 'date',
  'select', 'multiselect', 'checkbox', 'radio', 'file', 'country',
  'timezone', 'skills',
] as const;
export type FormFieldType = (typeof FORM_FIELD_TYPES)[number];

export interface FormFieldOption {
  value: string;
  label: string;
}

export interface FormField {
  id: string;
  label: string;
  type: FormFieldType;
  required?: boolean;
  placeholder?: string;
  help?: string;
  options?: readonly FormFieldOption[];
  /** Allowed file extensions for `file` fields. */
  accept?: readonly string[];
}

export interface FormSection {
  id: string;
  title: string;
  description?: string;
  fields: readonly FormField[];
}

/** The agreements a relationship must acknowledge during the application.
 *  `required` means the journey cannot be submitted without the checkbox.
 *  The disclaimer is honest: acknowledgement alone creates no binding
 *  relationship — agreements are separately executed. */
export interface AgreementRequest {
  id: string;
  title: string;
  required: boolean;
}

export interface FormSchema {
  relationship: HubRelationshipType;
  hero: string;
  sections: readonly FormSection[];
  agreements: readonly AgreementRequest[];
  /** Human labels for the wizard steps, derived per relationship. */
  steps: readonly string[];
}

const SELECT_OPTIONS = (list: readonly string[]): readonly FormFieldOption[] =>
  list.map((value) => ({ value, label: value }));

const field = (
  id: string,
  label: string,
  type: FormFieldType,
  opts: Partial<FormField> = {},
): FormField => ({ id, label, type, ...opts });

const SKILL_CHOICES = SELECT_OPTIONS([
  'Product Design', 'UI/UX', 'Software Engineering', 'Marketing', 'Social Media',
  'Communications', 'Finance', 'Sales', 'Operations', 'Motion Design', 'Animation',
  'Video Production', 'Post Production', 'Photography', 'Copywriting',
  'Business Development', 'Data', 'AI',
]);

const COUNTRIES = SELECT_OPTIONS([
  'Nigeria', 'Ghana', 'Kenya', 'South Africa', 'United Kingdom', 'United States',
  'Egypt', 'Rwanda', 'Ethiopia', 'Morocco', 'Canada', 'Germany', 'France',
  'United Arab Emirates', 'Other',
]);

const TIMEZONES = SELECT_OPTIONS([
  'GMT+1 (Nigeria)', 'GMT (London)', 'GMT+2', 'GMT+3', 'GMT+4', 'GMT-5 (US Eastern)',
  'GMT-8 (US Pacific)', 'Other',
]);

const DEPARTMENTS = SELECT_OPTIONS([
  'Creative & Brand', 'Marketing', 'Engineering / Technology', 'Operations',
  'Partnerships', 'Finance', 'Media & Content', 'Community', 'Sales',
]);

const personalFields = (): readonly FormField[] => [
  field('full_name', 'Full name', 'text', { required: true, placeholder: 'e.g. Ada Obi' }),
  field('preferred_name', 'Preferred name', 'text', { placeholder: 'How you’d like to be addressed' }),
  field('email', 'Email', 'email', { required: true, placeholder: 'you@example.com' }),
  field('phone', 'Phone', 'phone', { required: true, placeholder: '+234 800 000 0000' }),
  field('country', 'Country', 'country', { required: true, options: COUNTRIES }),
  field('state_region', 'State / Region', 'text'),
  field('city', 'City', 'text'),
  field('timezone', 'Time zone', 'timezone', { options: TIMEZONES }),
  field('communication_method', 'Preferred communication method', 'select', {
    options: SELECT_OPTIONS(['Email', 'Phone', 'WhatsApp', 'Video call']),
  }),
];

const personalLightFields = (): readonly FormField[] => [
  field('full_name', 'Full name', 'text', { required: true, placeholder: 'e.g. Ada Obi' }),
  field('email', 'Email', 'email', { required: true, placeholder: 'you@example.com' }),
  field('phone', 'Phone', 'phone', { required: true, placeholder: '+234 800 000 0000' }),
  field('country', 'Country', 'country', { required: true, options: COUNTRIES }),
];

const skillsField = (): FormField =>
  field('skills', 'Skills', 'skills', {
    help: 'Select as many as apply — add your own too.',
    options: SKILL_CHOICES,
  });

const consentAgreements = (): readonly AgreementRequest[] => [
  { id: 'privacy-notice', title: 'Privacy & data handling notice', required: true },
  { id: 'accurate', title: 'Information I provide is accurate and current', required: true },
];

// ---------------------------------------------------------------------------
// Schemas. Each relationship owns its sections, conditional questions,
// documents and agreements — the same engine renders every journey.
// ---------------------------------------------------------------------------

export const HUB_FORM_SCHEMAS: Record<HubRelationshipType, FormSchema> = {
  employee: {
    relationship: 'employee',
    hero: 'Join the NowOpen Africa team.',
    steps: ['Profile', 'Professional', 'Opportunity', 'Skills', 'Documents', 'Agreements', 'Review', 'Submit'],
    sections: [
      {
        id: 'personal', title: 'Personal Information', description: 'How we reach you, wherever you are.',
        fields: personalFields(),
      },
      {
        id: 'professional', title: 'Professional Information', description: 'Your experience, expertise and where we can find your work.',
        fields: [
          field('current_occupation', 'Current occupation', 'text', { placeholder: 'e.g. Product Designer' }),
          field('previous_experience', 'Previous experience', 'longtext', { placeholder: 'Briefly describe your most relevant roles.' }),
          field('years_experience', 'Years of experience', 'number', { placeholder: 'e.g. 5' }),
          field('linkedin', 'LinkedIn', 'url', { placeholder: 'https://linkedin.com/in/…' }),
          field('portfolio', 'Portfolio', 'url', { placeholder: 'https://…' }),
          field('professional_website', 'Professional website', 'url', { placeholder: 'https://…' }),
          field('areas_expertise', 'Areas of expertise', 'multiselect', { options: SKILL_CHOICES }),
        ],
      },
      {
        id: 'opportunity', title: 'Employment Interest', description: 'Where you’d fit and when you can start.',
        fields: [
          field('desired_department', 'Desired department', 'select', { required: true, options: DEPARTMENTS }),
          field('desired_role', 'Desired role', 'text', { required: true, placeholder: 'e.g. Senior Motion Designer' }),
          field('employment_type', 'Employment type', 'radio', {
            required: true, options: SELECT_OPTIONS(['Full-time', 'Part-time', 'Contract']),
          }),
          field('work_style', 'Work style', 'radio', {
            required: true, options: SELECT_OPTIONS(['Remote', 'Hybrid', 'On-site']),
          }),
          field('availability', 'Availability', 'text', { placeholder: 'e.g. Immediately, 2 weeks notice' }),
          field('expected_start_date', 'Expected start date', 'date'),
        ],
      },
      { id: 'skills', title: 'Skills', description: 'Pick what you bring — and add what we missed.', fields: [skillsField()] },
      {
        id: 'documents', title: 'Documents', description: 'PDF, DOC, DOCX, JPG, PNG or ZIP — what we need to review your application.',
        fields: [
          field('cv', 'CV', 'file', { required: true, accept: ['.pdf', '.doc', '.docx'] }),
          field('portfolio_file', 'Portfolio', 'file', { accept: ['.pdf', '.docx', '.zip', '.jpg', '.png'] }),
          field('certificates', 'Relevant certificates', 'file', { accept: ['.pdf', '.jpg', '.png'] }),
        ],
      },
      {
        id: 'agreements', title: 'Agreements', description: 'What you acknowledge as part of applying.',
        fields: [
          field('agreed_nda', 'Confidentiality / NDA', 'checkbox', { help: 'I understand and accept the confidentiality expectations of the role.' }),
          field('agreed_code-of-conduct', 'Code of Conduct', 'checkbox', { help: 'I commit to the NowOpen Africa standards of respect, integrity and inclusion.' }),
          field('agreed_privacy', 'Privacy / data handling', 'checkbox', { help: 'I consent to my information being processed for this application.' }),
          field('agreed_ip', 'Intellectual property agreement', 'checkbox', { help: 'Where applicable, I accept the IP terms of the role.' }),
        ],
      },
    ],
    agreements: [
      { id: 'nda', title: 'Confidentiality / NDA', required: true },
      { id: 'code-of-conduct', title: 'Code of Conduct', required: true },
      { id: 'privacy', title: 'Privacy / data handling', required: true },
      { id: 'ip', title: 'Intellectual property agreement', required: false },
      ...consentAgreements(),
    ],
  },

  intern: {
    relationship: 'intern',
    hero: 'Apply for an internship or graduate opportunity.',
    steps: ['Profile', 'Education', 'Internship', 'Skills', 'Portfolio', 'Questions', 'Consent', 'Review', 'Submit'],
    sections: [
      { id: 'personal', title: 'Personal', description: 'How we reach you.', fields: personalLightFields() },
      {
        id: 'education', title: 'Education', description: 'Where you study and what you’re into.',
        fields: [
          field('institution', 'Institution', 'text', { required: true, placeholder: 'e.g. University of Lagos' }),
          field('course', 'Course / field', 'text', { required: true, placeholder: 'e.g. Computer Science' }),
          field('level', 'Level', 'select', { options: SELECT_OPTIONS(['Undergraduate', 'Postgraduate', 'HND', 'Diploma', 'Other']) }),
          field('graduation_year', 'Graduation year', 'number', { placeholder: 'e.g. 2027' }),
          field('academic_interests', 'Academic interests', 'longtext'),
        ],
      },
      {
        id: 'internship', title: 'Internship', description: 'Where you want to spend your placement.',
        fields: [
          field('preferred_department', 'Preferred department', 'select', { required: true, options: DEPARTMENTS }),
          field('preferred_role', 'Preferred role', 'text', { placeholder: 'e.g. Motion Design intern' }),
          field('duration', 'Internship duration', 'select', { options: SELECT_OPTIONS(['3 months', '6 months', '12 months']) }),
          field('start_date', 'Start date', 'date'),
          field('end_date', 'End date', 'date'),
          field('work_style', 'Remote / hybrid', 'radio', { options: SELECT_OPTIONS(['Remote', 'Hybrid', 'On-site']) }),
          field('career_goals', 'Career goals', 'longtext', { help: 'Where do you want this placement to take you?' }),
        ],
      },
      { id: 'skills', title: 'Skills', description: 'What you already bring.', fields: [skillsField()] },
      {
        id: 'portfolio', title: 'Portfolio', description: 'Show us what you can do.',
        fields: [
          field('cv', 'CV', 'file', { required: true, accept: ['.pdf', '.doc', '.docx'] }),
          field('linkedin', 'LinkedIn', 'url', { placeholder: 'https://linkedin.com/in/…' }),
          field('github', 'GitHub', 'url', { placeholder: 'https://github.com/…' }),
          field('behance', 'Behance', 'url', { placeholder: 'https://behance.net/…' }),
          field('portfolio', 'Portfolio', 'url', { placeholder: 'https://…' }),
          field('other_portfolio', 'Other', 'url', { placeholder: 'https://…' }),
        ],
      },
      {
        id: 'questions', title: 'Questions', description: 'Two questions, no wrong answers.',
        fields: [
          field('learn_goals', 'What do you want to learn at NowOpen Africa?', 'longtext', { required: true }),
          field('contribution', 'What can you contribute?', 'longtext', { required: true }),
        ],
      },
      {
        id: 'consent', title: 'Consent', description: 'A few acknowledgements, as applicable.',
        fields: [
          field('agreed_internship-agreement', 'Internship terms', 'checkbox'),
          field('agreed_nda', 'Confidentiality', 'checkbox'),
          field('agreed_code-of-conduct', 'Code of Conduct', 'checkbox'),
        ],
      },
    ],
    agreements: [
      { id: 'internship-agreement', title: 'Internship terms', required: true },
      { id: 'nda', title: 'Confidentiality / NDA', required: true },
      { id: 'code-of-conduct', title: 'Code of Conduct', required: true },
      ...consentAgreements(),
    ],
  },

  volunteer: {
    relationship: 'volunteer',
    hero: 'Join the NowOpen Africa community and contribute your skills.',
    steps: ['Profile', 'Profile', 'Contribution', 'Motivation', 'Agreement', 'Review', 'Submit'],
    sections: [
      {
        id: 'personal', title: 'Personal', description: 'How we reach you.',
        fields: [
          field('full_name', 'Full name', 'text', { required: true, placeholder: 'e.g. Kofi Mensah' }),
          field('email', 'Email', 'email', { required: true, placeholder: 'you@example.com' }),
          field('phone', 'Phone', 'phone', { required: true }),
          field('country', 'Country', 'country', { required: true, options: COUNTRIES }),
          field('city', 'City', 'text'),
          field('timezone', 'Time zone', 'timezone', { options: TIMEZONES }),
        ],
      },
      {
        id: 'volunteer_profile', title: 'Volunteer Profile', description: 'How you want to give your time.',
        fields: [
          field('areas_interest', 'Areas of interest', 'multiselect', { options: SELECT_OPTIONS(['Community', 'Events', 'Design', 'Technology', 'Research', 'Content']) }),
          skillsField(),
          field('availability', 'Availability', 'select', { options: SELECT_OPTIONS(['Weekdays', 'Weekends', 'Evenings', 'Flexible']) }),
          field('commitment', 'Preferred commitment', 'select', { options: SELECT_OPTIONS(['A few hours a month', 'A few hours a week', 'Flexible']) }),
          field('work_style', 'Remote / local', 'radio', { options: SELECT_OPTIONS(['Remote', 'Local', 'Both']) }),
          field('languages', 'Languages', 'text', { placeholder: 'e.g. English, Yoruba, French' }),
        ],
      },
      {
        id: 'contribution', title: 'Contribution Areas', description: 'Where you can make the biggest difference.',
        fields: [
          field('contribution_areas', 'Contribution areas', 'multiselect', {
            options: SELECT_OPTIONS(['Community', 'Events', 'Marketing', 'Social Media', 'Content', 'Design', 'Technology', 'Research', 'Business Development', 'Communications', 'Production', 'Operations', 'Other']),
          }),
        ],
      },
      {
        id: 'motivation', title: 'Motivation',
        fields: [field('motivation', 'What would you like to contribute to NowOpen Africa?', 'longtext', { required: true })],
      },
      {
        id: 'agreement', title: 'Agreement', description: 'Mutual expectations for community ambassadors and volunteers.',
        fields: [
          field('agreed_volunteer-agreement', 'Volunteer agreement', 'checkbox'),
          field('agreed_nda', 'Confidentiality', 'checkbox'),
          field('agreed_code-of-conduct', 'Code of Conduct', 'checkbox'),
          field('agreed_safeguarding', 'Safety / safeguarding', 'checkbox'),
        ],
      },
    ],
    agreements: [
      { id: 'volunteer-agreement', title: 'Volunteer agreement', required: true },
      { id: 'nda', title: 'Confidentiality', required: true },
      { id: 'code-of-conduct', title: 'Code of Conduct', required: true },
      { id: 'safeguarding', title: 'Safety / safeguarding', required: true },
      ...consentAgreements(),
    ],
  },

  partner: {
    relationship: 'partner',
    hero: 'Explore a business, strategic or commercial partnership.',
    steps: ['Organization', 'Representative', 'Partnership', 'Proposal', 'Attachments', 'NDA', 'Review', 'Submit'],
    sections: [
      {
        id: 'organization', title: 'Organization', description: 'Tell us about the company.',
        fields: [
          field('company_name', 'Company / organization name', 'text', { required: true }),
          field('website', 'Website', 'url', { placeholder: 'https://…' }),
          field('industry', 'Industry', 'select', { options: SELECT_OPTIONS(['Technology', 'Media', 'Finance', 'Consumer goods', 'Agriculture', 'Education', 'Healthcare', 'Logistics', 'Entertainment', 'Other']) }),
          field('country', 'Country', 'country', { required: true, options: COUNTRIES }),
          field('city', 'City', 'text'),
          field('org_size', 'Organization size', 'select', { options: SELECT_OPTIONS(['1-10', '11-50', '51-200', '201-1000', '1000+']) }),
        ],
      },
      {
        id: 'representative', title: 'Representative', description: 'Who we’ll be speaking with.',
        fields: [
          field('full_name', 'Full name', 'text', { required: true }),
          field('job_title', 'Job title', 'text', { required: true }),
          field('email', 'Email', 'email', { required: true }),
          field('phone', 'Phone', 'phone', { required: true }),
          field('linkedin', 'LinkedIn', 'url'),
        ],
      },
      {
        id: 'partnership', title: 'Partnership Type', description: 'What kind of partnership are you exploring?',
        fields: [
          field('partnership_type', 'Partnership type', 'multiselect', {
            options: SELECT_OPTIONS(['Strategic', 'Business', 'Technology', 'Media', 'Marketing', 'Distribution', 'Community', 'Sponsorship', 'Investment', 'Other']),
          }),
        ],
      },
      {
        id: 'proposal', title: 'Partnership Proposal', description: 'The more specific, the better.',
        fields: [
          field('proposal', 'What are you proposing?', 'longtext', { required: true }),
          field('problem', 'What problem does the partnership solve?', 'longtext'),
          field('contributions', 'What does each party contribute?', 'longtext'),
          field('target_audience', 'Target audience', 'longtext'),
          field('expected_outcomes', 'Expected outcomes', 'longtext'),
          field('timeline', 'Proposed timeline', 'text'),
          field('geographic_scope', 'Geographic scope', 'text', { placeholder: 'e.g. Lagos + Abuja, or pan-African' }),
        ],
      },
      {
        id: 'attachments', title: 'Attachments', description: 'Company profile, proposal or pitch deck — anything that helps.',
        fields: [
          field('company_profile', 'Company profile', 'file', { accept: ['.pdf', '.doc', '.docx'] }),
          field('proposal_doc', 'Proposal', 'file', { accept: ['.pdf', '.docx', '.zip'] }),
          field('pitch_deck', 'Pitch deck', 'file', { accept: ['.pdf', '.pptx', '.zip'] }),
          field('relevant_docs', 'Relevant documents', 'file', { accept: ['.pdf', '.doc', '.docx', '.zip'] }),
        ],
      },
      {
        id: 'nda', title: 'NDA', description: 'Only where your business workflow requires it.',
        fields: [
          field('agreed_nda', 'NDA', 'checkbox', { help: 'I’m happy to sign an NDA to move discussions forward (optional).' }),
        ],
      },
    ],
    agreements: [
      { id: 'nda', title: 'NDA (where applicable)', required: false },
      ...consentAgreements(),
    ],
  },

  collaborator: {
    relationship: 'collaborator',
    hero: 'Work with NowOpen Africa on a creative, production, technology or special project.',
    steps: ['Profile', 'Category', 'Portfolio', 'Proposal', 'Documents', 'Review', 'Submit'],
    sections: [
      {
        id: 'personal', title: 'Profile', description: 'Who you are and where we find your work.',
        fields: [
          field('full_name', 'Full name', 'text', { required: true }),
          field('organization', 'Organization', 'text', { placeholder: 'Optional — if this is for a studio or collective' }),
          field('email', 'Email', 'email', { required: true }),
          field('phone', 'Phone', 'phone', { required: true }),
          field('country', 'Country', 'country', { required: true, options: COUNTRIES }),
          field('role', 'Role', 'text', { placeholder: 'e.g. Motion Designer, Editor, Engineer' }),
        ],
      },
      {
        id: 'category', title: 'Collaboration Category', description: 'Where your work fits.',
        fields: [
          field('collaboration_category', 'Collaboration category', 'radio', {
            required: true,
            options: SELECT_OPTIONS(['Creative', 'Design', 'UI/UX', 'Motion Design', 'Animation', 'Video', 'Photography', 'Music / Audio', 'Technology', 'Software', 'AI', 'Marketing', 'Communications', 'Production', 'Post Production', 'Events', 'Research', 'Other']),
          }),
        ],
      },
      {
        id: 'portfolio', title: 'Portfolio', description: 'Your best work, up front.',
        fields: [
          field('portfolio', 'Portfolio', 'url', { placeholder: 'https://…' }),
          field('website', 'Website', 'url', { placeholder: 'https://…' }),
          field('social', 'Social profiles', 'url', { placeholder: 'https://instagram.com/…' }),
          field('previous_work', 'Previous work', 'longtext'),
          field('expertise', 'Areas of expertise', 'multiselect', { options: SKILL_CHOICES }),
          field('availability', 'Availability', 'text'),
        ],
      },
      {
        id: 'proposal', title: 'Collaboration Proposal', description: 'What you’d love to build together.',
        fields: [
          field('collaboration_proposal', 'Collaboration proposal', 'longtext', { required: true }),
          field('engagement_model', 'Preferred engagement model', 'select', { options: SELECT_OPTIONS(['Project-based', 'Retainer', 'Revenue share', 'Partnership', 'Open to discussion']) }),
          field('rate', 'Rate / commercial terms', 'text', { placeholder: 'Where appropriate — optional' }),
        ],
      },
      {
        id: 'documents', title: 'Documents', description: 'Where applicable.',
        fields: [
          field('agreed_nda', 'NDA', 'checkbox', { help: 'Happy to sign an NDA (optional).' }),
          field('agreed_collaboration', 'Collaboration agreement', 'checkbox'),
          field('agreed_ip', 'IP / rights documentation', 'checkbox'),
          field('sow', 'Statement of Work', 'file', { accept: ['.pdf', '.docx'] }),
        ],
      },
    ],
    agreements: [
      { id: 'nda', title: 'NDA (where applicable)', required: false },
      { id: 'collaboration', title: 'Collaboration agreement', required: true },
      { id: 'ip', title: 'IP / rights', required: true },
      ...consentAgreements(),
    ],
  },

  business: {
    relationship: 'business',
    hero: 'Introduce your company or organization to NowOpen Africa.',
    steps: ['Organization', 'Details', 'Needs', 'Proposal', 'Review', 'Submit'],
    sections: [
      {
        id: 'organization', title: 'Organization', description: 'The basics.',
        fields: [
          field('business_name', 'Business name', 'text', { required: true }),
          field('registration', 'Registration information', 'text', { placeholder: 'Where applicable — e.g. CAC number' }),
          field('industry', 'Industry', 'select', { options: SELECT_OPTIONS(['Technology', 'Media', 'Finance', 'Consumer goods', 'Agriculture', 'Education', 'Healthcare', 'Logistics', 'Entertainment', 'Other']) }),
          field('website', 'Website', 'url'),
          field('social', 'Social accounts', 'url'),
          field('country', 'Country', 'country', { required: true, options: COUNTRIES }),
          field('city', 'City', 'text'),
        ],
      },
      {
        id: 'details', title: 'Details', description: 'What you do.',
        fields: [
          field('contact_person', 'Contact person', 'text', { required: true }),
          field('business_size', 'Business size', 'select', { options: SELECT_OPTIONS(['1-10', '11-50', '51-200', '201-1000', '1000+']) }),
          field('services', 'Services', 'multiselect', { options: SELECT_OPTIONS(['Software', 'Design', 'Marketing', 'Media', 'Production', 'Distribution', 'Consulting', 'Other']) }),
          field('products', 'Products', 'longtext'),
        ],
      },
      {
        id: 'needs', title: 'Needs', description: 'What you want from a relationship with NowOpen Africa.',
        fields: [
          field('marketing_needs', 'Marketing needs', 'multiselect', { options: SELECT_OPTIONS(['Brand awareness', 'Lead generation', 'Campaigns', 'Content', 'Social media', 'Events']) }),
          field('technology_needs', 'Technology needs', 'multiselect', { options: SELECT_OPTIONS(['Software', 'AI', 'Data', 'Integrations', 'Automation']) }),
          field('media_needs', 'Media needs', 'multiselect', { options: SELECT_OPTIONS(['Coverage', 'Press', 'Amplification', 'Creator partnerships']) }),
          field('advertising_needs', 'Advertising needs', 'multiselect', { options: SELECT_OPTIONS(['Paid social', 'Display', 'Video ads', 'Sponsorships']) }),
        ],
      },
      {
        id: 'proposal', title: 'Proposal', description: 'Tell us how you’d like to work together.',
        fields: [
          field('collaboration_proposal', 'Collaboration proposal', 'longtext', { required: true }),
          field('attachments', 'Supporting documents', 'file', { accept: ['.pdf', '.docx', '.zip'] }),
        ],
      },
    ],
    agreements: consentAgreements(),
  },

  advisor: {
    relationship: 'advisor',
    hero: 'Offer professional expertise or advisory support.',
    steps: ['Profile', 'Expertise', 'Advisory', 'Documents', 'Review', 'Submit'],
    sections: [
      {
        id: 'personal', title: 'Profile', description: 'Who you are and where you advise.',
        fields: [
          field('full_name', 'Name', 'text', { required: true }),
          field('professional_title', 'Professional title', 'text', { placeholder: 'e.g. General Counsel, Product Lead' }),
          field('company', 'Company', 'text'),
          field('email', 'Email', 'email', { required: true }),
          field('country', 'Country', 'country', { required: true, options: COUNTRIES }),
          field('linkedin', 'LinkedIn', 'url'),
          field('portfolio', 'Portfolio', 'url'),
        ],
      },
      {
        id: 'expertise', title: 'Expertise', description: 'Where your experience runs deep.',
        fields: [
          field('expertise', 'Expertise', 'multiselect', { options: SELECT_OPTIONS(['Strategy', 'Legal', 'Finance', 'Marketing', 'Operations', 'Product', 'Engineering', 'Fundraising', 'People', 'Other']) }),
          field('years_experience', 'Years of experience', 'number'),
        ],
      },
      {
        id: 'advisory', title: 'Advisory', description: 'How you’d like to help.',
        fields: [
          field('advisory_interests', 'Areas of advisory interest', 'multiselect', { options: SELECT_OPTIONS(['Company strategy', 'Product', 'Growth', 'Fundraising', 'Legal & compliance', 'Operations', 'Network & partnerships']) }),
          field('availability', 'Availability', 'text', { placeholder: 'e.g. 2 hours / month' }),
          field('proposed_contribution', 'Proposed contribution', 'longtext', { required: true }),
          field('engagement_preferences', 'Engagement preferences', 'longtext'),
        ],
      },
      {
        id: 'documents', title: 'Documents', description: 'Where applicable.',
        fields: [
          field('cv', 'CV', 'file', { accept: ['.pdf', '.doc', '.docx'] }),
          field('portfolio_file', 'Portfolio', 'file', { accept: ['.pdf', '.zip'] }),
          field('proposal', 'Proposal', 'file', { accept: ['.pdf', '.docx'] }),
          field('agreed_nda', 'NDA', 'checkbox', { help: 'Where applicable (optional).' }),
          field('agreed_advisor', 'Advisor / consultancy agreement', 'checkbox', { help: 'Where applicable (optional).' }),
        ],
      },
    ],
    agreements: [
      { id: 'nda', title: 'NDA (where applicable)', required: false },
      { id: 'advisor', title: 'Advisor / consultancy agreement', required: false },
      ...consentAgreements(),
    ],
  },

  media: {
    relationship: 'media',
    hero: 'Collaborate with NowOpen Africa as a media outlet, creator or influencer.',
    steps: ['Profile', 'Audience', 'Collaboration', 'Review', 'Submit'],
    sections: [
      {
        id: 'profile', title: 'Profile', description: 'Your outlet or creator presence.',
        fields: [
          field('creator_name', 'Creator / media name', 'text', { required: true }),
          field('entity_type', 'Individual or organization', 'radio', { required: true, options: SELECT_OPTIONS(['Individual', 'Organization']) }),
          field('platform', 'Platform', 'multiselect', { options: SELECT_OPTIONS(['YouTube', 'Instagram', 'TikTok', 'LinkedIn', 'X / Twitter', 'Podcast', 'Newsletter', 'TV', 'Radio', 'Print']) }),
          field('website', 'Website', 'url'),
          field('social', 'Social profiles', 'url'),
        ],
      },
      {
        id: 'audience', title: 'Audience', description: 'Who you reach.',
        fields: [
          field('audience_size', 'Audience size', 'text', { placeholder: 'e.g. 150k across platforms' }),
          field('audience_location', 'Audience location', 'text', { placeholder: 'e.g. Nigeria, Ghana, UK diaspora' }),
          field('content_category', 'Content category', 'multiselect', { options: SELECT_OPTIONS(['Business', 'Tech', 'Design', 'Entertainment', 'Culture', 'News', 'Lifestyle', 'Finance', 'Education']) }),
          field('campaign_experience', 'Campaign experience', 'longtext', { help: 'Brand work you’ve done before.' }),
        ],
      },
      {
        id: 'collaboration', title: 'Collaboration', description: 'How you’d like to work together.',
        fields: [
          field('collaboration_interests', 'Collaboration interests', 'longtext', { required: true }),
          field('rate_card', 'Rate card', 'text', { placeholder: 'Where applicable' }),
          field('availability', 'Availability', 'text'),
          field('portfolio', 'Portfolio', 'url'),
        ],
      },
    ],
    agreements: [
      { id: 'media-agreement', title: 'Media partnership terms', required: true },
      ...consentAgreements(),
    ],
  },

  other: {
    relationship: 'other',
    hero: 'For relationships that don’t fit the above categories.',
    steps: ['Profile', 'Details', 'Review', 'Submit'],
    sections: [
      { id: 'personal', title: 'Profile', description: 'The basics.', fields: personalLightFields() },
      {
        id: 'details', title: 'Details',
        fields: [
          field('relationship_details', 'How would you like to work with NowOpen Africa?', 'longtext', { required: true }),
          field('attachments', 'Supporting documents', 'file', { accept: ['.pdf', '.docx', '.zip'] }),
        ],
      },
    ],
    agreements: consentAgreements(),
  },
};

export function schemaFor(relationship: HubRelationshipType): FormSchema {
  return HUB_FORM_SCHEMAS[relationship] ?? HUB_FORM_SCHEMAS.other;
}

/** Every field across a schema, flattened for validation and rendering. */
export function allFieldsFor(schema: FormSchema): FormField[] {
  return schema.sections.flatMap((s) => [...s.fields]);
}

// ---------------------------------------------------------------------------
// Validation — honest rules, rendered next to the field that failed.
// ---------------------------------------------------------------------------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[+()\d\s-]{7,20}$/;

export function validateForm(
  schema: FormSchema,
  answers: Record<string, unknown>,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const f of allFieldsFor(schema)) {
    const value = answers[f.id];
    const empty = value === undefined || value === null || value === '' ||
      (Array.isArray(value) && value.length === 0);
    if (f.required && empty) {
      errors[f.id] = 'This field is required';
      continue;
    }
    if (empty) continue;
    if (f.type === 'email' && typeof value === 'string' && !EMAIL_RE.test(value)) {
      errors[f.id] = 'Enter a valid email address';
    }
    if (f.type === 'phone' && typeof value === 'string' && !PHONE_RE.test(value)) {
      errors[f.id] = 'Enter a valid phone number';
    }
    if (f.type === 'url' && typeof value === 'string' && value.trim() && !/^https?:\/\/.+/.test(value)) {
      errors[f.id] = 'Enter a full URL starting with http(s)://';
    }
    if (f.type === 'number' && typeof value === 'string' && value !== '' && Number.isNaN(Number(value))) {
      errors[f.id] = 'Enter a number';
    }
  }
  return errors;
}

export function hasErrors(errors: Record<string, string>): boolean {
  return Object.keys(errors).length > 0;
}

/** Required agreements the journey has not yet accepted. The Submit step uses
 *  this so a missing acknowledgement blocks submission honestly. */
export function missingRequiredAgreements(
  schema: FormSchema,
  answers: Record<string, unknown>,
): string[] {
  return schema.agreements
    .filter((a) => a.required && answers[`agreed_${a.id}`] !== true)
    .map((a) => a.title);
}

// ---------------------------------------------------------------------------
// File uploads — metadata only in this phase; real storage is a later phase.
// ---------------------------------------------------------------------------

export const ALLOWED_UPLOAD_TYPES = ['pdf', 'doc', 'docx', 'jpg', 'png', 'zip'] as const;
export const MAX_UPLOAD_MB = 10;

export interface UploadedFile {
  name: string;
  type: string;
  size: number;
}

export function isAllowedUpload(file: { name: string }): boolean {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  return (ALLOWED_UPLOAD_TYPES as readonly string[]).includes(ext);
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ---------------------------------------------------------------------------
// Pipelines — each relationship walks its own honest status journey.
// ---------------------------------------------------------------------------

export const APPLICATION_STATUSES = [
  'new', 'screening', 'under-review', 'interview', 'documents', 'agreement',
  'approved', 'onboarding', 'active', 'archived',
  'qualification', 'discussion', 'proposal', 'nda',
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string> = {
  new: 'New',
  screening: 'Screening',
  'under-review': 'Under review',
  interview: 'Interview / discussion',
  documents: 'Documents',
  agreement: 'Agreement',
  approved: 'Approved',
  onboarding: 'Onboarding',
  active: 'Active',
  archived: 'Archived',
  qualification: 'Qualification',
  discussion: 'Discussion',
  proposal: 'Proposal',
  nda: 'NDA',
};

const DEFAULT_PIPELINE: readonly ApplicationStatus[] = [
  'new', 'screening', 'under-review', 'interview', 'documents', 'agreement',
  'approved', 'onboarding', 'active', 'archived',
];

const PARTNER_PIPELINE: readonly ApplicationStatus[] = [
  'new', 'qualification', 'discussion', 'proposal', 'nda', 'agreement', 'approved', 'active',
];

export function pipelineFor(relationship: HubRelationshipType): readonly ApplicationStatus[] {
  return relationship === 'partner' ? PARTNER_PIPELINE : DEFAULT_PIPELINE;
}

export function nextStatus(relationship: HubRelationshipType, status: ApplicationStatus): ApplicationStatus | null {
  const pipeline = pipelineFor(relationship);
  const i = pipeline.indexOf(status);
  if (i < 0 || i >= pipeline.length - 1) return null;
  return pipeline[i + 1];
}

export function advanceStatus(
  relationship: HubRelationshipType,
  status: ApplicationStatus,
): ApplicationStatus {
  return nextStatus(relationship, status) ?? status;
}

/** OS-24 Applications Review: honest reviewer decisions on a submission.
 *  Advancing moves the application one step along its own relationship
 *  pipeline; rejecting archives it with a note; reopening puts it back at the
 *  front of the same pipeline. These only record the decision — nothing else
 *  happens automatically, and no profile is created until onboarding. */

export function applicationPipeline(app: Pick<FormApplication, 'relationship'>): readonly ApplicationStatus[] {
  return pipelineFor(app.relationship);
}

export function nextStatusFor(app: Pick<FormApplication, 'relationship' | 'status'>): ApplicationStatus | null {
  return nextStatus(app.relationship, app.status);
}

export function canAdvance(app: Pick<FormApplication, 'relationship' | 'status'>): boolean {
  return nextStatusFor(app) !== null;
}

export function advanceApplication(app: FormApplication, at = new Date()): FormApplication {
  const next = nextStatusFor(app);
  if (!next) return app;
  return { ...app, status: next, updated_at: at.toISOString() };
}

export function rejectApplication(app: FormApplication, at = new Date(), note?: string): FormApplication {
  return { ...app, status: 'archived', rejected: true, decision_note: note, updated_at: at.toISOString() };
}

export function reopenApplication(app: FormApplication, at = new Date()): FormApplication {
  return { ...app, status: 'new', rejected: false, decision_note: undefined, updated_at: at.toISOString() };
}

/** The agreement ids an application acknowledged (its agreed_* answers). */
export function acknowledgedAgreements(app: FormApplication): string[] {
  return Object.entries(app.answers)
    .filter(([key, v]) => key.startsWith('agreed_') && v === true)
    .map(([key]) => key.slice('agreed_'.length));
}

// ---------------------------------------------------------------------------
// Submissions — stored as rows; references are human-readable but unguessable.
// ---------------------------------------------------------------------------

export interface FormApplication {
  id: string;
  org_id: string;
  reference: string;
  relationship: HubRelationshipType;
  applicant_name: string;
  email: string;
  country: string;
  status: ApplicationStatus;
  source?: string;
  answers: Record<string, unknown>;
  consent: boolean;
  consent_at?: string;
  submitted_at: string;
  created_at?: string;
  updated_at?: string;
  /** Reviewer decision fields (OS-24). */
  rejected?: boolean;
  decision_note?: string;
}

export interface ApplicationRow {
  id: string;
  org_id: string;
  reference: string;
  relationship: string;
  applicant_name: string;
  email: string;
  country: string;
  status: string;
  source?: string | null;
  answers?: unknown;
  consent: boolean;
  consent_at?: string | null;
  submitted_at: string;
  created_at?: string;
  updated_at?: string;
  rejected?: boolean | null;
  decision_note?: string | null;
}

const RANDOM_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateReference(relationship: HubRelationshipType, at = new Date()): string {
  const code = hubRelationshipById(relationship)?.code ?? 'OTH';
  let random = '';
  for (let i = 0; i < 4; i += 1) random += RANDOM_CHARS[Math.floor(Math.random() * RANDOM_CHARS.length)];
  return `NOW-${code}-${at.getFullYear()}-${random}`;
}

export interface SubmissionInput {
  relationship: HubRelationshipType;
  applicantName: string;
  email: string;
  country: string;
  answers: Record<string, unknown>;
  consent: boolean;
  source?: string;
}

export type SubmissionResult =
  | { ok: true; application: FormApplication }
  | { ok: false; errors: Record<string, string> };

/** Create a submission. Consent is non-negotiable; the reference is random,
 *  so it can't be enumerated to read other people's applications. */
export function createFormSubmission(input: SubmissionInput): SubmissionResult {
  const errors: Record<string, string> = {};
  if (!input.consent) errors.consent = 'You must accept the privacy notice to submit';
  if (!input.applicantName.trim()) errors.applicant_name = 'This field is required';
  if (!EMAIL_RE.test(input.email.trim())) errors.email = 'Enter a valid email address';
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  const now = new Date().toISOString();
  return {
    ok: true,
    application: {
      id: crypto.randomUUID?.() ?? `app-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
      org_id: NOWOPEN_ORG_ID,
      reference: generateReference(input.relationship),
      relationship: input.relationship,
      applicant_name: input.applicantName.trim(),
      email: input.email.trim().toLowerCase(),
      country: input.country,
      status: 'new',
      source: input.source,
      answers: input.answers,
      consent: true,
      consent_at: now,
      submitted_at: now,
      created_at: now,
      updated_at: now,
    },
  };
}

export function mapApplicationRow(row: ApplicationRow): FormApplication {
  const relationship = HUB_RELATIONSHIP_TYPES.find((r) => r === row.relationship) ?? 'other';
  const status = APPLICATION_STATUSES.find((s) => s === row.status) ?? 'new';
  return {
    id: row.id,
    org_id: row.org_id,
    reference: row.reference,
    relationship,
    applicant_name: row.applicant_name,
    email: row.email,
    country: row.country,
    status,
    source: row.source ?? undefined,
    answers: typeof row.answers === 'object' && row.answers !== null
      ? (row.answers as Record<string, unknown>)
      : {},
    consent: row.consent,
    consent_at: row.consent_at ?? undefined,
    submitted_at: row.submitted_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    rejected: row.rejected ?? undefined,
    decision_note: row.decision_note ?? undefined,
  };
}

/** The snake_case row pushed to os_form_applications. */
export function toApplicationRow(app: FormApplication): ApplicationRow {
  return {
    id: app.id,
    org_id: app.org_id,
    reference: app.reference,
    relationship: app.relationship,
    applicant_name: app.applicant_name,
    email: app.email,
    country: app.country,
    status: app.status,
    source: app.source ?? null,
    answers: app.answers,
    consent: app.consent,
    consent_at: app.consent_at ?? null,
    submitted_at: app.submitted_at,
    created_at: app.created_at,
    updated_at: app.updated_at,
    rejected: app.rejected ?? null,
    decision_note: app.decision_note ?? null,
  };
}

export interface ApplicationsSummary {
  total: number;
  today: number;
  thisWeek: number;
  pendingReview: number;
  approved: number;
  rejected: number;
  awaitingDocuments: number;
  awaitingAgreement: number;
  byRelationship: Record<HubRelationshipType, number>;
}

/** Rollups for the admin dashboard — everything derived, never guessed. */
export function summarizeApplications(apps: FormApplication[], now = new Date()): ApplicationsSummary {
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);
  const byRelationship = Object.fromEntries(
    HUB_RELATIONSHIP_TYPES.map((r) => [r, 0]),
  ) as Record<HubRelationshipType, number>;
  let today = 0;
  let thisWeek = 0;
  let pendingReview = 0;
  let approved = 0;
  let rejected = 0;
  let awaitingDocuments = 0;
  let awaitingAgreement = 0;
  for (const a of apps) {
    byRelationship[a.relationship] = (byRelationship[a.relationship] ?? 0) + 1;
    const at = a.submitted_at ? new Date(a.submitted_at) : null;
    if (at && at >= startOfDay) today += 1;
    if (at && at >= weekAgo) thisWeek += 1;
    if (a.status === 'new' || a.status === 'screening' || a.status === 'under-review' || a.status === 'interview') pendingReview += 1;
    if (a.status === 'approved') approved += 1;
    if (a.status === 'archived' && a.rejected === true) rejected += 1;
    if (a.status === 'documents') awaitingDocuments += 1;
    if (a.status === 'agreement') awaitingAgreement += 1;
  }
  return {
    total: apps.length, today, thisWeek, pendingReview, approved, rejected,
    awaitingDocuments, awaitingAgreement, byRelationship,
  };
}

// ---------------------------------------------------------------------------
// Dev fallback ledger, mirrored by the 20260813090000_os_form_applications
// seed. The public page never reads it; the admin dashboard falls back to it
// until the migration is applied. Keep in sync with the SQL seed.
// ---------------------------------------------------------------------------

export const FORM_APPLICATIONS_SEED: FormApplication[] = [
  {
    id: 'seed-app-0', org_id: NOWOPEN_ORG_ID, reference: 'NOW-EMP-2026-8K2MZ4',
    relationship: 'employee', applicant_name: 'Chukwu Emeka', email: 'chukwu@nowopen.africa',
    country: 'Nigeria', status: 'approved', source: 'linkedin',
    answers: { desired_role: 'Senior Motion Designer', desired_department: 'Creative & Brand' },
    consent: true, submitted_at: '2026-08-01T09:15:00Z',
  },
  {
    id: 'seed-app-1', org_id: NOWOPEN_ORG_ID, reference: 'NOW-INT-2026-4QX7A9',
    relationship: 'intern', applicant_name: 'Ada Obi', email: 'ada@nowopen.africa',
    country: 'Nigeria', status: 'new', source: 'university',
    answers: { institution: 'University of Lagos', course: 'Computer Science' },
    consent: true, submitted_at: '2026-08-12T14:00:00Z',
  },
  {
    id: 'seed-app-2', org_id: NOWOPEN_ORG_ID, reference: 'NOW-VOL-2026-9MNP3B',
    relationship: 'volunteer', applicant_name: 'Kofi Mensah', email: 'kofi@example.com',
    country: 'Ghana', status: 'onboarding',
    answers: { contribution_areas: ['Community', 'Events'] },
    consent: true, submitted_at: '2026-07-15T10:30:00Z',
  },
  {
    id: 'seed-app-3', org_id: NOWOPEN_ORG_ID, reference: 'NOW-PTR-2026-2JKL8C',
    relationship: 'partner', applicant_name: 'Meatclub Nigeria', email: 'ops@meatclub.ng',
    country: 'Nigeria', status: 'agreement', source: 'referral',
    answers: { partnership_type: ['Business'], proposal: 'Restaurant discovery distribution' },
    consent: true, submitted_at: '2026-08-03T11:00:00Z',
  },
  {
    id: 'seed-app-4', org_id: NOWOPEN_ORG_ID, reference: 'NOW-MED-2026-6TRV2D',
    relationship: 'media', applicant_name: 'Nairobi Media House', email: 'news@nairobi.media',
    country: 'Kenya', status: 'discussion', source: 'event',
    answers: { platform: ['Newsletter', 'LinkedIn'], audience_size: '40k' },
    consent: true, submitted_at: '2026-08-10T08:45:00Z',
  },
];
