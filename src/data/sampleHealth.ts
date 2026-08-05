// Demo data for the Health operating system. Shown only for the curated clinic
// spotlight so the departments + doctors experience can be previewed before
// real clinics add their own.

export interface SampleDoctor {
  id: string;
  name: string;
  description: string;
  price: string;
  image: string;
  service_category: string;   // department
  duration_min: number | null;
  is_telemedicine: boolean;
}

const px = (id: number) =>
  `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=600`;

export const SAMPLE_DOCTORS: SampleDoctor[] = [
  { id: 'doc_1', name: 'Dr. Amina Bello', description: 'Consultant Cardiologist · 12 years experience.', price: '₦15,000 / consult', image: px(5215024), service_category: 'Cardiology', duration_min: 30, is_telemedicine: true },
  { id: 'doc_2', name: 'Dr. Chukwu Okafor', description: 'Paediatrician — newborn and child health.', price: '₦10,000 / consult', image: px(5407206), service_category: 'Paediatrics', duration_min: 30, is_telemedicine: true },
  { id: 'doc_3', name: 'Dr. Ngozi Eze', description: 'Obstetrician & Gynaecologist.', price: '₦18,000 / consult', image: px(5722164), service_category: 'Obstetrics & Gynaecology', duration_min: 40, is_telemedicine: false },
  { id: 'doc_4', name: 'Dr. Samuel Adeyemi', description: 'General Practitioner — everyday health concerns.', price: '₦7,500 / consult', image: px(6129507), service_category: 'General Practice', duration_min: 20, is_telemedicine: true },
  { id: 'doc_5', name: 'Dr. Fatima Sani', description: 'Dermatologist — skin, hair and nails.', price: '₦14,000 / consult', image: px(5327585), service_category: 'Dermatology', duration_min: 25, is_telemedicine: true },
  { id: 'doc_6', name: 'Dr. Emeka Nwosu', description: 'Orthopaedic Surgeon — bones and joints.', price: '₦20,000 / consult', image: px(4270371), service_category: 'Orthopaedics', duration_min: 40, is_telemedicine: false },
];

export const HEALTH_SPOTLIGHTS: Record<string, any> = {
  business_44: {
    id: 'business_44',
    username: 'lifeline-medical-centre',
    name: 'LifeLine Medical Centre',
    category: 'Hospital & Clinic',
    description:
      'A multi-specialty medical centre offering in-person and video consultations, laboratory services and 24/7 emergency care.',
    location: 'Ikeja, Lagos',
    phone: '+234 800 911 0000',
    website: 'https://lifelinemedical.example.com',
    email: 'care@lifelinemedical.example.com',
    opening_hours: 'Clinics: Mon–Sat 8AM–6PM · Emergency: 24/7',
    image_url: px(263402),
    rating: 4.8,
    status: 'open',
    verified: true,
    user_id: 'sample',
  },
};
