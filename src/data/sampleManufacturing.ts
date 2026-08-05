// Demo data for the Manufacturing operating system. Shown only for the curated
// manufacturer spotlight. Reuses business_products columns (product_category =
// product line, unit = wholesale unit / MOQ), so it shares the retail/agri
// migration.

export interface SampleManufacturedItem {
  id: string;
  name: string;
  description: string;
  price: string;
  image: string;
  stock: number | null;
  product_category: string;   // product line
  unit: string;               // wholesale unit / MOQ
  is_featured: boolean;
}

const px = (id: number) =>
  `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=600`;

export const SAMPLE_MANUFACTURED: SampleManufacturedItem[] = [
  { id: 'mfg_1', name: 'Sachet Water (Bag of 20)', description: 'NAFDAC-approved pure water, factory-sealed bags.', price: '₦300', image: px(327090), stock: 5000, product_category: 'Beverages', unit: 'per bag · MOQ 100', is_featured: true },
  { id: 'mfg_2', name: 'Bottled Water (Carton of 12)', description: '75cl bottled table water, shrink-wrapped cartons.', price: '₦1,800', image: px(1000084), stock: 3000, product_category: 'Beverages', unit: 'per carton · MOQ 50', is_featured: false },
  { id: 'mfg_3', name: 'Cabin Biscuits (Carton)', description: 'Crunchy cabin biscuits, wholesale cartons.', price: '₦9,500', image: px(230325), stock: 800, product_category: 'Snacks', unit: 'per carton · MOQ 20', is_featured: true },
  { id: 'mfg_4', name: 'Plantain Chips (Carton of 50)', description: 'Crispy plantain chips in retail sachets.', price: '₦12,000', image: px(1583884), stock: 600, product_category: 'Snacks', unit: 'per carton · MOQ 10', is_featured: false },
  { id: 'mfg_5', name: 'Liquid Soap (25L Keg)', description: 'Industrial-grade dishwashing liquid soap.', price: '₦15,000', image: px(4239013), stock: 400, product_category: 'Home Care', unit: 'per keg · MOQ 5', is_featured: false },
  { id: 'mfg_6', name: 'PET Bottles (Bag of 100)', description: 'Blow-moulded 50cl PET bottles with caps.', price: '₦6,000', image: px(4498136), stock: 2000, product_category: 'Packaging', unit: 'per bag · MOQ 20', is_featured: false },
];

export const MANUFACTURING_CERTS = ['NAFDAC registered', 'SON / MANCAP', 'ISO 9001', 'HACCP'];

export const MANUFACTURING_SPOTLIGHTS: Record<string, any> = {
  business_55: {
    id: 'business_55',
    username: 'nova-foods-manufacturing',
    name: 'Nova Foods & Packaging',
    category: 'Manufacturing',
    description:
      'A NAFDAC-certified manufacturer of beverages, snacks, home-care and packaging. Wholesale and bulk orders welcome — request a quote or book a factory tour.',
    location: 'Agbara Industrial Estate, Ogun State',
    phone: '+234 800 668 2337',
    website: 'https://novafoods.example.com',
    email: 'wholesale@novafoods.example.com',
    opening_hours: 'Mon–Sat: 8AM–6PM',
    image_url: px(4483610),
    rating: 4.7,
    status: 'open',
    verified: true,
    user_id: 'sample',
  },
};
