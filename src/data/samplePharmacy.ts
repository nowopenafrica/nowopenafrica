// Demo data for the Pharmacy operating system. Shown only for the curated
// pharmacy spotlight so the medicine catalogue can be previewed before real
// pharmacies add their own stock.

export interface SampleMedicine {
  id: string;
  name: string;
  description: string;
  price: string;
  image: string;
  stock: number | null;
  med_category: string;
  requires_prescription: boolean;
  pack_size: string;
}

const px = (id: number) =>
  `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=600`;

export const SAMPLE_MEDICINES: SampleMedicine[] = [
  { id: 'med_1', name: 'Paracetamol 500mg', description: 'Fast relief from mild pain and fever.', price: '₦800', image: px(159211), stock: 120, med_category: 'Pain & Fever', requires_prescription: false, pack_size: 'Pack of 20 tablets' },
  { id: 'med_2', name: 'Ibuprofen 400mg', description: 'Anti-inflammatory for aches, pains and inflammation.', price: '₦1,500', image: px(139398), stock: 80, med_category: 'Pain & Fever', requires_prescription: false, pack_size: 'Pack of 24 tablets' },
  { id: 'med_3', name: 'Amoxicillin 500mg', description: 'Broad-spectrum antibiotic — pharmacist verification required.', price: '₦3,200', image: px(3873209), stock: 40, med_category: 'Antibiotics', requires_prescription: true, pack_size: 'Pack of 21 capsules' },
  { id: 'med_4', name: 'Vitamin C 1000mg', description: 'Daily immune support, effervescent tablets.', price: '₦2,500', image: px(3683098), stock: 60, med_category: 'Vitamins & Supplements', requires_prescription: false, pack_size: 'Tube of 20 tablets' },
  { id: 'med_5', name: 'Multivitamin Syrup', description: 'Complete daily vitamins for children.', price: '₦2,000', image: px(3652097), stock: 35, med_category: 'Baby & Child', requires_prescription: false, pack_size: '200ml syrup' },
  { id: 'med_6', name: 'Blood Pressure Monitor', description: 'Digital upper-arm monitor with memory.', price: '₦18,000', image: px(3652100), stock: 12, med_category: 'Devices', requires_prescription: false, pack_size: '1 device' },
  { id: 'med_7', name: 'Metformin 500mg', description: 'For type-2 diabetes management — prescription required.', price: '₦2,800', image: px(208512), stock: 25, med_category: 'Chronic Care', requires_prescription: true, pack_size: 'Pack of 30 tablets' },
  { id: 'med_8', name: 'Antimalarial (ACT)', description: 'Artemisinin-based combination therapy for malaria.', price: '₦2,200', image: px(3652089), stock: 50, med_category: 'Malaria', requires_prescription: false, pack_size: 'Full adult course' },
];

export const PHARMACY_SPOTLIGHTS: Record<string, any> = {
  business_41: {
    id: 'business_41',
    username: 'wellcare-pharmacy',
    name: 'WellCare Pharmacy',
    category: 'Pharmacy',
    description:
      'Your neighbourhood pharmacy — genuine medicines, fast home delivery and a registered pharmacist available to answer your questions.',
    location: 'Yaba, Lagos',
    phone: '+234 800 555 0099',
    website: 'https://wellcarepharmacy.example.com',
    email: 'care@wellcarepharmacy.example.com',
    opening_hours: 'Mon–Sun: 8AM–10PM',
    image_url: px(139398),
    rating: 4.8,
    status: 'open',
    verified: true,
    user_id: 'sample',
  },
};
