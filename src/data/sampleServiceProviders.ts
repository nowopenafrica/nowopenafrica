// Demo data for the Service Providers operating system (plumbers, electricians,
// cleaners, technicians). Shown only for the curated spotlight. Reuses
// business_services (service_category = job type), so no migration is needed.

export interface SampleJob {
  id: string;
  name: string;
  description: string;
  price: string;
  service_category: string;   // job type
}

export const SAMPLE_JOBS: SampleJob[] = [
  { id: 'svc_1', name: 'Deep Home Cleaning (3-bed)', description: 'Full clean — floors, kitchen, bathrooms and windows.', price: 'From ₦25,000', service_category: 'Cleaning' },
  { id: 'svc_2', name: 'Post-Construction Cleaning', description: 'Remove dust, paint and debris after building work.', price: 'From ₦40,000', service_category: 'Cleaning' },
  { id: 'svc_3', name: 'Plumbing Repair', description: 'Leaks, blockages, taps, toilets and water systems.', price: 'From ₦8,000', service_category: 'Plumbing' },
  { id: 'svc_4', name: 'Electrical Fault Fixing', description: 'Wiring, sockets, DB boards and lighting faults.', price: 'From ₦10,000', service_category: 'Electrical' },
  { id: 'svc_5', name: 'AC Installation & Servicing', description: 'Install, gas top-up and servicing of split units.', price: 'From ₦15,000', service_category: 'AC & HVAC' },
  { id: 'svc_6', name: 'Fumigation & Pest Control', description: 'Safe treatment for roaches, rodents and termites.', price: 'From ₦20,000', service_category: 'Pest Control' },
];

export const SERVICE_PROVIDER_SPOTLIGHTS: Record<string, any> = {
  business_53: {
    id: 'business_53',
    username: 'sparkle-home-services',
    name: 'Sparkle Home Services',
    category: 'Cleaning Services',
    description:
      'Reliable home & office services — cleaning, plumbing, electrical, AC and pest control. Same-day and emergency call-outs across Lagos.',
    location: 'Gbagada, Lagos',
    phone: '+234 800 772 7553',
    website: 'https://sparkleservices.example.com',
    email: 'book@sparkleservices.example.com',
    opening_hours: 'Daily: 7AM–9PM · Emergency 24/7',
    image_url: 'https://images.pexels.com/photos/4239146/pexels-photo-4239146.jpeg?auto=compress&cs=tinysrgb&w=1000',
    rating: 4.7,
    status: 'open',
    verified: true,
    user_id: 'sample',
  },
};
