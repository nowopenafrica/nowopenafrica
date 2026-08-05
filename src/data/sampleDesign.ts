// Demo data for the Art & Design (creative / branding studio) operating system.
// Shown only for the curated design-studio spotlight. Reuses business_services
// (service_category = design discipline), so no migration is needed.

export interface SampleDesignService {
  id: string;
  name: string;
  description: string;
  price: string;
  service_category: string;   // discipline
}

export interface WorkShot { src: string; label: string; }

const px = (id: number) =>
  `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=800`;

export const SAMPLE_DESIGN_SERVICES: SampleDesignService[] = [
  { id: 'des_1', name: 'Brand identity package', description: 'Logo suite, colour, type, brand guidelines and stationery. 2–3 weeks.', price: 'From ₦450,000', service_category: 'Branding' },
  { id: 'des_2', name: 'Logo design', description: 'Primary + secondary marks, 3 concepts, unlimited files on approval.', price: 'From ₦150,000', service_category: 'Logo' },
  { id: 'des_3', name: 'Website / app UI design', description: 'Figma UI kit, responsive screens and a clickable prototype.', price: 'From ₦600,000', service_category: 'UI/UX' },
  { id: 'des_4', name: 'Social media pack (monthly)', description: '20 branded post templates + story set, editable in Canva/Figma.', price: 'From ₦180,000/mo', service_category: 'Social' },
  { id: 'des_5', name: 'Packaging & label design', description: 'Print-ready dielines for product packaging and labels.', price: 'From ₦220,000', service_category: 'Print' },
  { id: 'des_6', name: 'Motion / logo animation', description: 'Animated logo sting and short promo motion graphics.', price: 'From ₦250,000', service_category: 'Motion' },
];

// Portfolio — recent work (sample-only, lightbox).
export const WORK_GALLERY: WorkShot[] = [
  { src: px(196644), label: 'Fintech brand identity' },
  { src: px(1029757), label: 'Product packaging suite' },
  { src: px(326514), label: 'Mobile app UI kit' },
  { src: px(3182812), label: 'Campaign key visual' },
  { src: px(577585), label: 'Logo & mark exploration' },
  { src: px(1547971), label: 'Editorial & print layout' },
];

// Tools / skills (sample-only badges).
export const DESIGN_TOOLS = ['Figma', 'Illustrator', 'Photoshop', 'After Effects', 'Blender'];

export const DESIGN_SPOTLIGHTS: Record<string, any> = {
  business_61: {
    id: 'business_61',
    username: 'pixelforge-design-studio',
    name: 'PixelForge Design Studio',
    category: 'Art & Design',
    description:
      'Brand identity, UI/UX and motion for African startups and challenger brands. See recent work and start a project with a clear quote.',
    location: 'Yaba, Lagos',
    phone: '+234 809 118 4402',
    website: 'https://pixelforge.example.com',
    email: 'studio@pixelforge.example.com',
    opening_hours: 'Mon–Fri: 9AM–6PM',
    image_url: px(196644),
    rating: 4.9,
    status: 'open',
    verified: true,
    user_id: 'sample',
  },
};
