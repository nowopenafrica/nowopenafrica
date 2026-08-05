// Demo data for the Education operating system. Shown only for the curated
// school spotlight so the programmes + teachers experience can be previewed
// before real schools add their own.

export interface SampleCourse {
  id: string;
  name: string;
  description: string;
  price: string;
  image: string;
  service_category: string;   // programme / level
  instructor: string;         // teacher / lead tutor
  class_schedule: string;
  duration_min: number | null;
  is_online: boolean;
}

const px = (id: number) =>
  `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=700`;

export const SAMPLE_COURSES: SampleCourse[] = [
  { id: 'crs_1', name: 'Nursery & Early Years', description: 'Play-based foundation for ages 2–5.', price: '₦180,000 / term', image: px(8535214), service_category: 'Nursery', instructor: 'Mrs. Adebayo', class_schedule: 'Mon–Fri · 8AM–1PM', duration_min: null, is_online: false },
  { id: 'crs_2', name: 'Primary School', description: 'British + Nigerian curriculum, Primary 1–6.', price: '₦250,000 / term', image: px(8471835), service_category: 'Primary', instructor: 'Mr. Okonkwo', class_schedule: 'Mon–Fri · 8AM–3PM', duration_min: null, is_online: false },
  { id: 'crs_3', name: 'Secondary School', description: 'JSS1–SS3 with WAEC & IGCSE prep.', price: '₦320,000 / term', image: px(159844), service_category: 'Secondary', instructor: 'Mrs. Bello', class_schedule: 'Mon–Fri · 8AM–3:30PM', duration_min: null, is_online: false },
  { id: 'crs_4', name: 'JAMB / UTME Prep', description: 'Intensive exam prep with mock tests.', price: '₦60,000 / course', image: px(5905445), service_category: 'Exam Prep', instructor: 'Mr. Ibrahim', class_schedule: 'Sat · 9AM–1PM', duration_min: 240, is_online: true },
  { id: 'crs_5', name: 'Coding for Kids', description: 'Scratch & Python basics for ages 8–14.', price: '₦45,000 / course', image: px(8471888), service_category: 'Digital Skills', instructor: 'Coach Ada', class_schedule: 'Sat · 2PM–4PM', duration_min: 120, is_online: true },
  { id: 'crs_6', name: 'Adult IELTS Class', description: 'Prepare for IELTS with a certified trainer.', price: '₦80,000 / course', image: px(4145153), service_category: 'Language', instructor: 'Ms. Grace', class_schedule: 'Tue & Thu · 6PM–8PM', duration_min: 120, is_online: true },
];

export const EDUCATION_SPOTLIGHTS: Record<string, any> = {
  business_46: {
    id: 'business_46',
    username: 'bright-minds-academy',
    name: 'Bright Minds Academy',
    category: 'School & Education',
    description:
      'A nurturing school offering nursery through secondary education, plus exam prep and online courses. Admissions are open for the new session.',
    location: 'Ikeja, Lagos',
    phone: '+234 800 202 0300',
    website: 'https://brightminds.example.com',
    email: 'admissions@brightminds.example.com',
    opening_hours: 'Mon–Fri: 8AM–4PM',
    image_url: px(8471835),
    rating: 4.8,
    status: 'open',
    verified: true,
    user_id: 'sample',
  },
};
