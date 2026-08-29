// Demo data for the Retail operating system (used for meat shops, markets,
// supermarkets, groceries, etc.). Shown only for the curated retail spotlight.
// Reuses business_products columns (product_category = aisle/department, unit),
// so it shares the retail/agriculture migration.

export interface SampleRetailItem {
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

export const SAMPLE_RETAIL: SampleRetailItem[] = [
  { id: 'ret_1', name: 'Fresh Beef (Boneless)', description: 'Grass-fed, freshly cut boneless beef.', price: '₦4,500', image: px(618775), stock: 40, product_category: 'Beef', unit: 'per kg', is_featured: true },
  { id: 'ret_2', name: 'Cow Leg (Bokoto)', description: 'Cleaned and cut, perfect for pepper soup.', price: '₦3,800', image: px(2338407), stock: 25, product_category: 'Beef', unit: 'per kg', is_featured: false },
  { id: 'ret_3', name: 'Whole Chicken', description: 'Farm-fresh dressed broiler chicken.', price: '₦6,500', image: px(616354), stock: 30, product_category: 'Poultry', unit: 'each', is_featured: true },
  { id: 'ret_4', name: 'Chicken Laps (1kg)', description: 'Juicy chicken drumsticks and thighs.', price: '₦5,200', image: px(2338407), stock: 35, product_category: 'Poultry', unit: 'per kg', is_featured: false },
  { id: 'ret_5', name: 'Goat Meat (Assorted)', description: 'Assorted goat meat, cleaned and cut.', price: '₦6,000', image: px(65175), stock: 20, product_category: 'Goat', unit: 'per kg', is_featured: false },
  { id: 'ret_6', name: 'Fresh Titus Fish', description: 'Frozen mackerel (Titus), carton or by kg.', price: '₦4,000', image: px(725992), stock: 50, product_category: 'Fish', unit: 'per kg', is_featured: false },
  { id: 'ret_7', name: 'Gizzard (500g)', description: 'Cleaned chicken gizzard, ready to cook.', price: '₦2,500', image: px(616354), stock: 18, product_category: 'Poultry', unit: 'pack', is_featured: false },
  { id: 'ret_8', name: 'Ponmo (Cow Skin)', description: 'Soft, cleaned ponmo — a Nigerian favourite.', price: '₦1,500', image: px(1927377), stock: 22, product_category: 'Beef', unit: 'per kg', is_featured: false },
];

export const RETAIL_SPOTLIGHTS: Record<string, any> = {
  business_50: {
    id: 'business_50',
    username: 'prime-cuts-butchery',
    name: 'Prime Cuts Butchery',
    category: 'Grocery / Mini-Mart',
    description:
      'Fresh, hygienically-cut beef, poultry, goat meat and fish — cut to order. Order online for same-day delivery across Lagos.',
    location: 'Surulere, Lagos',
    phone: '+234 800 262 8746',
    website: 'https://primecuts.example.com',
    email: 'orders@primecuts.example.com',
    opening_hours: 'Mon–Sat: 7AM–7PM',
    image_url: px(618775),
    rating: 4.8,
    status: 'open',
    verified: true,
    user_id: 'sample',
  },
};
