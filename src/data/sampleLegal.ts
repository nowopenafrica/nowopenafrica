// Demo data for the Legal operating system. Shown only for the curated law-firm
// spotlight. Reuses business_services (service_category = practice area), so no
// migration is needed.

export interface SamplePractice {
  id: string;
  name: string;
  description: string;
  price: string;
  service_category: string;   // practice area
}

export const SAMPLE_PRACTICES: SamplePractice[] = [
  { id: 'law_1', name: 'Company Registration & CAC', description: 'Register your business, file annual returns and stay compliant.', price: 'From ₦80,000', service_category: 'Corporate & Commercial' },
  { id: 'law_2', name: 'Contract Drafting & Review', description: 'Airtight agreements — NDAs, MoUs, service contracts and more.', price: 'From ₦50,000', service_category: 'Corporate & Commercial' },
  { id: 'law_3', name: 'Property & Land (Perfection of Title)', description: 'Deed preparation, governor’s consent and title verification.', price: 'From ₦120,000', service_category: 'Property' },
  { id: 'law_4', name: 'Tenancy & Recovery', description: 'Tenancy agreements and lawful recovery of premises.', price: 'From ₦60,000', service_category: 'Property' },
  { id: 'law_5', name: 'Family Law & Divorce', description: 'Confidential advice on marriage, custody and settlements.', price: 'From ₦70,000', service_category: 'Family' },
  { id: 'law_6', name: 'Debt Recovery & Litigation', description: 'Firm, professional recovery of what you are owed.', price: 'From ₦100,000', service_category: 'Litigation' },
  { id: 'law_7', name: 'Trademark & IP Registration', description: 'Protect your brand — trademarks, patents and copyright.', price: 'From ₦90,000', service_category: 'Intellectual Property' },
];

export const LEGAL_SPOTLIGHTS: Record<string, any> = {
  business_52: {
    id: 'business_52',
    username: 'apex-legal-partners',
    name: 'Apex Legal Partners',
    category: 'Legal Services',
    description:
      'A commercial law firm helping businesses and individuals with company law, property, contracts and dispute resolution. Book a confidential consultation.',
    location: 'Victoria Island, Lagos',
    phone: '+234 800 253 3425',
    website: 'https://apexlegal.example.com',
    email: 'consult@apexlegal.example.com',
    opening_hours: 'Mon–Fri: 9AM–5PM',
    image_url: 'https://images.pexels.com/photos/5668473/pexels-photo-5668473.jpeg?auto=compress&cs=tinysrgb&w=1000',
    rating: 4.9,
    status: 'open',
    verified: true,
    user_id: 'sample',
  },
};
