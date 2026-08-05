// Demo data for the Digital Marketing (agency) operating system. Shown only for
// the curated agency spotlight. Reuses business_services (service_category =
// channel), so no migration is needed.

export interface SampleMarketingService {
  id: string;
  name: string;
  description: string;
  price: string;
  service_category: string;   // channel
}

export interface ResultStat { value: string; label: string; }

export const SAMPLE_MARKETING_SERVICES: SampleMarketingService[] = [
  { id: 'mkt_1', name: 'SEO & content growth', description: 'Technical SEO, keyword strategy and 4 articles/month to grow organic traffic.', price: 'From ₦250,000/mo', service_category: 'SEO' },
  { id: 'mkt_2', name: 'Social media management', description: 'Content calendar, design and community management across 3 channels.', price: 'From ₦200,000/mo', service_category: 'Social' },
  { id: 'mkt_3', name: 'Meta & Google Ads', description: 'Paid campaign setup, creative and optimisation (excludes ad spend).', price: 'From ₦180,000/mo', service_category: 'Paid Ads' },
  { id: 'mkt_4', name: 'Influencer campaigns', description: 'Creator sourcing, briefs and reporting for a launch or product push.', price: 'From ₦350,000', service_category: 'Influencer' },
  { id: 'mkt_5', name: 'Email & WhatsApp funnels', description: 'Automated flows that convert leads to sales, set up and managed.', price: 'From ₦150,000/mo', service_category: 'CRM' },
  { id: 'mkt_6', name: 'Brand strategy sprint', description: '2-week positioning, messaging and go-to-market playbook.', price: 'From ₦400,000', service_category: 'Strategy' },
];

// Headline results (sample-only) — the agency's proof strip.
export const MARKETING_RESULTS: ResultStat[] = [
  { value: '4.2×', label: 'Avg. ROAS' },
  { value: '120+', label: 'Brands grown' },
  { value: '18M', label: 'Monthly reach' },
];

// Platforms / channels (sample-only badges).
export const MARKETING_CHANNELS = ['Meta', 'Google', 'TikTok', 'Instagram', 'X', 'LinkedIn'];

export const MARKETING_SPOTLIGHTS: Record<string, any> = {
  business_65: {
    id: 'business_65',
    username: 'apex-digital-agency',
    name: 'Apex Digital Agency',
    category: 'Digital Marketing',
    description:
      'Full-funnel digital marketing for African brands — SEO, social, paid ads and influencer campaigns that drive measurable growth. Book a free strategy call.',
    location: 'Yaba, Lagos',
    phone: '+234 807 665 2280',
    website: 'https://apexdigital.example.com',
    email: 'grow@apexdigital.example.com',
    opening_hours: 'Mon–Fri: 9AM–6PM',
    image_url:
      'https://images.pexels.com/photos/905163/pexels-photo-905163.jpeg?auto=compress&cs=tinysrgb&w=800',
    rating: 4.8,
    status: 'open',
    verified: true,
    user_id: 'sample',
  },
};
