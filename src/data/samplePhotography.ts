// Demo data for the Photography operating system. Shown only for the curated
// studio spotlight so the portfolio + packages experience can be previewed
// before real studios add their own. Reuses existing business_services columns
// (service_category = genre, duration_min), so no migration is needed.

export interface SamplePackage {
  id: string;
  name: string;
  description: string;
  price: string;
  image: string;
  service_category: string;   // genre
  duration_min: number | null;
}

const px = (id: number) =>
  `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=800`;

export const SAMPLE_PACKAGES: SamplePackage[] = [
  { id: 'pkg_1', name: 'Full Wedding Coverage', description: '8 hours · 2 photographers · 500 edited photos · premium album.', price: '₦350,000', image: px(1024993), service_category: 'Wedding', duration_min: 480 },
  { id: 'pkg_2', name: 'Pre-Wedding Shoot', description: '2 hours · 2 locations · 40 edited photos.', price: '₦80,000', image: px(1043902), service_category: 'Wedding', duration_min: 120 },
  { id: 'pkg_3', name: 'Studio Portrait Session', description: '1 hour · 3 outfit changes · 15 edited photos.', price: '₦40,000', image: px(1266808), service_category: 'Portrait', duration_min: 60 },
  { id: 'pkg_4', name: 'Product Photography', description: 'Up to 10 items · white & lifestyle backgrounds.', price: '₦60,000', image: px(1029757), service_category: 'Product', duration_min: 180 },
  { id: 'pkg_5', name: 'Event Coverage (Half Day)', description: '4 hours · full-resolution gallery · same-week delivery.', price: '₦150,000', image: px(2608517), service_category: 'Events', duration_min: 240 },
  { id: 'pkg_6', name: 'Graduation / Family', description: '1 hour · on-location · 25 edited photos.', price: '₦50,000', image: px(1128318), service_category: 'Portrait', duration_min: 60 },
];

export interface PortfolioShot { src: string; genre: string; }

export const PHOTO_PORTFOLIO: PortfolioShot[] = [
  { src: px(1024993), genre: 'Wedding' },
  { src: px(2253870), genre: 'Wedding' },
  { src: px(1266808), genre: 'Portrait' },
  { src: px(415829), genre: 'Portrait' },
  { src: px(1029757), genre: 'Product' },
  { src: px(1667088), genre: 'Product' },
  { src: px(2608517), genre: 'Events' },
  { src: px(1763075), genre: 'Events' },
];

export const PHOTO_EQUIPMENT = ['Studio', 'Drone / aerial', 'Pro lighting', '4K video', 'Same-week delivery'];

export const PHOTO_SPOTLIGHTS: Record<string, any> = {
  business_47: {
    id: 'business_47',
    username: 'lens-luxe-studios',
    name: 'LensLuxe Studios',
    category: 'Photography & Video',
    description:
      'Award-winning photography & video studio — weddings, portraits, product and events. Book a shoot or check our availability.',
    location: 'Lekki, Lagos',
    phone: '+234 800 353 7000',
    website: 'https://lensluxe.example.com',
    email: 'studio@lensluxe.example.com',
    opening_hours: 'By appointment · Mon–Sat',
    image_url: px(1024993),
    rating: 4.9,
    status: 'open',
    verified: true,
    user_id: 'sample',
  },
};
