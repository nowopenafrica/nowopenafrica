// Demo data for the Fashion operating system. Shown only for the curated
// fashion spotlight so the catalogue can be previewed before real brands add
// their own items.

export interface SampleFashionItem {
  id: string;
  name: string;
  description: string;
  price: string;
  image: string;
  stock: number | null;
  fashion_category: string;
  sizes: string;
  fabric: string;
  is_featured: boolean;
}

const px = (id: number) =>
  `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=700`;

export const SAMPLE_FASHION: SampleFashionItem[] = [
  { id: 'fsn_1', name: 'Ankara Print Maxi Dress', description: 'Flowing maxi dress in vibrant Ankara print.', price: '₦25,000', image: px(1055691), stock: 15, fashion_category: 'Women', sizes: 'S,M,L,XL', fabric: 'Ankara cotton', is_featured: true },
  { id: 'fsn_2', name: 'Agbada 3-Piece Set', description: 'Elegant embroidered agbada for special occasions.', price: '₦65,000', image: px(1043474), stock: 8, fashion_category: 'Men', sizes: 'M,L,XL,XXL', fabric: 'Cashmere blend', is_featured: true },
  { id: 'fsn_3', name: 'Kente Blazer', description: 'Tailored blazer with a bold Kente accent.', price: '₦40,000', image: px(2955376), stock: 10, fashion_category: 'Men', sizes: 'S,M,L,XL', fabric: 'Cotton / Kente', is_featured: false },
  { id: 'fsn_4', name: 'Silk Head Wrap (Gele)', description: 'Premium silk gele in assorted colours.', price: '₦8,000', image: px(1926769), stock: 40, fashion_category: 'Accessories', sizes: 'One size', fabric: 'Silk', is_featured: false },
  { id: 'fsn_5', name: 'Kids Ankara Set', description: 'Adorable matching top and shorts for kids.', price: '₦12,000', image: px(35537), stock: 20, fashion_category: 'Kids', sizes: '2-3y,4-5y,6-7y', fabric: 'Ankara cotton', is_featured: false },
  { id: 'fsn_6', name: 'Beaded Statement Necklace', description: 'Handmade beaded necklace — a bold finishing touch.', price: '₦6,500', image: px(1191531), stock: 25, fashion_category: 'Accessories', sizes: 'One size', fabric: 'Glass beads', is_featured: false },
  { id: 'fsn_7', name: 'Adire Two-Piece', description: 'Hand-dyed Adire co-ord set — top and trousers.', price: '₦32,000', image: px(6311392), stock: 12, fashion_category: 'Women', sizes: 'S,M,L', fabric: 'Adire cotton', is_featured: true },
  { id: 'fsn_8', name: 'Leather Sandals', description: 'Handcrafted leather sandals, made to last.', price: '₦18,000', image: px(267301), stock: 18, fashion_category: 'Accessories', sizes: '39,40,41,42,43,44', fabric: 'Genuine leather', is_featured: false },
];

export const FASHION_SPOTLIGHTS: Record<string, any> = {
  business_45: {
    id: 'business_45',
    username: 'zuri-couture',
    name: 'Zuri Couture',
    category: 'Fashion & Apparel',
    description:
      'Contemporary African fashion — ready-to-wear and made-to-measure. Shop the collection or book a fitting for a bespoke piece.',
    location: 'Lekki, Lagos',
    phone: '+234 800 246 8100',
    website: 'https://zuricouture.example.com',
    email: 'style@zuricouture.example.com',
    opening_hours: 'Mon–Sat: 10AM–8PM',
    image_url: px(1055691),
    rating: 4.9,
    status: 'open',
    verified: true,
    user_id: 'sample',
  },
  // A second fashion brand — a streetwear boutique store — showing the same
  // Fashion OS powering a different brand identity.
  business_64: {
    id: 'business_64',
    username: 'urban-thread-boutique',
    name: 'Urban Thread Boutique',
    category: 'Fashion & Apparel',
    description:
      'Lagos streetwear and everyday essentials — tees, denim, sneakers and accessories. Shop the drop or reserve your size in-store.',
    location: 'Surulere, Lagos',
    phone: '+234 806 330 7742',
    website: 'https://urbanthread.example.com',
    email: 'shop@urbanthread.example.com',
    opening_hours: 'Mon–Sat: 10AM–9PM',
    image_url: px(2955376),
    rating: 4.7,
    status: 'open',
    verified: true,
    user_id: 'sample',
  },
};
