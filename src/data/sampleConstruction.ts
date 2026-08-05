// Demo data for the Construction operating system. Shown only for the curated
// construction-firm spotlight. Reuses business_services (service_category =
// service type), so no migration is needed.

export interface SampleBuildService {
  id: string;
  name: string;
  description: string;
  price: string;
  service_category: string;   // service type
}

const px = (id: number) =>
  `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=800`;

export const SAMPLE_BUILD_SERVICES: SampleBuildService[] = [
  { id: 'con_1', name: 'Residential Building', description: 'Bungalows, duplexes and estates — from foundation to finishing.', price: 'Quote on request', service_category: 'Residential' },
  { id: 'con_2', name: 'Commercial Construction', description: 'Offices, plazas, warehouses and retail developments.', price: 'Quote on request', service_category: 'Commercial' },
  { id: 'con_3', name: 'Renovation & Remodelling', description: 'Upgrade, extend or completely transform an existing property.', price: 'From ₦2,500,000', service_category: 'Renovation' },
  { id: 'con_4', name: 'Civil & Road Works', description: 'Drainage, interlocking, fencing and access roads.', price: 'Quote on request', service_category: 'Civil Works' },
  { id: 'con_5', name: 'Project Management & Supervision', description: 'Professional oversight to keep your build on time and budget.', price: 'From ₦500,000', service_category: 'Consulting' },
];

export const CONSTRUCTION_PROJECTS = [
  { src: px(1216589), label: '4-Bed Duplex · Lekki' },
  { src: px(280229), label: 'Office Complex · Ikeja' },
  { src: px(323705), label: 'Estate Development · Ajah' },
  { src: px(2219024), label: 'Warehouse · Agbara' },
  { src: px(159306), label: 'Renovation · Ikoyi' },
  { src: px(1109541), label: 'Civil Works · Epe' },
];

export const CONSTRUCTION_CAPABILITIES = ['Registered contractor', 'In-house architects', 'Own equipment fleet', 'Weekly progress reports'];

export const CONSTRUCTION_SPOTLIGHTS: Record<string, any> = {
  business_56: {
    id: 'business_56',
    username: 'buildwell-construction',
    name: 'BuildWell Construction',
    category: 'Construction',
    description:
      'A registered construction company delivering residential, commercial and civil projects across Nigeria. Request a quote or book a site consultation.',
    location: 'Lekki, Lagos',
    phone: '+234 800 284 5393',
    website: 'https://buildwell.example.com',
    email: 'projects@buildwell.example.com',
    opening_hours: 'Mon–Sat: 8AM–6PM',
    image_url: px(1216589),
    rating: 4.8,
    status: 'open',
    verified: true,
    user_id: 'sample',
  },
};
