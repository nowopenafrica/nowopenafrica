// Demo data for the Car Dealership operating system. Shown only for the curated
// dealership spotlight so the vehicle inventory can be previewed before real
// dealers add their own stock.

export interface SampleVehicle {
  id: string;
  name: string;
  description: string;
  price: string;
  image: string;
  gallery: string[];
  stock: null;
  vehicle_make: string;
  vehicle_model: string;
  vehicle_year: number;
  mileage_km: number;
  fuel_type: string;
  transmission: string;
  vin: string;
  vehicle_condition: string;
  is_featured: boolean;
}

const px = (id: number) =>
  `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=1000`;

export const SAMPLE_VEHICLES: SampleVehicle[] = [
  {
    id: 'car_1', name: 'Toyota Camry 2020', description: 'Clean foreign-used Camry with full service history, reverse camera and leather seats.',
    price: '₦18,500,000', image: px(170811), gallery: [px(170811), px(112460), px(3874337)], stock: null,
    vehicle_make: 'Toyota', vehicle_model: 'Camry', vehicle_year: 2020, mileage_km: 42000,
    fuel_type: 'Petrol', transmission: 'Automatic', vin: '4T1B11HK5KU000001', vehicle_condition: 'Foreign Used', is_featured: true,
  },
  {
    id: 'car_2', name: 'Lexus RX 350 2019', description: 'Premium SUV, thumb-start, panoramic roof and a fresh set of tyres.',
    price: '₦42,000,000', image: px(116675), gallery: [px(116675), px(100653)], stock: null,
    vehicle_make: 'Lexus', vehicle_model: 'RX 350', vehicle_year: 2019, mileage_km: 55000,
    fuel_type: 'Petrol', transmission: 'Automatic', vin: '2T2BZMCA3KC000045', vehicle_condition: 'Foreign Used', is_featured: true,
  },
  {
    id: 'car_3', name: 'Honda Accord 2022', description: 'Brand-new Accord, factory warranty, spotless interior.',
    price: '₦35,000,000', image: px(3729464), gallery: [px(3729464)], stock: null,
    vehicle_make: 'Honda', vehicle_model: 'Accord', vehicle_year: 2022, mileage_km: 0,
    fuel_type: 'Petrol', transmission: 'Automatic', vin: '1HGCV1F3XNA000078', vehicle_condition: 'New', is_featured: false,
  },
  {
    id: 'car_4', name: 'Mercedes-Benz GLE 2018', description: 'Powerful, well-maintained GLE with AMG styling package.',
    price: '₦48,000,000', image: px(3802510), gallery: [px(3802510), px(210019)], stock: null,
    vehicle_make: 'Mercedes-Benz', vehicle_model: 'GLE', vehicle_year: 2018, mileage_km: 71000,
    fuel_type: 'Petrol', transmission: 'Automatic', vin: '4JGDA5HB3JB000112', vehicle_condition: 'Foreign Used', is_featured: false,
  },
  {
    id: 'car_5', name: 'Toyota Corolla 2016', description: 'Reliable and economical — perfect first car or ride-hailing vehicle.',
    price: '₦11,000,000', image: px(97075), gallery: [px(97075)], stock: null,
    vehicle_make: 'Toyota', vehicle_model: 'Corolla', vehicle_year: 2016, mileage_km: 98000,
    fuel_type: 'Petrol', transmission: 'Automatic', vin: '2T1BURHE3GC000233', vehicle_condition: 'Nigerian Used', is_featured: false,
  },
  {
    id: 'car_6', name: 'Tesla Model 3 2021', description: 'Fully electric, long-range battery, autopilot and premium sound.',
    price: '₦55,000,000', image: px(1592384), gallery: [px(1592384)], stock: null,
    vehicle_make: 'Tesla', vehicle_model: 'Model 3', vehicle_year: 2021, mileage_km: 30000,
    fuel_type: 'Electric', transmission: 'Automatic', vin: '5YJ3E1EA7MF000567', vehicle_condition: 'Foreign Used', is_featured: false,
  },
];

export const CAR_SPOTLIGHTS: Record<string, any> = {
  business_40: {
    id: 'business_40',
    username: 'ace-auto-motors',
    name: 'Ace Auto Motors',
    category: 'Car Dealership',
    description:
      'Trusted car dealership offering brand-new and clean foreign-used vehicles. Every car is inspected, documented and comes with a test-drive on request.',
    location: 'Ikeja, Lagos',
    phone: '+234 800 222 3344',
    website: 'https://aceauto.example.com',
    email: 'sales@aceauto.example.com',
    opening_hours: 'Mon–Sat: 9AM–7PM',
    image_url: px(112460),
    rating: 4.7,
    status: 'open',
    verified: true,
    user_id: 'sample',
  },
};
