// Demo data for the Agriculture operating system. Shown only for the curated
// farm spotlight. Reuses business_products columns (product_category = produce
// type, unit), so it shares the retail/agriculture migration.

export interface SampleProduce {
  id: string;
  name: string;
  description: string;
  price: string;
  image: string;
  stock: number | null;
  product_category: string;
  unit: string;
  is_featured: boolean;
}

const px = (id: number) =>
  `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=600`;

export const SAMPLE_PRODUCE: SampleProduce[] = [
  { id: 'agr_1', name: 'Paddy Rice', description: 'Locally grown paddy rice, sold per 50kg bag.', price: '₦45,000', image: px(1393382), stock: 200, product_category: 'Grains', unit: 'per bag', is_featured: true },
  { id: 'agr_2', name: 'Yellow Maize', description: 'Dry, well-graded maize for feed or milling.', price: '₦38,000', image: px(547263), stock: 150, product_category: 'Grains', unit: 'per bag', is_featured: false },
  { id: 'agr_3', name: 'Fresh Tomatoes', description: 'Field-fresh tomatoes, per basket.', price: '₦25,000', image: px(533280), stock: 60, product_category: 'Vegetables', unit: 'per basket', is_featured: true },
  { id: 'agr_4', name: 'Yam Tubers', description: 'Large, mature yam tubers — bulk available.', price: '₦2,500', image: px(2286776), stock: 500, product_category: 'Tubers', unit: 'each', is_featured: false },
  { id: 'agr_5', name: 'Live Broilers', description: 'Healthy live broiler chickens, farm-gate price.', price: '₦7,000', image: px(1300355), stock: 300, product_category: 'Livestock', unit: 'each', is_featured: false },
  { id: 'agr_6', name: 'Palm Oil (25L)', description: 'Pure red palm oil, 25-litre keg.', price: '₦48,000', image: px(1435904), stock: 80, product_category: 'Processed', unit: 'per keg', is_featured: false },
  { id: 'agr_7', name: 'Plantain (Bunch)', description: 'Fresh plantain, sold by the bunch.', price: '₦4,500', image: px(2280551), stock: 120, product_category: 'Fruits', unit: 'per bunch', is_featured: false },
  { id: 'agr_8', name: 'Catfish (Live)', description: 'Fresh live catfish from our ponds.', price: '₦3,500', image: px(1683545), stock: 400, product_category: 'Livestock', unit: 'per kg', is_featured: false },
];

export const AGRICULTURE_SPOTLIGHTS: Record<string, any> = {
  business_51: {
    id: 'business_51',
    username: 'green-harvest-farms',
    name: 'Green Harvest Farms',
    category: 'Agriculture',
    description:
      'An integrated farm supplying grains, vegetables, tubers and livestock. Buy retail, order wholesale, export in bulk, or book a farm tour.',
    location: 'Abeokuta, Ogun State',
    phone: '+234 800 473 3627',
    website: 'https://greenharvest.example.com',
    email: 'sales@greenharvest.example.com',
    opening_hours: 'Mon–Sat: 8AM–5PM',
    image_url: px(2255801),
    rating: 4.7,
    status: 'open',
    verified: true,
    user_id: 'sample',
  },
};
