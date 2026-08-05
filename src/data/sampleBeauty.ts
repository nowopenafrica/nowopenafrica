// Demo data for the Beauty & Salon operating system. Shown only for the curated
// salon spotlight so the treatment menu, stylists and looks can be previewed
// before real salons add their own.

export interface SampleTreatment {
  id: string;
  name: string;
  description: string;
  price: string;
  image: string;
  service_category: string;
  duration_min: number | null;
  home_service: boolean;
}

const px = (id: number) =>
  `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=800`;

export const SAMPLE_TREATMENTS: SampleTreatment[] = [
  { id: 'trt_1', name: 'Wash, Blow-dry & Style', description: 'Cleanse, condition and a bouncy blow-out.', price: '₦8,000', image: px(3993449), service_category: 'Hair', duration_min: 60, home_service: true },
  { id: 'trt_2', name: 'Braids / Cornrows', description: 'Neat, long-lasting braids in your choice of style.', price: '₦15,000', image: px(3065209), service_category: 'Hair', duration_min: 180, home_service: true },
  { id: 'trt_3', name: 'Gel Manicure', description: 'Long-lasting gel polish with cuticle care.', price: '₦6,000', image: px(3997379), service_category: 'Nails', duration_min: 45, home_service: false },
  { id: 'trt_4', name: 'Pedicure Spa', description: 'Relaxing foot soak, scrub and polish.', price: '₦7,500', image: px(3997391), service_category: 'Nails', duration_min: 50, home_service: false },
  { id: 'trt_5', name: 'Bridal Makeup', description: 'Full glam makeover for your big day.', price: '₦45,000', image: px(2065195), service_category: 'Makeup', duration_min: 90, home_service: true },
  { id: 'trt_6', name: 'Everyday Glam', description: 'Soft, natural makeup for any occasion.', price: '₦15,000', image: px(457701), service_category: 'Makeup', duration_min: 60, home_service: true },
  { id: 'trt_7', name: 'Full Body Massage', description: '60-minute deep-tissue relaxation massage.', price: '₦20,000', image: px(3757942), service_category: 'Spa', duration_min: 60, home_service: false },
  { id: 'trt_8', name: 'Classic Haircut & Beard', description: 'Sharp cut and beard shape-up for men.', price: '₦5,000', image: px(1319460), service_category: 'Barber', duration_min: 40, home_service: false },
];

export const SALON_STYLISTS = [
  { name: 'Amara', specialty: 'Hair & Braids', image: px(3762800) },
  { name: 'Bisi', specialty: 'Nails', image: px(3760263) },
  { name: 'Chidinma', specialty: 'Makeup Artist', image: px(1181686) },
  { name: 'David', specialty: 'Barber', image: px(1043471) },
];

export const SALON_LOOKS = [px(3065209), px(2065195), px(3997379), px(3993449), px(457701), px(1319460)];

export const BEAUTY_SPOTLIGHTS: Record<string, any> = {
  business_43: {
    id: 'business_43',
    username: 'glow-beauty-lounge',
    name: 'Glow Beauty Lounge',
    category: 'Salon / Barber',
    description:
      'A full-service beauty lounge — hair, nails, makeup, spa and grooming. Book your favourite stylist in-salon or request home service.',
    location: 'Surulere, Lagos',
    phone: '+234 800 333 5566',
    website: 'https://glowbeauty.example.com',
    email: 'book@glowbeauty.example.com',
    opening_hours: 'Tue–Sun: 9AM–8PM',
    image_url: px(3993449),
    rating: 4.9,
    status: 'open',
    verified: true,
    user_id: 'sample',
  },
};
