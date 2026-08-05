// Demo data for the Real Estate operating system. Mirrors the sample-data
// fallback used elsewhere: shown only for the curated Real Estate spotlight
// listing so the property portal can be previewed before real agents add stock.

export interface SampleProperty {
  id: string;
  name: string;
  description: string;
  price: string;
  image: string;
  gallery: string[];
  listing_type: 'sale' | 'rent' | 'shortlet';
  property_type: string;
  bedrooms: number;
  bathrooms: number;
  area_sqm: number;
  property_location: string;
  is_featured: boolean;
  verified_property?: boolean;
}

const px = (id: number) =>
  `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=1000`;

export const SAMPLE_PROPERTIES: SampleProperty[] = [
  {
    id: 'prop_1',
    name: '4-Bedroom Detached Duplex with BQ',
    description:
      'Luxuriously finished detached duplex in a serviced estate — fitted kitchen, ensuite rooms, ample parking and 24/7 power and security.',
    price: '₦185,000,000',
    image: px(1396122),
    gallery: [px(1396122), px(1643383), px(1571460), px(2062431)],
    listing_type: 'sale',
    property_type: 'Detached Duplex',
    bedrooms: 4,
    bathrooms: 5,
    area_sqm: 420,
    property_location: 'Lekki Phase 1, Lagos',
    is_featured: true,
    verified_property: true,
  },
  {
    id: 'prop_2',
    name: '3-Bedroom Serviced Apartment',
    description:
      'Bright, modern serviced apartment with pool and gym access. Rent is inclusive of service charge, security and backup power.',
    price: '₦7,500,000 / year',
    image: px(1918291),
    gallery: [px(1918291), px(1643384), px(2029667)],
    listing_type: 'rent',
    property_type: 'Apartment',
    bedrooms: 3,
    bathrooms: 3,
    area_sqm: 165,
    property_location: 'Ikoyi, Lagos',
    is_featured: true,
    verified_property: true,
  },
  {
    id: 'prop_3',
    name: 'Luxury 2-Bedroom Short-let',
    description:
      'Fully furnished short-let with fast Wi-Fi, smart TV and daily housekeeping on request. Perfect for business travellers and vacations.',
    price: '₦120,000 / night',
    image: px(2079234),
    gallery: [px(2079234), px(1571468), px(1571463)],
    listing_type: 'shortlet',
    property_type: 'Apartment',
    bedrooms: 2,
    bathrooms: 2,
    area_sqm: 98,
    property_location: 'Victoria Island, Lagos',
    is_featured: false,
    verified_property: true,
  },
  {
    id: 'prop_4',
    name: '5-Bedroom Terraced House',
    description:
      'Spacious terrace in a gated development with green areas, children’s playground and CCTV throughout the estate.',
    price: '₦95,000,000',
    image: px(106399),
    gallery: [px(106399), px(1029599), px(280229)],
    listing_type: 'sale',
    property_type: 'Terraced House',
    bedrooms: 5,
    bathrooms: 4,
    area_sqm: 310,
    property_location: 'Ajah, Lagos',
    is_featured: false,
    verified_property: false,
  },
  {
    id: 'prop_5',
    name: '800sqm Residential Land',
    description:
      'Dry, fenced plot with governor’s consent and a clean title. Ready to build in a fast-appreciating neighbourhood.',
    price: '₦45,000,000',
    image: px(280222),
    gallery: [px(280222), px(1732414)],
    listing_type: 'sale',
    property_type: 'Land',
    bedrooms: 0,
    bathrooms: 0,
    area_sqm: 800,
    property_location: 'Ibeju-Lekki, Lagos',
    is_featured: false,
    verified_property: true,
  },
  {
    id: 'prop_6',
    name: 'Open-plan Office Suite',
    description:
      'Grade-A office space with meeting rooms, dedicated parking and a fibre connection. Available on a flexible lease.',
    price: '₦18,000,000 / year',
    image: px(1181406),
    gallery: [px(1181406), px(1571460)],
    listing_type: 'rent',
    property_type: 'Office',
    bedrooms: 0,
    bathrooms: 2,
    area_sqm: 240,
    property_location: 'Ikeja GRA, Lagos',
    is_featured: false,
    verified_property: false,
  },
];

// Curated Real Estate spotlight business so /business/business_37 previews the
// full property portal. business_37 is Real Estate's natural index in
// BUSINESS_CATEGORIES but falls outside the 30 generated samples, so
// BusinessDetail resolves it from here.
export const SPOTLIGHT_BUSINESSES: Record<string, any> = {
  business_37: {
    id: 'business_37',
    username: 'lagos-prime-realty',
    name: 'Lagos Prime Realty',
    category: 'Real Estate',
    description:
      'A trusted real estate agency helping you buy, rent and short-let verified homes across Lagos. Every listing is inspected and documented before it goes live.',
    location: 'Lagos, Nigeria',
    phone: '+234 800 123 4567',
    website: 'https://lagosprimerealty.example.com',
    email: 'hello@lagosprimerealty.example.com',
    opening_hours: 'Mon–Sat: 9AM–6PM',
    image_url: px(1643383),
    rating: 4.8,
    status: 'open',
    verified: true,
    user_id: 'sample',
  },
};
