// Demo data for the Events operating system. Shown only for the curated event
// company spotlight so the vendor bundle experience can be previewed before
// real companies add their own. Reuses business_services (service_category =
// vendor type), so no migration is needed.

export interface SampleVendor {
  id: string;
  name: string;
  description: string;
  price: string;
  image: string;
  service_category: string;   // vendor type
}

const px = (id: number) =>
  `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=700`;

export const SAMPLE_VENDORS: SampleVendor[] = [
  { id: 'evt_1', name: 'Luxury Hall Decoration', description: 'Full stage, backdrop, drapes and floral centrepieces.', price: '₦250,000', image: px(169193), service_category: 'Decoration' },
  { id: 'evt_2', name: 'Premium Catering (200 guests)', description: 'Small chops, jollof, continental & live cooking station.', price: '₦600,000', image: px(1729797), service_category: 'Catering' },
  { id: 'evt_3', name: 'Professional MC / Compere', description: 'Experienced anchor to keep your event lively.', price: '₦120,000', image: px(1105666), service_category: 'MC' },
  { id: 'evt_4', name: 'DJ & Sound System', description: 'Full sound, lighting and a crowd-pleasing DJ.', price: '₦180,000', image: px(1190298), service_category: 'DJ' },
  { id: 'evt_5', name: 'Event Photography & Video', description: 'Photo + cinematic video coverage of your big day.', price: '₦300,000', image: px(3037068), service_category: 'Photography' },
  { id: 'evt_6', name: 'Banquet Venue (up to 300)', description: 'Air-conditioned hall with parking and power backup.', price: '₦450,000', image: px(587741), service_category: 'Venue' },
];

export const EVENT_SPOTLIGHTS: Record<string, any> = {
  business_49: {
    id: 'business_49',
    username: 'grand-celebration-events',
    name: 'Grand Celebration Events',
    category: 'Event Planning',
    description:
      'Full-service event planning — decor, catering, MC, DJ, photography and venues. Book vendors individually or bundle everything for your day.',
    location: 'Victoria Island, Lagos',
    phone: '+234 800 246 9000',
    website: 'https://grandcelebration.example.com',
    email: 'plan@grandcelebration.example.com',
    opening_hours: 'Mon–Sat: 9AM–7PM',
    image_url: px(169193),
    rating: 4.9,
    status: 'open',
    verified: true,
    user_id: 'sample',
  },
};
