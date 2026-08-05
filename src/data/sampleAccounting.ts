// Demo data for the Accounting & Tax (accounting firm) operating system.
// Shown only for the curated accounting spotlight. Reuses business_services
// (service_category = service line), so no migration is needed.

export interface SampleAccountingService {
  id: string;
  name: string;
  description: string;
  price: string;
  service_category: string;   // service line
}

export const SAMPLE_ACCOUNTING_SERVICES: SampleAccountingService[] = [
  { id: 'acc_1', name: 'Monthly bookkeeping', description: 'Records, reconciliations and management accounts. Cloud-based, on time.', price: 'From ₦60,000/mo', service_category: 'Bookkeeping' },
  { id: 'acc_2', name: 'Company tax filing (CIT)', description: 'Annual company income tax computation and filing with FIRS.', price: 'From ₦120,000', service_category: 'Tax' },
  { id: 'acc_3', name: 'VAT & PAYE returns', description: 'Monthly VAT and PAYE preparation, remittance and compliance.', price: 'From ₦45,000/mo', service_category: 'Tax' },
  { id: 'acc_4', name: 'Payroll management', description: 'End-to-end payroll, payslips, pensions and statutory deductions.', price: 'From ₦2,500/staff', service_category: 'Payroll' },
  { id: 'acc_5', name: 'Statutory audit', description: 'Independent audit and financial statements for regulators and banks.', price: 'From ₦350,000', service_category: 'Audit' },
  { id: 'acc_6', name: 'Business registration (CAC)', description: 'Company incorporation, TIN and tax registration handled for you.', price: 'From ₦85,000', service_category: 'Advisory' },
];

// Credential / trust badges (sample-only).
export const ACCOUNTING_CAPABILITIES = [
  'ICAN-certified',
  'FIRS-registered',
  'CAC-accredited',
  'Cloud accounting',
];

export const ACCOUNTING_SPOTLIGHTS: Record<string, any> = {
  business_63: {
    id: 'business_63',
    username: 'ledgerpro-accountants',
    name: 'LedgerPro Chartered Accountants',
    category: 'Accounting & Tax',
    description:
      'Bookkeeping, tax, payroll and audit for SMEs and startups — ICAN-certified and FIRS-registered. Stay compliant and book a free first consultation.',
    location: 'Ikoyi, Lagos',
    phone: '+234 803 990 5521',
    website: 'https://ledgerpro.example.com',
    email: 'hello@ledgerpro.example.com',
    opening_hours: 'Mon–Fri: 8:30AM–5:30PM',
    image_url:
      'https://images.pexels.com/photos/6693661/pexels-photo-6693661.jpeg?auto=compress&cs=tinysrgb&w=800',
    rating: 4.9,
    status: 'open',
    verified: true,
    user_id: 'sample',
  },
};
