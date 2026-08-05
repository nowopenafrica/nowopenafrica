// Demo data for the Insurance (broker / underwriter) operating system.
// Shown only for the curated insurance spotlight. Reuses business_services
// (service_category = policy class), so no migration is needed.

export interface SamplePolicy {
  id: string;
  name: string;
  description: string;
  price: string;
  service_category: string;   // policy class
}

export const SAMPLE_POLICIES: SamplePolicy[] = [
  { id: 'ins_1', name: 'Comprehensive Motor', description: 'Accident, theft, fire and third-party for private and commercial vehicles.', price: 'From ₦45,000/yr', service_category: 'Motor' },
  { id: 'ins_2', name: 'Health / HMO Cover', description: 'Cashless treatment across a wide hospital network for you or your staff.', price: 'From ₦80,000/yr', service_category: 'Health' },
  { id: 'ins_3', name: 'Term Life Assurance', description: 'Income protection and a lump-sum payout for your family. Flexible tenure.', price: 'From ₦30,000/yr', service_category: 'Life' },
  { id: 'ins_4', name: 'Home & Property', description: 'Building and contents cover against fire, flood, burglary and more.', price: 'From ₦55,000/yr', service_category: 'Property' },
  { id: 'ins_5', name: 'Travel Insurance', description: 'Schengen/UK/US-compliant medical, delay and baggage cover per trip.', price: 'From ₦18,000/trip', service_category: 'Travel' },
  { id: 'ins_6', name: 'SME Business Package', description: 'Combined property, liability and group-life cover for small businesses.', price: 'From ₦120,000/yr', service_category: 'Business' },
];

// Marketing trust badges (sample-only).
export const INSURANCE_CAPABILITIES = [
  'NAICOM-licensed',
  'Fast claims',
  'Cashless network',
  '24/7 support',
];

export const INSURANCE_SPOTLIGHTS: Record<string, any> = {
  business_62: {
    id: 'business_62',
    username: 'shield-insurance-brokers',
    name: 'Shield Insurance Brokers',
    category: 'Insurance',
    description:
      'Motor, health, life, property and business cover from Nigeria’s leading underwriters. Compare policies, get an instant quote and file claims with support.',
    location: 'Victoria Island, Lagos',
    phone: '+234 807 443 9915',
    website: 'https://shieldinsure.example.com',
    email: 'cover@shieldinsure.example.com',
    opening_hours: 'Mon–Fri: 8AM–5PM',
    image_url:
      'https://images.pexels.com/photos/5921788/pexels-photo-5921788.jpeg?auto=compress&cs=tinysrgb&w=800',
    rating: 4.7,
    status: 'open',
    verified: true,
    user_id: 'sample',
  },
};
