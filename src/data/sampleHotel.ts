// Demo data for the Hotel operating system. Shown only for the curated hotel
// spotlight so the rooms experience can be previewed before real hotels add
// their own rooms.

export interface SampleRoom {
  id: string;
  name: string;
  description: string;
  price: string;
  image: string;
  capacity: number;
  amenities: string;
}

const px = (id: number) =>
  `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=800`;

export const SAMPLE_ROOMS: SampleRoom[] = [
  { id: 'room_1', name: 'Standard Queen Room', description: 'Cosy room with a queen bed, workspace and city view.', price: '₦45,000 / night', image: px(164595), capacity: 2, amenities: 'AC, Free Wi-Fi, Breakfast, Smart TV' },
  { id: 'room_2', name: 'Deluxe King Room', description: 'Spacious king room with a lounge chair and rain shower.', price: '₦75,000 / night', image: px(271624), capacity: 2, amenities: 'AC, Free Wi-Fi, Breakfast, Minibar, Smart TV' },
  { id: 'room_3', name: 'Executive Suite', description: 'Separate living area, kitchenette and premium amenities.', price: '₦140,000 / night', image: px(261102), capacity: 3, amenities: 'AC, Wi-Fi, Breakfast, Kitchenette, Workspace, Pool access' },
  { id: 'room_4', name: 'Family Room', description: 'Two queen beds — perfect for families or small groups.', price: '₦95,000 / night', image: px(1454806), capacity: 4, amenities: 'AC, Wi-Fi, Breakfast, 2 Queen Beds' },
];

export const HOTEL_FACILITIES = [
  'Swimming pool', 'Gym', 'Spa', 'Restaurant', 'Conference rooms', 'Airport pickup', 'Free parking', '24/7 security',
];

export const HOTEL_SPOTLIGHTS: Record<string, any> = {
  business_39: {
    id: 'business_39',
    username: 'grand-savanna-hotel',
    name: 'Grand Savanna Hotel',
    category: 'Hotel & Lodging',
    description:
      'A modern 4-star hotel in the heart of the city — comfortable rooms, a rooftop pool and a restaurant serving local and continental cuisine.',
    location: 'Ikoyi, Lagos',
    phone: '+234 800 456 7890',
    website: 'https://grandsavanna.example.com',
    email: 'reservations@grandsavanna.example.com',
    opening_hours: 'Reception open 24/7',
    image_url: px(258154),
    rating: 4.6,
    status: 'open',
    verified: true,
    user_id: 'sample',
  },
};
