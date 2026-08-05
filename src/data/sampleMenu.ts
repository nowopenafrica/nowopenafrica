// Demo data for the Restaurant operating system. Shown only for the curated
// restaurant spotlight listing so the digital menu can be previewed before real
// restaurants add their own items.

export interface SampleMenuItem {
  id: string;
  name: string;
  description: string;
  price: string;
  image: string;
  menu_category: string;
  is_special: boolean;
  is_recommended: boolean;
  stock: null;
}

const px = (id: number) =>
  `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=800`;

export const SAMPLE_MENU: SampleMenuItem[] = [
  { id: 'menu_1', name: 'Jollof Rice & Grilled Chicken', description: 'Smoky party jollof with a quarter grilled chicken and fried plantain.', price: '₦5,500', image: px(5638732), menu_category: 'Mains', is_special: true, is_recommended: true, stock: null },
  { id: 'menu_2', name: 'Egusi & Pounded Yam', description: 'Rich melon-seed soup with assorted meat and fresh pounded yam.', price: '₦6,000', image: px(6646357), menu_category: 'Mains', is_special: false, is_recommended: true, stock: null },
  { id: 'menu_3', name: 'Suya Platter', description: 'Spicy grilled beef skewers with onions, tomatoes and yaji.', price: '₦4,500', image: px(2233729), menu_category: 'Starters', is_special: true, is_recommended: false, stock: null },
  { id: 'menu_4', name: 'Peppered Snail', description: 'Sautéed snails in a rich pepper sauce — a house favourite.', price: '₦7,000', image: px(4871119), menu_category: 'Starters', is_special: false, is_recommended: true, stock: null },
  { id: 'menu_5', name: 'Chapman', description: 'The classic Nigerian mocktail — refreshing and fruity.', price: '₦2,000', image: px(96974), menu_category: 'Drinks', is_special: false, is_recommended: false, stock: null },
  { id: 'menu_6', name: 'Zobo (Hibiscus)', description: 'Chilled hibiscus drink infused with ginger and pineapple.', price: '₦1,500', image: px(1233319), menu_category: 'Drinks', is_special: false, is_recommended: false, stock: null },
  { id: 'menu_7', name: 'Puff Puff (6 pcs)', description: 'Golden, fluffy fried dough dusted with sugar.', price: '₦1,200', image: px(4110251), menu_category: 'Desserts', is_special: false, is_recommended: false, stock: null },
  { id: 'menu_8', name: 'Coconut Cake Slice', description: 'Moist coconut sponge with a light cream finish.', price: '₦2,500', image: px(291528), menu_category: 'Desserts', is_special: false, is_recommended: true, stock: null },
];

export const MENU_SPOTLIGHTS: Record<string, any> = {
  business_38: {
    id: 'business_38',
    username: 'lagos-flavors-kitchen',
    name: 'Lagos Flavors Kitchen',
    category: 'Restaurant',
    description:
      'Authentic Nigerian cuisine served fresh daily. Dine in, reserve a table, or order for delivery — from jollof to small chops.',
    location: 'Victoria Island, Lagos',
    phone: '+234 800 987 6543',
    website: 'https://lagosflavors.example.com',
    email: 'orders@lagosflavors.example.com',
    opening_hours: 'Mon–Sun: 11AM–11PM',
    image_url: px(67468),
    rating: 4.7,
    status: 'open',
    verified: true,
    user_id: 'sample',
  },
};
