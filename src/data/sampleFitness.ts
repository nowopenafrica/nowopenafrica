// Demo data for the Fitness operating system. Shown only for the curated gym
// spotlight so the memberships + class schedule can be previewed before real
// gyms add their own.

export interface SampleFitnessItem {
  id: string;
  name: string;
  description: string;
  price: string;
  image: string;
  amenities: string;      // perks (memberships) — comma-separated
  session_kind: 'membership' | 'class';
  class_level: string;
  class_schedule: string;
  instructor: string;
  duration_min: number | null;
}

const px = (id: number) =>
  `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=800`;

export const SAMPLE_FITNESS: SampleFitnessItem[] = [
  // Memberships
  { id: 'mem_1', name: 'Monthly Membership', description: 'Full gym access, no commitment.', price: '₦20,000 / month', image: px(1954524), amenities: 'Gym floor, Locker, 1 free class', session_kind: 'membership', class_level: '', class_schedule: '', instructor: '', duration_min: null },
  { id: 'mem_2', name: 'Quarterly Membership', description: 'Three months at a discount.', price: '₦50,000 / quarter', image: px(1552252), amenities: 'Gym floor, Locker, Unlimited classes, Sauna', session_kind: 'membership', class_level: '', class_schedule: '', instructor: '', duration_min: null },
  { id: 'mem_3', name: 'Annual Membership', description: 'Best value — full year, all access.', price: '₦160,000 / year', image: px(3253501), amenities: 'All access, Unlimited classes, Sauna, 2 PT sessions', session_kind: 'membership', class_level: '', class_schedule: '', instructor: '', duration_min: null },
  // Classes
  { id: 'cls_1', name: 'Spin Cycle', description: 'High-energy indoor cycling to great music.', price: '₦3,500 / class', image: px(4162449), amenities: '', session_kind: 'class', class_level: 'All levels', class_schedule: 'Mon, Wed, Fri · 6:00 AM', instructor: 'Coach Ada', duration_min: 45 },
  { id: 'cls_2', name: 'HIIT Blast', description: 'Fat-burning high-intensity interval training.', price: '₦4,000 / class', image: px(4162579), amenities: '', session_kind: 'class', class_level: 'Intermediate', class_schedule: 'Tue, Thu · 6:30 PM', instructor: 'Coach Emeka', duration_min: 40 },
  { id: 'cls_3', name: 'Vinyasa Yoga', description: 'Flow, breathe and build flexibility.', price: '₦3,000 / class', image: px(3822622), amenities: '', session_kind: 'class', class_level: 'Beginner', class_schedule: 'Sat · 8:00 AM', instructor: 'Coach Zainab', duration_min: 60 },
  { id: 'cls_4', name: 'Strength & Conditioning', description: 'Build muscle and power with guided lifts.', price: '₦4,500 / class', image: px(4164761), amenities: '', session_kind: 'class', class_level: 'Advanced', class_schedule: 'Mon, Thu · 7:00 PM', instructor: 'Coach Tunde', duration_min: 50 },
];

export const FITNESS_SPOTLIGHTS: Record<string, any> = {
  business_42: {
    id: 'business_42',
    username: 'pulse-fitness-club',
    name: 'Pulse Fitness Club',
    category: 'Fitness & Gym',
    description:
      'A modern fitness club with a fully-equipped gym floor, group classes and certified trainers. Flexible memberships and pay-as-you-go classes.',
    location: 'Lekki, Lagos',
    phone: '+234 800 777 1122',
    website: 'https://pulsefitness.example.com',
    email: 'hello@pulsefitness.example.com',
    opening_hours: 'Mon–Sat: 5AM–10PM, Sun: 7AM–8PM',
    image_url: px(1954524),
    rating: 4.7,
    status: 'open',
    verified: true,
    user_id: 'sample',
  },
};
