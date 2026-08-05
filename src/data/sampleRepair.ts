// Demo data for the Gadget & Device Repair operating system (phone / laptop /
// camera / console repair shops). Shown only for the curated repair spotlight.
// Reuses business_services (service_category = device type), so no migration.

export interface SampleRepair {
  id: string;
  name: string;
  description: string;
  price: string;
  service_category: string;   // device type
}

export const SAMPLE_REPAIRS: SampleRepair[] = [
  { id: 'rep_1', name: 'Phone screen replacement', description: 'Cracked screen or LCD swap for iPhone, Samsung, Tecno, Infinix — genuine parts.', price: 'From ₦18,000', service_category: 'Phones' },
  { id: 'rep_2', name: 'Phone battery & charging port', description: 'Battery swap or charging-port repair — most models done same day.', price: 'From ₦9,000', service_category: 'Phones' },
  { id: 'rep_3', name: 'Laptop screen & keyboard', description: 'Cracked display, hinge or keyboard replacement for any laptop brand.', price: 'From ₦25,000', service_category: 'Laptops' },
  { id: 'rep_4', name: 'Laptop upgrade (SSD/RAM)', description: 'Speed up your machine with an SSD or RAM upgrade + clean install.', price: 'From ₦20,000', service_category: 'Laptops' },
  { id: 'rep_5', name: 'Camera sensor & lens service', description: 'Sensor cleaning, shutter repair and lens fungus removal for DSLR/mirrorless.', price: 'From ₦15,000', service_category: 'Cameras' },
  { id: 'rep_6', name: 'Game console repair (HDMI/disc)', description: 'PS4/PS5/Xbox HDMI port, disc drive and overheating fixes.', price: 'From ₦22,000', service_category: 'Consoles' },
  { id: 'rep_7', name: 'Water damage recovery', description: 'Ultrasonic board cleaning and component-level repair for liquid damage.', price: 'From ₦15,000', service_category: 'Board Repair' },
  { id: 'rep_8', name: 'Data recovery', description: 'Recover photos and files from dead phones, laptops and memory cards.', price: 'From ₦20,000', service_category: 'Data' },
];

// Trust badges (sample-only).
export const REPAIR_CAPABILITIES = [
  'Free diagnostics',
  '90-day warranty',
  'Genuine parts',
  'Same-day service',
  'Board-level repair',
];

export const REPAIR_SPOTLIGHTS: Record<string, any> = {
  business_68: {
    id: 'business_68',
    username: 'gadgetmedic-repairs',
    name: 'GadgetMedic Repairs',
    category: 'Gadget & Device Repair',
    description:
      'Phone, laptop, camera and console repairs with genuine parts and a warranty. Free diagnostics — most fixes done same day while you wait.',
    location: 'Computer Village, Ikeja, Lagos',
    phone: '+234 803 771 9040',
    website: 'https://gadgetmedic.example.com',
    email: 'fix@gadgetmedic.example.com',
    opening_hours: 'Mon–Sat: 9AM–7PM',
    image_url:
      'https://images.pexels.com/photos/4792733/pexels-photo-4792733.jpeg?auto=compress&cs=tinysrgb&w=800',
    rating: 4.8,
    status: 'open',
    verified: true,
    user_id: 'sample',
  },
};
