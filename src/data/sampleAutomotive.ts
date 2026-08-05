// Demo data for the Automotive (auto service / repair) operating system.
// Shown only for the curated auto-workshop spotlight. Reuses business_services
// (service_category = job type), so no migration is needed.

export interface SampleAutoService {
  id: string;
  name: string;
  description: string;
  price: string;
  service_category: string;   // job type
}

export const SAMPLE_AUTO_SERVICES: SampleAutoService[] = [
  { id: 'auto_1', name: 'Full service & inspection', description: 'Oil, filters, fluids, 40-point safety check and report.', price: 'From ₦45,000', service_category: 'Maintenance' },
  { id: 'auto_2', name: 'Computer diagnostics', description: 'OBD-II scan — engine, ABS, transmission fault codes read and explained.', price: '₦15,000', service_category: 'Diagnostics' },
  { id: 'auto_3', name: 'Brake pads & discs', description: 'Genuine parts, front or rear, fitted and road-tested same day.', price: 'From ₦38,000', service_category: 'Repairs' },
  { id: 'auto_4', name: 'AC re-gas & repair', description: 'Leak test, compressor check and full re-gas for cold air.', price: 'From ₦30,000', service_category: 'Repairs' },
  { id: 'auto_5', name: 'Tyre change & wheel alignment', description: 'Balancing and 4-wheel laser alignment for even wear.', price: 'From ₦25,000', service_category: 'Tyres & Wheels' },
  { id: 'auto_6', name: 'Dent removal & respray', description: 'Panel beating and colour-matched respray by the panel.', price: 'From ₦60,000', service_category: 'Bodywork' },
];

// Marketing trust badges (sample-only).
export const AUTO_CAPABILITIES = [
  'Certified technicians',
  'Genuine parts',
  '6-month warranty',
  'Free pickup & drop-off',
];

export const AUTOMOTIVE_SPOTLIGHTS: Record<string, any> = {
  business_58: {
    id: 'business_58',
    username: 'autopro-service-centre',
    name: 'AutoPro Service Centre',
    category: 'Automotive',
    description:
      'Multi-brand car servicing, diagnostics and repairs with genuine parts and a warranty. Book a slot online or request roadside assistance.',
    location: 'Ikeja, Lagos',
    phone: '+234 803 226 7700',
    website: 'https://autopro.example.com',
    email: 'workshop@autopro.example.com',
    opening_hours: 'Mon–Sat: 8AM–7PM',
    image_url:
      'https://images.pexels.com/photos/3807386/pexels-photo-3807386.jpeg?auto=compress&cs=tinysrgb&w=800',
    rating: 4.7,
    status: 'open',
    verified: true,
    user_id: 'sample',
  },
};
