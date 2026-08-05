// Demo data for the Travel operating system. Shown only for the curated travel
// agency spotlight. Reuses business_services (image_url, service_category =
// package type), so no migration is needed.

export interface SampleTrip {
  id: string;
  name: string;
  description: string;
  price: string;
  image: string;
  service_category: string;   // package type
}

const px = (id: number) =>
  `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=800`;

export const SAMPLE_TRIPS: SampleTrip[] = [
  { id: 'trp_1', name: 'Zanzibar Beach Getaway (5 nights)', description: 'Flights, beach resort, transfers and island tour.', price: 'From ₦1,250,000', image: px(1287460), service_category: 'Beach' },
  { id: 'trp_2', name: 'Kenya Safari Adventure (4 days)', description: 'Masai Mara game drives, lodge stay and full board.', price: 'From ₦1,650,000', image: px(667205), service_category: 'Safari' },
  { id: 'trp_3', name: 'Dubai City Break (5 nights)', description: 'Hotel, city tour, desert safari and visa support.', price: 'From ₦1,450,000', image: px(618079), service_category: 'City Break' },
  { id: 'trp_4', name: 'Umrah Package (10 days)', description: 'Flights, hotel near Haram, visa and guided rites.', price: 'From ₦2,100,000', image: px(2233416), service_category: 'Pilgrimage' },
  { id: 'trp_5', name: 'Cape Town Explorer (6 nights)', description: 'Table Mountain, winelands and coastal drives.', price: 'From ₦1,850,000', image: px(259447), service_category: 'City Break' },
  { id: 'trp_6', name: 'Obudu Mountain Resort (3 nights)', description: 'Domestic getaway — cable car, ranch and nature.', price: 'From ₦320,000', image: px(3389817), service_category: 'Local' },
];

export const TRAVEL_SPOTLIGHTS: Record<string, any> = {
  business_57: {
    id: 'business_57',
    username: 'wanderlust-travels',
    name: 'Wanderlust Travels',
    category: 'Travel & Tourism',
    description:
      'Curated holidays, flights, visa assistance and hotel bookings — local and international. Book a package or let us plan a custom trip.',
    location: 'Victoria Island, Lagos',
    phone: '+234 800 926 3378',
    website: 'https://wanderlust.example.com',
    email: 'travel@wanderlust.example.com',
    opening_hours: 'Mon–Sat: 9AM–6PM',
    image_url: px(1287460),
    rating: 4.8,
    status: 'open',
    verified: true,
    user_id: 'sample',
  },
};
