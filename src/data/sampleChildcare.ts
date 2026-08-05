// Demo data for the Childcare (crèche / daycare / nursery) operating system.
// Shown only for the curated childcare spotlight. Reuses business_services
// (service_category = age group), so no migration is needed.

export interface SampleCareProgram {
  id: string;
  name: string;
  description: string;
  price: string;
  service_category: string;   // age group
}

export const SAMPLE_CARE_PROGRAMS: SampleCareProgram[] = [
  { id: 'care_1', name: 'Infant Care', description: '3–12 months · 1:3 carer ratio · feeding, naps and sensory play. Mon–Fri, 7:30AM–6PM.', price: 'From ₦85,000/mo', service_category: 'Infants (0–1)' },
  { id: 'care_2', name: 'Toddler Programme', description: '1–2 years · guided play, potty training and early motor skills. Mon–Fri, 7:30AM–6PM.', price: 'From ₦70,000/mo', service_category: 'Toddlers (1–2)' },
  { id: 'care_3', name: 'Pre-School (Nursery)', description: '3–4 years · phonics, numeracy and social skills with a structured curriculum.', price: 'From ₦65,000/mo', service_category: 'Pre-school (3–4)' },
  { id: 'care_4', name: 'After-School Care', description: 'Ages 5–10 · homework support, meals and supervised play till 6PM.', price: 'From ₦45,000/mo', service_category: 'After-school (5–10)' },
  { id: 'care_5', name: 'Holiday Camp', description: 'School-break day camp · arts, sports, excursions and lunch included.', price: 'From ₦25,000/wk', service_category: 'Holiday camp' },
  { id: 'care_6', name: 'Drop-in Daycare', description: 'Hourly care for ages 1–5 — perfect for errands, appointments or work days.', price: '₦3,500/hr', service_category: 'Drop-in' },
];

// Marketing trust badges (sample-only).
export const CARE_CAPABILITIES = [
  'CCTV-monitored',
  'Trained caregivers',
  'First-aid certified',
  'Nutritious meals',
  'Secure access',
];

export const CHILDCARE_SPOTLIGHTS: Record<string, any> = {
  business_59: {
    id: 'business_59',
    username: 'little-stars-daycare',
    name: 'Little Stars Daycare & Nursery',
    category: 'Childcare',
    description:
      'A safe, nurturing crèche and nursery for ages 0–10 — trained caregivers, CCTV-monitored rooms and a play-based curriculum. Book a tour today.',
    location: 'Lekki Phase 1, Lagos',
    phone: '+234 802 554 1180',
    website: 'https://littlestars.example.com',
    email: 'hello@littlestars.example.com',
    opening_hours: 'Mon–Fri: 7:30AM–6PM',
    image_url:
      'https://images.pexels.com/photos/8535230/pexels-photo-8535230.jpeg?auto=compress&cs=tinysrgb&w=800',
    rating: 4.9,
    status: 'open',
    verified: true,
    user_id: 'sample',
  },
};
