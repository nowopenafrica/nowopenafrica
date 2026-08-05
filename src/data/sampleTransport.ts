// Demo data for the Transport operating system. Shown only for the curated
// transport spotlight so the routes + fleet experience can be previewed before
// real operators add their own. Reuses existing business_services columns
// (service_category = route type, class_schedule = departures, capacity =
// seats, duration_min = trip time), so no migration is needed.

export interface SampleRoute {
  id: string;
  name: string;
  description: string;
  price: string;
  service_category: string;   // route type
  class_schedule: string;     // departure times
  capacity: number | null;    // seats
  duration_min: number | null;
}

export const SAMPLE_ROUTES: SampleRoute[] = [
  { id: 'rte_1', name: 'Lagos → Abuja', description: 'Luxury coach with AC, Wi-Fi and refreshments.', price: '₦18,000', service_category: 'Interstate', class_schedule: 'Daily · 6:00 AM, 10:00 AM, 4:00 PM', capacity: 49, duration_min: 600 },
  { id: 'rte_2', name: 'Lagos → Ibadan', description: 'Frequent shuttles, air-conditioned Sienna.', price: '₦6,500', service_category: 'Interstate', class_schedule: 'Every 30 mins · 6 AM–8 PM', capacity: 6, duration_min: 150 },
  { id: 'rte_3', name: 'Lagos → Benin', description: 'Comfortable interstate coach service.', price: '₦12,000', service_category: 'Interstate', class_schedule: 'Daily · 7:00 AM, 2:00 PM', capacity: 33, duration_min: 300 },
  { id: 'rte_4', name: 'City Ride (Lagos)', description: 'On-demand rides within Lagos metro.', price: 'From ₦1,500', service_category: 'City Ride', class_schedule: 'On demand · 24/7', capacity: 4, duration_min: null },
  { id: 'rte_5', name: 'Airport Shuttle', description: 'Door-to-door pickup to MMIA & domestic terminals.', price: '₦8,000', service_category: 'Airport', class_schedule: 'On schedule · book ahead', capacity: 4, duration_min: 60 },
];

export const TRANSPORT_FLEET = ['Luxury coaches', 'AC minibuses', 'Sienna shuttles', 'Cargo trucks', 'GPS-tracked'];

export const TRANSPORT_SPOTLIGHTS: Record<string, any> = {
  business_48: {
    id: 'business_48',
    username: 'swift-movers-transit',
    name: 'Swift Movers Transit',
    category: 'Logistics & Transport',
    description:
      'Interstate coaches, city rides and cargo delivery across Nigeria. Book a seat, hire a vehicle or track your parcel in real time.',
    location: 'Jibowu, Lagos',
    phone: '+234 800 700 8000',
    website: 'https://swiftmovers.example.com',
    email: 'bookings@swiftmovers.example.com',
    opening_hours: 'Terminal open 24/7',
    image_url: 'https://images.pexels.com/photos/385998/pexels-photo-385998.jpeg?auto=compress&cs=tinysrgb&w=1000',
    rating: 4.6,
    status: 'open',
    verified: true,
    user_id: 'sample',
  },
};
