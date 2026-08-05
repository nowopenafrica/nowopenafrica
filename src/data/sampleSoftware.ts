// Demo data for the Software & IT (tech studio) operating system. Shown only for
// the curated software spotlight. Reuses business_services (service_category =
// practice), so no migration is needed.

export interface SampleSoftwareService {
  id: string;
  name: string;
  description: string;
  price: string;
  service_category: string;   // practice
}

export interface CaseStat { value: string; label: string; }

export const SAMPLE_SOFTWARE_SERVICES: SampleSoftwareService[] = [
  { id: 'sw_1', name: 'Web app development', description: 'Custom web platforms in React/Next.js with a scalable backend and CI/CD.', price: 'From ₦1,500,000', service_category: 'Web' },
  { id: 'sw_2', name: 'Mobile app (iOS + Android)', description: 'Cross-platform apps in React Native/Flutter, from design to app-store launch.', price: 'From ₦2,200,000', service_category: 'Mobile' },
  { id: 'sw_3', name: 'Cloud & DevOps setup', description: 'AWS/GCP architecture, containerisation and automated deployments.', price: 'From ₦900,000', service_category: 'Cloud' },
  { id: 'sw_4', name: 'Cybersecurity audit', description: 'Penetration testing, vulnerability assessment and a remediation plan.', price: 'From ₦750,000', service_category: 'Security' },
  { id: 'sw_5', name: 'Managed IT support', description: 'Helpdesk, monitoring and maintenance with a guaranteed response SLA.', price: 'From ₦250,000/mo', service_category: 'Support' },
  { id: 'sw_6', name: 'Data & AI integration', description: 'Dashboards, pipelines and LLM-powered features wired into your product.', price: 'From ₦1,200,000', service_category: 'Data & AI' },
];

// Delivery proof (sample-only).
export const SOFTWARE_STATS: CaseStat[] = [
  { value: '80+', label: 'Products shipped' },
  { value: '99.9%', label: 'Uptime SLA' },
  { value: '2–8 wk', label: 'To first release' },
];

// Tech stack (sample-only badges).
export const SOFTWARE_STACK = ['React', 'Next.js', 'Node', 'Flutter', 'AWS', 'PostgreSQL'];

export const SOFTWARE_SPOTLIGHTS: Record<string, any> = {
  business_67: {
    id: 'business_67',
    username: 'stackforge-technologies',
    name: 'StackForge Technologies',
    category: 'Software & IT',
    description:
      'Product engineering studio building web, mobile and cloud software for African businesses. From MVP to scale — book a discovery call and start building.',
    location: 'Yaba, Lagos',
    phone: '+234 809 442 6650',
    website: 'https://stackforge.example.com',
    email: 'build@stackforge.example.com',
    opening_hours: 'Mon–Fri: 9AM–6PM',
    image_url:
      'https://images.pexels.com/photos/1181271/pexels-photo-1181271.jpeg?auto=compress&cs=tinysrgb&w=800',
    rating: 4.9,
    status: 'open',
    verified: true,
    user_id: 'sample',
  },
};
